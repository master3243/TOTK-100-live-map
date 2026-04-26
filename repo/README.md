# TOTK Save Map Helper

THIS PROJECT IS 100% CREATED BY CODEX 5.5 MEDIUM. THIS IS VIBE SLOP.

# Build

`conda activate ./env`

`./build.ps1`

# Run

Local browser prototype for comparing a Tears of the Kingdom save file against map data.

```powershell
cd .\repo\
python server.py
```

Then open <http://127.0.0.1:8000/>.

## Current milestone

- Real Tears of the Kingdom map imagery for Surface, Sky, and Depths.
- Mouse drag panning.
- Wheel, button, and touch pinch zooming.
- Cursor image coordinates for future save-data overlays.
- Live read-only parsing of the configured `progress.sav`.
- Obtained Korok locations drawn from save flags and refreshed every 2.5 seconds.

Map image seed source: <https://github.com/vguzman812/totk-coordinates-map> (MIT).
Korok hash/coordinate reference source: <https://github.com/marcrobledo/savegame-editors>.
