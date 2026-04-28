# TOTK Save Map Helper

Local interactive Tears of the Kingdom map that loads your save file and shows you what's missing (and where it is) on the map so you can easily get closer to 100%.

 The local version can automatically load your save file every second and updates the map in real time.

But the browser version is ok-ish but requires manual save file upload every time.

# BROWSER VERSION: **[https://master3243.github.io/TOTK-100-live-map/](https://master3243.github.io/TOTK-100-live-map/)**

# Who is this for?

If you are playing Tears of the Kingdom and want to get 100% without spending hours manually tracking which Koroks/Things you already got, this project is for you. As mentioned, the best capability is it can read your save file live from your save folder and constantly update. That means you can leave the window open on a side monitor and it will be a live guide.

# Local Setup

The local version of the app is MUCH better in terms of quality of life. The map updates in real-time as you play and constantly shows the next nearest unfinished Korok/Boss/etc.

If you want the local version you need to know how to setup a python environment (which is very simple, just look up a guide).

The first step is to clone the repository.

## to create a new environment

```powershell
cd REPO_FOLDER
conda create -p ./env python=3.9
pip install -r .\docs\requirements.txt
```

## Run Locally

```powershell
conda activate ./env
python .\docs\gui.py
```

Or if you don't want to open the browser automatically (`python .\docs\gui.py --skip-browser`)

## build .exe

You don't need to do this. But it was convenient when you can just double click it to start the app.

To build a .exe locally:

```powershell
cd REPO_FOLDER
conda activate ./env
./build.ps1
```

## Current milestone

- Real Tears of the Kingdom map imagery for Surface, Sky, and Depths.
- Mouse drag panning.
- Wheel, button, and touch pinch zooming.
- Cursor image coordinates for future save-data overlays.
- Live read-only parsing of the configured `progress.sav`.
- Obtained Korok locations drawn from save flags and refreshed every 2.5 seconds.

## Credits / Thanks

Huge thanks to the following people for public resources that made this project possible.

- **Map imagery seed**: [`vguzman812/totk-coordinates-map`](https://github.com/vguzman812/totk-coordinates-map)
- **Save parsing + korok hash/coordinate reference**: [`marcrobledo/savegame-editors`](https://github.com/marcrobledo/savegame-editors)
- **Icon pack source (stored in `assets/zd-icons/`)**: [`zeldadungeon.net/maps/totk/icons/`](https://www.zeldadungeon.net/maps/totk/icons/)
- **In-browser Python runtime for the GitHub Pages/manual-upload mode**: [Pyodide](https://pyodide.org/)
- **Third-party JS bundled under `docs/references/`**:
  - [`FileSaver.js`](https://github.com/eligrey/FileSaver.js) (eligrey)
  - Marc Robledo’s helper libraries (MarcFile/Tooltips/DragAndDrop) referenced in the bundled `savegame-editor.js`

# Disclaimer

THIS PROJECT IS CREATED BY CODEX-5.5-MEDIUM AND CURSOR ON AUTO. But it did require tons of guidence from me in terms of what features I want and bugs/workflows that need improvements.

This is why the project does not (and never will) modify any save files. I don't trust AI code that modifies something as sensitive as a save file. It might cause corruptions which I would never want to cause. Thus, this project is simply a read-only viewer.
