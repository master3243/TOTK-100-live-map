# TOTK Save Map Helper

Local interactive Tears of the Kingdom map that loads your save file and shows you what's missing (and where it is) on the map so you can easily get closer to 100%.

 The local version can automatically load your save file every second and updates the map in real time.

But the browser version is ok-ish but requires manual save file upload every time. The website runs completely in your browser with the files hosted by GitHub so there is no server.

# BROWSER VERSION: **[https://master3243.github.io/TOTK-100-live-map/](https://master3243.github.io/TOTK-100-live-map/)**

# Who is this for?

If you are playing Tears of the Kingdom and want to get 100% without spending hours manually tracking which Koroks/Things you already got, this project is for you. As mentioned, the best capability is it can read your save file live from your save folder and constantly update. That means you can leave the window open on a side monitor and it will be a live guide.

However, the browser version is still useful for quick one time use.

# Local Setup

The local version of the app is much better in terms of quality of life. The map updates in real-time as you play and constantly shows the next nearest unfinished Korok/Boss/etc.

If you want the local version, you need to know how to setup a python environment (which is very simple, just look up a guide online).

The first step is to clone the repository then follow the instructions in the [docs/README.md](docs/README.md) file.

## Credits / Thanks

Huge thanks to the following people for public resources that made this project possible.

- **Save parsing + korok hash/coordinate reference**: [`marcrobledo/savegame-editors`](https://github.com/marcrobledo/savegame-editors)
- **Google Sheet data from the TotK Data Collection Discord Community**: [`Data Spreadsheet for Tears of the Kingdom (1.4.0)`](https://docs.google.com/spreadsheets/d/1fBvQ17WHP3ASgtO8ode_rf1g4DfEHErMrHwwLppNTJM)
  - "TotK Data Collection Discord Community for continually ensuring the quality and accuracy of the sheet
  - KreaTV1 and DT12345, for assisting with damage research and testing
  - Shozutko, for manually sorting quest captions
  - Doge229, for kohga's construct image and promoting the sheet with the Rauru discord bot"
  - Many members helped me personally (`Doge229`, `Phil`, and many others)
- **Background Map**: [`vguzman812/totk-coordinates-map`](https://github.com/vguzman812/totk-coordinates-map)
- **Shrine chest object/save-flag mapping**: [`zeldamods/objmap-totk`](https://github.com/zeldamods/objmap-totk)
- **Icon pack source (stored in `assets/zd-icons/`)**: [`zeldadungeon.net/maps/totk/icons/`](https://www.zeldadungeon.net/maps/totk/icons/)
- **In-browser Python runtime for the GitHub Pages/manual-upload mode**: [Pyodide](https://pyodide.org/)
- **Third-party JS bundled under `docs/references/`**:
  - [`FileSaver.js`](https://github.com/eligrey/FileSaver.js) (eligrey)
  - Marc Robledo’s helper libraries (MarcFile/Tooltips/DragAndDrop) referenced in the bundled `savegame-editor.js`

# Disclaimer

This project is developed with the help of codex-5.5-medium and cursor on auto. This is why the project does not (and never will) modify any save files. I don't trust AI code that modifies something as sensitive as a save file especially when the loading logic isn't 100% clear. If I had chosen to do that it could have potentially introduced corruptions which I would never want to cause. Thus, this project is simply a read-only viewer.
