import ast
import csv
import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
REFERENCES = ROOT / "references"
OUTPUT = ROOT / "completion_data.json"
LAYER_FIX = 500
ICON_Y_OFFSET = 106

MASTER_MAP = REFERENCES / "TOTK master sheet - Map.csv"
MASTER_MAP_SKIP = ( "_IsCompleted_Exp", "_IsAfter_DungeonBossDead_Exp" )  # Fix map csv
MASTER_MAP_REPLACE = { "IsVisitLocation.HatenoLab": "IsVisitLocation.HatenoLabo" }  # Fix map csv

TOWER_LOCATION_NAMES = [
    "Lookout Landing",
    "Lindor's Brow",
    "Pikida Stonegrove",
    "Eldin Canyon",
    "Ulri Mountain",
    "Sahasra Slope",
    "Upland Zorana",
    "Hyrule Field",
    "Gerudo Canyon",
    "Gerudo Highlands",
    "Rabella Wetlands",
    "Thyphlo Ruins",
    "Popla Foothills",
    "Mount Lanayru",
    "Rospro Pass",
]

TOWER_OBJMAP_IDS = [
    "0xf5d609bea48ad8a7",
    "0x0fc9e8295f1f88fd",
    "0xd123cab576760e7a",
    "0x2db057d38b410428",
    "0xb3186e3b60f253e0",
    "0x17e0e03b26704860",
    "0xe7fca251fbcd90c0",
    "0x38aac9054a75ba9f",
    "0x5d34d120278b0839",
    "0xbcdf97fc90e206fc",
    "0x32dcf687f9affd88",
    "0x5b8c27dcacdedda0",
    "0x1096ee2cdaab6137",
    "0x999f20de53cae3cf",
    "0xc1c2ac34270e19c5",
]


CATEGORIES = [
    {"id": "towers", "label": "Towers", "hashes": "TOWERS_ACTIVATED", "coords": "TOWERS", "kind": "bool"},
    {"id": "shrines", "label": "Shrines", "hashes": "SHRINES_STATUS", "coords": "SHRINES", "kind": "bool", "target": "Clear"},
    {"id": "lightroots", "label": "Lightroots", "hashes": "LIGHTROOTS_STATUS", "coords": "LIGHTROOTS", "kind": "bool", "target": "Open"},
    {"id": "caves", "label": "Caves", "hashes": "LOCATION_CAVES_VISITED2", "coords": "LOCATION_CAVES", "kind": "bool"},
    {"id": "bubbulfrogs", "label": "Bubbulfrogs", "hashes": "BUBBULS_GUIDS", "coords": "LOCATION_BUBBULS", "kind": "guid"},
    {"id": "hudson_sign", "label": "Hudson Sign", "hashes": "ADDISON_COMPLETED", "coords": "ADDISON", "kind": "guid"},
    {"id": "dungeon_bosses", "label": "Depths Dungeon Bosses", "hashes": "BOSSES_REMATCH_DEFEATED", "coords": "BOSSES_REMATCH", "kind": "bool"},
    {"id": "flux_construct", "label": "Flux Constructs", "hashes": "BOSSES_FLUX_CONSTRUCT_DEFEATED", "coords": "BOSSES_FLUX_CONSTRUCT", "kind": "bool"},
    {"id": "hinox", "label": "Hinox", "hashes": "BOSSES_HINOXES_DEFEATED", "coords": "BOSSES_HINOXES", "kind": "bool"},
    {"id": "stone_talus", "label": "Stone Talus", "hashes": "BOSSES_TALUSES_DEFEATED", "coords": "BOSSES_TALUSES", "kind": "bool"},
    {"id": "molduga", "label": "Molduga", "hashes": "BOSSES_MOLDUGAS_DEFEATED", "coords": "BOSSES_MOLDUGAS", "kind": "bool"},
    {"id": "frox", "label": "Frox", "hashes": "BOSSES_FROXS_DEFEATED", "coords": "BOSSES_FROXS", "kind": "bool"},
    {"id": "gleeok", "label": "Gleeok", "hashes": "BOSSES_GLEEOKS_DEFEATED", "coords": "BOSSES_GLEEOKS", "kind": "bool"},
    {"id": "wells", "label": "Wells", "hashes": "LOCATION_WELLS_VISITED2", "coords": "LOCATION_WELLS", "kind": "bool"},
    {"id": "chasms", "label": "Chasms", "hashes": "LOCATION_CHASMS_VISITED2", "coords": "LOCATION_CHASMS", "kind": "bool"},
    {"id": "schema_stone", "label": "Schema Stones", "hashes": "SCHEMATICS_STONE_FOUND", "coords": "SCHEMATICS_STONE", "kind": "bool"},
    {"id": "yiga_schematic", "label": "Yiga Schematic", "hashes": "SCHEMATICS_YIGA_FOUND", "coords": "SCHEMATICS_YIGA", "kind": "bool"},
    {"id": "old_map", "label": "Old Map", "hashes": "TREASURE_MAPS_FOUND", "coords": "TREASURE_MAPS", "kind": "bool"},
    {"id": "armor", "label": "Armor", "source": "armor_locations", "kind": "bool"},
    {"id": "sage_will", "label": "Sage's Will", "hashes": "SAGE_WILLS_FOUND", "coords": "SAGE_WILLS", "kind": "guid"},
    {"id": "general_locations", "label": "General Locations", "source": "master_map", "kind": "bool"},
]


