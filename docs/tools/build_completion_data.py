import sys
import ast
import csv
import json
import re
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))
from utils import murmur3_32


ROOT = Path(__file__).resolve().parents[1]
REFERENCES = ROOT / "references"
OUTPUT = ROOT / "completion_data.json"
LAYER_FIX = 500
ICON_Y_OFFSET = 106

GENERAL_LOCATIONS_CSV = REFERENCES / "TOTK master sheet - Map.csv"
FOOD_CSV = REFERENCES / "TOTK master sheet - Food.csv"
KEY_ITEM_CSV = REFERENCES / "TOTK master sheet - KeyItems.csv"
MATERIALS_CSV = REFERENCES / "TOTK master sheet - Materials.csv"
QUESTS_CSV = REFERENCES / "TOTK master sheet - Quests.csv"
CHARACTER_PROFILES_CSV = REFERENCES / "TOTK master sheet - Chara. Profiles.csv"
MEMORIES_CSV = REFERENCES / "TOTK master sheet - Memories.csv"
OLD_MAPS_CSV = REFERENCES / "TOTK master sheet - Old Maps.csv"
PARAGLIDER_FABRICS_CSV = REFERENCES / "TOTK master sheet - Paraglider Fabrics.csv"
ZONAI_DEVICES_CSV = REFERENCES / "TOTK master sheet - Zonai Devices.csv"
OLD_MAP_CHESTS_JSON = REFERENCES / "objmap_old_map_chests.json"
SHRINE_CHESTS_JSON = REFERENCES / "objmap_shrine_chests.json"

COMPLETISM_JS = REFERENCES / "zelda-totk.completism.js"
COORDINATES_JS = REFERENCES / "zelda-totk.coordinates.js"
EQUIPMENT_JS = REFERENCES / "zelda-totk.class.equipment.js"
HASHES_CSV = REFERENCES / "zelda-totk.hashes.csv"
LOCALE_EN_JS = REFERENCES / "zelda-totk.locale.en.js"
ZELDACENTRAL_CHESTS_SURFACE = REFERENCES / "zeldacentral-totk-surface-chests.json"
ZELDACENTRAL_CHESTS_SKY = REFERENCES / "zeldacentral-totk-sky-chests.json"
ZELDACENTRAL_CHESTS_DEPTHS = REFERENCES / "zeldacentral-totk-depths-chests.json"


GENERAL_LOCATIONS_SKIP = ( "_IsCompleted_Exp", "_IsAfter_DungeonBossDead_Exp", "IsVisitLocation.Shop" )  # Fix map csv
GENERAL_LOCATIONS_REPLACE = { "IsVisitLocation.HatenoLab": "IsVisitLocation.HatenoLabo" }  # Fix map csv
OLD_MAP_REWARD_REPLACE = {  # these are IDs for upgraded armors which are wrong and will not map correctly
    "Armor_035_Head": "Armor_005_Head",
    "Armor_035_Lower": "Armor_005_Lower",
    "Armor_216_Head": "Armor_215_Head",
    "Armor_224_Head": "Armor_220_Head",
}

KEY_ITEMS_SKIP = frozenset(
    {
        "Ultrahand",
        "Fuse",
        "Ascend",
        "Recall",
        "Autobuild",
        "Energy Cell",
        "Bubbul Gem",
        "Light of Blessing",
        "Sage's Will",
        "Vow of Tulin, Sage of Wind",
        "Vow of Yunobo, Sage of Fire",
        "Vow of Sidon, Sage of Water",
        "Vow of Riju, Sage of Lightning",
        "Vow of Mineru, Sage of Spirit",
        "Travel Medallion Prototype",
    }
)
QUEST_TYPES = [
    ("quests_main", "Main Quests", "Main Quest"),
    ("quests_side", "Side Quests", "Side Quest"),
    ("quests_adventure", "Side Adventures", "Side Adventure"),
    ("quests_shrine", "Shrine Quests", "Shrine Quest"),
]
QUEST_SKIP = ( "Destroy Ganondorf", "Find Princess Zelda" )  # These two don't complete as the game loads after completing them

