const materialsStatus = document.querySelector("#materialsStatus");
const armorFourStarSummary = document.querySelector("#armorFourStarSummary");
const armorUpgradeCountSummary = document.querySelector("#armorUpgradeCountSummary");
const shortMaterialSummary = document.querySelector("#shortMaterialSummary");
const missingMaterialSummary = document.querySelector("#missingMaterialSummary");
const rupeeNeededSummary = document.querySelector("#rupeeNeededSummary");
const materialsTableBody = document.querySelector("#materialsTableBody");
const showAllMaterials = document.querySelector("#showAllMaterials");
const copyMaterialsButton = document.querySelector("#copyMaterialsButton");
const materialsBackLink = document.querySelector(".materials-back-link");
let currentPayload = null;
let armorHealthTimer = null;
let lastArmorHealthKey = null;
let armorMaterialsLoading = false;
const MATERIAL_TYPE_ORDER = ["Enemy", "Boss", "Animal", "Fish", "Plant", "Gem", "Dragon", "Other"];
const ARMOR_UPGRADE_RUPEE_COSTS = { 1: 10, 2: 50, 3: 200, 4: 500 };
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

function materialView(item) {
  const totalNeeded = item.totalRequired || 0;
  const currentNeeded = item.neededForRemainingUpgrades || 0;
  const inventory = item.owned || 0;
  return {
    ...item,
    totalNeeded,
    currentNeeded,
    inventory,
    missing: currentNeeded - inventory + 1,
  };
}

function currentNeedCell(value) {
  const cell = tableCell("", "numeric current-need-cell");
  cell.append(String(value));
  const extra = document.createElement("span");
  extra.className = "current-need-extra";
  extra.textContent = "+1";
  cell.append(extra);
  return cell;
}

function materialViews(payload) {
  return (payload.materials || [])
    .map(materialView)
    .sort((a, b) =>
      materialTypeSort(a.type) - materialTypeSort(b.type)
      || (a.material || "").localeCompare(b.material || ""),
    );
}

function armorUpgradeSummary(payload) {
  const upgradeItems = payload.armor?.upgradeItems || [];
  return upgradeItems.reduce((summary, item) => {
    const neededLevels = item.neededLevels || [];
    summary.count += neededLevels.length;
    summary.rupees += neededLevels.reduce((total, level) => total + (ARMOR_UPGRADE_RUPEE_COSTS[level] || 0), 0);
    return summary;
  }, { count: 0, rupees: 0 });
}

function formatInteger(value) {
  return Number(value || 0).toLocaleString();
}

function renderMaterials(payload) {
  currentPayload = payload;
  const allMaterials = materialViews(payload);
  const materials = allMaterials.filter((item) => showAllMaterials.checked || item.missing > 0);
  const shortCount = allMaterials.filter((item) => item.missing > 0).length;
  const missingMaterialCount = allMaterials.reduce((total, item) => total + Math.max(item.missing, 0), 0);
  const upgrades = armorUpgradeSummary(payload);

  armorFourStarSummary.textContent = `${payload.armor?.fourStar ?? "--"} / ${payload.armor?.fourStarTotal ?? "--"}`;
  armorUpgradeCountSummary.textContent = formatInteger(upgrades.count);
  shortMaterialSummary.textContent = String(shortCount);
  missingMaterialSummary.textContent = formatInteger(missingMaterialCount);
  rupeeNeededSummary.textContent = formatInteger(upgrades.rupees);
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
    row.classList.toggle("material-done-row", item.missing <= 0);
    row.append(
      typeCell(item.type),
      tableCell(item.material || item.actorName || ""),
      tableCell(String(item.totalNeeded), "numeric"),
      currentNeedCell(item.currentNeeded),
      tableCell(String(item.inventory), "numeric"),
      tableCell(String(item.missing), "numeric"),
    );
    return row;
  }));
}

function tsvEscape(value) {
  return String(value ?? "").replaceAll("\t", " ").replaceAll("\r", " ").replaceAll("\n", " ");
}

function materialsClipboardText(payload) {
  const headers = ["Type", "Material", "Total Need for all upgrades", "Consumed (for upgrades)", "Need", "Inventory"];
  const rows = materialViews(payload).map((item) => [
    item.type || "Other",
    item.material || item.actorName || "",
    item.totalNeeded,
    item.totalNeeded - item.currentNeeded,
    item.currentNeeded + 1,
    item.inventory,
  ]);
  return [headers, ...rows].map((row) => row.map(tsvEscape).join("\t")).join("\n");
}

showAllMaterials?.addEventListener("change", () => {
  if (currentPayload) {
    renderMaterials(currentPayload);
  }
});

if (materialsBackLink) {
  materialsBackLink.href = pyodideAwarePageUrl("index.html");
}

copyMaterialsButton?.addEventListener("click", async () => {
  if (!currentPayload) {
    return;
  }
  try {
    await navigator.clipboard.writeText(materialsClipboardText(currentPayload));
    copyMaterialsButton.textContent = "Copied";
    setTimeout(() => {
      copyMaterialsButton.textContent = "Copy table";
    }, 1200);
  } catch (error) {
    setStatus("Could not copy table");
    console.error(error);
  }
});

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
  if (armorMaterialsLoading) {
    return;
  }
  armorMaterialsLoading = true;
  const storedFile = storedUploadedSaveFile();
  try {
    if (storedFile && window.TOTK_USE_PYODIDE) {
      setStatus(`Loading ${storedFile.name}`);
      return renderMaterials(await armorUpgradeMaterialsViaPyodide(storedFile));
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
    if (!window.TOTK_USE_PYODIDE && storedFile) {
      try {
        return renderMaterials(await postStoredSaveToBackend(storedFile));
      } catch {
        // keep original error below
      }
    }
    setStatus(error.message || "Could not load armor materials");
    const row = document.createElement("tr");
    row.append(tableCell("Could not load armor materials.", "materials-empty-cell"));
    row.firstChild.colSpan = 6;
    materialsTableBody.replaceChildren(row);
    console.error(error);
  } finally {
    armorMaterialsLoading = false;
  }
}

function pageIsActive() {
  return document.visibilityState === "visible" && document.hasFocus();
}

async function refreshArmorHealth() {
  if (!pageIsActive()) {
    return;
  }
  try {
    const response = await fetch("/api/health", { cache: "no-store" });
    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || "Health check failed");
    }
    const key = (await response.text()).trim() || null;
    const changed = key && key !== lastArmorHealthKey;
    lastArmorHealthKey = key;
    if (changed) {
      await loadMaterials();
    }
  } catch (error) {
    console.error(error);
  }
}

if (window.TOTK_USE_PYODIDE) {
  loadMaterials();
} else {
  refreshArmorHealth();
  armorHealthTimer = setInterval(refreshArmorHealth, 1000);
}

window.addEventListener("focus", () => {
  if (!window.TOTK_USE_PYODIDE) {
    refreshArmorHealth();
  }
});

document.addEventListener("visibilitychange", () => {
  if (!window.TOTK_USE_PYODIDE && document.visibilityState === "visible") {
    refreshArmorHealth();
  }
});

window.addEventListener("pagehide", () => {
  if (armorHealthTimer) {
    clearInterval(armorHealthTimer);
  }
});