STATS = [
    {"id": "compendium", "label": "Compendium", "hashes": "COMPENDIUM_STATUS", "kind": "reverse", "target": "Unopened", "includeMissing": True},
    {"id": "armor_inventory", "label": "Armor", "source": "armor_inventory", "kind": "armor_inventory", "includeMissing": True},
    {"id": "armor_upgraded", "label": "Armor (4-star upgraded)", "source": "armor_upgraded", "kind": "armor_upgraded", "includeMissing": True},
    {"id": "pristine_weapons", "label": "Pristine Weapons", "source": "pristine_weapons", "kind": "positive", "includeMissing": True},
    {"id": "fabrics", "label": "Fabrics", "source": "fabrics", "kind": "positive", "includeMissing": True},
]

COLLECTABLE_FABRICS = [
    ("Default", "Ordinary Fabric"),
    ("Pattern00", "Goron Fabric"),
    ("Pattern01", "Zora Fabric"),
    ("Pattern02", "Gerudo Fabric"),
    ("Pattern03", "Royal Hyrulean Fabric"),
    ("Pattern04", "Zonai Fabric"),
    ("Pattern05", "Sheikah Fabric"),
    ("Pattern06", "Yiga Fabric"),
    ("Pattern07", "Monster-Control-Crew Fabric"),
    ("Pattern08", "Zonai Survey Team Fabric"),
    ("Pattern09", "Horse-God Fabric"),
    ("Pattern10", "Lurelin Village Fabric"),
    ("Pattern11", "Lucky Clover Gazette Fabric"),
    ("Pattern12", "Hudson Construction Fabric"),
    ("Pattern13", "Koltin's Fabric"),
    ("Pattern14", "Korok Fabric"),
    ("Pattern15", "Grizzlemaw-Bear Fabric"),
    ("Pattern16", "Robbie's Fabric"),
    ("Pattern17", "Cece Fabric"),
    ("Pattern18", "Aerocuda Fabric"),
    ("Pattern19", "Eldin-Ostrich Fabric"),
    ("Pattern20", "Cucco Fabric"),
    ("Pattern21", "Horse Fabric"),
    ("Pattern22", "Chuchu Fabric"),
    ("Pattern23", "Lynel Fabric"),
    ("Pattern24", "Gleeok Fabric"),
    ("Pattern25", "Stalnox Fabric"),
    ("Pattern55", "Nostalgic Fabric"),
    ("Pattern56", "Addison's Fabric"),
]


