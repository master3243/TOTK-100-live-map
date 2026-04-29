import ipaddress
import json
import logging
import os
import shutil
import struct
import sys
import tempfile
import time
import traceback
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Lock
from urllib.parse import urlparse
from urllib.parse import parse_qs


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
HASHES_DATA_PATH = ROOT / "references" / "zelda-totk.hashes.csv"
RECIPE_REFERENCE_IDS_PATH = ROOT / "references" / "recipe_ids_mine_228.txt"
HOST = "127.0.0.1"
PORT = 8000


def _read_raw_config() -> dict:
    if not CONFIG_PATH.exists():
        return {}
    try:
        with CONFIG_PATH.open("r", encoding="utf-8") as file:
            return json.load(file)
    except Exception:
        logging.exception("Could not read %s", CONFIG_PATH)
        return {}


def _parse_listen_host(value, default: str = "127.0.0.1") -> str:
    if value is None:
        return default
    if isinstance(value, str):
        text = value.strip()
        return text if text else default
    return str(value)


def _parse_listen_port(value, default: int = 8000) -> int:
    if value is None:
        return default
    try:
        port = int(value)
    except (TypeError, ValueError):
        return default
    if 1 <= port <= 65535:
        return port
    return default


def apply_listen_settings_from_config() -> None:
    """Set module-level HOST/PORT from config.json if present."""
    global HOST, PORT
    raw = _read_raw_config()
    HOST = _parse_listen_host(raw.get("server_host"), HOST)
    PORT = _parse_listen_port(raw.get("server_port"), PORT)


def url_host_for_browser(listen_host: str) -> str:
    """Host segment for a browser URL (127.0.0.1 when bound to all interfaces)."""
    text = (listen_host or "").strip()
    if not text or text == "0.0.0.0":
        return "127.0.0.1"
    try:
        addr = ipaddress.ip_address(text)
        if addr.version == 6:
            return f"[{addr.compressed}]"
        return addr.compressed
    except ValueError:
        return text

SAVE_VERSIONS = {
    2307552: {"header": 0x0046C3C8, "metadata_start": 0x0003C050, "version": "v1.0"},
    2307656: {"header": 0x0047E0F4, "metadata_start": 0x0003C088, "version": "v1.1.x/v1.2.x"},
    2307856: {"header": 0x0049E946, "metadata_start": 0x0003C138, "version": "v1.4.x"},
}

META_SAVE_TYPE_HASH = 0xA3DB7114
CLEAR_HASH = 0x62965740
PLAYER_SAVE_POS_HASH = 0xC884818D
PLAYER_MAX_LIFE_HASH = 0xFBE01DA1  # Int; PlayerStatus.MaxLife
PLAYER_MAX_STAMINA_HASH = 0xF9212C74  # Float; PlayerStatus.MaxStamina
PLAYER_MAX_ENERGY_HASH = 0xAFD01D68  # Float; PlayerStatus.MaxEnergy
MAX_RECIPES = 228
HYRULE_MIN_X = -6000
HYRULE_MAX_X = 6000
HYRULE_MIN_Z = -5000
HYRULE_MAX_Z = 5000
SKY_MIN_Y = 750
DEPTHS_MAX_Y = -100
LOG_LIMIT = 200
LOG_ENTRIES = []
LOG_NEXT_ID = 1
SERVER_LOCK = Lock()

_DATA = {
    "initialized": False,
    "korok_data": None,
    "completion_data": None,
    "tracked_hashes": None,
    "recipe_hashes": None,
    "recipe_total": None,
    "recipe_hash_to_id": None,
    "recipe_reference_ids": None,
    "tracked_save_paths": None,
}


def setup_logging():
    logger = logging.getLogger()
    if logger.handlers:
        return
    logger.setLevel(logging.INFO)
    formatter = logging.Formatter("%(asctime)s %(levelname)s %(message)s")

    if sys.stderr is not None:
        stream = logging.StreamHandler(sys.stderr)
        stream.setFormatter(formatter)
        logger.addHandler(stream)


