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
KOROK_DATA_PATH = ROOT / "references" / "korok_data.json"
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
        "mapY": (HYRULE_MAX_Z - z) / (HYRULE_MAX_Z - HYRULE_MIN_Z) * 5000,
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


def load_json(path):
    with path.open("r", encoding="utf-8") as file:
        return json.load(file)


def iter_hash_variables():
    if not HASHES_DATA_PATH.exists():
        return
    with HASHES_DATA_PATH.open("r", encoding="utf-8", errors="ignore") as file:
        for raw_line in file:
            parts = raw_line.strip().split(";", 2)
            if len(parts) != 3:
                continue
            try:
                yield int(parts[0], 16), parts[2]
            except ValueError:
                continue


def load_recipe_hash_to_id() -> dict[int, str]:
    """Map recipe cooked-flag hash -> recipe id (Item_*)."""
    mapping: dict[int, str] = {}
    for hash_value, var in iter_hash_variables() or ():
        if var.startswith("RecipeCard.Content.Item_") and var.endswith(".IsCooked"):
            mapping[hash_value] = var[len("RecipeCard.Content.") : -len(".IsCooked")]
    return mapping


def load_recipe_reference_ids() -> set[str]:
    """Load the canonical 228 recipe IDs to use for intersections."""
    if not RECIPE_REFERENCE_IDS_PATH.exists():
        return set()
    return {
        line.strip()
        for line in RECIPE_REFERENCE_IDS_PATH.read_text(encoding="utf-8", errors="ignore").splitlines()
        if line.strip()
    }


def initialize_data():
    """Load static JSON/reference data and derive the hashes used by save parsing."""
    korok_data = load_json(KOROK_DATA_PATH)
    completion_data = load_json(COMPLETION_DATA_PATH)
    recipe_hash_to_id = load_recipe_hash_to_id()
    recipe_hashes = set(recipe_hash_to_id.keys())
    recipe_reference_ids = load_recipe_reference_ids()
    categories = completion_data["categories"]
    stats = completion_data.get("stats", [])

    _DATA["korok_data"] = korok_data
    _DATA["completion_data"] = completion_data
    _DATA["recipe_hashes"] = recipe_hashes
    _DATA["recipe_hash_to_id"] = recipe_hash_to_id
    _DATA["recipe_reference_ids"] = recipe_reference_ids
    _DATA["recipe_total"] = len(recipe_reference_ids) if recipe_reference_ids else min(len(recipe_hashes), MAX_RECIPES)
    _DATA["tracked_hashes"] = (
        {
            int(entry["hash"], 16)
            for group in ("hidden", "carry")
            for entry in korok_data[group]
        }
        | {
            int(item["value"], 16)
            for definition in [*categories, *(stat for stat in stats if not stat.get("arrayHash"))]
            if definition["kind"] != "guid"
            for item in definition["items"]
        }
        | {
            int(stat["arrayHash"], 16)
            for stat in stats
            if stat.get("arrayHash")
        }
        | recipe_hashes
    )


def initialize():
    if _DATA["initialized"]:
        return

    initialize_data()
    _DATA["tracked_save_paths"] = scan_tracked_saves()
    _DATA["initialized"] = True


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


def read_save_bytes(save_path):
    last_error = None
    for _ in range(4):
        temp = tempfile.NamedTemporaryFile(delete=False, suffix=".sav")
        temp.close()
        temp_path = Path(temp.name)
        try:
            shutil.copyfile(save_path, temp_path)
            return temp_path.read_bytes()
        except (PermissionError, OSError) as error:
            last_error = error
            time.sleep(0.15)
        finally:
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


def read_hash_value(data, hash_value, reader=read_u32):
    pointer_offset = find_hash_value_offset(data, hash_value)
    return None if pointer_offset is None else reader(data, pointer_offset)


def parse_player_position(data):
    vector_offset = read_hash_value(data, PLAYER_SAVE_POS_HASH)
    if vector_offset is None:
        return None

    raw_x = read_f32(data, vector_offset)
    raw_y = read_f32(data, vector_offset + 4)
    raw_z = read_f32(data, vector_offset + 8)
    x = raw_x
    z = raw_z
    position = {
        "x": x,
        "y": raw_y - 106,
        "z": z,
        "raw": {"x": raw_x, "y": raw_y, "z": raw_z},
        "layer": layer_for_y(raw_y - 106),
    }
    position.update(world_to_map(x, z))
    return position


def parse_player_max_stats(data):
    """Parse max Life / Stamina / Battery from PlayerStatus.*."""
    max_life = read_hash_value(data, PLAYER_MAX_LIFE_HASH)
    max_stamina = read_hash_value(data, PLAYER_MAX_STAMINA_HASH, read_f32)
    max_energy = read_hash_value(data, PLAYER_MAX_ENERGY_HASH, read_f32)

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
    guid_offset = read_hash_value(data, META_SAVE_TYPE_HASH)
    if guid_offset is None:
        return set()

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


