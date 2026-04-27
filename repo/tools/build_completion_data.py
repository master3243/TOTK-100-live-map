import ast
import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
REFERENCES = ROOT / "references"
OUTPUT = ROOT / "completion_data.json"
LAYER_FIX = 500


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
    {"id": "sage_will", "label": "Sage's Will", "hashes": "SAGE_WILLS_FOUND", "coords": "SAGE_WILLS", "kind": "guid"},
    {"id": "general_locations", "label": "General Locations", "hashes": "LOCATIONS_VISITED", "coords": "LOCATIONS", "kind": "bool"},
]


STATS = [
    {"id": "compendium", "label": "Compendium", "hashes": "COMPENDIUM_STATUS", "kind": "reverse", "target": "Unopened"},
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


def parse_hashes(text, name, kind):
    array = strip_comments(extract_array(text, name))
    values = []
    for item in re.finditer(r"hash\(\s*(['\"])(.*?)\1\s*\)|(0x[0-9a-fA-F]+)|(['\"])(0x[0-9a-fA-F]+|\d+)\4", array):
        if item.group(2) is not None:
            values.append(f"{murmur3_32(item.group(2)):08x}" if kind == "bool" else str(int(item.group(2), 0)))
        elif item.group(3):
            values.append(f"{int(item.group(3), 16):08x}" if kind == "bool" else str(int(item.group(3), 16)))
        elif item.group(5):
            raw = item.group(5)
            values.append(f"{int(raw, 0):08x}" if kind == "bool" else str(int(raw, 0)))
    return values


def eval_number(expr):
    expr = expr.replace("LAYER_FIX", str(LAYER_FIX))
    node = ast.parse(expr, mode="eval")
    allowed = (ast.Expression, ast.BinOp, ast.UnaryOp, ast.Constant, ast.Add, ast.Sub, ast.USub, ast.UAdd)
    if not all(isinstance(child, allowed) for child in ast.walk(node)):
        raise ValueError(f"Unsafe expression: {expr}")
    return float(eval(compile(node, "<expr>", "eval"), {"__builtins__": {}}, {}))


def parse_coordinates(text, name):
    array = extract_array(text, name)[1:-1]
    rows = []
    pattern = re.compile(r"\[\s*([^,\]]+)\s*,\s*([^,\]]+)\s*,\s*([^\]]+)\]\s*,?\s*(?://\s*([^\r\n]+))?")
    for match in pattern.finditer(array):
        rows.append({
            "x": eval_number(match.group(1).strip()),
            "y": eval_number(match.group(2).strip()),
            "z": eval_number(match.group(3).strip()),
            "note": (match.group(4) or "").strip(),
        })
    return rows


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


def main():
    completism = (REFERENCES / "zelda-totk.completism.js").read_text(encoding="utf-8")
    coordinates = (REFERENCES / "zelda-totk.coordinates.js").read_text(encoding="utf-8")
    equipment = (REFERENCES / "zelda-totk.class.equipment.js").read_text(encoding="utf-8")
    hashes = (REFERENCES / "zelda-totk.hashes.csv").read_text(encoding="utf-8")
    categories = []
    for category in CATEGORIES:
        ids = parse_hashes(completism, category["hashes"], category["kind"])
        coords = parse_coordinates(coordinates, category["coords"])
        count = min(len(ids), len(coords))
        items = []
        for index in range(count):
            coord = coords[index]
            items.append({
                "id": f"{category['id']}-{index + 1:03d}",
                "value": ids[index],
                "x": coord["x"],
                "y": coord["y"],
                "z": coord["z"],
                "layer": layer_for(coord["y"]),
                "note": coord["note"],
            })
        categories.append({
            "id": category["id"],
            "label": category["label"],
            "kind": category["kind"],
            "targetValue": target_value(category.get("target")),
            "defaultVisible": category.get("defaultVisible", True),
            "items": items,
            "sourceCounts": {"ids": len(ids), "coordinates": len(coords)},
        })
    stats = []
    for stat in STATS:
        if stat.get("source") == "pristine_weapons":
            items = parse_pristine_weapon_items(equipment)
        elif stat.get("source") == "fabrics":
            items = parse_fabric_items(hashes)
        else:
            ids = parse_hashes(completism, stat["hashes"], "bool")
            items = [{"id": f"{stat['id']}-{index + 1:03d}", "value": value} for index, value in enumerate(ids)]
        stats.append({
            "id": stat["id"],
            "label": stat["label"],
            "kind": stat["kind"],
            "targetValue": target_value(stat.get("target")),
            "includeMissing": stat.get("includeMissing", False),
            "items": items,
            "sourceCounts": {"ids": len(items)},
        })
    OUTPUT.write_text(json.dumps({"categories": categories, "stats": stats}, indent=2), encoding="utf-8")
    print(f"Wrote {OUTPUT}")
    for category in categories:
        print(category["id"], len(category["items"]), category["sourceCounts"])
    for stat in stats:
        print(stat["id"], len(stat["items"]), stat["sourceCounts"])


if __name__ == "__main__":
    main()
