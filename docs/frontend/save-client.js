let _pyodidePromise = null;
const UPLOADED_SAVE_STORAGE_KEY = "totkUploadedSave";

function pyodideAwarePageUrl(path) {
  const url = new URL(path, window.location.href);
  if (window.TOTK_USE_PYODIDE) {
    url.searchParams.set("pyodide", "1");
  }
  return url.toString();
}

function pyodideAssetUrl(path) {
  const base = new URL(".", window.location.href);
  return new URL(path, base).toString();
}

async function loadPyodideScript() {
  if (typeof window.loadPyodide === "function") {
    return;
  }
  await new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/pyodide/v0.26.2/full/pyodide.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Pyodide"));
    document.head.appendChild(script);
  });
}

async function fetchTextAsset(path) {
  return fetch(pyodideAssetUrl(path), { cache: "no-store" }).then((response) => response.text());
}

async function ensurePyodide() {
  if (_pyodidePromise) {
    return _pyodidePromise;
  }
  _pyodidePromise = (async () => {
    await loadPyodideScript();
    const pyodide = await window.loadPyodide({ indexURL: "https://cdn.jsdelivr.net/pyodide/v0.26.2/full/" });

    pyodide.FS.mkdirTree("/app/references");
    const [serverPy, utilsPy, completionJson] = await Promise.all([
      fetchTextAsset("server.py"),
      fetchTextAsset("utils.py"),
      fetchTextAsset("completion_data.json"),
    ]);
    pyodide.FS.writeFile("/app/server.py", serverPy, { encoding: "utf8" });
    pyodide.FS.writeFile("/app/utils.py", utilsPy, { encoding: "utf8" });
    pyodide.FS.writeFile("/app/completion_data.json", completionJson, { encoding: "utf8" });

    await pyodide.runPythonAsync(`
import sys, time
from pathlib import Path

sys.path.insert(0, "/app")
import server as _srv

_srv.initialize_data()

def parse_uploaded_save(path: str, filename: str = "progress.sav", mtime: float | None = None):
    data = Path(path).read_bytes()
    save_modified = int(mtime if mtime is not None else time.time())
    return _srv.build_save_payload(data, filename, save_modified, snapshot=[])

def parse_uploaded_armor_upgrade_materials(path: str, filename: str = "progress.sav", mtime: float | None = None):
    data = Path(path).read_bytes()
    save_modified = int(mtime if mtime is not None else time.time())
    return _srv.build_armor_upgrade_material_payload(data, filename, save_modified)

def parse_uploaded_recipes(path: str, filename: str = "progress.sav", mtime: float | None = None):
    data = Path(path).read_bytes()
    save_modified = int(mtime if mtime is not None else time.time())
    return _srv.build_recipe_payload(data, filename, save_modified)
`);
    return pyodide;
  })();
  return _pyodidePromise;
}

function arrayBufferToBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function base64ToUint8Array(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function rememberUploadedSave(file, buffer) {
  try {
    sessionStorage.setItem(UPLOADED_SAVE_STORAGE_KEY, JSON.stringify({
      name: file.name || "progress.sav",
      lastModified: file.lastModified || Date.now(),
      bytes: arrayBufferToBase64(buffer),
    }));
  } catch (error) {
    console.warn("Could not store uploaded save for secondary pages", error);
  }
}

function storedUploadedSave() {
  try {
    const raw = sessionStorage.getItem(UPLOADED_SAVE_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function storedUploadedSaveFile() {
  const stored = storedUploadedSave();
  if (!stored?.bytes) {
    return null;
  }
  return new File(
    [base64ToUint8Array(stored.bytes)],
    stored.name || "progress.sav",
    { lastModified: stored.lastModified || Date.now() },
  );
}

async function uploadManualSaveViaPyodide(file, buffer = null) {
  setSaveLoading(true, "Loading");
  const pyodide = await ensurePyodide();
  const bytes = new Uint8Array(buffer || await file.arrayBuffer());
  pyodide.FS.mkdirTree("/tmp");
  pyodide.FS.writeFile("/tmp/upload.sav", bytes);

  setSaveLoading(true, "Loading");
  const mtime = Math.floor((file.lastModified || Date.now()) / 1000);
  const pyResult = await pyodide.runPythonAsync(`parse_uploaded_save("/tmp/upload.sav", ${JSON.stringify(file.name || "progress.sav")}, ${mtime})`);
  const result = pyResult.toJs({ dict_converter: Object.fromEntries });
  pyResult.destroy?.();
  return result;
}

async function armorUpgradeMaterialsViaPyodide(file, buffer = null) {
  const pyodide = await ensurePyodide();
  const bytes = new Uint8Array(buffer || await file.arrayBuffer());
  pyodide.FS.mkdirTree("/tmp");
  pyodide.FS.writeFile("/tmp/armor-upload.sav", bytes);

  const mtime = Math.floor((file.lastModified || Date.now()) / 1000);
  const pyResult = await pyodide.runPythonAsync(
    `parse_uploaded_armor_upgrade_materials("/tmp/armor-upload.sav", ${JSON.stringify(file.name || "progress.sav")}, ${mtime})`,
  );
  const result = pyResult.toJs({ dict_converter: Object.fromEntries });
  pyResult.destroy?.();
  return result;
}

async function recipesViaPyodide(file, buffer = null) {
  const pyodide = await ensurePyodide();
  const bytes = new Uint8Array(buffer || await file.arrayBuffer());
  pyodide.FS.mkdirTree("/tmp");
  pyodide.FS.writeFile("/tmp/recipes-upload.sav", bytes);

  const mtime = Math.floor((file.lastModified || Date.now()) / 1000);
  const pyResult = await pyodide.runPythonAsync(
    `parse_uploaded_recipes("/tmp/recipes-upload.sav", ${JSON.stringify(file.name || "progress.sav")}, ${mtime})`,
  );
  const result = pyResult.toJs({ dict_converter: Object.fromEntries });
  pyResult.destroy?.();
  return result;
}
