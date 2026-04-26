import json
import os
import shutil
import struct
import sys
import tempfile
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Lock
from urllib.parse import urlparse


def resource_root() -> Path:
    if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
        return Path(sys._MEIPASS)  # type: ignore[attr-defined]
    return Path(__file__).resolve().parent


def runtime_root() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent


ROOT = resource_root()
RUNTIME_ROOT = runtime_root()

CONFIG_PATH = RUNTIME_ROOT / "config.json"
STATE_PATH = RUNTIME_ROOT / "state.json"

KOROK_DATA_PATH = ROOT / "korok_data.json"
COMPLETION_DATA_PATH = ROOT / "completion_data.json"
HOST = "127.0.0.1"
PORT = 8000

SAVE_VERSIONS = {
    2307552: {"header": 0x0046C3C8, "metadata_start": 0x0003C050, "version": "v1.0"},
    2307656: {"header": 0x0047E0F4, "metadata_start": 0x0003C088, "version": "v1.1.x/v1.2.x"},
    2307856: {"header": 0x0049E946, "metadata_start": 0x0003C138, "version": "v1.4.x"},
}

META_SAVE_TYPE_HASH = 0xA3DB7114
CLEAR_HASH = 0x62965740
PLAYER_SAVE_POS_HASH = 0xC884818D
HYRULE_MIN_X = -6000
HYRULE_MAX_X = 6000
HYRULE_MIN_Z = -5000
HYRULE_MAX_Z = 5000
SKY_MIN_Y = 750
DEPTHS_MAX_Y = -100
LOG_LIMIT = 200
LOG_ENTRIES = []
SERVER_LOCK = Lock()


def read_u32(data, offset):
    return int.from_bytes(data[offset:offset + 4], "little", signed=False)


def read_f32(data, offset):
    return struct.unpack_from("<f", data, offset)[0]


def world_to_map(x, z):
    return {
        "mapX": (x - HYRULE_MIN_X) / (HYRULE_MAX_X - HYRULE_MIN_X) * 6000,
        "mapY": (z - HYRULE_MIN_Z) / (HYRULE_MAX_Z - HYRULE_MIN_Z) * 5000,
    }


def layer_for_y(y):
    if y >= SKY_MIN_Y:
        return "sky"
    if y < DEPTHS_MAX_Y:
        return "depths"
    return "surface"


def add_log(message):
    timestamp = time.strftime("%H:%M:%S")
    LOG_ENTRIES.append({"time": timestamp, "message": message})
    del LOG_ENTRIES[:-LOG_LIMIT]


def load_config():
    if not CONFIG_PATH.exists():
        template_path = ROOT / "config.json"
        if template_path.exists():
            CONFIG_PATH.write_text(template_path.read_text(encoding="utf-8"), encoding="utf-8")
        else:
            CONFIG_PATH.write_text(json.dumps({"save_path": ""}, indent=2), encoding="utf-8")

    with CONFIG_PATH.open("r", encoding="utf-8") as file:
        config = json.load(file)
    save_path = config.get("save_path")
    if not save_path:
        raise ValueError(f"{CONFIG_PATH} must define save_path")
    save_file = config.get("save_file")
    if not save_file:
        return {"mode": "single", "save_path": Path(save_path), "save_file": Path(save_path).name}
    return {"mode": "scan", "save_root": Path(save_path), "save_file": save_file}


def scan_tracked_saves():
    config = load_config()
    if config["mode"] == "single":
        tracked = [config["save_path"]]
        add_log(f"Tracking single save: {tracked[0]}")
        return tracked

    save_root = config["save_root"]
    save_file = config["save_file"]
    if not save_root.exists():
        raise ValueError(f"Configured save_path does not exist: {save_root}")

    tracked = sorted(path for path in save_root.glob(f"*/{save_file}") if path.is_file())
    add_log(f"Scanned {save_root} for */{save_file}")
    if tracked:
        add_log(f"Tracking {len(tracked)} save file(s): " + "; ".join(path.relative_to(save_root).as_posix() for path in tracked))
    else:
        add_log("No matching save files found")
    return tracked


def load_korok_data():
    with KOROK_DATA_PATH.open("r", encoding="utf-8") as file:
        return json.load(file)


def load_completion_data():
    with COMPLETION_DATA_PATH.open("r", encoding="utf-8") as file:
        return json.load(file)