TOWERS = [
    ("Lookout Landing", "0xf5d609bea48ad8a7"),
    ("Lindor's Brow", "0x0fc9e8295f1f88fd"),
    ("Pikida Stonegrove", "0xd123cab576760e7a"),
    ("Eldin Canyon", "0x2db057d38b410428"),
    ("Ulri Mountain", "0xb3186e3b60f253e0"),
    ("Sahasra Slope", "0x17e0e03b26704860"),
    ("Upland Zorana", "0xe7fca251fbcd90c0"),
    ("Hyrule Field", "0x38aac9054a75ba9f"),
    ("Gerudo Canyon", "0x5d34d120278b0839"),
    ("Gerudo Highlands", "0xbcdf97fc90e206fc"),
    ("Rabella Wetlands", "0x32dcf687f9affd88"),
    ("Thyphlo Ruins", "0x5b8c27dcacdedda0"),
    ("Popla Foothills", "0x1096ee2cdaab6137"),
    ("Mount Lanayru", "0x999f20de53cae3cf"),
    ("Rospro Pass", "0xc1c2ac34270e19c5"),
]


CATEGORIES = [
    {"id": "towers", "label": "Towers", "hashes": "TOWERS_ACTIVATED", "coords": "TOWERS", "kind": "bool"},
    {"id": "shrines", "label": "Shrines", "hashes": "SHRINES_STATUS", "coords": "SHRINES", "kind": "bool", "target": "Clear"},
    {"id": "shrine_chests", "label": "Shrine Chests", "source": "shrine_chests", "kind": "bool"},
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
    {"id": "koroks", "label": "Koroks", "source": "koroks", "kind": "seed"},
    {"id": "schema_stone", "label": "Schema Stones", "hashes": "SCHEMATICS_STONE_FOUND", "coords": "SCHEMATICS_STONE", "kind": "bool"},
    {"id": "yiga_schematic", "label": "Yiga Schematic", "hashes": "SCHEMATICS_YIGA_FOUND", "coords": "SCHEMATICS_YIGA", "kind": "bool"},
    {"id": "old_map", "label": "Old Map", "source": "old_maps", "kind": "bool"},
    {"id": "armor", "label": "Armor", "source": "armor_locations", "kind": "bool"},
    {"id": "sage_will", "label": "Sage's Will", "hashes": "SAGE_WILLS_FOUND", "coords": "SAGE_WILLS", "kind": "guid"},
    {"id": "general_locations", "label": "General Locations", "source": "master_map", "kind": "bool"},
]


STATS = [
    {"id": "compendium", "label": "Compendium", "hashes": "COMPENDIUM_STATUS", "kind": "reverse", "target": "Unopened", "includeMissing": True},
    {"id": "armor_inventory", "label": "Armor", "source": "armor_inventory", "kind": "armor_inventory", "includeMissing": True},
    {"id": "armor_upgraded", "label": "Armor (4-star upgraded)", "source": "armor_upgraded", "kind": "armor_upgraded", "includeMissing": True},
    {"id": "pristine_weapons", "label": "Pristine Weapons", "source": "pristine_weapons", "kind": "positive", "includeMissing": True},
    {"id": "fabrics", "label": "Fabrics", "source": "master_fabrics", "kind": "positive", "includeMissing": True},
    {"id": "fabrics_amiibo", "label": "Fabrics (Amiibo)", "source": "master_fabrics_amiibo", "kind": "positive", "includeMissing": True, "note": "Amiibo fabrics are not obtainable without amiibos and should not be considered part of 100%."},
    {"id": "recipes", "label": "Recipes", "source": "master_food", "kind": "positive"},
    {"id": "materials", "label": "Materials", "source": "master_materials", "kind": "inventory_collection", "includeMissing": True},
    {"id": "key_items", "label": "Key Items", "source": "master_key_items", "kind": "inventory_collection", "includeMissing": True},
    *[
        {"id": stat_id, "label": label, "source": "master_quests", "kind": "positive", "questType": quest_type, "target": "Complete", "includeMissing": True}
        for stat_id, label, quest_type in QUEST_TYPES
    ],
    {"id": "memories", "label": "Memories", "source": "master_memories", "kind": "positive", "includeMissing": True},
    {"id": "character_profiles", "label": "Character Profiles", "source": "master_character_profiles", "kind": "positive", "includeMissing": True},
    {"id": "zonai_devices", "label": "Zonai Devices", "source": "master_zonai_devices", "kind": "positive", "includeMissing": True},
]

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


def parse_korok_hashes(completism_text, array_name):
    """UInt32 hashes from CompletismHashes.KOROKS_* arrays (raw 0x... literals)."""
    array_text = strip_comments(extract_array(completism_text, array_name))
    return [int(match, 16) & 0xFFFFFFFF for match in re.findall(r"0x[0-9a-fA-F]+", array_text)]