def progress_summary(definition, total, obtained_count):
    return {
        "id": definition["id"],
        "label": definition["label"],
        "kind": definition["kind"],
        "total": total,
        "obtained": obtained_count,
        "remaining": total - obtained_count,
        "sourceCounts": definition.get("sourceCounts", {}),
    }


def make_progress_marker(entry, category, obtained, raw_value):
    marker = dict(entry)
    marker.update(world_to_map(entry["x"], entry["z"]))
    marker["layer"] = layer_for_y(entry.get("y", 0))
    marker["categoryId"] = category["id"]
    marker["categoryLabel"] = category["label"]
    marker["obtained"] = obtained
    marker["rawValue"] = raw_value
    return marker


def target_raw(definition):
    value = definition.get("targetValue")
    return int(value, 16) if value else None


def is_raw_obtained(definition, raw):
    expected = target_raw(definition)
    if definition["kind"] == "reverse" and expected is not None:
        return raw != expected
    if expected is not None:
        return raw == expected
    return raw != 0


def save_item_state(definition, item, values, guid_values=None):
    if definition["kind"] == "guid":
        return int(item["value"]) in (guid_values or set()), "guid", None
    raw = values.get(int(item["value"], 16), 0)
    return is_raw_obtained(definition, raw), f"{raw:08x}", raw


def split_progress_items(definition, markers):
    items = []
    obtained_items = []
    for marker in markers:
        (obtained_items if marker["obtained"] else items).append(marker)
    summary = progress_summary(definition, len(markers), len(obtained_items))
    summary.update({
        "items": items,
        "obtainedItems": obtained_items,
        "defaultVisible": definition.get("defaultVisible", True),
    })
    return summary


def build_map_category(category, values, guid_values):
    return split_progress_items(
        category,
        [
            make_progress_marker(item, category, *save_item_state(category, item, values, guid_values)[:2])
            for item in category["items"]
        ],
    )


def build_seed_category(values):
    korok_data = _DATA["korok_data"] or {"hidden": [], "carry": []}
    definition = {
        "id": "koroks",
        "label": "Koroks",
        "kind": "seed",
        "sourceCounts": {
            "locations": sum(len(korok_data[kind]) for kind in ("hidden", "carry")),
            "seeds": len(korok_data["hidden"]) + len(korok_data["carry"]) * 2,
        },
    }
    markers = []
    for kind in ("hidden", "carry"):
        for entry in korok_data[kind]:
            hash_value = int(entry["hash"], 16)
            raw_value = values.get(hash_value, 0)
            obtained = raw_value != 0 if kind == "hidden" else raw_value == CLEAR_HASH
            marker = make_progress_marker(entry, definition, obtained, f"{raw_value:08x}")
            marker["seedValue"] = 2 if kind == "carry" else 1
            markers.append(marker)
    category = split_progress_items(definition, markers)
    category["obtainedSeeds"] = sum(marker["seedValue"] for marker in category["obtainedItems"])
    category["totalSeeds"] = definition["sourceCounts"]["seeds"]
    return category


def build_completion(values, guid_values):
    completion_data = _DATA["completion_data"] or {"categories": []}
    return [build_seed_category(values)] + [
        build_map_category(category, values, guid_values)
        for category in completion_data["categories"]
    ]


def build_stat_summary(stat, item_state, missing_keys=()):
    obtained_count = 0
    missing_items = []

    for item in stat["items"]:
        obtained, extra_missing = item_state(item)
        if obtained:
            obtained_count += 1
        elif stat.get("includeMissing"):
            missing_items.append({
                "id": item["id"],
                "label": item.get("label") or item["id"],
                **{key: item.get(key) for key in missing_keys if key in item},
                **extra_missing,
            })

    summary = progress_summary(stat, len(stat["items"]), obtained_count)
    if stat.get("includeMissing"):
        summary["missing"] = missing_items
    return summary


def build_armor_stat(stat, values, data):
    array_hash = stat.get("arrayHash")
    pointer = values.get(int(array_hash, 16), None) if array_hash else None
    pouch_names = set(read_string64_array(data, pointer))

    def item_state(item):
        ids = item.get("ids", []) if stat["kind"] == "armor_inventory" else item.get("upgradedIds") or [item.get("upgradedId")]
        return any(armor_id in pouch_names for armor_id in ids), {}

    return build_stat_summary(stat, item_state, ("baseId", "upgradedId", "upgradedIds"))


def build_completion_stats(values, data):
    completion_data = _DATA["completion_data"] or {"stats": []}
    stats = []
    for stat in completion_data.get("stats", []):
        if stat["kind"].startswith("armor_"):
            stats.append(build_armor_stat(stat, values, data))
            continue

        def item_state(item, stat=stat):
            obtained, _raw_value, raw = save_item_state(stat, item, values)
            return obtained, {"rawValue": raw}

        stats.append(build_stat_summary(stat, item_state, ("value",)))
    return stats