def load_state():
    if not STATE_PATH.exists():
        return {
            "obtainedKorokIds": [],
            "latestObtainedId": None,
            "latestObtainedAt": None,
            "newlyDetectedIds": [],
            "lastSaveModified": None,
            "_exists": False,
        }

    with STATE_PATH.open("r", encoding="utf-8") as file:
        state = json.load(file)

    if "saves" not in state:
        active_path = state.get("activeSavePath") or "__legacy__"
        state = {
            "activeSavePath": state.get("activeSavePath"),
            "saves": {
                active_path: {
                    "obtainedKorokIds": state.get("obtainedKorokIds", []),
                    "latestObtainedId": state.get("latestObtainedId"),
                    "latestObtainedAt": state.get("latestObtainedAt"),
                    "newlyDetectedIds": state.get("newlyDetectedIds", []),
                    "lastSaveModified": state.get("lastSaveModified"),
                }
            },
        }

    state.setdefault("activeSavePath", None)
    state.setdefault("saves", {})
    state.setdefault("obtainedKorokIds", [])
    state.setdefault("latestObtainedId", None)
    state.setdefault("latestObtainedAt", None)
    state.setdefault("newlyDetectedIds", [])
    state.setdefault("lastSaveModified", None)
    state.setdefault("activeSavePath", None)
    state["_exists"] = True
    return state


def save_state(state):
    temp_path = STATE_PATH.with_suffix(".json.tmp")
    persisted_state = {key: value for key, value in state.items() if not key.startswith("_")}
    with temp_path.open("w", encoding="utf-8") as file:
        json.dump(persisted_state, file, indent=2)
    temp_path.replace(STATE_PATH)


KOROK_DATA = load_korok_data()
COMPLETION_DATA = load_completion_data()
KOROK_HASHES = {
    int(entry["hash"], 16)
    for group in ("hidden", "carry")
    for entry in KOROK_DATA[group]
}
COMPLETION_BOOL_HASHES = {
    int(item["value"], 16)
    for category in COMPLETION_DATA["categories"]
    if category["kind"] == "bool"
    for item in category["items"]
}
TRACKED_HASHES = KOROK_HASHES | COMPLETION_BOOL_HASHES
TRACKED_SAVE_PATHS = scan_tracked_saves()
PAYLOAD_CACHE = {
    "mtimes": None,
    "payload": None,
}


def snapshot_tracked_saves():
    if not TRACKED_SAVE_PATHS:
        raise ValueError("No tracked save files. Check config.json save_path/save_file.")

    snapshot = []
    for path in TRACKED_SAVE_PATHS:
        try:
            snapshot.append({"path": path, "mtime": os.path.getmtime(path)})
        except FileNotFoundError:
            snapshot.append({"path": path, "mtime": None})
    return snapshot


def select_active_save(snapshot):
    existing = [item for item in snapshot if item["mtime"] is not None]
    if not existing:
        raise ValueError("Tracked save files are missing")
    return max(existing, key=lambda item: item["mtime"])


def format_mtime(value):
    return time.strftime("%H:%M:%S", time.localtime(value)) if value else "missing"


def save_label(path):
    return f"{path.parent.name}/{path.name}"


def mtimes_key(snapshot):
    return tuple((str(item["path"]), item["mtime"]) for item in snapshot)


def describe_changed_mtimes(previous_key, current_snapshot):
    if previous_key is None:
        return []

    previous = dict(previous_key)
    changes = []
    for item in current_snapshot:
        path_text = str(item["path"])
        old_mtime = previous.get(path_text)
        if old_mtime != item["mtime"]:
            changes.append((item["path"], old_mtime, item["mtime"]))
    return changes


def copy_stable_save(save_path):
    temp = tempfile.NamedTemporaryFile(delete=False, suffix=".sav")
    temp.close()
    try:
        shutil.copyfile(save_path, temp.name)
        return Path(temp.name)
    except Exception:
        Path(temp.name).unlink(missing_ok=True)
        raise


def read_save_bytes(save_path):
    last_error = None
    for _ in range(4):
        temp_path = None
        try:
            temp_path = copy_stable_save(save_path)
            return temp_path.read_bytes()
        except (PermissionError, OSError) as error:
            last_error = error
            time.sleep(0.15)
        finally:
            if temp_path:
                temp_path.unlink(missing_ok=True)
    raise last_error