def fatal(message: str):
    setup_logging()
    logging.error("%s", message)
    logging.error("Traceback:\n%s", traceback.format_exc())
    raise SystemExit(1)


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
    global LOG_NEXT_ID
    timestamp = time.strftime("%H:%M:%S")
    LOG_ENTRIES.append({"id": LOG_NEXT_ID, "time": timestamp, "message": message})
    LOG_NEXT_ID += 1
    del LOG_ENTRIES[:-LOG_LIMIT]


def load_config():
    if not CONFIG_PATH.exists():
        template_path = ROOT / "config.json"
        if template_path.exists():
            CONFIG_PATH.write_text(template_path.read_text(encoding="utf-8"), encoding="utf-8")
        else:
            CONFIG_PATH.write_text(
                json.dumps({"save_path": "", "save_file": "progress.sav"}, indent=2),
                encoding="utf-8",
            )

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


def load_recipe_cooked_hashes() -> set[int]:
    """
    Recipe "book" entries seem to be stored as per-recipe boolean flags.
    We count how many of those flags are non-zero in the save.
    """
    if not HASHES_DATA_PATH.exists():
        return set()

    hashes: set[int] = set()
    with HASHES_DATA_PATH.open("r", encoding="utf-8", errors="ignore") as file:
        for raw_line in file:
            line = raw_line.strip()
            if not line:
                continue
            parts = line.split(";", 2)
            if len(parts) < 3:
                continue
            hash_hex, _, var = parts
            if var.startswith("RecipeCard.Content.Item_") and var.endswith(".IsCooked"):
                try:
                    hashes.add(int(hash_hex, 16))
                except ValueError:
                    continue
    return hashes


def load_recipe_hash_to_id() -> dict[int, str]:
    """Map recipe cooked-flag hash -> recipe id (Item_*)."""
    if not HASHES_DATA_PATH.exists():
        return {}

    mapping: dict[int, str] = {}
    with HASHES_DATA_PATH.open("r", encoding="utf-8", errors="ignore") as file:
        for raw_line in file:
            line = raw_line.strip()
            if not line:
                continue
            parts = line.split(";", 2)
            if len(parts) != 3:
                continue
            hash_hex, _typ, var = parts
            if not (var.startswith("RecipeCard.Content.Item_") and var.endswith(".IsCooked")):
                continue
            try:
                h = int(hash_hex, 16)
            except ValueError:
                continue
            recipe_id = var[len("RecipeCard.Content.") : -len(".IsCooked")]
            mapping[h] = recipe_id
    return mapping


def load_recipe_reference_ids() -> set[str]:
    """Load the canonical 228 recipe IDs to use for intersections."""
    if not RECIPE_REFERENCE_IDS_PATH.exists():
        return set()
    ids = set()
    for line in RECIPE_REFERENCE_IDS_PATH.read_text(encoding="utf-8", errors="ignore").splitlines():
        item = line.strip()
        if item:
            ids.add(item)
    return ids