def build_koroks_items(completism_text, coordinates_text):
    """Flat marker list: ids hidden-### / carry-### (Zelda Dungeon URLs), value = save hash."""
    items = []

    def section(row_kind, array_name):
        hashes = parse_korok_hashes(completism_text, array_name)
        coord_rows = parse_coordinates(coordinates_text, array_name)
        if len(hashes) != len(coord_rows):
            raise ValueError(
                f"Korok {row_kind} length mismatch: {len(hashes)} hashes, {len(coord_rows)} coordinates"
            )
        for index, (h, c) in enumerate(zip(hashes, coord_rows)):
            items.append({
                "id": f"{row_kind}-{index + 1:03d}",
                "value": f"{h:08x}",
                "kind": row_kind,
                "x": c["x"],
                "y": c["y"],
                "z": c["z"],
                "layer": layer_for(c["y"]),
                "note": c["note"],
            })

    section("hidden", "KOROKS_HIDDEN")
    section("carry", "KOROKS_CARRY")
    return items


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
            if any(s in flag for s in GENERAL_LOCATIONS_SKIP):
                continue
            if flag in GENERAL_LOCATIONS_REPLACE:
                flag = GENERAL_LOCATIONS_REPLACE[flag]
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


def fabric_pattern_id(actor_name):
    if actor_name == "Obj_SubstituteCloth_Default":
        return "Default"
    match = re.fullmatch(r"Obj_SubstituteCloth_(\d+)", actor_name)
    if not match:
        raise ValueError(f"Bad fabric actor: {actor_name}")
    return f"Pattern{int(match.group(1)):02d}"


def parse_master_fabric_items(path, amiibo):
    items = []
    for row in read_master_rows(path):
        source = row.get("Source", "")
        if ("amiibo" in source.lower()) != amiibo:
            continue
        actor_name = row["Fabric ActorName"].strip()
        if not actor_name:
            continue
        pattern_id = fabric_pattern_id(actor_name)
        items.append({
            "id": f"fabrics{'_amiibo' if amiibo else ''}-{len(items) + 1:03d}",
            "value": f"{murmur3_32('OwnedParasailPattern.' + pattern_id):08x}",
            "label": row["Name"].strip() or actor_name,
            "fabricId": actor_name,
            "source": source.strip(),
        })
    return items