def murmur3_32(text, seed=0):
    """reference CSV / completism file uses murmur3_32. so we do it here as well."""
    data = bytearray(text.encode("utf-8"))
    length = len(data)
    c1 = 0xCC9E2D51
    c2 = 0x1B873593
    h1 = seed & 0xFFFFFFFF
    rounded_end = length & 0xFFFFFFFC
    for i in range(0, rounded_end, 4):
        k1 = data[i] | (data[i + 1] << 8) | (data[i + 2] << 16) | (data[i + 3] << 24)
        k1 = (k1 * c1) & 0xFFFFFFFF
        k1 = ((k1 << 15) | (k1 >> 17)) & 0xFFFFFFFF
        k1 = (k1 * c2) & 0xFFFFFFFF
        h1 ^= k1
        h1 = ((h1 << 13) | (h1 >> 19)) & 0xFFFFFFFF
        h1 = (h1 * 5 + 0xE6546B64) & 0xFFFFFFFF
    k1 = 0
    tail = length & 3
    if tail == 3:
        k1 ^= data[rounded_end + 2] << 16
    if tail >= 2:
        k1 ^= data[rounded_end + 1] << 8
    if tail >= 1:
        k1 ^= data[rounded_end]
        k1 = (k1 * c1) & 0xFFFFFFFF
        k1 = ((k1 << 15) | (k1 >> 17)) & 0xFFFFFFFF
        k1 = (k1 * c2) & 0xFFFFFFFF
        h1 ^= k1
    h1 ^= length
    h1 ^= h1 >> 16
    h1 = (h1 * 0x85EBCA6B) & 0xFFFFFFFF
    h1 ^= h1 >> 13
    h1 = (h1 * 0xC2B2AE35) & 0xFFFFFFFF
    h1 ^= h1 >> 16
    return h1 & 0xFFFFFFFF


def extract_array(text, name):
    match = re.search(rf"\b{name}\s*:\s*\[|\b{name}\s*=\s*\[", text)
    if not match:
        raise ValueError(f"Could not find {name}")
    start = match.end() - 1
    depth = 0
    in_line = False
    in_block = False
    in_quote = None
    escaped = False
    for index in range(start, len(text)):
        char = text[index]
        nxt = text[index + 1] if index + 1 < len(text) else ""
        if in_line:
            if char in "\r\n":
                in_line = False
            continue
        if in_block:
            if char == "*" and nxt == "/":
                in_block = False
            continue
        if in_quote:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == in_quote:
                in_quote = None
            continue
        if char in "\"'":
            in_quote = char
            continue
        if char == "/" and nxt == "/":
            in_line = True
            continue
        if char == "/" and nxt == "*":
            in_block = True
            continue
        if char == "[":
            depth += 1
        elif char == "]":
            depth -= 1
            if depth == 0:
                return text[start:index + 1]
    raise ValueError(f"Could not parse {name}")


def strip_comments(text):
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    text = re.sub(r"//.*", "", text)
    return text


def iter_active_array_rows(text, name):
    array = extract_array(text, name)[1:-1]
    in_block = False
    for line in array.splitlines():
        code = ""
        comment = ""
        index = 0
        in_quote = None
        escaped = False
        while index < len(line):
            char = line[index]
            nxt = line[index + 1] if index + 1 < len(line) else ""
            if in_block:
                if char == "*" and nxt == "/":
                    in_block = False
                    index += 2
                    continue
                index += 1
                continue
            if in_quote:
                code += char
                if escaped:
                    escaped = False
                elif char == "\\":
                    escaped = True
                elif char == in_quote:
                    in_quote = None
                index += 1
                continue
            if char in "\"'":
                in_quote = char
                code += char
                index += 1
                continue
            if char == "/" and nxt == "*":
                in_block = True
                index += 2
                continue
            if char == "/" and nxt == "/":
                comment = line[index + 2:].strip()
                break
            code += char
            index += 1

        code = code.strip()
        if code:
            yield code, comment