def initialize():
    if _DATA["initialized"]:
        return

    korok_data = load_korok_data()
    completion_data = load_completion_data()
    korok_hashes = {
        int(entry["hash"], 16)
        for group in ("hidden", "carry")
        for entry in korok_data[group]
    }
    completion_bool_hashes = {
        int(item["value"], 16)
        for category in completion_data["categories"]
        if category["kind"] == "bool"
        for item in category["items"]
    }
    completion_stat_hashes = {
        int(item["value"], 16)
        for stat in completion_data.get("stats", [])
        if not stat.get("arrayHash")
        for item in stat["items"]
    }
    completion_array_hashes = {
        int(stat["arrayHash"], 16)
        for stat in completion_data.get("stats", [])
        if stat.get("arrayHash")
    }

    recipe_hash_to_id = load_recipe_hash_to_id()
    recipe_hashes = set(recipe_hash_to_id.keys())
    recipe_reference_ids = load_recipe_reference_ids()

    _DATA["korok_data"] = korok_data
    _DATA["completion_data"] = completion_data
    _DATA["recipe_hashes"] = recipe_hashes
    _DATA["recipe_hash_to_id"] = recipe_hash_to_id
    _DATA["recipe_reference_ids"] = recipe_reference_ids
    _DATA["recipe_total"] = len(recipe_reference_ids) if recipe_reference_ids else min(len(recipe_hashes), MAX_RECIPES)
    _DATA["tracked_hashes"] = (
        korok_hashes
        | completion_bool_hashes
        | completion_stat_hashes
        | completion_array_hashes
        | recipe_hashes
    )
    _DATA["tracked_save_paths"] = scan_tracked_saves()
    _DATA["initialized"] = True


def load_state():
    if not STATE_PATH.exists():
        return {
            "activeSavePath": None,
            "saves": {},
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
                    "lastSaveModified": state.get("lastSaveModified"),
                }
            },
        }

    state.setdefault("activeSavePath", None)
    state.setdefault("saves", {})
    state.setdefault("activeSavePath", None)
    state["_exists"] = True
    return state


def save_state(state):
    temp_path = STATE_PATH.with_suffix(".json.tmp")
    persisted_state = {key: value for key, value in state.items() if not key.startswith("_")}
    with temp_path.open("w", encoding="utf-8") as file:
        json.dump(persisted_state, file, indent=2)
    temp_path.replace(STATE_PATH)


PAYLOAD_CACHE = {
    "mtimes": None,
    "payload": None,
}


def snapshot_tracked_saves():
    tracked_save_paths = _DATA["tracked_save_paths"] or []
    if not tracked_save_paths:
        raise ValueError("No tracked save files. Check config.json save_path/save_file.")

    snapshot = []
    for path in tracked_save_paths:
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
    tracked_hashes = _DATA["tracked_hashes"] or set()
    if len(data) < 0x30 or read_u32(data, 0) != 0x01020304:
        raise ValueError("Not a TOTK progress.sav file")

    table_end = find_hash_table_end(data)
    values = {}
    for offset in range(0x28, table_end, 8):
        hash_value = read_u32(data, offset)
        if hash_value in tracked_hashes:
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


def parse_player_max_stats(data):
    """Parse max Life / Stamina / Battery from PlayerStatus.*."""

    def read_by_hash_u32(hash_value: int):
        pointer_offset = find_hash_value_offset(data, hash_value)
        if pointer_offset is None:
            return None
        return read_u32(data, pointer_offset)

    def read_by_hash_f32(hash_value: int):
        pointer_offset = find_hash_value_offset(data, hash_value)
        if pointer_offset is None:
            return None
        return read_f32(data, pointer_offset)

    max_life = read_by_hash_u32(PLAYER_MAX_LIFE_HASH)
    max_stamina = read_by_hash_f32(PLAYER_MAX_STAMINA_HASH)
    max_energy = read_by_hash_f32(PLAYER_MAX_ENERGY_HASH)

    if max_life is None or max_stamina is None or max_energy is None:
        return None

    # SavegameEditor reference scaling:
    # - hearts are stored as quarters of life
    # - stamina wheels and battery cells are stored as /1000 units
    life_hearts = int(round(max_life / 4))
    stamina_wheels = int(round(max_stamina / 1000))
    battery_cells = int(round(max_energy / 1000))

    return {
        "maxLife": max_life,
        "lifeHearts": life_hearts,
        "maxStamina": max_stamina,
        "staminaWheels": stamina_wheels,
        "maxEnergy": max_energy,
        "batteryCells": battery_cells,
    }


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