def read_master_rows(path):
    with path.open(encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def parse_master_actor_items(path, prefix, skip_names=None):
    skip = skip_names or frozenset()
    items = []
    for row in read_master_rows(path):
        actor_name = row["ActorName"].strip()
        if not actor_name:
            continue
        label = row.get("Name", "").strip() or actor_name
        if label in skip:
            continue
        items.append({
            "id": f"{prefix}-{len(items) + 1:03d}",
            "label": label,
            "actorName": actor_name,
        })
    return items


def parse_master_recipe_items(path):
    items = parse_master_actor_items(path, "recipes")
    for item in items:
        item["value"] = f"{murmur3_32('RecipeCard.Content.' + item['actorName'] + '.IsCooked'):08x}"
    return items


def parse_master_inventory_items(path, prefix, array_name, skip_names=None):
    return {
        "arrayHash": f"{murmur3_32(array_name):08x}",
        "items": parse_master_actor_items(path, prefix, skip_names=skip_names),
    }


def parse_master_quest_items(path, quest_type):
    items = []
    for row in read_master_rows(path):
        if row["Type"].strip() != quest_type:
            continue
        quest_id = row["ID"].strip()
        if not quest_id:
            continue
        name = row.get("Name", "").strip()
        if name in QUEST_SKIP:
            continue
        items.append({
            "id": f"quest-{len(items) + 1:03d}",
            "value": f"{murmur3_32('Step_' + quest_id):08x}",
            "label": name or quest_id,
            "questId": quest_id,
        })
    return items


def parse_master_memory_items(path):
    items = []
    for row in read_master_rows(path):
        actor = row["Actor"].strip()
        if not actor:
            continue
        items.append({
            "id": f"memories-{len(items) + 1:03d}",
            "value": f"{murmur3_32('IsGetAdventureMemory.' + actor):08x}",
            "label": row["Title"].strip() or actor,
            "actorName": actor,
        })
    return items


def parse_master_character_profile_items(path):
    items = []
    for row in read_master_rows(path):
        actor = row["Actor"].strip()
        if not actor:
            continue
        items.append({
            "id": f"character_profiles-{len(items) + 1:03d}",
            "value": f"{murmur3_32('CharaDirectory_IsInstantTipsDisplayed.' + actor):08x}",
            "label": row["Name"].strip() or actor,
            "actorName": actor,
        })
    return items


def parse_master_zonai_device_items(path):
    items = []
    for row in read_master_rows(path):
        actor = row["ActorName (Item)"].strip()
        if not actor:
            continue
        items.append({
            "id": f"zonai_devices-{len(items) + 1:03d}",
            "value": f"{murmur3_32('IsGet.' + actor):08x}",
            "label": row["Name"].strip() or actor,
            "actorName": actor,
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
        if base_label == "Hylian Hood":
            base_label = "Hylian Hood (non-lowered)"
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


def parse_shrine_chest_items(path, coordinates_text):
    shrines = parse_coordinates(coordinates_text, "SHRINES")
    items = []
    for row in json.loads(path.read_text(encoding="utf-8-sig")):
        match = re.fullmatch(r"Dungeon(\d{3})", row["dungeon"])
        if not match:
            raise ValueError(f"Bad shrine dungeon id: {row['dungeon']}")
        shrine_index = int(match.group(1))
        if shrine_index >= len(shrines):
            raise ValueError(f"Missing shrine coordinates for {row['dungeon']}")
        coord = shrines[shrine_index]
        for chest_index, chest in enumerate(row.get("chests", []), start=1):
            reward = chest.get("reward") or "Unknown reward"
            save_flag = chest["saveFlag"]
            items.append({
                "id": f"shrine_chests-{len(items) + 1:03d}",
                "value": f"{murmur3_32(save_flag):08x}",
                "x": coord["x"],
                "y": coord["y"],
                "z": coord["z"],
                "layer": layer_for(coord["y"]),
                "label": f"{row['shrine']} chest {chest_index}",
                "note": f"{row['dungeon']} - {row['shrine']} - {reward} - {save_flag}",
                "objmapId": chest["hashId"],
                "objmapQuery": chest["hashId"],
            })
    return items


def parse_old_map_items(path, chest_path):
    items = []
    chests = {
        row["rewardActor"]: row
        for row in json.loads(chest_path.read_text(encoding="utf-8-sig"))
    }
    with path.open(encoding="utf-8-sig", newline="") as handle:
        for row in csv.reader(handle):
            if not row or row[0] == "0/31":
                continue
            map_actor = row[13].strip()
            reward_actor = OLD_MAP_REWARD_REPLACE.get(row[14].strip(), row[14].strip())
            reward = row[8].strip()
            if not map_actor or not reward_actor:
                continue
            chest = chests.get(reward_actor)
            if chest is None:
                raise ValueError(f"Missing old-map chest object for {reward_actor}")
            map_flag = f"IsFindTreasureMap.{reward_actor}"
            entries = [
                ("map", map_flag, (), row[4], row[6], row[5], f"Old Map - {row[1].strip()} - {reward} - {map_actor}", map_actor),
                ("chest", f"IsGet.{reward_actor}", (map_flag,), chest["x"], chest["y"], -chest["z"], f"Treasure Chest - {row[7].strip()} - {reward} - {reward_actor}", chest["hashId"]),
            ]
            for kind, flag, requires, x, y, z, note, objmap_query in entries:
                x, y, z = round(float(x), 2), round(float(y), 2), round(float(z), 2)
                item = {
                    "id": f"old_map-{len(items) + 1:03d}",
                    "value": f"{murmur3_32(flag):08x}",
                    "x": x,
                    "y": y,
                    "z": z,
                    "layer": layer_for(y),
                    "kind": kind,
                    "label": f"{reward} ({'map' if kind == 'map' else 'chest'})",
                    "note": f"{note} - {flag}",
                    "objmapQuery": objmap_query,
                }
                if kind == "chest":
                    item["objmapId"] = objmap_query
                    item["requires"] = [f"{murmur3_32(value):08x}" for value in requires]
                items.append(item)
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


def compendium_labels_by_value(hashes_text):
    labels = {}
    for line in hashes_text.splitlines():
        match = re.match(r"^([0-9a-fA-F]{8});Enum;(PictureBookData\..+)\.State$", line.strip())
        if match:
            labels[match.group(1).lower()] = match.group(2)
    return labels


def main():
    completism = COMPLETISM_JS.read_text(encoding="utf-8")
    coordinates = COORDINATES_JS.read_text(encoding="utf-8")
    equipment = EQUIPMENT_JS.read_text(encoding="utf-8")
    hashes = HASHES_CSV.read_text(encoding="utf-8")
    locale = LOCALE_EN_JS.read_text(encoding="utf-8")
    zeldacentral_chests = {
        "surface": ZELDACENTRAL_CHESTS_SURFACE.read_text(encoding="utf-8"),
        "sky": ZELDACENTRAL_CHESTS_SKY.read_text(encoding="utf-8"),
        "depths": ZELDACENTRAL_CHESTS_DEPTHS.read_text(encoding="utf-8"),
    }
    categories = []
    for category in CATEGORIES:
        if category.get("source") == "koroks":
            items = build_koroks_items(completism, coordinates)
            hidden_n = sum(1 for item in items if item["kind"] == "hidden")
            carry_n = sum(1 for item in items if item["kind"] == "carry")
            categories.append({
                "id": category["id"],
                "label": category["label"],
                "kind": category["kind"],
                "targetValue": target_value(category.get("target")),
                "defaultVisible": category.get("defaultVisible", True),
                "items": items,
                "sourceCounts": {
                    "locations": len(items),
                    "seeds": hidden_n + carry_n * 2,
                },
            })
            continue

        if category.get("source") == "master_map":
            items = parse_master_map_general_locations(GENERAL_LOCATIONS_CSV)
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

        if category.get("source") == "shrine_chests":
            items = parse_shrine_chest_items(SHRINE_CHESTS_JSON, coordinates)
            categories.append({
                "id": category["id"],
                "label": category["label"],
                "kind": category["kind"],
                "targetValue": target_value(category.get("target")),
                "defaultVisible": category.get("defaultVisible", True),
                "items": items,
                "sourceCounts": {"chests": len(items)},
            })
            continue

        if category.get("source") == "old_maps":
            items = parse_old_map_items(OLD_MAPS_CSV, OLD_MAP_CHESTS_JSON)
            categories.append({
                "id": category["id"],
                "label": category["label"],
                "kind": category["kind"],
                "targetValue": target_value(category.get("target")),
                "defaultVisible": category.get("defaultVisible", True),
                "items": items,
                "sourceCounts": {"rows": len(items) // 2, "markers": len(items)},
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
                "note": coord["note"],
            }
            if category["id"] == "towers":
                item["note"] = f"IsVisitLocation.Tower{index + 1:02d} ({TOWERS[index][0]})"
                item["objmapId"] = TOWERS[index][1]
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
        elif stat.get("source") == "master_fabrics":
            items = parse_master_fabric_items(PARAGLIDER_FABRICS_CSV, amiibo=False)
        elif stat.get("source") == "master_fabrics_amiibo":
            items = parse_master_fabric_items(PARAGLIDER_FABRICS_CSV, amiibo=True)
        elif stat.get("source") == "master_food":
            items = parse_master_recipe_items(FOOD_CSV)
        elif stat.get("source") == "master_materials":
            inventory = parse_master_inventory_items(MATERIALS_CSV, "materials", "Pouch.Material.Content.Name")
            items = inventory["items"]
        elif stat.get("source") == "master_key_items":
            inventory = parse_master_inventory_items(KEY_ITEM_CSV, "key_items", "Pouch.KeyItem.Content.Name", skip_names=KEY_ITEMS_SKIP)
            items = inventory["items"]
        elif stat.get("source") == "master_quests":
            items = parse_master_quest_items(QUESTS_CSV, stat["questType"])
        elif stat.get("source") == "master_memories":
            items = parse_master_memory_items(MEMORIES_CSV)
        elif stat.get("source") == "master_character_profiles":
            items = parse_master_character_profile_items(CHARACTER_PROFILES_CSV)
        elif stat.get("source") == "master_zonai_devices":
            items = parse_master_zonai_device_items(ZONAI_DEVICES_CSV)
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
        if stat.get("note"):
            stat_entry["note"] = stat["note"]
        if stat["kind"].startswith("armor_"):
            stat_entry["arrayHash"] = hash_by_flag["Pouch.Armor.Content.Name"]
            stat_entry["sourceCounts"]["arrayHash"] = 1
        elif stat.get("source") == "master_materials":
            stat_entry["arrayHash"] = inventory["arrayHash"]
            stat_entry["sourceCounts"]["arrayHash"] = 1
        elif stat.get("source") == "master_key_items":
            stat_entry["arrayHash"] = inventory["arrayHash"]
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