def parse_hash_rows(text, name, kind):
    rows = []
    for code, comment in iter_active_array_rows(text, name):
        matches = list(re.finditer(r"hash\(\s*(['\"])(.*?)\1\s*\)|(0x[0-9a-fA-F]+)|(['\"])(0x[0-9a-fA-F]+|\d+)\4", code))
        for item in matches:
            if item.group(2) is not None:
                value = f"{murmur3_32(item.group(2)):08x}" if kind == "bool" else str(int(item.group(2), 0))
            elif item.group(3):
                value = f"{int(item.group(3), 16):08x}" if kind == "bool" else str(int(item.group(3), 16))
            elif item.group(5):
                raw = item.group(5)
                value = f"{int(raw, 0):08x}" if kind == "bool" else str(int(raw, 0))
            else:
                continue
            rows.append({"value": value, "note": comment if len(matches) == 1 else ""})
    return rows


def parse_hashes(text, name, kind):
    return [row["value"] for row in parse_hash_rows(text, name, kind)]


def eval_number(expr):
    expr = expr.replace("LAYER_FIX", str(LAYER_FIX))
    node = ast.parse(expr, mode="eval")
    allowed = (ast.Expression, ast.BinOp, ast.UnaryOp, ast.Constant, ast.Add, ast.Sub, ast.USub, ast.UAdd)
    if not all(isinstance(child, allowed) for child in ast.walk(node)):
        raise ValueError(f"Unsafe expression: {expr}")
    return float(eval(compile(node, "<expr>", "eval"), {"__builtins__": {}}, {}))


def normalize_icon_y(value):
    return round(value - ICON_Y_OFFSET, 2)


def normalize_target_note_y(note):
    def replace(match):
        x, y, z = match.groups()
        return f"target: [{x},{normalize_icon_y(float(y)):g},{-float(z):g}]"

    return re.sub(
        r"target:\s*\[\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\]",
        replace,
        note,
        flags=re.I,
    )


def parse_coordinates(text, name):
    rows = []
    pattern = re.compile(r"\[\s*([^,\]]+)\s*,\s*([^,\]]+)\s*,\s*([^\]]+)\]\s*,?\s*(?://\s*([^\r\n]+))?")
    for code, comment in iter_active_array_rows(text, name):
        match = pattern.search(code)
        if not match:
            continue
        rows.append({
            "x": eval_number(match.group(1).strip()),
            "y": normalize_icon_y(eval_number(match.group(2).strip())),
            "z": -eval_number(match.group(3).strip()),
            "note": normalize_target_note_y((match.group(4) or comment or "").strip()),
        })
    return rows


def parse_master_map_general_locations(path):
    master_map_exclude_types = {"Korok", "Cave", "Well", "Shrine", "Lightroot", "Tower"}
    items = []
    with path.open(encoding="utf-8-sig", newline="") as handle:
        reader = csv.reader(handle)
        header = next(reader)
        indexes = {name: header.index(name) for name in ("ActorName", "Name", "Type", "Flag To Unlock")}
        for row_number, row in enumerate(reader, start=2):
            if not row or len(row) <= indexes["Type"]:
                continue
            type_name = row[indexes["Type"]].strip()
            if type_name in master_map_exclude_types:
                continue

            flag = row[indexes["Flag To Unlock"]].strip()
            if any(s in flag for s in MASTER_MAP_SKIP):
                continue
            if flag in MASTER_MAP_REPLACE:
                flag = MASTER_MAP_REPLACE[flag]
            x, y, z = parse_master_map_coordinate(row, row_number)
            actor_name = row[indexes["ActorName"]].strip()
            name = row[indexes["Name"]].strip()
            items.append({
                "id": f"general_locations-{len(items) + 1:03d}",
                "value": f"{murmur3_32(flag):08x}",
                "x": x,
                "y": y,
                "z": z,
                "layer": layer_for(y),
                "label": name,
                "note": " - ".join(part for part in (flag, name, type_name, actor_name) if part),
            })
    return items


def parse_master_map_coordinate(row, row_number):
    for index in range(4, len(row), 3):
        if index + 2 >= len(row):
            break
        if row[index].strip() and row[index + 1].strip():
            height = row[index + 2].strip()
            return (
                round(float(row[index]), 2),
                round(float(height), 2) if height else 0.0,
                round(float(row[index + 1]), 2),
            )
    raise ValueError(f"Missing map coordinate on row {row_number}")


