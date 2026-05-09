const materialsStatus = document.querySelector("#materialsStatus");
const armorFourStarSummary = document.querySelector("#armorFourStarSummary");
const shortMaterialSummary = document.querySelector("#shortMaterialSummary");
const materialsTableBody = document.querySelector("#materialsTableBody");
const showAllMaterials = document.querySelector("#showAllMaterials");
const materialsBackLink = document.querySelector(".materials-back-link");
let currentPayload = null;
const MATERIAL_TYPE_ORDER = ["Enemy", "Boss", "Animal", "Fish", "Plant", "Gem", "Dragon", "Other"];
function materialTypeSort(type) {
  const index = MATERIAL_TYPE_ORDER.indexOf(type || "Other");
  return index < 0 ? MATERIAL_TYPE_ORDER.length : index;
}

function setStatus(text) {
  materialsStatus.textContent = text;
}

function tableCell(text, className = "") {
  const cell = document.createElement("td");
  cell.textContent = text;
  if (className) {
    cell.className = className;
  }
  return cell;
}

function typeCell(type) {
  const cell = tableCell("", "material-type-cell");
  const chip = document.createElement("span");
  chip.className = `material-type-chip material-type-${String(type || "Other").toLowerCase()}`;
  chip.textContent = type || "Other";
  cell.append(chip);
  return cell;
}

function buffered(value) {
  return value > 0 ? value + 1 : 0;
}

function materialView(item) {
  const totalNeeded = buffered(item.totalRequired || 0);
  const currentNeeded = buffered(item.neededForRemainingUpgrades || 0);
  const inventory = item.owned || 0;
  return {
    ...item,
    totalNeeded,
    currentNeeded,
    inventory,
    missing: Math.max(currentNeeded - inventory, 0),
  };
}

function renderMaterials(payload) {
  currentPayload = payload;
  const materials = (payload.materials || [])
    .map(materialView)
    .filter((item) => showAllMaterials.checked || item.missing > 0)
    .sort((a, b) =>
      materialTypeSort(a.type) - materialTypeSort(b.type)
      || (a.material || "").localeCompare(b.material || ""),
    );
  const shortCount = (payload.materials || []).map(materialView).filter((item) => item.missing > 0).length;

  armorFourStarSummary.textContent = `${payload.armor?.fourStar ?? "--"} / ${payload.armor?.fourStarTotal ?? "--"}`;
  shortMaterialSummary.textContent = String(shortCount);
  setStatus(payload.savePath || "Loaded save");

  if (!materials.length) {
    const row = document.createElement("tr");
    row.append(tableCell("No materials needed for remaining armor upgrades.", "materials-empty-cell"));
    row.firstChild.colSpan = 6;
    materialsTableBody.replaceChildren(row);
    return;
  }

  materialsTableBody.replaceChildren(...materials.map((item) => {
    const row = document.createElement("tr");
    row.classList.toggle("material-short-row", item.missing > 0);
    row.classList.toggle("material-done-row", item.missing === 0);
    row.append(
      typeCell(item.type),
      tableCell(item.material || item.actorName || ""),
      tableCell(String(item.totalNeeded), "numeric"),
      tableCell(String(item.currentNeeded), "numeric"),
      tableCell(String(item.inventory), "numeric"),
      tableCell(String(item.missing), "numeric"),
    );
    return row;
  }));
}

showAllMaterials?.addEventListener("change", () => {
  if (currentPayload) {
    renderMaterials(currentPayload);
  }
});

if (materialsBackLink) {
  materialsBackLink.href = pyodideAwarePageUrl("index.html");
}

async function postStoredSaveToBackend(file) {
  const response = await fetch("/api/upload_armor_upgrade_materials", {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "X-Filename": file.name || "progress.sav",
    },
    body: await file.arrayBuffer(),
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || "Could not calculate armor materials");
  }
  return payload;
}

async function loadMaterials() {
  const storedFile = storedUploadedSaveFile();
  try {
    if (storedFile) {
      setStatus(`Loading ${storedFile.name}`);
      if (window.TOTK_USE_PYODIDE) {
        return renderMaterials(await armorUpgradeMaterialsViaPyodide(storedFile));
      }
      try {
        return renderMaterials(await postStoredSaveToBackend(storedFile));
      } catch {
        return renderMaterials(await armorUpgradeMaterialsViaPyodide(storedFile));
      }
    }

    if (window.TOTK_USE_PYODIDE) {
      throw new Error("No uploaded save is available on this page. Return to the map and upload a save first.");
    }

    setStatus("Loading live save");
    const response = await fetch("/api/armor_upgrade_materials", { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Could not calculate armor materials");
    }
    renderMaterials(payload);
  } catch (error) {
    setStatus(error.message || "Could not load armor materials");
    const row = document.createElement("tr");
    row.append(tableCell("Could not load armor materials.", "materials-empty-cell"));
    row.firstChild.colSpan = 6;
    materialsTableBody.replaceChildren(row);
    console.error(error);
  }
}

loadMaterials();
