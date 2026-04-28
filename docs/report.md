# TOTK Save Map Helper Guide

This project is a local browser app for watching a live Tears of the Kingdom `progress.sav`, comparing it against known map data, and drawing the result on real TOTK map images. It is currently focused on Korok seeds, Link's current location, and several completionist categories.

## How To Run

From the project folder:

```powershell
python server.py
```

Then open:

```text
http://127.0.0.1:8000/
```

The server hosts the static page and provides two JSON endpoints:

- `/api/koroks`: current parsed save payload, including Koroks, player position, completionist items, tracked saves, and counts.
- `/api/log`: short status log for startup, mtime changes, active save changes, parsing events, and latest Korok detection.

## Important Files

`server.py`

The local HTTP server and save parser. It scans configured save files, watches mtimes, chooses the newest active save, parses save flags, builds marker payloads, and serves the browser API.

`index.html`

The app shell: sidebar, overlay checkboxes, map viewport, marker layers, tooltip container, and controls.

`app.js`

Frontend behavior: map pan/zoom, layer switching, polling `/api/koroks`, rendering markers, tooltips, arrows, logs, tri-state overlay checkboxes, and auto-pan modes.

`styles.css`

Visual styling for the app, markers, Zelda Dungeon map icons, tooltips, sidebar, and responsive layout.

`config.json`

Points the server at the save directory. Current shape:

```json
{
  "save_path": "path-to-grandparent-save-folder",
  "save_file": "progress.sav"
}
```

On startup, the server scans:

```text
save_path/*/save_file
```

For example, if `save_file` is `progress.sav`, it tracks every grandchild `progress.sav` one folder below `save_path`.

`state.json`

Runtime state used to detect the latest newly obtained Korok by diffing obtained Korok ids between save updates. It is keyed per active save path so multiple save slots do not stomp each other's history.

`korok_data.json`

Generated data for Korok locations and save hashes.

`completion_data.json`

Generated data for completionist categories, their save flags/GUID values, coordinates, layer, and notes.

`assets/`

Map images and icons. The three map layers are:

- `assets/surface.jpg`
- `assets/sky.jpg`
- `assets/depths.jpg`

Map icons downloaded from Zelda Dungeon's `/maps/totk/icons/` live under:

```text
assets/zd-icons/
```

`tools/build_korok_data.py`

Builds `korok_data.json` from local reference files.

`tools/build_completion_data.py`

Builds `completion_data.json` from local reference files.

`references/`

Local copies of source data from Marc Robledo's TOTK save editor and other map-coordinate references.

## Save Tracking Flow

At server startup:

1. `load_config()` reads `config.json`.
2. `scan_tracked_saves()` searches `save_path/*/save_file`.
3. The resulting paths are stored in `TRACKED_SAVE_PATHS`.
4. Startup messages are written to the in-memory log.

On every `/api/koroks` request:

1. `snapshot_tracked_saves()` reads the mtime for each tracked save.
2. `mtimes_key()` turns those mtimes into a cache key.
3. If no mtime changed, the server returns the cached payload.
4. If any mtime changed, the server logs the change.
5. `select_active_save()` chooses the existing tracked save with the newest mtime.
6. The active save is copied to a temporary file before parsing, so the live backup process is less likely to interrupt reads.
7. The save is parsed and a fresh payload is cached.

This means the app does not constantly re-read the save file when nothing changed. It also supports the active slot changing as different `progress.sav` files receive newer mtimes.

## Save Parsing

The parser expects a TOTK `progress.sav` with the normal hash table structure. It validates the first bytes and finds the end of the simple hash table by locating `MetaData.SaveTypeHash`.

Main parser pieces:

- `parse_save_values(data)`: reads tracked hash values for Koroks and boolean completion flags.
- `parse_guid_values(data)`: reads the GUID array used by some completionist items.
- `parse_player_position(data)`: reads Link's current save position from `PLAYER_SAVE_POS_HASH`.
- `build_markers(values)`: turns Korok save values into map markers.
- `build_completion(values, guid_values)`: turns completionist save values into remaining/unobtained marker groups.