def parse_pristine_weapon_items(equipment_text):
    match = re.search(r"Equipment\.WEAPONS_DECAYED_TO_PRISTINE\s*=\s*\{(.*?)\};", equipment_text, re.S)
    if not match:
        raise ValueError("Could not find WEAPONS_DECAYED_TO_PRISTINE")

    items = []
    pattern = re.compile(
        r"['\"](?P<decayed>Weapon_(?:Sword|Lsword|Spear)_\d+)['\"]\s*:\s*"
        r"['\"](?P<pristine>Weapon_(?:Sword|Lsword|Spear)_\d+)['\"]"
        r"\s*,?\s*(?://\s*(?P<label>[^\r\n]+))?"
    )
    for match in pattern.finditer(match.group(1)):
        label = (match.group("label") or match.group("pristine")).strip()
        decayed_id = match.group("decayed")
        pristine_id = match.group("pristine")
        items.append({
            "id": pristine_id,
            "value": f"{murmur3_32('EquipmentDeathCount.' + decayed_id):08x}",
            "label": label,
            "decayedId": decayed_id,
            "pristineId": pristine_id,
        })
    return items


def parse_fabric_items(hashes_text):
    hash_by_pattern = {}
    pattern = re.compile(r"^([0-9a-fA-F]{8});Bool;OwnedParasailPattern\.(Default|Pattern\d+)$")
    for line in hashes_text.splitlines():
        match = pattern.match(line.strip())
        if not match:
            continue
        hash_by_pattern[match.group(2)] = match.group(1).lower()

    items = []
    for pattern_id, label in COLLECTABLE_FABRICS:
        if pattern_id not in hash_by_pattern:
            raise ValueError(f"Missing fabric hash for {pattern_id}")
        items.append({
            "id": pattern_id,
            "value": hash_by_pattern[pattern_id],
            "label": label,
            "fabricId": "Obj_SubstituteCloth_Default" if pattern_id == "Default" else f"Obj_SubstituteCloth_{pattern_id.replace('Pattern', '')}",
        })
    return items


def parse_hash_csv(hashes_text):
    hashes = {}
    for line in hashes_text.splitlines():
        parts = line.strip().split(";", 2)
        if len(parts) == 3:
            hashes[parts[2]] = parts[0].lower()
    return hashes


def parse_armor_locale_rows(locale_text):
    star = chr(0x2605)
    rows = []
    for match in re.finditer(r"(Armor_[A-Za-z0-9_]+)\s*:\s*'((?:\\'|[^'])*)'", locale_text):
        item_id = match.group(1)
        label = match.group(2).replace("\\'", "'")
        if label.startswith("*"):
            continue
        star_count = label.count(star)
        base_label = re.sub(rf"\s*{re.escape(star)}+$", "", label).strip()
        rows.append({
            "id": item_id,
            "label": label,
            "baseLabel": base_label,
            "stars": star_count,
        })
    return rows


def parse_armor_inventory_items(locale_text):
    groups = {}
    for row in parse_armor_locale_rows(locale_text):
        groups.setdefault(row["baseLabel"], []).append(row)
    items = []
    for base_label in sorted(groups, key=str.lower):
        base_rows = [row for row in groups[base_label] if row["stars"] == 0]
        if not base_rows:
            continue
        items.append({
            "id": f"armor_inventory-{len(items) + 1:03d}",
            "label": base_label,
            "baseId": base_rows[0]["id"],
            "ids": sorted({row["id"] for row in groups[base_label]}),
        })
    return items


def parse_armor_upgraded_items(locale_text):
    groups = {}
    for row in parse_armor_locale_rows(locale_text):
        groups.setdefault(row["baseLabel"], []).append(row)
    items = []
    for base_label in sorted(groups, key=str.lower):
        base_rows = [row for row in groups[base_label] if row["stars"] == 0]
        four_star_rows = [row for row in groups[base_label] if row["stars"] == 4]
        if not base_rows or not four_star_rows:
            continue
        items.append({
            "id": f"armor_upgraded-{len(items) + 1:03d}",
            "label": base_label,
            "baseId": base_rows[0]["id"],
            "upgradedId": four_star_rows[0]["id"],
            "upgradedIds": sorted({row["id"] for row in four_star_rows}),
        })
    return items