def read_string64_array(data, pointer):
    if pointer is None or pointer < 0 or pointer + 4 > len(data):
        return []

    count = read_u32(data, pointer)
    start = pointer + 4
    if count <= 0 or start + count * 64 > len(data):
        return []

    values = []
    for index in range(count):
        raw = data[start + index * 64:start + (index + 1) * 64]
        text = raw.split(b"\x00", 1)[0].decode("utf-8", errors="ignore").strip()
        if text:
            values.append(text)
    return values


def build_markers(values):
    korok_data = _DATA["korok_data"] or {"hidden": [], "carry": []}
    markers = []
    for kind in ("hidden", "carry"):
        for entry in korok_data[kind]:
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
    completion_data = _DATA["completion_data"] or {"categories": []}
    categories = []
    for category in completion_data["categories"]:
        items = []
        obtained_items = []
        obtained_count = 0
        target_value = category.get("targetValue")
        target_raw = int(target_value, 16) if target_value else None
        for item in category["items"]:
            if category["kind"] == "guid":
                obtained = int(item["value"]) in guid_values
                raw_value = "guid"
            else:
                hash_value = int(item["value"], 16)
                raw = values.get(hash_value, 0)
                obtained = raw == target_raw if target_raw is not None else raw != 0
                raw_value = f"{raw:08x}"

            marker = dict(item)
            marker.update(world_to_map(item["x"], item["z"]))
            marker["categoryId"] = category["id"]
            marker["categoryLabel"] = category["label"]
            marker["obtained"] = obtained
            marker["rawValue"] = raw_value

            if obtained:
                obtained_count += 1
                obtained_items.append(marker)
                continue

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
            "obtainedItems": obtained_items,
            "defaultVisible": category.get("defaultVisible", True),
            "sourceCounts": category.get("sourceCounts", {}),
        })
    return categories


def build_armor_stat(stat, values, data):
    array_hash = stat.get("arrayHash")
    pointer = values.get(int(array_hash, 16), None) if array_hash else None
    pouch_names = set(read_string64_array(data, pointer))
    obtained_count = 0
    missing_items = []

    for item in stat["items"]:
        if stat["kind"] == "armor_inventory":
            obtained = any(armor_id in pouch_names for armor_id in item.get("ids", []))
        else:
            upgraded_ids = item.get("upgradedIds") or [item.get("upgradedId")]
            obtained = any(armor_id in pouch_names for armor_id in upgraded_ids)
        if obtained:
            obtained_count += 1
        elif stat.get("includeMissing"):
            missing_items.append({
                "id": item["id"],
                "label": item.get("label") or item["id"],
                "baseId": item.get("baseId"),
                "upgradedId": item.get("upgradedId"),
                "upgradedIds": item.get("upgradedIds"),
            })

    total = len(stat["items"])
    summary = {
        "id": stat["id"],
        "label": stat["label"],
        "kind": stat["kind"],
        "total": total,
        "obtained": obtained_count,
        "remaining": total - obtained_count,
        "sourceCounts": stat.get("sourceCounts", {}),
    }
    if stat.get("includeMissing"):
        summary["missing"] = missing_items
    return summary


def build_completion_stats(values, data):
    completion_data = _DATA["completion_data"] or {"stats": []}
    stats = []
    for stat in completion_data.get("stats", []):
        if stat["kind"].startswith("armor_"):
            stats.append(build_armor_stat(stat, values, data))
            continue

        target_value = stat.get("targetValue")
        target_raw = int(target_value, 16) if target_value else None
        obtained_count = 0
        missing_items = []
        for item in stat["items"]:
            hash_value = int(item["value"], 16)
            raw = values.get(hash_value, 0)
            if stat["kind"] == "reverse" and target_raw is not None:
                obtained = raw != target_raw
            elif target_raw is not None:
                obtained = raw == target_raw
            else:
                obtained = raw != 0
            if obtained:
                obtained_count += 1
            elif stat.get("includeMissing"):
                missing_items.append({
                    "id": item["id"],
                    "label": item.get("label") or item["id"],
                    "value": item["value"],
                    "rawValue": raw,
                })

        total = len(stat["items"])
        summary = {
            "id": stat["id"],
            "label": stat["label"],
            "kind": stat["kind"],
            "total": total,
            "obtained": obtained_count,
            "remaining": total - obtained_count,
            "sourceCounts": stat.get("sourceCounts", {}),
        }
        if stat.get("includeMissing"):
            summary["missing"] = missing_items
        stats.append(summary)
    return stats


