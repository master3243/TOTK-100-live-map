import logging
import queue
import threading
import webbrowser
import functools
import json
from pathlib import Path
from typing import Optional

import server


class TkLogHandler(logging.Handler):
    def __init__(self, sink: "queue.Queue[str]"):
        super().__init__()
        self._sink = sink
        self.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))

    def emit(self, record: logging.LogRecord) -> None:
        try:
            self._sink.put_nowait(self.format(record))
        except Exception:
            pass


def run():
    import tkinter as tk
    from tkinter import filedialog, messagebox
    from tkinter import ttk

    server.setup_logging()

    root = tk.Tk()
    root.title("TOTK Save Map Helper")
    root.minsize(760, 460)

    icon_path = server.resource_root() / "app.ico"
    if icon_path.exists():
        try:
            root.iconbitmap(str(icon_path))
        except Exception:
            logging.exception("Could not set window icon: %s", icon_path)

    log_queue: "queue.Queue[str]" = queue.Queue()
    logging.getLogger().addHandler(TkLogHandler(log_queue))

    status_var = tk.StringVar(value="Stopped")
    host_var = tk.StringVar(value="127.0.0.1")
    port_var = tk.StringVar(value="8000")
    url_var = tk.StringVar(value="http://127.0.0.1:8000/")

    server_thread: Optional[threading.Thread] = None
    httpd = {"server": None}

    def save_config(config: dict):
        server.CONFIG_PATH.write_text(json.dumps(config, indent=2), encoding="utf-8")
        logging.info("Wrote config: %s", server.CONFIG_PATH)

    def rebuild_url():
        listen_host = host_var.get().strip() or "127.0.0.1"
        port_text = port_var.get().strip() or "8000"
        try:
            port = int(port_text)
        except ValueError:
            port = 8000
        display_host = server.url_host_for_browser(listen_host)
        url_var.set(f"http://{display_host}:{port}/")

    def merge_server_keys_into_config():
        if not server.CONFIG_PATH.exists():
            return
        try:
            config = json.loads(server.CONFIG_PATH.read_text(encoding="utf-8"))
        except Exception:
            return
        changed = False
        if "server_host" not in config:
            config["server_host"] = "127.0.0.1"
            changed = True
        if "server_port" not in config:
            config["server_port"] = 8000
            changed = True
        if changed:
            save_config(config)

    def load_server_fields_from_config():
        if not server.CONFIG_PATH.exists():
            return
        try:
            config = json.loads(server.CONFIG_PATH.read_text(encoding="utf-8"))
        except Exception:
            return
        host = config.get("server_host")
        if isinstance(host, str) and host.strip():
            host_var.set(host.strip())
        port = config.get("server_port")
        if port is not None:
            try:
                port_var.set(str(int(port)))
            except (TypeError, ValueError):
                pass
        rebuild_url()

    def persist_listen_settings(listen_host: str, listen_port: int):
        config: dict = {}
        if server.CONFIG_PATH.exists():
            try:
                config = json.loads(server.CONFIG_PATH.read_text(encoding="utf-8"))
            except Exception:
                config = {}
        config["server_host"] = listen_host
        config["server_port"] = listen_port
        save_config(config)

    def parse_listen_for_start():
        listen_host = host_var.get().strip() or "127.0.0.1"
        port_text = port_var.get().strip()
        if not port_text:
            messagebox.showwarning("TOTK Save Map Helper", "Port is empty.")
            return None
        try:
            listen_port = int(port_text)
        except ValueError:
            messagebox.showwarning("TOTK Save Map Helper", f"Invalid port: {port_text!r}")
            return None
        if not (1 <= listen_port <= 65535):
            messagebox.showwarning(
                "TOTK Save Map Helper",
                f"Port must be between 1 and 65535 (got {listen_port}).",
            )
            return None
        return listen_host, listen_port

    def looks_like_save_root(folder: Path, save_file: str) -> bool:
        # Accept either:
        # - <folder>\progress.sav
        # - <folder>\<profile>\progress.sav (one level deep)
        if (folder / save_file).is_file():
            return True
        try:
            return any(p.is_file() for p in folder.glob(f"*/{save_file}"))
        except Exception:
            return False

    def ensure_config():
        config = {}
        if server.CONFIG_PATH.exists():
            try:
                config = json.loads(server.CONFIG_PATH.read_text(encoding="utf-8"))
            except Exception:
                messagebox.showwarning(
                    "TOTK Save Map Helper",
                    f"Could not read config.json. A new one will be created.\n\n{server.CONFIG_PATH}",
                )
                config = {}

        config.setdefault("save_file", "progress.sav")
        config.setdefault("save_path", "")

        if not server.CONFIG_PATH.exists():
            save_config(config)

        if config.get("save_path"):
            return

        while True:
            messagebox.showinfo(
                "TOTK Save Map Helper",
                "Select your TOTK save folder (the folder that contains progress.sav, or a folder that contains profiles with progress.sav inside).",
            )
            chosen = filedialog.askdirectory(title="Select TOTK save folder")
            if not chosen:
                messagebox.showwarning(
                    "TOTK Save Map Helper",
                    "No folder selected. The app will run, but /api/koroks will error until you set save_path in config.json.",
                )
                return

            chosen_path = Path(chosen)
            config["save_path"] = str(chosen_path)
            save_config(config)

            if looks_like_save_root(chosen_path, config["save_file"]):
                return

            keep = messagebox.askyesno(
                "TOTK Save Map Helper",
                f"That folder doesn't look valid.\n\n"
                f"Couldn't find '{config['save_file']}' in:\n"
                f"- {chosen_path}\n"
                f"- {chosen_path}\\*\\{config['save_file']}\n\n"
                "Keep this path anyway?",
            )
            if keep:
                return
            config["save_path"] = ""

    def append_log(line: str):
        text.configure(state="normal")
        text.insert("end", line + "\n")
        text.see("end")
        text.configure(state="disabled")

    def poll_logs():
        while True:
            try:
                line = log_queue.get_nowait()
            except queue.Empty:
                break
            append_log(line)
        root.after(120, poll_logs)

    def start_server():
        nonlocal server_thread
        if server_thread and server_thread.is_alive():
            return

        parsed = parse_listen_for_start()
        if not parsed:
            status_var.set("Stopped")
            return
        listen_host, listen_port = parsed
        server.HOST = listen_host
        server.PORT = listen_port
        rebuild_url()
        persist_listen_settings(listen_host, listen_port)

        def target():
            try:
                server.initialize()
                handler = functools.partial(server.Handler, directory=str(server.ROOT))
                httpd["server"] = server.ThreadingHTTPServer((server.HOST, server.PORT), handler)
                logging.info("Serving at %s", url_var.get())
                status_var.set("Running")
                httpd["server"].serve_forever()
            except Exception:
                logging.exception("Server crashed")
            finally:
                status_var.set("Stopped")

        status_var.set("Starting…")
        server_thread = threading.Thread(target=target, name="http-server", daemon=True)
        server_thread.start()

        # Give it a moment to bind before opening browser.
        root.after(250, open_browser)

    def stop_server():
        srv = httpd.get("server")
        if srv is None:
            return
        try:
            logging.info("Stopping server…")
            srv.shutdown()
            srv.server_close()
        except Exception:
            logging.exception("Could not stop server")
        finally:
            httpd["server"] = None
            status_var.set("Stopped")

    def open_browser():
        url = url_var.get()
        try:
            webbrowser.open(url, new=1, autoraise=True)
        except Exception:
            logging.exception("Could not open browser: %s", url)

    def copy_url():
        url = url_var.get()
        try:
            root.clipboard_clear()
            root.clipboard_append(url)
            root.update()
            logging.info("Copied URL to clipboard: %s", url)
        except Exception:
            logging.exception("Could not copy URL")

    def on_close():
        stop_server()
        root.after(150, root.destroy)

    root.protocol("WM_DELETE_WINDOW", on_close)

    main = ttk.Frame(root, padding=12)
    main.pack(fill="both", expand=True)

    header = ttk.Frame(main)
    header.pack(fill="x")

    ttk.Label(header, text="Status:").pack(side="left")
    ttk.Label(header, textvariable=status_var).pack(side="left", padx=(6, 0))

    bind_frame = ttk.Frame(main)
    bind_frame.pack(fill="x", pady=(10, 0))
    ttk.Label(bind_frame, text="Listen host:").grid(row=0, column=0, sticky="w")
    ttk.Entry(bind_frame, textvariable=host_var, width=18).grid(row=0, column=1, padx=(6, 0), sticky="w")
    ttk.Label(bind_frame, text="Port:").grid(row=0, column=2, padx=(14, 0), sticky="w")
    ttk.Entry(bind_frame, textvariable=port_var, width=8).grid(row=0, column=3, padx=(6, 0), sticky="w")

    host_var.trace_add("write", lambda *_: rebuild_url())
    port_var.trace_add("write", lambda *_: rebuild_url())

    buttons = ttk.Frame(main)
    buttons.pack(fill="x", pady=(12, 8))

    ttk.Button(buttons, text="Start", command=start_server).pack(side="left")
    ttk.Button(buttons, text="Stop", command=stop_server).pack(side="left", padx=(8, 0))
    ttk.Button(buttons, text="Open UI", command=open_browser).pack(side="left", padx=(8, 0))
    ttk.Button(buttons, text="Copy URL", command=copy_url).pack(side="left", padx=(8, 0))

    ttk.Label(main, text="Logs").pack(anchor="w", pady=(6, 4))

    log_frame = ttk.Frame(main)
    log_frame.pack(fill="both", expand=True)

    scrollbar = ttk.Scrollbar(log_frame)
    scrollbar.pack(side="right", fill="y")

    text = tk.Text(
        log_frame,
        wrap="none",
        yscrollcommand=scrollbar.set,
        state="disabled",
    )
    text.pack(side="left", fill="both", expand=True)
    scrollbar.config(command=text.yview)

    append_log("Ready. Click Start to run the local server.")
    poll_logs()

    ensure_config()
    merge_server_keys_into_config()
    load_server_fields_from_config()

    # Auto-start for convenience.
    root.after(250, start_server)
    root.mainloop()


if __name__ == "__main__":
    run()