def parse_locale_names(locale_text):
    names = {}
    for match in re.finditer(r"(Armor_[A-Za-z0-9_]+)\s*:\s*'((?:\\'|[^'])*)'", locale_text):
        item_id = match.group(1)
        label = match.group(2).replace("\\'", "'")
        if "★" in label:
            continue
        names[label] = item_id
    return names


def parse_armor_location_items(chests_by_layer, locale_text, hashes_text):
    name_to_armor_id = parse_locale_names(locale_text)
    name_to_armor_id["Champion's Leathers"] = "Armor_1106_Upper"
    hash_by_flag = parse_hash_csv(hashes_text)

    items = []
    missing = []
    for map_layer, chests_text in chests_by_layer.items():
        data = json.loads(chests_text)
        armor_group = next((group for group in data if group.get("name") == "Armor"), None)
        if not armor_group:
            raise ValueError(f"Could not find Armor group in zeldacentral-totk-{map_layer}-chests.json")

        markers = []
        for layer in armor_group.get("layers", []):
            markers.extend(layer.get("markers", []))

        for index, marker in enumerate(markers, start=1):
            label = marker["name"]
            armor_id = name_to_armor_id.get(label)
            if not armor_id:
                missing.append(label)
                continue
            value = hash_by_flag.get(f"IsGet.{armor_id}")
            if not value:
                missing.append(f"{label} ({armor_id})")
                continue

            coords = marker["coords"]
            source_id = marker.get("id", f"armor-{map_layer}-{index:03d}")
            x = float(coords[1])
            y = normalize_icon_y(float(marker.get("elv", 0)))
            z = float(coords[0])
            items.append({
                "id": f"armor-{len(items) + 1:03d}",
                "value": value,
                "x": x,
                "y": y,
                "z": z,
                "layer": map_layer,
                "note": f"{source_id} - {label} - {armor_id}",
                "armorId": armor_id,
                "objmapQuery": armor_id,
            })

    if missing:
        raise ValueError(f"Could not map armor markers: {', '.join(missing)}")
    return items


def layer_for(y):
    if y >= 750:
        return "sky"
    if y < -100:
        return "depths"
    return "surface"


def target_value(value):
    if value is None:
        return None
    if isinstance(value, str):
        return f"{murmur3_32(value):08x}"
    return f"{int(value):08x}"


def generated_note(category_id, index, coord_note):
    if coord_note:
        return coord_note
    if category_id == "towers" and index < len(TOWER_LOCATION_NAMES):
        return f"IsVisitLocation.Tower{index + 1:02d} ({TOWER_LOCATION_NAMES[index]})"
    return ""


def objmap_id_for(category_id, index):
    if category_id == "towers" and index < len(TOWER_OBJMAP_IDS):
        return TOWER_OBJMAP_IDS[index]
    return None


def compendium_labels_by_value(hashes_text):
    labels = {}
    for line in hashes_text.splitlines():
        match = re.match(r"^([0-9a-fA-F]{8});Enum;(PictureBookData\..+)\.State$", line.strip())
        if match:
            labels[match.group(1).lower()] = match.group(2)
    return labels