def update_state(markers, save_modified, active_save_path):
    state = load_state()
    save_key = str(active_save_path)
    save_state_entry = state["saves"].setdefault(
        save_key,
        {
            "obtainedKorokIds": [],
            "lastSaveModified": None,
        },
    )
    previous_ids = set(save_state_entry["obtainedKorokIds"])
    current_ids = {marker["id"] for marker in markers if marker["obtained"]}
    first_seen_save = not save_state_entry["obtainedKorokIds"] and not save_state_entry["lastSaveModified"]
    _ = sorted(current_ids - previous_ids) if state["_exists"] and not first_seen_save else []

    save_state_entry["obtainedKorokIds"] = sorted(current_ids)
    save_state_entry["lastSaveModified"] = save_modified
    state["activeSavePath"] = str(active_save_path)
    save_state(state)
    return save_state_entry


def build_save_payload(data, save_path, save_modified, snapshot=None, update_latest_state=True):
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
    player_stats = parse_player_max_stats(data)
    recipe_hash_to_id = _DATA.get("recipe_hash_to_id") or {}
    recipe_reference_ids = _DATA.get("recipe_reference_ids") or set()
    recipe_total = _DATA.get("recipe_total") or len(recipe_reference_ids) or len(recipe_hash_to_id)

    # Determine which cooked recipes are in (or out of) the canonical 228 set.
    cooked_recipe_ids = {
        recipe_hash_to_id[hash_value]
        for hash_value in recipe_hash_to_id
        if values.get(hash_value, 0) != 0
    }
    in_228 = cooked_recipe_ids & recipe_reference_ids
    extra = sorted(cooked_recipe_ids - recipe_reference_ids)
    recipes_obtained = len(in_228)
    markers = build_markers(values)
    completion = build_completion(values, guid_values)
    completion_stats = build_completion_stats(values, data)
    obtained_markers = [marker for marker in markers if marker["obtained"]]
    if update_latest_state:
        update_state(markers, save_modified, save_path)

    return {
        "savePath": str(save_path),
        "trackedSaves": [
            {"path": str(item["path"]), "mtime": item["mtime"]}
            for item in (snapshot or [])
        ],
        "lastModified": save_modified,
        "fileSize": len(data),
        "version": known_version,
        "player": player_position,
        "playerStats": player_stats,
        "recipes": {
            "obtained": recipes_obtained,
            "total": recipe_total,
            "extras": extra,
        },
        "counts": {
            "hidden": sum(1 for marker in obtained_markers if marker["kind"] == "hidden"),
            "carry": sum(1 for marker in obtained_markers if marker["kind"] == "carry"),
            "totalLocations": len(obtained_markers),
            "totalSeeds": sum(marker["seedValue"] for marker in obtained_markers),
            "availableLocations": len((_DATA["korok_data"] or {"hidden": [], "carry": []})["hidden"]) + len((_DATA["korok_data"] or {"hidden": [], "carry": []})["carry"]),
            "availableSeeds": len((_DATA["korok_data"] or {"hidden": [], "carry": []})["hidden"]) + len((_DATA["korok_data"] or {"hidden": [], "carry": []})["carry"]) * 2,
        },
        "markers": markers,
        "completion": completion,
        "completionStats": completion_stats,
    }


