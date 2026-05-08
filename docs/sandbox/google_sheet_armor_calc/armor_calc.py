from __future__ import annotations
import os
from pathlib import Path
from urllib.parse import parse_qs, urlparse
from urllib.request import Request, urlopen

from dotenv import load_dotenv

import pandas as pd
import pyperclip


_err_msg = "SHEET_URL is not set. Go to the google sheet and share it with 'Anyone with the link' then set the SHEET_URL in a .env file"
assert load_dotenv('.env') or load_dotenv(Path(__file__).parent / '.env'), _err_msg
assert os.environ["SHEET_URL"], _err_msg

STAR_COLS = [0, 2, 4, 6]   # qty columns for 1★, 2★, 3★, 4★
NAME_COLS = [1, 3, 5, 7]   # material-name columns
LEVELS = [1, 2, 3, 4]
TYPE_KEYWORDS = {
    "Dragon": [
        "Dinraal", "Farosh", "Naydra", "Light Dragon",
    ],
    "Boss": [
        "Boss Bokoblin", "Hinox", "Lynel", "Molduga", "Frox", "Gleeok", "Dark Clump",
    ],
    "Enemy": [
        "Bokoblin", "Moblin", "Lizalfos", "Horriblin", "Construct", "Keese",
        "Chuchu", "Gibdo", "Like", "Octorok", "Aerocuda", "Octo Balloon",
    ],
    "Fish": [
        "Trout", "Bass", "Cave Fish", "Stealthfin",
    ],
    "Animal": [
        "Beetle", "Darner", "Lizard", "Frog", "Butterfly", "Firefly",
        "Crab", "Snail",
    ],
    "Plant": [
        "Acorn", "Seed", "Brightbloom", "Brightcap", "Shroom", "Mushroom", "Honey",
        "Fruit", "Bananas", "Thistle", "Nightshade", "Safflina",
        "Silent Princess", "Sundelion", "Swift Carrot", "Swift Violet",
        "Dazzlefruit", "Puffshroom", "Razorshroom", "Rushroom", "Sunshroom",
        "Zapshroom", "Chillshroom", "Voltfruit",
    ],
    "Gem": [
        "Amber", "Diamond", "Flint", "Luminous Stone", "Opal", "Ruby",
        "Sapphire", "Topaz", "Zonaite", "Zonai Charge",
    ],
    "Other": [
        "Star Fragment",
    ],
}
TYPE_ORDER = ["Enemy", "Boss", "Animal", "Fish", "Plant", "Gem", "Dragon", "Other"]
TYPE_SORT = {material_type: i for i, material_type in enumerate(TYPE_ORDER)}

def _sheet_id_from_url(sheet_url: str) -> str:
    parsed = urlparse(sheet_url)
    parts = [p for p in parsed.path.split("/") if p]
    # Common:
    # https://docs.google.com/spreadsheets/d/<SPREADSHEET_ID>/edit
    if "spreadsheets" in parts:
        try:
            sd_idx = parts.index("spreadsheets")
            if sd_idx + 2 < len(parts) and parts[sd_idx + 1] == "d":
                return parts[sd_idx + 2]
        except ValueError:
            pass
    # Alternate:
    # https://drive.google.com/open?id=<SPREADSHEET_ID>
    qs = parse_qs(parsed.query)
    if "id" in qs and qs["id"]:
        return qs["id"][0]
    raise ValueError(f"Could not parse spreadsheet id from url: {sheet_url!r}")