def main():
    completism = (REFERENCES / "zelda-totk.completism.js").read_text(encoding="utf-8")
    coordinates = (REFERENCES / "zelda-totk.coordinates.js").read_text(encoding="utf-8")
    equipment = (REFERENCES / "zelda-totk.class.equipment.js").read_text(encoding="utf-8")
    hashes = (REFERENCES / "zelda-totk.hashes.csv").read_text(encoding="utf-8")
    locale = (REFERENCES / "zelda-totk.locale.en.js").read_text(encoding="utf-8")
    zeldacentral_chests = {
        "surface": (REFERENCES / "zeldacentral-totk-surface-chests.json").read_text(encoding="utf-8"),
        "sky": (REFERENCES / "zeldacentral-totk-sky-chests.json").read_text(encoding="utf-8"),
        "depths": (REFERENCES / "zeldacentral-totk-depths-chests.json").read_text(encoding="utf-8"),
    }
    categories = []
    for category in CATEGORIES:
        if category.get("source") == "master_map":
            items = parse_master_map_general_locations(MASTER_MAP)
            categories.append({
                "id": category["id"],
                "label": category["label"],
                "kind": category["kind"],
                "targetValue": target_value(category.get("target")),
                "defaultVisible": category.get("defaultVisible", True),
                "items": items,
                "sourceCounts": {"rows": len(items)},
            })
            continue

        if category.get("source") == "armor_locations":
            items = parse_armor_location_items(zeldacentral_chests, locale, hashes)
            categories.append({
                "id": category["id"],
                "label": category["label"],
                "kind": category["kind"],
                "targetValue": target_value(category.get("target")),
                "defaultVisible": category.get("defaultVisible", True),
                "items": items,
                "sourceCounts": {"ids": len(items), "coordinates": len(items)},
            })
            continue

        hash_rows = parse_hash_rows(completism, category["hashes"], category["kind"])
        coords = parse_coordinates(coordinates, category["coords"])
        count = min(len(hash_rows), len(coords))
        items = []
        for index in range(count):
            coord = coords[index]
            hash_row = hash_rows[index]
            item = {
                "id": f"{category['id']}-{index + 1:03d}",
                "value": hash_row["value"],
                "x": coord["x"],
                "y": coord["y"],
                "z": coord["z"],
                "layer": layer_for(coord["y"]),
                "note": generated_note(category["id"], index, coord["note"]),
            }
            objmap_id = objmap_id_for(category["id"], index)
            if objmap_id:
                item["objmapId"] = objmap_id
            items.append(item)
        categories.append({
            "id": category["id"],
            "label": category["label"],
            "kind": category["kind"],
            "targetValue": target_value(category.get("target")),
            "defaultVisible": category.get("defaultVisible", True),
            "items": items,
            "sourceCounts": {"ids": len(hash_rows), "coordinates": len(coords)},
        })
    stats = []
    compendium_labels = compendium_labels_by_value(hashes)
    hash_by_flag = parse_hash_csv(hashes)
    for stat in STATS:
        if stat.get("source") == "pristine_weapons":
            items = parse_pristine_weapon_items(equipment)
        elif stat.get("source") == "fabrics":
            items = parse_fabric_items(hashes)
        elif stat.get("source") == "armor_inventory":
            items = parse_armor_inventory_items(locale)
        elif stat.get("source") == "armor_upgraded":
            items = parse_armor_upgraded_items(locale)
        else:
            ids = parse_hashes(completism, stat["hashes"], "bool")
            items = []
            for index, value in enumerate(ids):
                item = {"id": f"{stat['id']}-{index + 1:03d}", "value": value}
                if stat["id"] == "compendium" and value in compendium_labels:
                    item["label"] = compendium_labels[value]
                items.append(item)
        stat_entry = {
            "id": stat["id"],
            "label": stat["label"],
            "kind": stat["kind"],
            "targetValue": target_value(stat.get("target")),
            "includeMissing": stat.get("includeMissing", False),
            "items": items,
            "sourceCounts": {"ids": len(items)},
        }
        if stat["kind"].startswith("armor_"):
            stat_entry["arrayHash"] = hash_by_flag["Pouch.Armor.Content.Name"]
            stat_entry["sourceCounts"]["arrayHash"] = 1
        stats.append(stat_entry)
    OUTPUT.write_text(json.dumps({"categories": categories, "stats": stats}, indent=2), encoding="utf-8")
    print(f"Wrote {OUTPUT}")
    for category in categories:
        print(category["id"], len(category["items"]), category["sourceCounts"])
    for stat in stats:
        print(stat["id"], len(stat["items"]), stat["sourceCounts"])


if __name__ == "__main__":
    main()