def seed_category_summary(completion):
    seed_category = next((category for category in completion if category["kind"] == "seed"), None)
    if not seed_category:
        return {"locations": 0, "seeds": 0, "totalLocations": 0, "totalSeeds": 0}
    return {
        "locations": seed_category["obtained"],
        "seeds": seed_category.get("obtainedSeeds", seed_category["obtained"]),
        "totalLocations": seed_category["total"],
        "totalSeeds": seed_category.get("totalSeeds", seed_category["total"]),
    }


def build_recipe_summary(values):
    recipe_hash_to_id = _DATA.get("recipe_hash_to_id") or {}
    recipe_reference_ids = _DATA.get("recipe_reference_ids") or set()
    recipe_total = _DATA.get("recipe_total") or len(recipe_reference_ids) or len(recipe_hash_to_id)
    cooked_recipe_ids = {
        recipe_hash_to_id[hash_value]
        for hash_value in recipe_hash_to_id
        if values.get(hash_value, 0) != 0
    }
    canonical_ids = cooked_recipe_ids & recipe_reference_ids
    return {
        "obtained": len(canonical_ids),
        "total": recipe_total,
        "extras": sorted(cooked_recipe_ids - recipe_reference_ids),
    }


def build_save_payload(data, save_path, save_modified, snapshot=None):
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
    recipes = build_recipe_summary(values)
    completion = build_completion(values, guid_values)
    completion_stats = build_completion_stats(values, data)
    seed_summary = seed_category_summary(completion)

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
        "recipes": recipes,
        "counts": {
            "totalLocations": seed_summary["locations"],
            "totalSeeds": seed_summary["seeds"],
            "availableLocations": seed_summary["totalLocations"],
            "availableSeeds": seed_summary["totalSeeds"],
        },
        "completion": completion,
        "completionStats": completion_stats,
    }


def parse_uploaded_save(data, filename):
    with SERVER_LOCK:
        initialize()
        label = filename or "uploaded progress.sav"
        save_modified = time.time()
        payload = build_save_payload(data, f"manual upload: {label}", save_modified, snapshot=[])
        add_log(f"Parsed manual upload {label}: {payload['counts']['totalSeeds']}/1000 seeds")
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
        payload = build_save_payload(data, save_path, save_modified, snapshot=snapshot)
        add_log(f"Parsed {save_label(save_path)}: {payload['counts']['totalSeeds']}/1000 seeds")

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


def delta_log_payload(query):
    try:
        last_id = int((query.get("last_id") or ["0"])[0])
    except ValueError:
        last_id = 0
    entries = [entry for entry in LOG_ENTRIES if entry.get("id", 0) > last_id]
    latest_id = LOG_ENTRIES[-1]["id"] if LOG_ENTRIES else last_id
    return {"entries": entries, "latestId": latest_id}


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        # In PyInstaller --windowed apps, sys.stderr can be None which breaks the
        # default BaseHTTPRequestHandler logging. Route it to logging instead.
        logging.info("%s - - %s", self.address_string(), format % args)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_body(self, status, body, content_type):
        data = body.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", f"{content_type}; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def send_json(self, status, payload):
        self.send_body(status, json.dumps(payload), "application/json")

    def send_text(self, status, body):
        self.send_body(status, str(body), "text/plain")

    def read_request_body(self):
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0:
            raise ValueError("No save file was uploaded")
        return self.rfile.read(length)

    def handle_upload_save(self):
        filename = self.headers.get("X-Filename", "uploaded progress.sav")
        return parse_uploaded_save(self.read_request_body(), filename)

    def do_GET(self):
        parsed = urlparse(self.path)
        try:
            if parsed.path == "/api/health":
                self.send_text(200, health_status())
                return
            if parsed.path == "/api/progress":
                self.send_json(200, parse_current_save())
                return
            if parsed.path == "/api/log":
                self.send_json(200, {"entries": LOG_ENTRIES[-LOG_LIMIT:]})
                return
            if parsed.path == "/api/delta_log":
                self.send_json(200, delta_log_payload(parse_qs(parsed.query or "")))
                return
        except Exception as error:
            add_log(f"Error: {error}")
            logging.exception("Error handling %s", parsed.path)
            if parsed.path == "/api/health":
                self.send_text(500, str(error))
            else:
                self.send_json(500, {"error": str(error)})
            return
        return super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path != "/api/upload_save":
            self.send_json(404, {"error": "Not found"})
            return
        try:
            self.send_json(200, self.handle_upload_save())
        except Exception as error:
            add_log(f"Upload error: {error}")
            logging.exception("Error handling %s", parsed.path)
            status = 400 if isinstance(error, ValueError) else 500
            self.send_json(status, {"error": str(error)})


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