def parse_uploaded_save(data, filename):
    with SERVER_LOCK:
        initialize()
        label = filename or "uploaded progress.sav"
        save_modified = time.time()
        payload = build_save_payload(data, f"manual upload: {label}", save_modified, snapshot=[], update_latest_state=False)
        obtained_markers = [marker for marker in payload["markers"] if marker["obtained"]]
        add_log(f"Parsed manual upload {label}: {sum(marker['seedValue'] for marker in obtained_markers)}/1000 seeds")
        return payload


def parse_current_save():
    with SERVER_LOCK:
        initialize()
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
        payload = build_save_payload(data, save_path, save_modified, snapshot=snapshot, update_latest_state=True)
        markers = payload["markers"]
        obtained_markers = [marker for marker in markers if marker["obtained"]]
        add_log(f"Parsed {save_label(save_path)}: {sum(marker['seedValue'] for marker in obtained_markers)}/1000 seeds")

        PAYLOAD_CACHE["mtimes"] = current_mtimes
        PAYLOAD_CACHE["payload"] = payload
        return payload


def health_status():
    with SERVER_LOCK:
        initialize()
        snapshot = snapshot_tracked_saves()
        active = select_active_save(snapshot)
        # Keep this tiny (<100B typical): client uses it as a change token.
        # Use mtime + file name + parent folder for stability without long paths.
        path = Path(active["path"])
        label = f"{path.parent.name}/{path.name}"
        return f"{label}|{active['mtime']}"


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        # In PyInstaller --windowed apps, sys.stderr can be None which breaks the
        # default BaseHTTPRequestHandler logging. Route it to logging instead.
        logging.info("%s - - %s", self.address_string(), format % args)

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

    def send_text(self, status, body):
        data = str(body).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/health":
            try:
                self.send_text(200, health_status())
            except Exception as error:
                add_log(f"Error: {error}")
                logging.exception("Error handling /api/health")
                self.send_text(500, str(error))
            return
        if parsed.path == "/api/koroks":
            try:
                self.send_json(200, parse_current_save())
            except Exception as error:
                add_log(f"Error: {error}")
                logging.exception("Error handling /api/koroks")
                self.send_json(500, {"error": str(error)})
            return
        if parsed.path == "/api/log":
            self.send_json(200, {"entries": LOG_ENTRIES[-LOG_LIMIT:]})
            return
        if parsed.path == "/api/delta_log":
            query = parse_qs(parsed.query or "")
            try:
                last_id = int((query.get("last_id") or ["0"])[0])
            except ValueError:
                last_id = 0
            entries = [entry for entry in LOG_ENTRIES if entry.get("id", 0) > last_id]
            latest_id = LOG_ENTRIES[-1]["id"] if LOG_ENTRIES else last_id
            self.send_json(200, {"entries": entries, "latestId": latest_id})
            return
        return super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/upload_save":
            try:
                length = int(self.headers.get("Content-Length", "0"))
                if length <= 0:
                    self.send_json(400, {"error": "No save file was uploaded"})
                    return
                data = self.rfile.read(length)
                filename = self.headers.get("X-Filename", "uploaded progress.sav")
                self.send_json(200, parse_uploaded_save(data, filename))
            except Exception as error:
                add_log(f"Upload error: {error}")
                logging.exception("Error handling /api/upload_save")
                self.send_json(500, {"error": str(error)})
            return
        self.send_json(404, {"error": "Not found"})


def main():
    setup_logging()
    os.chdir(ROOT)
    apply_listen_settings_from_config()
    url = f"http://{url_host_for_browser(HOST)}:{PORT}/"
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"Serving TOTK helper at {url}")
    logging.info("Serving TOTK helper at %s", url)
    try:
        webbrowser.open(url, new=1, autoraise=True)
    except Exception:
        logging.exception("Could not open browser")
    server.serve_forever()


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception:
        fatal("Unhandled startup error.")
