import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
REFERENCES = ROOT / "references"
OUTPUT = ROOT / "references" / "korok_data.json"
ICON_Y_OFFSET = 106


def read_text(path):
    return path.read_text(encoding="utf-8")


def extract_js_array(text, name):
    match = re.search(rf"\b{name}\s*:\s*\[", text)
    if not match:
        raise ValueError(f"Could not find {name}")

    start = match.end() - 1
    depth = 0
    in_line_comment = False
    in_block_comment = False

    for index in range(start, len(text)):
        current = text[index]
        nxt = text[index + 1] if index + 1 < len(text) else ""

        if in_line_comment:
            if current in "\r\n":
                in_line_comment = False
            continue
        if in_block_comment:
            if current == "*" and nxt == "/":
                in_block_comment = False
            continue
        if current == "/" and nxt == "/":
            in_line_comment = True
            continue
        if current == "/" and nxt == "*":
            in_block_comment = True
            continue
        if current == "[":
            depth += 1
        elif current == "]":
            depth -= 1
            if depth == 0:
                return text[start:index + 1]

    raise ValueError(f"Could not parse {name}")


def remove_comments(text):
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    text = re.sub(r"//.*", "", text)
    return text


def parse_hashes(text, name):
    array_text = remove_comments(extract_js_array(text, name))
    return [int(value, 16) for value in re.findall(r"0x[0-9a-fA-F]+", array_text)]


def normalize_icon_y(value):
    return round(value - ICON_Y_OFFSET, 2)


def normalize_target_note_y(note):
    def replace(match):
        x, y, z = match.groups()
        return f"target: [{x},{normalize_icon_y(float(y)):g},{z}]"

    return re.sub(
        r"target:\s*\[\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\]",
        replace,
        note,
        flags=re.I,
    )


def parse_coordinates(text, name):
    array_text = extract_js_array(text, name)
    rows = []
    for match in re.finditer(r"\[\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\]\s*,?\s*(?://\s*([^\r\n]+))?", array_text):
        rows.append(
            {
                "x": float(match.group(1)),
                "y": normalize_icon_y(float(match.group(2))),
                "z": float(match.group(3)),
                "note": normalize_target_note_y((match.group(4) or "").strip()),
            }
        )
    return rows


def combine(kind, hashes, coordinates):
    if len(hashes) != len(coordinates):
        raise ValueError(f"{kind} length mismatch: {len(hashes)} hashes, {len(coordinates)} coordinates")

    return [
        {
            "id": f"{kind}-{index + 1:03d}",
            "kind": kind,
            "hash": f"{hash_value:08x}",
            "x": coord["x"],
            "y": coord["y"],
            "z": coord["z"],
            "note": coord["note"],
        }
        for index, (hash_value, coord) in enumerate(zip(hashes, coordinates))
    ]


def main():
    completism = read_text(REFERENCES / "zelda-totk.completism.js")
    coordinates = read_text(REFERENCES / "zelda-totk.coordinates.js")

    data = {
        "source": "marcrobledo/savegame-editors zelda-totk.completism.js and zelda-totk.coordinates.js",
        "hidden": combine(
            "hidden",
            parse_hashes(completism, "KOROKS_HIDDEN"),
            parse_coordinates(coordinates, "KOROKS_HIDDEN"),
        ),
        "carry": combine(
            "carry",
            parse_hashes(completism, "KOROKS_CARRY"),
            parse_coordinates(coordinates, "KOROKS_CARRY"),
        ),
    }

    OUTPUT.write_text(json.dumps(data, indent=2), encoding="utf-8")
    print(f"Wrote {OUTPUT} ({len(data['hidden'])} hidden, {len(data['carry'])} carry)")


if __name__ == "__main__":
    main()