Korok pair seeds use a special clear value:

```python
CLEAR_HASH = 0x62965740
```

Hidden single Koroks are treated as obtained when their raw save value is nonzero. Carry/pair Koroks are treated as obtained when the value matches `CLEAR_HASH`.

## Latest Korok Logic

The latest obtained Korok is not guessed from coordinates. It is detected by diffing save state.

`update_state()`:

1. Builds the current set of obtained Korok ids.
2. Loads the previous set from `state.json` for the active save path.
3. Computes newly obtained ids:

```text
current obtained ids - previous obtained ids
```

4. If there are newly detected ids, the last sorted id is stored as `latestObtainedId`.
5. The current set is persisted back to `state.json`.

The frontend then uses `latestObtainedId` for highlighting, auto-pan, and the latest-to-nearest arrow.

## Coordinates And Layers

The app uses a 6000 by 5000 map coordinate plane for all three map images.

World-to-map conversion is in `server.py`:

```python
mapX = (x - HYRULE_MIN_X) / (HYRULE_MAX_X - HYRULE_MIN_X) * 6000
mapY = (z - HYRULE_MIN_Z) / (HYRULE_MAX_Z - HYRULE_MIN_Z) * 5000
```

Current bounds:

```python
HYRULE_MIN_X = -6000
HYRULE_MAX_X = 6000
HYRULE_MIN_Z = -5000
HYRULE_MAX_Z = 5000
```

Layer is inferred from world Y:

```python
sky if y >= 750
depths if y < -100
surface otherwise
```

The frontend only renders markers whose `marker.layer` matches the selected layer button: Surface, Sky, or Depths.

## Frontend Data Flow

`app.js` starts by loading the Surface map and polling:

```javascript
setInterval(refreshKoroks, 2500);
setInterval(refreshLog, 2500);
```

`refreshKoroks()`:

1. Fetches `/api/koroks`.
2. Stores `playerPosition`.
3. Stores completion categories.
4. Updates latest Korok state.
5. Applies player auto-pan if enabled.
6. Updates completion counts.
7. Renders guide arrows.
8. Renders markers.
9. Updates summary counts and button states.

`renderMarkers()` draws:

- Korok markers.
- Completionist markers.
- Link/player marker.

Each marker has a custom hover tooltip attached with details like status, category, layer, world coordinates, map coordinates, and source note.

## Overlay Controls

Overlay groups in the sidebar are collapsed by default using `<details>`. Each parent group has a tri-state checkbox:

- Checked: all enabled child items are checked.
- Unchecked: all enabled child items are unchecked.
- Mixed/dot: some child items are checked.

The groups are:

- Obtained Seeds
- Unobtained Seeds
- Player
- Completionist

Parent checkbox logic lives in:

- `syncGroupState()`
- `syncAllGroupStates()`
- `setGroupChecked()`

The individual checkbox lists are mapped in `overlayGroups`.

## Auto-Pan Modes

There are two mutually exclusive auto-pan modes:

- `Unobtained Seeds > Pan to latest`
- `Player > Pan to latest`

Despite the duplicate label, they follow different targets:

- Unobtained Seeds mode follows the latest newly obtained Korok.
- Player mode follows Link's current save position.

`syncAutoPanPair()` ensures checking one turns off the other. Player auto-pan is checked by default.

Player auto-pan only recenters when Link's parsed position changes, so normal polling does not constantly drag the map back when the save mtime is unchanged or Link is stationary.

## Guide Arrows

The app draws short CSS compass arrows:

- From the latest obtained Korok toward the nearest visible unobtained Korok.
- From Link toward the nearest visible unobtained Korok.

Nearest-Korok distance uses world X/Z, not screen pixels:

```javascript
Math.hypot(marker.x - origin.x, marker.z - origin.z)
```