def find_hash_table_end(data):
    for offset in range(0x28, len(data) - 8, 8):
        if read_u32(data, offset) == META_SAVE_TYPE_HASH:
            return offset + 4
    raise ValueError("Could not find MetaData.SaveTypeHash; unsupported or incomplete save file")


def parse_save_values(data):
    if len(data) < 0x30 or read_u32(data, 0) != 0x01020304:
        raise ValueError("Not a TOTK progress.sav file")

    table_end = find_hash_table_end(data)
    values = {}
    for offset in range(0x28, table_end, 8):
        hash_value = read_u32(data, offset)
        if hash_value in TRACKED_HASHES:
            values[hash_value] = read_u32(data, offset + 4)
    return values


def find_hash_value_offset(data, hash_value):
    table_end = find_hash_table_end(data)
    for offset in range(0x28, table_end, 8):
        if read_u32(data, offset) == hash_value:
            return offset + 4
    return None


def parse_player_position(data):
    pointer_offset = find_hash_value_offset(data, PLAYER_SAVE_POS_HASH)
    if pointer_offset is None:
        return None

    vector_offset = read_u32(data, pointer_offset)
    raw_x = read_f32(data, vector_offset)
    raw_y = read_f32(data, vector_offset + 4)
    raw_z = read_f32(data, vector_offset + 8)
    x = raw_x
    z = raw_z
    position = {
        "x": x,
        "y": raw_y - 105,
        "z": z,
        "raw": {"x": raw_x, "y": raw_y, "z": raw_z},
        "layer": layer_for_y(raw_y - 105),
    }
    position.update(world_to_map(x, z))
    return position


def parse_guid_values(data):
    pointer_offset = find_hash_value_offset(data, META_SAVE_TYPE_HASH)
    if pointer_offset is None:
        return set()

    guid_offset = read_u32(data, pointer_offset)
    values = set()
    for offset in range(guid_offset, len(data) - 7, 8):
        lower = read_u32(data, offset)
        upper = read_u32(data, offset + 4)
        if lower == 0 and upper == 0:
            break
        values.add((upper << 32) | lower)
    return values


def build_markers(values):
    markers = []
    for kind in ("hidden", "carry"):
        for entry in KOROK_DATA[kind]:
            hash_value = int(entry["hash"], 16)
            raw_value = values.get(hash_value, 0)
            obtained = raw_value != 0 if kind == "hidden" else raw_value == CLEAR_HASH
            marker = dict(entry)
            marker.update(world_to_map(entry["x"], entry["z"]))
            marker["layer"] = layer_for_y(entry.get("y", 0))
            marker["obtained"] = obtained
            marker["rawValue"] = f"{raw_value:08x}"
            marker["seedValue"] = 2 if kind == "carry" else 1
            markers.append(marker)
    return markers


def build_completion(values, guid_values):
    categories = []
    for category in COMPLETION_DATA["categories"]:
        items = []
        obtained_count = 0
        for item in category["items"]:
            if category["kind"] == "guid":
                obtained = int(item["value"]) in guid_values
                raw_value = "guid"
            else:
                hash_value = int(item["value"], 16)
                raw = values.get(hash_value, 0)
                obtained = raw != 0
                raw_value = f"{raw:08x}"

            if obtained:
                obtained_count += 1
                continue

            marker = dict(item)
            marker.update(world_to_map(item["x"], item["z"]))
            marker["categoryId"] = category["id"]
            marker["categoryLabel"] = category["label"]
            marker["rawValue"] = raw_value
            items.append(marker)

        total = len(category["items"])
        categories.append({
            "id": category["id"],
            "label": category["label"],
            "kind": category["kind"],
            "total": total,
            "obtained": obtained_count,
            "remaining": total - obtained_count,
            "items": items,
            "sourceCounts": category.get("sourceCounts", {}),
        })
    return categories


