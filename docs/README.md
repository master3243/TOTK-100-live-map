This folder has the source code for the website.

It's called "docs" because github is stupid and can only host pages in root ('/') or docs ('/docs') directories.

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

I don't recommend doing this unless you are a developer and know what you are doing. For me, it was convenient to have an .exe file I can just double click to start the app.

To build a .exe locally:

```powershell
cd REPO_FOLDER
conda activate ./env
./build.ps1
```

## Github Pages Local Reproduction

to reproduce what github pages does:

```powershell
cd docs
python -m http.server 8002
```
Then open `http://localhost:8002/?pyodide=1`