Arrows are only drawn for the active map layer and only if the relevant overlay checkboxes are enabled.

## Completionist Overlay

The completionist overlay currently shows remaining/unobtained items for:

- Caves
- Hudson Signs
- Flux Constructs
- Hinox
- Stone Talus
- Molduga
- Frox
- Gleeok
- Wells
- Chasms
- Yiga Schematic
- Old Map
- Sage's Will

Counts come from the server payload:

```json
{
  "id": "caves",
  "label": "Caves",
  "total": 197,
  "obtained": 162,
  "remaining": 35,
  "items": []
}
```

Only remaining/unobtained completionist items are sent in `items`.

## Icons

The app currently uses icons from:

```text
https://www.zeldadungeon.net/maps/totk/icons/
```

Downloaded files are stored in:

```text
assets/zd-icons/
```

Current local icons include:

- `korok.png`
- `cave.png`
- `well.png`
- `chasm.png`
- `schematic.png`
- `skull.png`
- `monster.png`
- `gleeok.svg`
- `leaf.png`
- `star.png`

CSS maps category classes to icons. For example:

- `.completion-caves` uses `cave.png`.
- `.completion-wells` uses `well.png`.
- `.completion-yiga_schematic` uses `schematic.png`.
- Most minibosses use `skull.png` or `monster.png`.
- Gleeok uses `gleeok.svg`.

## Logs

The server keeps a short in-memory log in `LOG_ENTRIES`. It avoids logging when nothing changes.

Useful events include:

- Startup scan result.
- Which save files are tracked.
- Mtime changes.
- Active save changes.
- Latest Korok detection.
- Parse summary.
- Errors.

The frontend fetches `/api/log` and displays it in the collapsed Log panel.

## Regenerating Data

If reference files change, regenerate Korok data:

```powershell
python tools\build_korok_data.py
```

Regenerate completionist data:

```powershell
python tools\build_completion_data.py
```

Then restart the server so the top-level loaded data is refreshed.

## Testing And Checks

Frontend syntax check:

```powershell
node --check app.js
```

Python syntax check without writing bytecode:

```powershell
python - <<'PY'
import ast
from pathlib import Path
for path in [Path("server.py"), Path("tools/build_completion_data.py"), Path("tools/build_korok_data.py")]:
    ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    print(f"OK {path}")
PY
```

If the server is running, `python -m py_compile` may fail on Windows because `__pycache__` files can be locked. Use the AST check above in that case.

Basic API check:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/api/koroks
```

## Common Extension Points

Add another overlay category:

1. Add the hashes and coordinate source to `tools/build_completion_data.py`.
2. Regenerate `completion_data.json`.
3. Add a checkbox and count badge to `index.html`.
4. Add the checkbox to `completionInputs` in `app.js`.
5. Add a CSS icon rule for `.completion-your_category`.

Add a new icon:

1. Download it into `assets/zd-icons/`.
2. Reference it from `styles.css`.
3. Run the CSS path check:

```powershell
$css = Get-Content styles.css -Raw
[regex]::Matches($css, 'url\("([^"]+)"\)') | ForEach-Object {
  $_.Groups[1].Value
} | Sort-Object -Unique | ForEach-Object {
  if (Test-Path $_) { "OK $_" } else { "MISSING $_" }
}
```

Change save location:

1. Edit `config.json`.
2. Restart `server.py`.
3. Check the Log panel for the tracked save list.

## Known Limitations

- Save parsing is read-only, but it assumes the save structure matches known TOTK `progress.sav` layouts.
- Tracked save paths are scanned only on server startup. If a new save slot folder appears later, restart the server.
- Completionist coordinates depend on the local reference files in `references/`.
- Some completionist categories use generic map icons because Zelda Dungeon's `/maps/totk/icons/` directory does not expose a distinct icon for every exact item.
- Latest Korok detection depends on `state.json`. If that file is deleted, the app will not know past history until it observes a new diff.