def update_state(markers, save_modified, active_save_path):
    state = load_state()
    save_key = str(active_save_path)
    save_state_entry = state["saves"].setdefault(
        save_key,
        {
            "obtainedKorokIds": [],
            "latestObtainedId": None,
            "latestObtainedAt": None,
            "newlyDetectedIds": [],
            "lastSaveModified": None,
        },
    )
    previous_ids = set(save_state_entry["obtainedKorokIds"])
    current_ids = {marker["id"] for marker in markers if marker["obtained"]}
    first_seen_save = not save_state_entry["obtainedKorokIds"] and not save_state_entry["lastSaveModified"]
    newly_detected_ids = sorted(current_ids - previous_ids) if state["_exists"] and not first_seen_save else []

    if newly_detected_ids:
        save_state_entry["latestObtainedId"] = newly_detected_ids[-1]
        save_state_entry["latestObtainedAt"] = time.time()
        add_log(f"Latest Korok: {newly_detected_ids[-1]} from {save_label(active_save_path)}")

    save_state_entry["obtainedKorokIds"] = sorted(current_ids)
    save_state_entry["newlyDetectedIds"] = newly_detected_ids
    save_state_entry["lastSaveModified"] = save_modified
    state["activeSavePath"] = str(active_save_path)
    save_state(state)
    return save_state_entry


def parse_current_save():
    with SERVER_LOCK:
        snapshot = snapshot_tracked_saves()
        current_mtimes = mtimes_key(snapshot)
        if PAYLOAD_CACHE["mtimes"] == current_mtimes and PAYLOAD_CACHE["payload"] is not None:
            return PAYLOAD_CACHE["payload"]

        for path, old_mtime, new_mtime in describe_changed_mtimes(PAYLOAD_CACHE["mtimes"], snapshot):
            add_log(f"mtime changed: {save_label(path)} {format_mtime(old_mtime)} -> {format_mtime(new_mtime)}")

        active_save = select_active_save(snapshot)
        save_path = active_save["path"]
        save_modified = active_save["mtime"]
        if not PAYLOAD_CACHE["payload"] or PAYLOAD_CACHE["payload"].get("savePath") != str(save_path):
            add_log(f"Active save: {save_path}")

        data = read_save_bytes(save_path)
        header = read_u32(data, 4)
        metadata_start = read_u32(data, 8)
        version_info = SAVE_VERSIONS.get(len(data))
        known_version = (
            version_info["version"]
            if version_info and version_info["header"] == header and version_info["metadata_start"] == metadata_start
            else "unknown/modded"
        )
        values = parse_save_values(data)
        guid_values = parse_guid_values(data)
        player_position = parse_player_position(data)
        markers = build_markers(values)
        completion = build_completion(values, guid_values)
        obtained_markers = [marker for marker in markers if marker["obtained"]]
        state = update_state(markers, save_modified, save_path)
        add_log(f"Parsed {save_label(save_path)}: {sum(marker['seedValue'] for marker in obtained_markers)}/1000 seeds")

        payload = {
            "savePath": str(save_path),
            "trackedSaves": [
                {"path": str(item["path"]), "mtime": item["mtime"]}
                for item in snapshot
            ],
            "lastModified": save_modified,
            "fileSize": len(data),
            "version": known_version,
            "player": player_position,
            "counts": {
                "hidden": sum(1 for marker in obtained_markers if marker["kind"] == "hidden"),
                "carry": sum(1 for marker in obtained_markers if marker["kind"] == "carry"),
                "totalLocations": len(obtained_markers),
                "totalSeeds": sum(marker["seedValue"] for marker in obtained_markers),
                "availableLocations": len(KOROK_DATA["hidden"]) + len(KOROK_DATA["carry"]),
                "availableSeeds": len(KOROK_DATA["hidden"]) + len(KOROK_DATA["carry"]) * 2,
            },
            "state": {
                "latestObtainedId": state["latestObtainedId"],
                "latestObtainedAt": state["latestObtainedAt"],
                "newlyDetectedIds": state["newlyDetectedIds"],
            },
            "markers": markers,
            "completion": completion,
        }
        PAYLOAD_CACHE["mtimes"] = current_mtimes
        PAYLOAD_CACHE["payload"] = payload
        return payload


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/koroks":
            try:
                self.send_json(200, parse_current_save())
            except Exception as error:
                add_log(f"Error: {error}")
                self.send_json(500, {"error": str(error)})
            return
        if parsed.path == "/api/log":
            self.send_json(200, {"entries": LOG_ENTRIES[-LOG_LIMIT:]})
            return
        return super().do_GET()


def main():
    os.chdir(ROOT)
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"Serving TOTK helper at http://{HOST}:{PORT}/")
    server.serve_forever()


if __name__ == "__main__":
    main()
