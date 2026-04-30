let _pyodidePromise = null;

function pyodideAssetUrl(path) {
  const base = new URL(".", window.location.href);
  return new URL(path, base).toString();
}

async function loadPyodideScript() {
  if (typeof window.loadPyodide === "function") {
    return;
  }
  await new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/pyodide/v0.26.2/full/pyodide.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Pyodide"));
    document.head.appendChild(script);
  });
}

async function fetchTextAsset(path) {
  return fetch(pyodideAssetUrl(path), { cache: "no-store" }).then((response) => response.text());
}

async function ensurePyodide() {
  if (_pyodidePromise) {
    return _pyodidePromise;
  }
  _pyodidePromise = (async () => {
    await loadPyodideScript();
    const pyodide = await window.loadPyodide({ indexURL: "https://cdn.jsdelivr.net/pyodide/v0.26.2/full/" });

    pyodide.FS.mkdirTree("/app/references");
    const [serverPy, korokJson, completionJson, hashesCsv, recipeRefIds] = await Promise.all([
      fetchTextAsset("server.py"),
      fetchTextAsset("korok_data.json"),
      fetchTextAsset("completion_data.json"),
      fetchTextAsset("references/zelda-totk.hashes.csv"),
      fetchTextAsset("references/recipe_ids_mine_228.txt"),
    ]);
    pyodide.FS.writeFile("/app/server.py", serverPy, { encoding: "utf8" });
    pyodide.FS.writeFile("/app/korok_data.json", korokJson, { encoding: "utf8" });
    pyodide.FS.writeFile("/app/completion_data.json", completionJson, { encoding: "utf8" });
    pyodide.FS.writeFile("/app/references/zelda-totk.hashes.csv", hashesCsv, { encoding: "utf8" });
    pyodide.FS.writeFile("/app/references/recipe_ids_mine_228.txt", recipeRefIds, { encoding: "utf8" });

    await pyodide.runPythonAsync(`
import sys, time
from pathlib import Path

sys.path.insert(0, "/app")
import server as _srv

_srv.initialize_data()

def parse_uploaded_save(path: str, filename: str = "progress.sav", mtime: float | None = None):
    data = Path(path).read_bytes()
    save_modified = int(mtime if mtime is not None else time.time())
    return _srv.build_save_payload(data, filename, save_modified, snapshot=[])
`);
    return pyodide;
  })();
  return _pyodidePromise;
}

async function uploadManualSaveViaPyodide(file) {
  setSaveLoading(true, "Loading");
  const pyodide = await ensurePyodide();
  const bytes = new Uint8Array(await file.arrayBuffer());
  pyodide.FS.mkdirTree("/tmp");
  pyodide.FS.writeFile("/tmp/upload.sav", bytes);

  setSaveLoading(true, "Loading");
  const mtime = Math.floor((file.lastModified || Date.now()) / 1000);
  const pyResult = await pyodide.runPythonAsync(`parse_uploaded_save("/tmp/upload.sav", ${JSON.stringify(file.name || "progress.sav")}, ${mtime})`);
  const result = pyResult.toJs({ dict_converter: Object.fromEntries });
  pyResult.destroy?.();
  return result;
}