def download_sheet_xlsx(sheet_url: str, filename: str | Path) -> Path:
    out_path = Path(filename)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    spreadsheet_id = _sheet_id_from_url(sheet_url)
    export_url = (
        f"https://docs.google.com/spreadsheets/d/{spreadsheet_id}/export"
        f"?format=xlsx"
    )
    req = Request(export_url)
    try:
        with urlopen(req, timeout=60) as resp:
            content_type = resp.headers.get("Content-Type", "")
            data = resp.read()
    except Exception as e:
        raise RuntimeError(
            "Failed to download spreadsheet. Verify the sheet is shared publicly "
            "or accessible without login."
        ) from e
    # Helpful guard: Google may return HTML if auth/share settings are wrong.
    if data[:20].lstrip().startswith(b"<!DOCTYPE") or b"text/html" in content_type.encode():
        raise RuntimeError(
            "Google returned HTML instead of an XLSX file. The spreadsheet is "
            "probably not publicly accessible, or authentication is required."
        )
    out_path.write_bytes(data)
    return out_path


def _is_star_cell(x) -> bool:
    if pd.isna(x):
        return False
    s = str(x)
    return "★" in s or "☆" in s


def _is_filled_star_cell(x) -> bool:
    """
    Counts an upgrade level as consumed/obtained if the star cell contains filled ★.
    Example:
      ★      -> consumed
      ★★     -> consumed
      ★★★    -> consumed
      ☆☆☆☆   -> not consumed
    """
    if pd.isna(x):
        return False
    return "★" in str(x)


def _is_upgrade_header_row(row) -> bool:
    return any(_is_star_cell(row.iloc[col]) for col in STAR_COLS)

def classify_material_type(material: str) -> str:
    material = str(material).strip()
    for material_type, keywords in TYPE_KEYWORDS.items():
        if any(keyword in material for keyword in keywords):
            return material_type
    return "Other"

def parse_material_needs(raw: pd.DataFrame) -> pd.DataFrame:
    records = []
    current_obtained = None
    for _, row in raw.iterrows():
        if _is_upgrade_header_row(row):
            current_obtained = {
                level: _is_filled_star_cell(row.iloc[star_col])
                for level, star_col in zip(LEVELS, STAR_COLS)
            }
            continue
        if current_obtained is None:
            continue
        for level, qty_col, name_col in zip(LEVELS, STAR_COLS, NAME_COLS):
            qty = row.iloc[qty_col]
            material = row.iloc[name_col]
            if pd.isna(qty) or pd.isna(material):
                continue
            material = str(material).strip()
            if not material:
                continue
            qty = pd.to_numeric(qty, errors="coerce")
            if pd.isna(qty):
                continue
            records.append({
                "Material": material,
                "Total Need for all upgrades": int(qty),
                "Consumed (for upgrades)": int(qty) if current_obtained[level] else 0,
            })
    columns = ["Type", "Material", "Total Need for all upgrades", "Consumed (for upgrades)", "Need"]
    if not records:
        return pd.DataFrame(columns=columns)
    result = pd.DataFrame(records).groupby("Material", as_index=False).sum()
    result["Need"] = result["Total Need for all upgrades"] - result["Consumed (for upgrades)"]
    result.loc[result["Need"] > 0, "Need"] += 1
    result.insert(0, "Type", result["Material"].map(classify_material_type))
    result["_type_sort"] = result["Type"].map(TYPE_SORT).fillna(len(TYPE_ORDER))
    result = result.sort_values(["_type_sort", "Material"]).drop(columns="_type_sort").reset_index(drop=True)
    return result[columns]

def main():
    root_dir = Path(__file__).parent.parent
    current_dir = Path(__file__).parent
    sheet_path = current_dir / 'sheet.xlsx'
    download_sheet_xlsx(os.environ["SHEET_URL"], sheet_path)
    print(f"Downloaded sheet to: {sheet_path.relative_to(root_dir)}")
    armor_df = pd.read_excel(sheet_path, sheet_name="Armor").iloc[:,6:]
    mats_df = parse_material_needs(armor_df)
    out_path = current_dir / "materials_needed.txt"
    clipboard_text = mats_df.to_csv(sep="\t", index=False)
    out_path.write_text(clipboard_text, encoding="utf-8")
    pyperclip.copy(clipboard_text)
    print(f"Wrote TSV to: {out_path.relative_to(root_dir)}")
    print(f"Copied {len(mats_df)} material rows to clipboard.")

if __name__ == "__main__":
    main()
