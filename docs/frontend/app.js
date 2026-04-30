const layers = {
  surface: {
    label: "surface",
    src: "assets/surface.jpg",
    alt: "Tears of the Kingdom surface map",
  },
  sky: {
    label: "sky",
    src: "assets/sky.jpg",
    alt: "Tears of the Kingdom sky map",
  },
  depths: {
    label: "depths",
    src: "assets/depths.jpg",
    alt: "Tears of the Kingdom depths map",
  },
};

const $ = (selector) => document.querySelector(selector);
const byId = (...ids) => Object.fromEntries(ids.map((id) => [id, $(`#${id}`)]));
const {
  mapViewport: viewport, mapImage, guideLayer, markerLayer, mapTooltip, statTooltip, loadingState,
  zoomValue, cursorValue, liveSaveList, liveSaveCompletedToggleRow, liveSaveCompletedToggle,
  saveStatus, seedCount, locationCount, recipesSummary, lifeSummary, staminaSummary, batterySummary,
  completionistSummary, armorInventorySummary, armorUpgradedSummary, compendiumSummary,
  pristineWeaponsSummary, fabricsSummary, manualSaveInput, manualSaveStatus, demoSaveButton,
  demoModal, demoModalCancel, demoModalConfirm, markersMenu, saveLoadingOverlay, saveDropLayer,
  sidebarToggle, sidebarBackdrop, sidebarClose, logEntries, viewPlayer,
} = byId(
  "mapViewport", "mapImage", "guideLayer", "markerLayer", "mapTooltip", "statTooltip", "loadingState",
  "zoomValue", "cursorValue", "liveSaveList", "liveSaveCompletedToggleRow", "liveSaveCompletedToggle",
  "saveStatus", "seedCount", "locationCount", "recipesSummary", "lifeSummary", "staminaSummary",
  "batterySummary", "completionistSummary", "armorInventorySummary", "armorUpgradedSummary",
  "compendiumSummary", "pristineWeaponsSummary", "fabricsSummary", "manualSaveInput", "manualSaveStatus",
  "demoSaveButton", "demoModal", "demoModalCancel", "demoModalConfirm", "markersMenu", "saveLoadingOverlay",
  "saveDropLayer", "sidebarToggle", "sidebarBackdrop", "sidebarClose", "logEntries", "viewPlayer",
);
const demoSaveInputs = document.querySelectorAll('input[name="demoSave"]');
const logPanel = logEntries?.closest(".log-panel") || null;
const layerButtons = document.querySelectorAll(".layer-button");
let currentCompletionStats = {};
let currentPlayerStats = null;
let currentRecipes = null;
const completionStatSummaries = [
  {
    id: "armor_inventory",
    title: "Armor",
    element: armorInventorySummary,
    missingPrefix: "Still missing",
    completeText: "All armor collected",
    tooltipCompleteText: "All armor collected.",
    emptyText: "No armor data loaded",
  },
  {
    id: "armor_upgraded",
    title: "Armor (4-star upgraded)",
    element: armorUpgradedSummary,
    missingPrefix: "Still left",
    completeText: "All upgradeable armor is at 4 stars",
    tooltipCompleteText: "All upgradeable armor is at 4 stars.",
    emptyText: "No armor upgrade data loaded",
  },
  {
    id: "compendium",
    title: "Compendium",
    element: compendiumSummary,
    missingPrefix: "Still missing",
    completeText: "All compendium pictures registered",
    tooltipCompleteText: "All compendium pictures registered.",
    emptyText: "No compendium data loaded",
  },
  {
    id: "pristine_weapons",
    title: "Pristine Weapons",
    element: pristineWeaponsSummary,
    missingPrefix: "Still locked",
    completeText: "All pristine weapons unlocked",
    tooltipCompleteText: "All pristine weapons unlocked.",
    emptyText: "No pristine weapon data loaded",
  },
  {
    id: "fabrics",
    title: "Fabrics",
    element: fabricsSummary,
    missingPrefix: "Still left",
    completeText: "All fabrics collected",
    tooltipCompleteText: "All fabrics collected.",
    emptyText: "No fabric data loaded",
  },
];
const overlayInputs = {
  playerLocation: document.querySelector("#showPlayerLocation"),
  playerGuide: document.querySelector("#showPlayerGuide"),
  playerAutoPan: document.querySelector("#playerAutoPan"),
};

// Until we successfully parse at least one save payload, hide panels that depend on save data.
document.body.classList.add("no-save-loaded");
const groupInputs = {
  player: document.querySelector("#groupPlayer"),
  completion: document.querySelector("#groupCompletion"),
};
const completionIds = [
  "koroks", "towers", "shrines", "lightroots", "caves", "bubbulfrogs", "hudson_sign",
  "dungeon_bosses", "flux_construct", "hinox", "stone_talus", "molduga", "frox", "gleeok",
  "wells", "chasms", "yiga_schematic", "old_map", "armor", "sage_will", "schema_stone",
  "general_locations",
];
const completionInputs = Object.fromEntries(completionIds.map((id) => [id, $(`#completion-${id}`)]));
const completionCounts = Object.fromEntries(
  completionIds.map((id) => [id, $(`#completionCount-${id}`)]),
);
const completionShowObtained = Object.fromEntries(completionIds.map((id) => [id, false]));
const completionEyesToggle = document.querySelector("#completionEyesToggle");
const completionTotalSummary = document.querySelector("#completionTotalSummary");
const completionObtainedToggles = Object.fromEntries(
  Object.entries(completionCounts).map(([id, count]) => {
    const button = document.createElement("button");
    button.className = "show-obtained-toggle";
    button.type = "button";
    button.setAttribute("aria-label", `Show obtained ${id.replaceAll("_", " ")}`);
    button.setAttribute("aria-pressed", "false");
    button.title = "Show obtained";
    count?.after(button);
    return [id, button];
  }),
);
const overlayGroups = {
  player: [overlayInputs.playerLocation, overlayInputs.playerGuide, overlayInputs.playerAutoPan],
  completion: [
    ...Object.values(completionInputs),
  ],
};

function anyCompletionEyesOpen() {
  return Object.values(completionShowObtained).some(Boolean);
}

function setAllCompletionEyes(open) {
  for (const id of Object.keys(completionShowObtained)) {
    completionShowObtained[id] = open;
  }
}

function updateCompletionEyesToggleUi() {
  if (!completionEyesToggle) {
    return;
  }
  const open = anyCompletionEyesOpen();
  completionEyesToggle.classList.toggle("active", open);
  completionEyesToggle.setAttribute("aria-pressed", open ? "true" : "false");
  completionEyesToggle.title = open ? "Hide obtained (all)" : "Show obtained (all)";
  completionEyesToggle.setAttribute("aria-label", open ? "Hide obtained completion items" : "Show obtained completion items");
}

const minScale = 0.18;
const maxScale = 6;
const zoomStep = 0.05;
const wheelZoomFactor = 1.1;
const buttonZoomFactor = 1.25;
/** Max zoom when auto-framing the player guide arrow (200%). */
const playerGuideMaxScale = 2;
const LIVE_SAVE_ROW_ORDER = [
  "completionist",
  "seeds",
  "koroks",
  "life",
  "stamina",
  "battery",
  "armor",
  "armor-upgraded",
  "compendium",
  "pristine-weapons",
  "fabrics",
  "recipes",
];

const PLAYER_MAX_LIFE_HEARTS = 38;
const PLAYER_MAX_STAMINA_WHEELS = 3;
const PLAYER_MAX_BATTERY_CELLS = 48;
const PLAYER_MAX_RECIPES = 228;
const playerStatSummaries = [
  {
    element: lifeSummary,
    value: (stats) => stats && Math.min(stats.lifeHearts, PLAYER_MAX_LIFE_HEARTS),
    total: PLAYER_MAX_LIFE_HEARTS,
  },
  {
    element: staminaSummary,
    value: (stats) => stats && formatStaminaUnits(stats.maxStamina),
    total: PLAYER_MAX_STAMINA_WHEELS,
  },
  {
    element: batterySummary,
    value: (stats) => stats && Math.min(stats.batteryCells, PLAYER_MAX_BATTERY_CELLS),
    total: PLAYER_MAX_BATTERY_CELLS,
  },
];

let activeLayer = "surface";
let scale = 1;
let offsetX = 0;
let offsetY = 0;
let imageWidth = 0;
let imageHeight = 0;
let hasLoadedAnyMapImage = false;
let activePointers = new Map();
let dragStart = null;
let pinchStart = null;
let korokMarkers = [];
let completionCategories = [];
let playerPosition = null;
let linkNearestUnobtainedId = null;
let linkNearestCompletionId = null;
let lastLogSignature = "";
let lastLogId = 0;
let pendingPanPoint = null;
let lastPlayerPanKey = null;
/** When unchanged, skip re-applying player-guide zoom/pan (avoids jumps on unrelated overlay toggles). */
let lastPlayerGuideFrameKey = "";
let korokCountSummary = null;
let hasLoadedAnySave = false;
let liveSaveCompletedExpanded = false;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function snapScale(value) {
  const snapped = Math.round(value / zoomStep) * zoomStep;
  return clamp(Number(snapped.toFixed(4)), minScale, maxScale);
}

function isNarrowLayout() {
  // Some mobile browsers report hover/pointer media queries inconsistently.
  // Use innerWidth as a reliable fallback.
  return window.innerWidth <= 820
    || window.matchMedia("(max-width: 820px)").matches
    || window.matchMedia("(hover: none) and (pointer: coarse)").matches;
}

function updateNarrowLayoutClass() {
  document.body.classList.toggle("narrow-layout", isNarrowLayout());
}

function shouldAutoCloseSidebarAfterSave() {
  if (!document.body.classList.contains("sidebar-open")) {
    return false;
  }
  const visualWidth = window.visualViewport?.width || window.innerWidth;
  return document.body.classList.contains("narrow-layout")
    || isNarrowLayout()
    || visualWidth <= 820;
}

function closeSidebarAfterSaveIfNeeded() {
  if (!shouldAutoCloseSidebarAfterSave()) {
    return;
  }
  setSidebarOpen(false);
  requestAnimationFrame(() => {
    if (shouldAutoCloseSidebarAfterSave()) {
      setSidebarOpen(false);
    }
  });
}

function clampPanToViewportCenterCell() {
  if (!imageWidth || !imageHeight) {
    return;
  }
  const rect = viewport.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) {
    return;
  }

  const mapW = imageWidth * scale;
  const mapH = imageHeight * scale;

  const cellLeft = rect.width / 5;
  const cellRight = (rect.width * 4) / 5;
  const cellTop = rect.height / 5;
  const cellBottom = (rect.height * 4) / 5;

  // Keep each map edge OUTSIDE the center cell:
  // leftEdge <= cellLeft, rightEdge >= cellRight, topEdge <= cellTop, bottomEdge >= cellBottom
  const minOffsetX = cellRight - mapW;
  const maxOffsetX = cellLeft;
  const minOffsetY = cellBottom - mapH;
  const maxOffsetY = cellTop;

  if (minOffsetX > maxOffsetX) {
    // Map is smaller than the center cell in this axis; just center it.
    offsetX = (rect.width - mapW) / 2;
  } else {
    offsetX = clamp(offsetX, minOffsetX, maxOffsetX);
  }

  if (minOffsetY > maxOffsetY) {
    offsetY = (rect.height - mapH) / 2;
  } else {
    offsetY = clamp(offsetY, minOffsetY, maxOffsetY);
  }
}

function updateTransform() {
  clampPanToViewportCenterCell();
  const transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
  mapImage.style.transform = transform;
  guideLayer.style.transform = transform;
  markerLayer.style.transform = transform;
  zoomValue.textContent = `${Math.round(scale * 100)}%`;
  updateIconScale();
  if (isTooltipPinned) {
    positionPinnedMapTooltip();
  }
}

function setDemoModalOpen(open) {
  if (!demoModal) {
    return;
  }
  if (open) {
    const defaultDemoSave = demoModal.querySelector('input[name="demoSave"][value="endgame"]');
    if (defaultDemoSave) {
      defaultDemoSave.checked = true;
    }
  }
  demoModal.hidden = !open;
  demoModal.setAttribute("aria-hidden", open ? "false" : "true");
}

function selectedDemoSave() {
  const selected = Array.from(demoSaveInputs).find((input) => input.checked);
  return {
    src: selected?.dataset.src || "assets/dummy.sav",
    filename: selected?.dataset.filename || "dummy.sav",
    label: selected?.dataset.label || "Endgame Save (~70%)",
  };
}

function updateIconScale() {
  // The map is scaled via CSS transform; compensate marker size so icons stay readable.
  // ZeldaDungeon-style: markers remain closer to a consistent pixel size while zooming.
  // When zoomed OUT (small scale) we want icons to get larger for visibility.
  const normalized = Math.max(scale || 1, 0.12);
  const iconScale = clamp(1 / (normalized ** 1.1), 0.55, 4.0);
  const iconScaleStr = iconScale.toFixed(4);
  markerLayer.style.setProperty("--iconScale", iconScaleStr);
  guideLayer.style.setProperty("--iconScale", iconScaleStr);
}

function centerMap() {
  if (!imageWidth || !imageHeight) {
    return;
  }

  const rect = viewport.getBoundingClientRect();
  const fit = Math.min(rect.width / imageWidth, rect.height / imageHeight);
  scale = snapScale(fit * 0.96);
  offsetX = (rect.width - imageWidth * scale) / 2;
  offsetY = (rect.height - imageHeight * scale) / 2;
  updateTransform();
}

/** Keep zoom/pan stable when the window size changes (e.g. Alt toggling the menu bar on Windows). */
function preserveMapCenterOnViewportResize() {
  if (!imageWidth || !imageHeight) {
    return;
  }
  const rect = viewport.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) {
    return;
  }
  const midX = rect.width / 2;
  const midY = rect.height / 2;
  const mapX = (midX - offsetX) / scale;
  const mapY = (midY - offsetY) / scale;
  offsetX = midX - mapX * scale;
  offsetY = midY - mapY * scale;
  updateTransform();
}

function zoomAt(nextScale, clientX, clientY) {
  const rect = viewport.getBoundingClientRect();
  const pointX = clientX - rect.left;
  const pointY = clientY - rect.top;
  const mapX = (pointX - offsetX) / scale;
  const mapY = (pointY - offsetY) / scale;

  scale = snapScale(nextScale);
  offsetX = pointX - mapX * scale;
  offsetY = pointY - mapY * scale;
  updateTransform();
}

function panToMapPoint(mapX, mapY, nextScale = Math.max(scale, 0.72)) {
  const rect = viewport.getBoundingClientRect();
  scale = snapScale(nextScale);
  offsetX = rect.width / 2 - mapX * scale;
  offsetY = rect.height / 2 - mapY * scale;
  updateTransform();
}

function panToPoint(point, nextScale = Math.max(scale, 1.2)) {
  if (point.layer && point.layer !== activeLayer) {
    pendingPanPoint = { point, nextScale };
    loadLayer(point.layer);
    return;
  }
  panToMapPoint(point.mapX, point.mapY, nextScale);
}

function loadLayer(layerName) {
  activeLayer = layerName;
  loadingState.textContent = "Loading map...";
  loadingState.classList.remove("hidden");
  mapImage.alt = layers[layerName].alt;
  mapImage.src = layers[layerName].src;

  // While the image is still loading (especially on first launch), we don't yet know natural dimensions,
  if (!imageWidth || !imageHeight) {
    scale = 1;
    offsetX = 0;
    offsetY = 0;
    const transform = "translate(0px, 0px) scale(1)";
    mapImage.style.transform = transform;
    guideLayer.style.transform = transform;
    markerLayer.style.transform = transform;
    zoomValue.textContent = "100%";
  }

  layerButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.layer === layerName);
  });

  renderGuide(korokMarkers);
  renderMarkers();
}

function getVisibleMarkers(markers) {
  return markers.filter((marker) => {
    if (marker.layer !== activeLayer) {
      return false;
    }
    if (!completionInputs.koroks?.checked) {
      return false;
    }
    if (marker.obtained && !completionShowObtained.koroks) {
      return false;
    }
    return true;
  });
}

function markerLabel(marker) {
  const state = marker.obtained ? "Obtained" : "Missing";
  const kind = marker.kind === "carry" ? "carry pair" : "hidden Korok";
  return `${state} ${kind} ${marker.id}`;
}

function markerDisplayPoint(marker) {
  const targetWorld = parseTargetWorldFromNote(marker.note);
  return targetWorld ? worldToMap(targetWorld.x, targetWorld.z) : marker;
}

function enabledGroupItems(items) {
  return items.filter((item) => !item.disabled);
}

function syncGroupState(groupName) {
  const groupInput = groupInputs[groupName];
  const items = enabledGroupItems(overlayGroups[groupName]);
  const checkedCount = items.filter((item) => item.checked).length;

  if (!items.length) {
    groupInput.checked = false;
    groupInput.indeterminate = false;
    groupInput.disabled = true;
    return;
  }

  groupInput.disabled = false;
  groupInput.checked = checkedCount === items.length;
  groupInput.indeterminate = checkedCount > 0 && checkedCount < items.length;
}

function syncAllGroupStates() {
  Object.keys(overlayGroups).forEach(syncGroupState);
}

function rerenderOverlays() {
  syncAllGroupStates();
  renderGuide(korokMarkers);
  renderMarkers();
}

function setGroupChecked(groupName, checked) {
  for (const item of enabledGroupItems(overlayGroups[groupName])) {
    item.checked = checked;
  }
  if (checked && groupName === "player" && overlayInputs.playerAutoPan.checked) {
    // no-op: group already checked, keep current behavior
  }
  rerenderOverlays();
}

function completionLabel(marker) {
  const displayNote = displayMarkerNote(marker);
  const note = displayNote ? ` - ${displayNote}` : "";
  return `${marker.obtained ? "Obtained" : "Missing"} ${marker.categoryLabel}${note}`;
}

function formatNumber(value) {
  return Number.isFinite(value) ? Math.round(value).toLocaleString() : "--";
}

function formatLayer(layer) {
  return layers[layer]?.label || layer || "unknown";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

const OBJMAP_TOTK_ZOOM = 8;
const EXTERNAL_LINK_ICON =
  '<svg class="tooltip-link-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M10.0002 5H8.2002C7.08009 5 6.51962 5 6.0918 5.21799C5.71547 5.40973 5.40973 5.71547 5.21799 6.0918C5 6.51962 5 7.08009 5 8.2002V15.8002C5 16.9203 5 17.4801 5.21799 17.9079C5.40973 18.2842 5.71547 18.5905 6.0918 18.7822C6.5192 19 7.07899 19 8.19691 19H15.8031C16.921 19 17.48 19 17.9074 18.7822C18.2837 18.5905 18.5905 18.2839 18.7822 17.9076C19 17.4802 19 16.921 19 15.8031V14M20 9V4M20 4H15M20 4L13 11"/></svg>';

/** Leading decimal in korok `note` is often the 64-bit map object id used by objmap. */
function parseLeadingUInt64FromNote(note) {
  if (!note || typeof note !== "string") {
    return null;
  }
  const match = /^(\d{12,})/.exec(note.trim());
  if (!match) {
    return null;
  }
  try {
    return BigInt(match[1]);
  } catch {
    return null;
  }
}

function parseAnyUInt64FromNote(note) {
  if (!note || typeof note !== "string") {
    return null;
  }
  const match = /\b(\d{12,})\b/.exec(note);
  if (!match) {
    return null;
  }
  try {
    return BigInt(match[1]);
  } catch {
    return null;
  }
}

function parseLeadingHex64FromNote(note) {
  if (!note || typeof note !== "string") {
    return null;
  }
  const match = /^(0x[0-9a-fA-F]{16})\b/.exec(note.trim());
  return match ? match[1] : null;
}

function parseLocationFlagFromNote(note) {
  if (!note || typeof note !== "string") {
    return null;
  }
  const match = /\b(IsVisitLocation\.[\w_]+)\b/.exec(note);
  return match ? match[1] : null;
}

function parseLeadingFlagFromNote(note) {
  if (!note || typeof note !== "string") {
    return null;
  }
  const match = /^([A-Za-z_][\w_]*(?:\.[\w_]+)*)\b/.exec(note.trim());
  return match ? match[1] : null;
}

function formatHexId(value, { pad64 = false } = {}) {
  const raw = String(value || "").trim();
  if (!raw) {
    return null;
  }
  const hexMatch = /^0x([0-9a-fA-F]+)$/.exec(raw);
  if (hexMatch) {
    const hex = hexMatch[1].toLowerCase();
    return `0x${pad64 ? hex.padStart(16, "0") : hex}`;
  }
  if (/^[0-9a-fA-F]{8}$/.test(raw)) {
    return `0x${raw.toLowerCase()}`;
  }
  if (/^\d{12,}$/.test(raw)) {
    try {
      return `0x${BigInt(raw).toString(16).padStart(16, "0")}`;
    } catch {
      return null;
    }
  }
  return null;
}

function markerHexId(marker) {
  const objmapId = formatHexId(marker.objmapId, { pad64: true });
  if (objmapId && /^0x[0-9a-f]{16}$/.test(objmapId)) {
    return objmapId;
  }
  const noteHex = parseLeadingHex64FromNote(marker.note);
  if (noteHex) {
    return noteHex.toLowerCase();
  }
  const noteUInt64 = parseLeadingUInt64FromNote(marker.note);
  if (noteUInt64 != null) {
    return `0x${noteUInt64.toString(16).padStart(16, "0")}`;
  }
  return (
    formatHexId(marker.hash, { pad64: true })
    || formatHexId(marker.value, { pad64: true })
  );
}

function markerObjmapQuery(marker) {
  const objmapQuery = (marker.objmapQuery || "").trim();
  if (objmapQuery) {
    return objmapQuery;
  }
  const objmapId = (marker.objmapId || "").trim();
  if (/^0x[0-9a-fA-F]{16}$/.test(objmapId)) {
    return objmapId;
  }
  if (marker.categoryId === "yiga_schematic") {
    return "yiga";
  }
  if (marker.categoryId === "schema_stone") {
    return "Abandoned Mine";
  }
  if (marker.categoryId === "old_map") {
    const oldMapId = parseAnyUInt64FromNote(marker.note);
    if (oldMapId != null) {
      return oldMapId.toString(10);
    }
  }
  if (marker.categoryId === "general_locations") {
    const generalLocationFlag = parseLeadingFlagFromNote(marker.note);
    if (generalLocationFlag) {
      return generalLocationFlag.replaceAll(".", " ");
    }
  }
  const locationFlag = parseLocationFlagFromNote(marker.note);
  if (locationFlag) {
    return locationFlag.replaceAll(".", " ");
  }
  const hexFromNote = parseLeadingHex64FromNote(marker.note);
  if (hexFromNote != null) {
    return hexFromNote;
  }
  const fromNote = parseLeadingUInt64FromNote(marker.note);
  if (fromNote != null) {
    return `0x${fromNote.toString(16).padStart(16, "0")}`;
  }
  if (marker.categoryId === "bubbulfrogs" && /^\d+$/.test(String(marker.value || ""))) {
    return `0x${BigInt(marker.value).toString(16).padStart(16, "0")}`;
  }
  const raw = (marker.hash || marker.value || "").trim();
  if (/^[0-9a-fA-F]{8}$/.test(raw)) {
    return `0x${raw}`;
  }
  return null;
}

function displayMarkerNote(marker) {
  const note = marker.note || "";
  if (marker.categoryId === "bubbulfrogs" && note.startsWith("xxxxxxxxxxxxxxx")) {
    return `${marker.value}${note.slice("xxxxxxxxxxxxxxx".length)}`;
  }
  return note;
}

function formatLayerForObjmap(layer) {
  const map = {
    surface: "Surface",
    sky: "Sky",
    depths: "Depths",
  };
  if (layer && map[layer]) {
    return map[layer];
  }
  if (!layer) {
    return "Surface";
  }
  return layer.charAt(0).toUpperCase() + layer.slice(1).toLowerCase();
}

/** https://objmap-totk.zeldamods.org — zoom z8, world X/Z, layer, ?q=0x… */
function buildObjmapTotkUrl(marker) {
  const q = markerObjmapQuery(marker);
  if (q == null || !Number.isFinite(marker.x) || !Number.isFinite(marker.z)) {
    return null;
  }
  const x = Math.round(marker.x);
  const z = Math.round(marker.z);
  const layerName = formatLayerForObjmap(marker.layer);
  return `https://objmap-totk.zeldamods.org/#/map/z${OBJMAP_TOTK_ZOOM},${x},${z},${layerName}?q=${encodeURIComponent(q)}`;
}

function tooltipExternalLinks(links) {
  if (!links.length) {
    return "";
  }
  const anchors = links
    .map(
      (link) =>
        `<a class="tooltip-link" href="${escapeHtml(link.href)}" target="_blank" rel="noopener noreferrer">${EXTERNAL_LINK_ICON}<span>${escapeHtml(link.label)}</span></a>`,
    )
    .join("");
  return `<div class="tooltip-actions">${anchors}</div>`;
}

function tooltipRows(title, rows) {
  const rowHtml = rows
    .filter((row) => row.value !== undefined && row.value !== null && row.value !== "")
    .map((row) => `<div><dt>${escapeHtml(row.label)}</dt><dd>${escapeHtml(row.value)}</dd></div>`)
    .join("");
  return `<strong>${escapeHtml(title)}</strong><dl>${rowHtml}</dl>`;
}

function korokTooltip(marker) {
  const match = /^(hidden|carry)-(\d+)$/.exec(marker.id || "");
  const kind = match?.[1] || null;
  const index = match ? Number.parseInt(match[2], 10) : null;
  let zdNumber = null;
  if (kind === "hidden" && Number.isFinite(index)) {
    zdNumber = index + 99; // hidden-001 -> Korok0100
  } else if (kind === "carry" && Number.isFinite(index)) {
    zdNumber = index - 1; // carry-001 -> Korok0000
  }
  const zdCode = zdNumber == null ? null : `Korok${String(zdNumber).padStart(4, "0")}`;
  const zdUrl = zdCode
    ? `https://www.zeldadungeon.net/tears-of-the-kingdom-interactive-map/?m=${encodeURIComponent(zdCode)}`
    : null;

  const base = tooltipRows(markerLabel(marker), [
    { label: "Status", value: marker.obtained ? "Obtained" : "Unobtained" },
    { label: "Type", value: marker.kind === "carry" ? "Pair, 2 seeds" : "Single seed" },
    { label: "Layer", value: formatLayer(marker.layer) },
    { label: "World", value: `X ${formatNumber(marker.x)}, Y ${formatNumber(marker.y)}, Z ${formatNumber(marker.z)}` },
    { label: "Map", value: `${formatNumber(marker.mapX)}, ${formatNumber(marker.mapY)}` },
    { label: "Save value", value: marker.rawValue },
    { label: "Hex", value: markerHexId(marker) },
  ]);
  const links = [];
  if (zdUrl) {
    links.push({ href: zdUrl, label: "Zelda Dungeon" });
  }
  const objmapUrl = buildObjmapTotkUrl(marker);
  if (objmapUrl) {
    links.push({ href: objmapUrl, label: "Zelda DB" });
  }
  if (!links.length) {
    return base;
  }
  return `${base}${tooltipExternalLinks(links)}`;
}

function completionTooltip(marker) {
  const displayNote = displayMarkerNote(marker);
  const base = tooltipRows(completionLabel(marker), [
    { label: "Category", value: marker.categoryLabel },
    { label: "Status", value: marker.obtained ? "Obtained" : "Unobtained" },
    { label: "Layer", value: formatLayer(marker.layer) },
    { label: "World", value: `X ${formatNumber(marker.x)}, Y ${formatNumber(marker.y)}, Z ${formatNumber(marker.z)}` },
    { label: "Map", value: `${formatNumber(marker.mapX)}, ${formatNumber(marker.mapY)}` },
    { label: "Hex", value: markerHexId(marker) },
    { label: "Source", value: displayNote },
  ]);
  const objmapUrl = buildObjmapTotkUrl(marker);
  if (!objmapUrl) {
    return base;
  }
  return `${base}${tooltipExternalLinks([{ href: objmapUrl, label: "Zelda DB" }])}`;
}

function playerTooltip(position) {
  return tooltipRows("Link's current location", [
    { label: "Layer", value: formatLayer(position.layer) },
    { label: "World", value: `X ${formatNumber(position.x)}, Y ${formatNumber(position.y)}, Z ${formatNumber(position.z)}` },
    { label: "Map", value: `${formatNumber(position.mapX)}, ${formatNumber(position.mapY)}` },
    position.raw ? { label: "Raw save", value: `X ${formatNumber(position.raw.x)}, Y ${formatNumber(position.raw.y)}, Z ${formatNumber(position.raw.z)}` } : {},
  ]);
}

function playerLifeTooltip(stats) {
  if (!stats) {
    return tooltipRows("Life", [{ label: "Status", value: "No save data loaded" }]);
  }
  return tooltipRows("Life", [
    { label: "Max", value: `${Math.min(stats.lifeHearts, PLAYER_MAX_LIFE_HEARTS)} / ${PLAYER_MAX_LIFE_HEARTS} hearts` },
    { label: "Raw maxLife", value: stats.maxLife },
  ]);
}

function formatStaminaUnits(maxStamina) {
  const cappedUnits = Math.min(maxStamina / 1000, PLAYER_MAX_STAMINA_WHEELS);
  const normalized = Math.abs(cappedUnits - PLAYER_MAX_STAMINA_WHEELS) < 1e-6
    ? PLAYER_MAX_STAMINA_WHEELS
    : Math.floor(cappedUnits * 10) / 10;
  return Number.isInteger(normalized) ? String(normalized) : normalized.toFixed(1);
}

function playerStaminaTooltip(stats) {
  if (!stats) {
    return tooltipRows("Stamina", [{ label: "Status", value: "No save data loaded" }]);
  }
  return tooltipRows("Stamina", [
    { label: "Max", value: `${formatStaminaUnits(stats.maxStamina)} / ${PLAYER_MAX_STAMINA_WHEELS} wheels` },
    { label: "Raw maxStamina", value: stats.maxStamina },
  ]);
}

function playerBatteryTooltip(stats) {
  if (!stats) {
    return tooltipRows("Battery", [{ label: "Status", value: "No save data loaded" }]);
  }
  return tooltipRows("Battery", [
    { label: "Max", value: `${Math.min(stats.batteryCells, PLAYER_MAX_BATTERY_CELLS)} / ${PLAYER_MAX_BATTERY_CELLS} cells` },
    { label: "Raw maxEnergy", value: stats.maxEnergy },
  ]);
}

function recipesTooltip(recipes) {
  if (!recipes) {
    return tooltipRows("Recipes", [{ label: "Status", value: "No save data loaded" }]);
  }
  const obtained = recipes.obtained ?? "--";
  const total = recipes.total ?? PLAYER_MAX_RECIPES;
  const extras = recipes.extras || [];

  const collected = typeof obtained === "number" ? obtained : Number(obtained);
  const left = Number.isFinite(collected) ? Math.max(total - collected, 0) : "--";

  let html = tooltipRows("Recipes", [
    {
      label: "Collected",
      value: `${obtained} / ${total}`,
    },
    { label: "Left", value: String(left) },
  ]);

  if (extras.length) {
    html += `<p class="tooltip-note">⚠️ Unknown recipes found in save file</p>`;
    const items = extras.map((id) => `<li>${escapeHtml(id)}</li>`).join("");
    html += `<div class="tooltip-section-title">Extra cooked recipes</div><ul class="tooltip-list">${items}</ul>`;
  }

  return html;
}

function completionistTooltip() {
  if (!completionCategories.length) {
    return tooltipRows("Completionist", [
      { label: "Status", value: "No save data loaded" },
    ]);
  }
  const total = completionCategories.length;
  const complete = completionCategories.filter((category) => (category.remaining ?? 0) === 0).length;
  const missing = [...completionCategories]
    .filter((category) => (category.remaining ?? 0) > 0)
    .sort((a, b) => (b.remaining ?? 0) - (a.remaining ?? 0));
  const rows = tooltipRows("Completionist", [
    { label: "Complete", value: `${complete} / ${total} categories` },
    { label: "Left", value: missing.length },
  ]);
  if (!missing.length) {
    return `${rows}<p class="tooltip-note">All completionist categories are done.</p>`;
  }
  const items = missing
    .map((category) => {
      const remaining = category.remaining ?? 0;
      const obtained = category.obtained ?? 0;
      const categoryTotal = category.total ?? remaining + obtained;
      return `<li>${escapeHtml(category.label)} <span class="tooltip-list-note">${remaining} left (${obtained}/${categoryTotal})</span></li>`;
    })
    .join("");
  return `${rows}<div class="tooltip-section-title">Still left</div><ul class="tooltip-list">${items}</ul>`;
}

function sortStatMissingByLabel(items) {
  return [...(items || [])].sort((a, b) =>
    String(a.label || a.id || "").localeCompare(String(b.label || b.id || ""), undefined, { sensitivity: "base" }),
  );
}

function isCompletedRatioText(text) {
  const match = /^\s*([\d,]+)\s*\/\s*([\d,]+)\s*$/.exec(String(text || ""));
  if (!match) {
    return false;
  }
  const current = Number.parseInt(match[1].replaceAll(",", ""), 10);
  const total = Number.parseInt(match[2].replaceAll(",", ""), 10);
  return Number.isFinite(current) && Number.isFinite(total) && total > 0 && current === total;
}

function updateLiveSaveRows() {
  if (!liveSaveList || !liveSaveCompletedToggle || !liveSaveCompletedToggleRow) {
    return;
  }

  const rows = Array.from(liveSaveList.querySelectorAll(":scope > div"));
  const statusRow = rows.find((row) => row.dataset.liveRow === "status");
  const metricRows = rows
    .filter((row) => row.dataset.liveRow !== "status")
    .sort((a, b) => LIVE_SAVE_ROW_ORDER.indexOf(a.dataset.liveRow) - LIVE_SAVE_ROW_ORDER.indexOf(b.dataset.liveRow));
  const incompleteRows = [];
  const completedRows = [];

  for (const row of metricRows) {
    const liveRowId = row.dataset.liveRow;
    const ddText = row.querySelector("dd")?.textContent;
    let complete = false;
    complete = isCompletedRatioText(ddText);
    row.classList.toggle("live-save-row-complete", complete);
    row.classList.toggle("live-save-row-collapsed", complete && !liveSaveCompletedExpanded);
    if (complete) {
      completedRows.push(row);
    } else {
      incompleteRows.push(row);
    }
  }

  liveSaveList.replaceChildren(...[statusRow, ...incompleteRows, liveSaveCompletedToggleRow, ...completedRows].filter(Boolean));
  liveSaveCompletedToggleRow.hidden = completedRows.length === 0;
  liveSaveCompletedToggle.setAttribute("aria-expanded", liveSaveCompletedExpanded ? "true" : "false");
  liveSaveCompletedToggle.textContent = liveSaveCompletedExpanded
    ? `Hide completed (${completedRows.length})`
    : `Show completed (${completedRows.length})`;
}

function statListTooltip(stat, title, completeText, { formatItem = null } = {}) {
  if (!stat) {
    return tooltipRows(title, [
      { label: "Status", value: "No save data loaded" },
    ]);
  }
  const missing = sortStatMissingByLabel(stat.missing);
  const rows = tooltipRows(title, [
    { label: "Collected", value: `${stat.obtained} / ${stat.total}` },
    { label: "Left", value: stat.remaining },
  ]);
  if (!missing.length && stat.remaining > 0) {
    return `${rows}<p class="tooltip-note">Missing list not available from the current save payload yet.</p>`;
  }
  if (!missing.length) {
    return `${rows}<p class="tooltip-note">${escapeHtml(completeText)}</p>`;
  }
  const items = missing
    .map((item) => `<li>${escapeHtml(formatItem ? formatItem(item) : item.label || item.id)}</li>`)
    .join("");
  return `${rows}<div class="tooltip-section-title">Still left</div><ul class="tooltip-list">${items}</ul>`;
}

function positionTooltipAtClient(clientX, clientY) {
  const rect = viewport.getBoundingClientRect();
  const gap = 14;
  mapTooltip.hidden = false;
  const tooltipRect = mapTooltip.getBoundingClientRect();
  let left = clientX - rect.left + gap;
  let top = clientY - rect.top + gap;

  if (left + tooltipRect.width > rect.width - 8) {
    left = clientX - rect.left - tooltipRect.width - gap;
  }
  if (top + tooltipRect.height > rect.height - 8) {
    top = clientY - rect.top - tooltipRect.height - gap;
  }

  mapTooltip.style.left = `${Math.max(8, left)}px`;
  mapTooltip.style.top = `${Math.max(8, top)}px`;
}

function positionTooltip(event) {
  positionTooltipAtClient(event.clientX, event.clientY);
}

/** Keep pinned map tooltip aligned with its marker while panning / zooming. */
function positionPinnedMapTooltip() {
  if (!isTooltipPinned || !(tooltipPinnedOwner instanceof HTMLElement)) {
    return;
  }
  if (!tooltipPinnedOwner.isConnected) {
    setTooltipPinned(false);
    return;
  }
  const br = tooltipPinnedOwner.getBoundingClientRect();
  if (br.width < 2 && br.height < 2) {
    return;
  }
  const clientX = br.right;
  const clientY = br.top + br.height * 0.5;
  positionTooltipAtClient(clientX, clientY);
}

function positionStatTooltip(event) {
  const gap = 14;
  statTooltip.hidden = false;
  const tooltipRect = statTooltip.getBoundingClientRect();
  let left = event.clientX + gap;
  let top = event.clientY + gap;

  if (left + tooltipRect.width > window.innerWidth - 8) {
    left = event.clientX - tooltipRect.width - gap;
  }
  if (top + tooltipRect.height > window.innerHeight - 8) {
    top = window.innerHeight - tooltipRect.height - 8;
  }

  statTooltip.style.left = `${Math.max(8, left)}px`;
  statTooltip.style.top = `${Math.max(8, top)}px`;
}

let isTooltipPinned = false;
let isStatTooltipPinned = false;
let tooltipPinnedAtMs = 0;
let statTooltipPinnedAtMs = 0;
let lastDragEndAtMs = 0;
let didPanThisGesture = false;
let lastPanEndAtMs = 0;
let tooltipPinnedOwner = null;
let statTooltipPinnedOwner = null;
let tooltipPinCandidate = null;

function setTooltipPinned(pinned) {
  isTooltipPinned = pinned;
  if (!pinned) {
    if (tooltipPinnedOwner instanceof HTMLElement) {
      tooltipPinnedOwner.classList.remove("tooltip-pinned-owner");
    }
    tooltipPinnedOwner = null;
    mapTooltip.hidden = true;
    mapTooltip.classList.remove("pinned");
  } else {
    mapTooltip.hidden = false;
    mapTooltip.classList.add("pinned");
  }
}

function setTooltipContent(html, { pinned = false } = {}) {
  if (pinned) {
    mapTooltip.innerHTML = `<button class="tooltip-close" type="button" aria-label="Close tooltip" title="Close">&times;</button>${html}`;
  } else {
    mapTooltip.innerHTML = html;
  }
}

function setStatTooltipPinned(pinned) {
  isStatTooltipPinned = pinned;
  if (!pinned) {
    if (statTooltipPinnedOwner instanceof HTMLElement) {
      statTooltipPinnedOwner.classList.remove("tooltip-pinned-owner");
    }
    statTooltipPinnedOwner = null;
    statTooltip.hidden = true;
    statTooltip.classList.remove("pinned");
  } else {
    statTooltip.hidden = false;
    statTooltip.classList.add("pinned");
  }
}

function setStatTooltipContent(html, { pinned = false } = {}) {
  if (pinned) {
    statTooltip.innerHTML = `<button class="tooltip-close" type="button" aria-label="Close tooltip" title="Close">&times;</button>${html}`;
  } else {
    statTooltip.innerHTML = html;
  }
}

function attachTooltip(element, html) {
  element.addEventListener("pointerenter", (event) => {
    if (isTooltipPinned) {
      return;
    }
    setTooltipContent(html, { pinned: false });
    positionTooltip(event);
  });
  element.addEventListener("pointermove", (event) => {
    if (isTooltipPinned) {
      return;
    }
    positionTooltip(event);
  });
  element.addEventListener("pointerleave", () => {
    if (isTooltipPinned) {
      return;
    }
    // Hide on hover-leave, but not during/just after a pan gesture (pointer-capture can emit leave on release).
    if (viewport.classList.contains("dragging")) {
      return;
    }
    if (performance.now() - lastDragEndAtMs < 350) {
      return;
    }
    mapTooltip.hidden = true;
  });
  element.addEventListener("pointerdown", (event) => {
    // Allow drag-to-pan even when starting on an icon.
    // If the gesture ends without panning, we'll pin on pointerup.
    tooltipPinCandidate = {
      pointerId: event.pointerId,
      element,
      html,
    };
  });
}

function pulseMarkersMenu() {
  if (!markersMenu) {
    return;
  }
  markersMenu.open = true;
  markersMenu.classList.remove("menu-glow");
  void markersMenu.offsetWidth;
  markersMenu.classList.add("menu-glow");
}

function attachStatTooltip(element, getHtml, { onClick = null } = {}) {
  element.addEventListener("pointerenter", (event) => {
    if (isStatTooltipPinned) {
      return;
    }
    setStatTooltipContent(getHtml(), { pinned: false });
    positionStatTooltip(event);
  });
  element.addEventListener("pointermove", (event) => {
    if (isStatTooltipPinned) {
      return;
    }
    positionStatTooltip(event);
  });
  element.addEventListener("pointerleave", () => {
    if (isStatTooltipPinned) {
      return;
    }
    statTooltip.hidden = true;
  });
  element.addEventListener("focus", () => {
    if (isStatTooltipPinned) {
      return;
    }
    setStatTooltipContent(getHtml(), { pinned: false });
    const rect = element.getBoundingClientRect();
    positionStatTooltip({ clientX: rect.right, clientY: rect.top });
  });
  element.addEventListener("blur", () => {
    if (isStatTooltipPinned) {
      return;
    }
    statTooltip.hidden = true;
  });
  element.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (statTooltipPinnedOwner instanceof HTMLElement) {
      statTooltipPinnedOwner.classList.remove("tooltip-pinned-owner");
    }
    statTooltipPinnedOwner = element;
    statTooltipPinnedOwner.classList.add("tooltip-pinned-owner");
    statTooltipPinnedAtMs = performance.now();
    setStatTooltipContent(getHtml(), { pinned: true });
    setStatTooltipPinned(true);
    positionStatTooltip(event);
    onClick?.(event);
  });
}

// Close pinned tooltip when clicking outside it.
document.addEventListener("click", (event) => {
  if (!statTooltip.hidden) {
    if (isStatTooltipPinned && performance.now() - statTooltipPinnedAtMs < 300) {
      return;
    }
    const target = event.target;
    if (target && statTooltip.contains(target)) {
      return;
    }
    if (target instanceof HTMLElement && target.closest(".hover-stat")) {
      return;
    }
    if (isStatTooltipPinned) {
      setStatTooltipPinned(false);
    } else {
      statTooltip.hidden = true;
    }
  }

  if (mapTooltip.hidden) {
    return;
  }
  // After panning, browsers often fire a click on mouseup; don't treat that as a dismiss action.
  if (performance.now() - lastPanEndAtMs < 350) {
    return;
  }
  // Some browsers still dispatch a click on mouseup after we pin on pointerdown.
  // Ignore those immediate clicks so the tooltip doesn't instantly close.
  if (isTooltipPinned && performance.now() - tooltipPinnedAtMs < 300) {
    return;
  }
  const target = event.target;
  if (target && mapTooltip.contains(target)) {
    return;
  }
  if (isTooltipPinned) {
    setTooltipPinned(false);
  } else {
    mapTooltip.hidden = true;
  }
});

// Close button inside pinned tooltip.
mapTooltip.addEventListener("click", (event) => {
  const target = event.target;
  if (target instanceof HTMLElement && target.closest(".tooltip-close")) {
    event.preventDefault();
    event.stopPropagation();
    setTooltipPinned(false);
  }
});

statTooltip.addEventListener("click", (event) => {
  const target = event.target;
  if (target instanceof HTMLElement && target.closest(".tooltip-close")) {
    event.preventDefault();
    event.stopPropagation();
    setStatTooltipPinned(false);
  }
});

// Tooltip should block map panning, but still allow text selection.
mapTooltip.addEventListener("pointerdown", (event) => {
  event.stopPropagation();
});
mapTooltip.addEventListener("pointermove", (event) => {
  event.stopPropagation();
});
mapTooltip.addEventListener("pointerup", (event) => {
  event.stopPropagation();
});
mapTooltip.addEventListener("pointercancel", (event) => {
  event.stopPropagation();
});
mapTooltip.addEventListener("wheel", (event) => {
  event.stopPropagation();
}, { passive: true });

statTooltip.addEventListener("pointerdown", (event) => {
  event.stopPropagation();
});
statTooltip.addEventListener("pointermove", (event) => {
  event.stopPropagation();
});
statTooltip.addEventListener("pointerup", (event) => {
  event.stopPropagation();
});
statTooltip.addEventListener("pointercancel", (event) => {
  event.stopPropagation();
});
statTooltip.addEventListener("wheel", (event) => {
  event.stopPropagation();
}, { passive: true });

// Escape closes pinned or sticky hover tooltip.
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") {
    return;
  }
  if (document.body.classList.contains("sidebar-open")) {
    event.preventDefault();
    setSidebarOpen(false);
    return;
  }
  if (document.body.classList.contains("save-drop-active")) {
    event.preventDefault();
    hideManualSaveDropUi();
    return;
  }
  if (mapTooltip.hidden && statTooltip.hidden) {
    return;
  }
  event.preventDefault();
  setTooltipPinned(false);
  setStatTooltipPinned(false);
});

function setSidebarOpen(open) {
  document.body.classList.toggle("sidebar-open", open);
  if (sidebarBackdrop) {
    sidebarBackdrop.hidden = !open;
    sidebarBackdrop.setAttribute("aria-hidden", open ? "false" : "true");
  }
  if (sidebarClose) {
    sidebarClose.hidden = !open;
    sidebarClose.setAttribute("aria-hidden", open ? "false" : "true");
  }
  // Keep the hamburger as "open menu"; close is via the top-right X, backdrop, or Escape.
}

if (sidebarToggle) {
  sidebarToggle.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    setSidebarOpen(true);
  });
}

if (sidebarBackdrop) {
  sidebarBackdrop.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    setSidebarOpen(false);
  });
}

if (sidebarClose) {
  sidebarClose.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    setSidebarOpen(false);
  });
}

const WORLD_DISTANCE_Y_WEIGHT = 3;

/** World-space distance using X, Y, Z; vertical separation counts 10× vs horizontal (same Y as server payloads). */
function worldDistanceWorld3D(a, b) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  if (!Number.isFinite(a.y) || !Number.isFinite(b.y)) {
    return Math.hypot(dx, dz);
  }
  const dy = WORLD_DISTANCE_Y_WEIGHT * (a.y - b.y);
  return Math.hypot(dx, dy, dz);
}

const HYRULE_MIN_X = -6000;
const HYRULE_MAX_X = 6000;
const HYRULE_MIN_Z = -5000;
const HYRULE_MAX_Z = 5000;

function worldToMap(x, z) {
  return {
    mapX: (x - HYRULE_MIN_X) / (HYRULE_MAX_X - HYRULE_MIN_X) * 6000,
    mapY: (z - HYRULE_MIN_Z) / (HYRULE_MAX_Z - HYRULE_MIN_Z) * 5000,
  };
}

function mapToWorld(mapX, mapY) {
  return {
    x: HYRULE_MIN_X + (mapX / 6000) * (HYRULE_MAX_X - HYRULE_MIN_X),
    z: HYRULE_MIN_Z + (mapY / 5000) * (HYRULE_MAX_Z - HYRULE_MIN_Z),
  };
}

function parseTargetWorldFromNote(note) {
  if (!note || typeof note !== "string") {
    return null;
  }
  const match = /\btarget:\s*\[\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\]/i.exec(note);
  if (!match) {
    return null;
  }
  const x = Number(match[1]);
  const y = Number(match[2]);
  const z = Number(match[3]);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
    return null;
  }
  return { x, y, z };
}

function appendKorokTargetLines(markers) {
  if (!imageWidth || !imageHeight) {
    return null;
  }
  const candidates = (markers || []).filter((marker) => marker && (marker.kind === "carry" || marker.kind === "hidden"));

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "korok-pair-lines");
  svg.setAttribute("width", String(imageWidth));
  svg.setAttribute("height", String(imageHeight));
  svg.style.position = "absolute";
  svg.style.left = "0";
  svg.style.top = "0";
  svg.style.pointerEvents = "none";

  let appended = 0;
  for (const marker of candidates) {
    const targetWorld = parseTargetWorldFromNote(marker.note);
    if (!targetWorld) {
      continue;
    }
    const targetMap = worldToMap(targetWorld.x, targetWorld.z);
    if (!Number.isFinite(marker.mapX) || !Number.isFinite(marker.mapY)) {
      continue;
    }
    if (!Number.isFinite(targetMap.mapX) || !Number.isFinite(targetMap.mapY)) {
      continue;
    }

    // Carry: icon at end, small circle at start.
    // Hidden-with-target: icon at end (target), small circle at start (entry).
    if (marker.kind === "carry" || marker.kind === "hidden") {
      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("cx", String(marker.mapX));
      circle.setAttribute("cy", String(marker.mapY));
      circle.setAttribute("r", marker.kind === "carry" ? "3.3" : "3.0");
      circle.setAttribute("vector-effect", "non-scaling-stroke");
      circle.setAttribute("class", marker.obtained ? "obtained" : "unobtained");
      svg.appendChild(circle);
    }

    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", String(marker.mapX));
    line.setAttribute("y1", String(marker.mapY));
    line.setAttribute("x2", String(targetMap.mapX));
    line.setAttribute("y2", String(targetMap.mapY));
    line.setAttribute("vector-effect", "non-scaling-stroke");
    line.setAttribute("class", marker.obtained ? "obtained" : "unobtained");
    svg.appendChild(line);
    appended += 1;
  }

  return appended ? svg : null;
}

/** Closest target for the player guide: unobtained koroks and visible missing completion pins (world XYZ). */
function findNearestPlayerGuideTarget(origin, korokCandidates, completionCandidates) {
  let nearest = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const marker of korokCandidates) {
    const distance = worldDistanceWorld3D(marker, origin);
    if (distance < nearestDistance) {
      nearest = marker;
      nearestDistance = distance;
    }
  }

  for (const marker of completionCandidates) {
    const distance = worldDistanceWorld3D(marker, origin);
    if (distance < nearestDistance) {
      nearest = marker;
      nearestDistance = distance;
    }
  }

  return nearest;
}

function arrowDirection(origin, target) {
  const dx = target.mapX - origin.mapX;
  const dy = target.mapY - origin.mapY;
  const distance = Math.hypot(dx, dy);
  if (!distance) {
    return null;
  }
  return {
    angle: Math.atan2(dy, dx),
    distance,
  };
}

function appendCompassArrow(origin, target, className) {
  const direction = arrowDirection(origin, target);
  if (!direction) {
    return null;
  }

  const arrow = document.createElement("span");
  arrow.className = `compass-arrow ${className}`;
  arrow.style.left = `${origin.mapX}px`;
  arrow.style.top = `${origin.mapY}px`;
  arrow.style.setProperty("--compass-rotate", `${direction.angle}rad`);
  return arrow;
}

/** Distance from viewport center to edge along a unit direction (viewport px). */
function viewportEdgeDistanceAlongRay(viewWidth, viewHeight, nx, ny) {
  const cx = viewWidth / 2;
  const cy = viewHeight / 2;
  let t = Infinity;
  if (nx > 1e-9) {
    t = Math.min(t, (viewWidth - cx) / nx);
  }
  if (nx < -1e-9) {
    t = Math.min(t, (0 - cx) / nx);
  }
  if (ny > 1e-9) {
    t = Math.min(t, (viewHeight - cy) / ny);
  }
  if (ny < -1e-9) {
    t = Math.min(t, (0 - cy) / ny);
  }
  return t;
}

/** Center the player on screen and zoom so the target sits halfway from center to the viewport edge along that ray (cap 200%). */
function applyPlayerGuideView(player, target) {
  if (!imageWidth || !imageHeight) {
    return;
  }
  const rect = viewport.getBoundingClientRect();
  const vw = rect.width;
  const vh = rect.height;
  if (vw < 1 || vh < 1) {
    return;
  }

  const vx = target.mapX - player.mapX;
  const vy = target.mapY - player.mapY;
  const mapLen = Math.hypot(vx, vy);
  if (mapLen < 1e-6) {
    return;
  }

  const nx = vx / mapLen;
  const ny = vy / mapLen;
  const edgeDist = viewportEdgeDistanceAlongRay(vw, vh, nx, ny);
  if (!Number.isFinite(edgeDist) || edgeDist <= 0) {
    return;
  }

  const desiredScreenDist = 0.5 * edgeDist;
  let nextScale = desiredScreenDist / mapLen;
  nextScale = clamp(nextScale, minScale, Math.min(playerGuideMaxScale, maxScale));

  scale = snapScale(nextScale);
  offsetX = vw / 2 - player.mapX * scale;
  offsetY = vh / 2 - player.mapY * scale;
  updateTransform();
}

function appendPlayerGuideConnector(player, target) {
  if (!imageWidth || !imageHeight) {
    return null;
  }
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "player-guide-connector");
  svg.setAttribute("width", String(imageWidth));
  svg.setAttribute("height", String(imageHeight));
  svg.style.position = "absolute";
  svg.style.left = "0";
  svg.style.top = "0";
  svg.style.pointerEvents = "none";

  const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
  line.setAttribute("x1", String(player.mapX));
  line.setAttribute("y1", String(player.mapY));
  line.setAttribute("x2", String(target.mapX));
  line.setAttribute("y2", String(target.mapY));
  line.setAttribute("vector-effect", "non-scaling-stroke");
  svg.appendChild(line);
  return svg;
}

function updateTargetControls() {
  viewPlayer.disabled = !playerPosition;
  overlayInputs.playerLocation.disabled = !playerPosition;
  overlayInputs.playerGuide.disabled = !playerPosition;
  overlayInputs.playerAutoPan.disabled = !playerPosition;
  syncAllGroupStates();
}

function renderGuide(markers) {
  guideLayer.replaceChildren();
  linkNearestUnobtainedId = null;
  linkNearestCompletionId = null;

  if (!overlayInputs.playerGuide.checked) {
    lastPlayerGuideFrameKey = "";
  }

  if (!overlayInputs.playerGuide.checked) {
    return;
  }

  const visibleUnobtained = markers.filter((marker) => {
    return marker.layer === activeLayer
      && !marker.obtained
      && completionInputs.koroks?.checked;
  });

  const visibleCompletionMissing = [];
  for (const category of completionCategories) {
    const input = completionInputs[category.id];
    if (!input || !input.checked) {
      continue;
    }
    for (const item of category.items) {
      if (item.layer === activeLayer) {
        visibleCompletionMissing.push(item);
      }
    }
  }

  const fragment = document.createDocumentFragment();

  if (
    imageWidth
    && imageHeight
    && playerPosition
    && playerPosition.layer === activeLayer
    && overlayInputs.playerGuide.checked
  ) {
    const nearestFromLink = findNearestPlayerGuideTarget(
      playerPosition,
      visibleUnobtained,
      visibleCompletionMissing,
    );
    if (nearestFromLink) {
      if (Object.hasOwn(nearestFromLink, "categoryId")) {
        linkNearestCompletionId = nearestFromLink.id;
      } else {
        linkNearestUnobtainedId = nearestFromLink.id;
      }
      const frameKey = `${nearestFromLink.id}|${Math.round(playerPosition.x)}|${Math.round(playerPosition.z)}|${activeLayer}`;
      if (frameKey !== lastPlayerGuideFrameKey) {
        lastPlayerGuideFrameKey = frameKey;
        applyPlayerGuideView(playerPosition, nearestFromLink);
      }
      const connector = appendPlayerGuideConnector(playerPosition, nearestFromLink);
      if (connector) {
        fragment.appendChild(connector);
      }
      const arrow = appendCompassArrow(playerPosition, nearestFromLink, "link-arrow");
      if (arrow) {
        fragment.appendChild(arrow);
      }
    } else {
      lastPlayerGuideFrameKey = "";
    }
  }

  guideLayer.appendChild(fragment);
}

function renderMarkers(markers = korokMarkers, categories = completionCategories) {
  korokMarkers = markers;
  completionCategories = categories;
  const fragment = document.createDocumentFragment();

  const visibleKoroks = getVisibleMarkers(markers);
  const targetLines = appendKorokTargetLines(visibleKoroks);
  if (targetLines) {
    fragment.appendChild(targetLines);
  }

  for (const marker of visibleKoroks) {
    const element = document.createElement("span");
    const classes = ["korok-marker", marker.kind, marker.obtained ? "obtained" : "unobtained"];
    if (marker.id === linkNearestUnobtainedId) {
      classes.push("link-nearest");
    }

    element.className = classes.join(" ");
    const point = markerDisplayPoint(marker);
    element.style.left = `${point.mapX}px`;
    element.style.top = `${point.mapY}px`;
    element.removeAttribute("title");
    attachTooltip(element, korokTooltip(marker));
    fragment.appendChild(element);
  }

  for (const category of categories) {
    const input = completionInputs[category.id];
    if (!input || !input.checked) {
      continue;
    }

    const categoryMarkers = completionShowObtained[category.id]
      ? [...category.items, ...(category.obtainedItems || [])]
      : category.items;
    for (const marker of categoryMarkers) {
      if (marker.layer !== activeLayer) {
        continue;
      }

      const element = document.createElement("span");
      const classes = ["completion-marker", `completion-${marker.categoryId}`];
      if (marker.obtained) {
        classes.push("obtained");
      }
      if (marker.id === linkNearestCompletionId) {
        classes.push("link-nearest");
      }
      element.className = classes.join(" ");
      element.style.left = `${marker.mapX}px`;
      element.style.top = `${marker.mapY}px`;
      element.removeAttribute("title");
      attachTooltip(element, completionTooltip(marker));
      fragment.appendChild(element);
    }
  }

  if (playerPosition && playerPosition.layer === activeLayer && overlayInputs.playerLocation.checked) {
    const link = document.createElement("span");
    link.className = "link-marker";
    link.style.left = `${playerPosition.mapX}px`;
    link.style.top = `${playerPosition.mapY}px`;
    link.removeAttribute("title");
    link.innerHTML = '<span class="person-head"></span><span class="person-body"></span><span class="person-arm left"></span><span class="person-arm right"></span><span class="person-leg left"></span><span class="person-leg right"></span>';
    attachTooltip(link, playerTooltip(playerPosition));
    fragment.appendChild(link);
  }

  mapTooltip.hidden = true;
  markerLayer.replaceChildren(fragment);
}

function completionCountText(category) {
  const remaining = category.remaining ?? 0;
  const obtained = category.obtained ?? 0;
  const total = category.total ?? remaining + obtained;
  return `${remaining} (${obtained}/${total})`;
}

function completionRowModels(categories) {
  return [
    korokCountSummary
      ? {
          id: "koroks",
          label: "Koroks",
          contributesToTotal: false,
          ...korokCountSummary,
        }
      : {
          id: "koroks",
          label: "Koroks",
          obtained: 0,
          total: 0,
          remaining: 0,
          contributesToTotal: false,
          unloaded: true,
        },
    ...categories.map((category) => ({
      contributesToTotal: true,
      ...category,
    })),
  ];
}

function updateCompletionRow(category) {
    const count = completionCounts[category.id];
    const input = completionInputs[category.id];
    const label = input?.closest("label");
    const remaining = category.remaining ?? 0;
    const obtained = category.obtained ?? 0;
    if (count) {
      count.textContent = category.unloaded ? "--" : completionCountText(category);
    }
    const toggle = completionObtainedToggles[category.id];
    if (toggle) {
      toggle.disabled = obtained === 0;
      toggle.classList.toggle("active", completionShowObtained[category.id]);
      toggle.setAttribute("aria-pressed", completionShowObtained[category.id] ? "true" : "false");
      toggle.title = completionShowObtained[category.id] ? "Hide obtained" : "Show obtained";
      toggle.setAttribute(
        "aria-label",
        `${completionShowObtained[category.id] ? "Hide" : "Show"} obtained ${category.label}`,
      );
    }
    if (label) {
      const complete = !category.unloaded && remaining === 0;
      label.classList.toggle("completion-row-complete", complete);
      label.classList.toggle("completion-row-incomplete", !complete);
    }
}

function updateCompletionCounts(categories) {
  let totalObtained = 0;
  let totalTotal = 0;

  for (const category of completionRowModels(categories)) {
    updateCompletionRow(category);
    if (category.contributesToTotal) {
      totalObtained += category.obtained ?? 0;
      totalTotal += category.total ?? (category.remaining ?? 0) + (category.obtained ?? 0);
    }
  }
  if (completionTotalSummary) {
    completionTotalSummary.textContent = categories.length ? `${totalObtained} / ${totalTotal}` : "-- / --";
    completionTotalSummary.setAttribute("title", "Obtained / total (all completion categories)");
  }
  updateCompletionEyesToggleUi();
}

function completionStatsById(stats) {
  return Object.fromEntries((stats || []).map((stat) => [stat.id, stat]));
}

function completionStatAriaText(stat, config) {
  if (!stat) {
    return config.emptyText;
  }
  const missing = sortStatMissingByLabel(stat.missing);
  if (!missing.length) {
    return config.completeText;
  }
  return `${config.missingPrefix}:\n${missing.map((item) => item.label || item.id).join("\n")}`;
}

function updateCompletionStatSummary(config) {
  if (!config.element) {
    return;
  }
  const stat = currentCompletionStats[config.id] || null;
  config.element.textContent = stat ? `${stat.obtained} / ${stat.total}` : "-- / --";
  config.element.removeAttribute("title");
  config.element.setAttribute("aria-label", completionStatAriaText(stat, config));
}

function updatePlayerStatSummary(config) {
  if (!config.element) {
    return;
  }
  const value = currentPlayerStats ? config.value(currentPlayerStats) : null;
  config.element.textContent = value == null ? "--" : `${value} / ${config.total}`;
}

function updateSaveSummary(payload) {
  const modified = new Date(payload.lastModified * 1000);
  saveStatus.textContent = modified.toLocaleTimeString();
  seedCount.textContent = `${payload.counts.totalSeeds} / ${payload.counts.availableSeeds}`;
  locationCount.textContent = `${payload.counts.totalLocations} / ${payload.counts.availableLocations}`;
  const recipes = payload.recipes || null;
  currentRecipes = recipes;
  if (recipesSummary) {
    if (!recipes) {
      recipesSummary.textContent = "--";
    } else {
      const extras = recipes.extras || [];
      const warningPrefix = extras.length ? "⚠️ " : "";
      recipesSummary.textContent = `${warningPrefix}${recipes.obtained} / ${recipes.total}`;
    }
  }
  const stats = payload.playerStats || null;
  currentPlayerStats = stats;
  playerStatSummaries.forEach(updatePlayerStatSummary);

  const obtained = payload.counts.totalLocations ?? 0;
  const total = payload.counts.availableLocations ?? 0;
  const remaining = Math.max(0, total - obtained);
  korokCountSummary = { obtained, total, remaining, text: `${remaining} (${obtained}/${total})` };

  const categories = payload.completion || [];
  const totalCategories = categories.length;
  const completedCategories = categories.filter((c) => (c.remaining ?? 0) === 0).length;
  completionistSummary.textContent =
    totalCategories > 0 ? `${completedCategories} / ${totalCategories}` : "-- / --";

  currentCompletionStats = completionStatsById(payload.completionStats);
  completionStatSummaries.forEach(updateCompletionStatSummary);
  updateLiveSaveRows();
}

function updatePlayerAutoPan(payload) {
  if (!overlayInputs.playerAutoPan.checked || !playerPosition) {
    return;
  }

  const key = `${payload.lastModified}|${Math.round(playerPosition.x)}|${Math.round(playerPosition.y)}|${Math.round(playerPosition.z)}`;
  if (key === lastPlayerPanKey) {
    return;
  }

  lastPlayerPanKey = key;
  panToPoint(playerPosition, Math.max(scale, 1.2));
}

function panToPlayerNow() {
  if (overlayInputs.playerAutoPan.checked && playerPosition) {
    lastPlayerPanKey = null;
    panToPoint(playerPosition, Math.max(scale, 1.2));
  }
}

function viewPlayerLocation() {
  if (playerPosition) {
    panToPoint(playerPosition);
  }
}

function applySavePayload(payload) {
  const isFirstSaveLoad = !hasLoadedAnySave;
  hasLoadedAnySave = true;
  document.body.classList.remove("awaiting-manual-save");
  document.body.classList.remove("no-save-loaded");
  if (isFirstSaveLoad && markersMenu) {
    markersMenu.open = true;
  }
  closeSidebarAfterSaveIfNeeded();
  playerPosition = payload.player || null;
  completionCategories = payload.completion || [];
  updatePlayerAutoPan(payload);
  updateSaveSummary(payload);
  updateCompletionCounts(completionCategories);
  renderGuide(payload.markers);
  renderMarkers(payload.markers, completionCategories);
  updateTargetControls();
  closeSidebarAfterSaveIfNeeded();
}

async function refreshKoroks() {
  try {
    const response = await fetch("/api/koroks", { cache: "no-store" });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || "Could not load save data");
    }

    applySavePayload(payload);
  } catch (error) {
    saveStatus.textContent = "Error";
    seedCount.textContent = "-- / --";
    locationCount.textContent = "-- / --";
    completionistSummary.textContent = "-- / --";
    currentCompletionStats = {};
    completionStatSummaries.forEach(updateCompletionStatSummary);
    updateLiveSaveRows();
    console.error(error);
  }
}

function hasFileDragTransfer(event) {
  return Boolean(event.dataTransfer?.types?.includes("Files"));
}

function hideManualSaveDropUi() {
  document.body.classList.remove("save-drop-active");
  if (saveDropLayer) {
    saveDropLayer.hidden = true;
    saveDropLayer.setAttribute("aria-hidden", "true");
  }
}

function setSaveLoading(loading, statusText) {
  document.body.classList.toggle("save-loading", loading);
  if (saveLoadingOverlay) {
    saveLoadingOverlay.hidden = !loading;
    saveLoadingOverlay.setAttribute("aria-hidden", loading ? "false" : "true");
  }
  if (manualSaveStatus) {
    if (loading) {
      // Keep a minimal inline status for screen readers; visual loading is centered overlay.
      manualSaveStatus.textContent = "Loading";
    } else if (typeof statusText === "string") {
      manualSaveStatus.textContent = statusText;
    }
  }
  if (manualSaveInput) {
    manualSaveInput.disabled = loading;
  }
  if (demoSaveButton) {
    demoSaveButton.disabled = loading;
  }
  if (viewport) {
    viewport.setAttribute("aria-busy", loading ? "true" : "false");
  }
}

function showManualSaveDropUi() {
  document.body.classList.add("save-drop-active");
  if (saveDropLayer) {
    saveDropLayer.hidden = false;
    saveDropLayer.setAttribute("aria-hidden", "false");
  }
}

async function uploadManualSave(file, options = {}) {
  hideManualSaveDropUi();
  if (!file) {
    return;
  }
  const loadedLabel = options.loadedLabel || file.name || "save file";
  const sourceLabel = options.sourceLabel || "Manual upload";
  setSaveLoading(true, "Loading");
  try {
    if (window.TOTK_USE_PYODIDE) {
      const payload = await uploadManualSaveViaPyodide(file);
      applySavePayload(payload);
      setSaveLoading(false, `Loaded ${loadedLabel}`);
      saveStatus.textContent = sourceLabel;
      return;
    }
    const response = await fetch("/api/upload_save", {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "X-Filename": file.name || "progress.sav",
      },
      body: await file.arrayBuffer(),
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Could not parse uploaded save");
    }
    applySavePayload(payload);
    setSaveLoading(false, `Loaded ${loadedLabel}`);
    saveStatus.textContent = sourceLabel;
  } catch (error) {
    // Helpful fallback for static hosting: if the backend is missing, try Pyodide once.
    if (!window.TOTK_USE_PYODIDE) {
      try {
        const payload = await uploadManualSaveViaPyodide(file);
        applySavePayload(payload);
        setSaveLoading(false, `Loaded ${loadedLabel}`);
        saveStatus.textContent = sourceLabel;
        return;
      } catch {
        // keep original error below
      }
    }
    setSaveLoading(false, "Load failed");
    saveStatus.textContent = "Error";
    console.error(error);
  } finally {
    manualSaveInput.value = "";
    setSaveLoading(false);
  }
}

let _pyodidePromise = null;
let _pyodideReady = false;

function pyodideAssetUrl(path) {
  // Keep relative to the current directory so this works under /repo/ and /docs/ equally.
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

async function ensurePyodide() {
  if (_pyodidePromise) {
    return _pyodidePromise;
  }
  _pyodidePromise = (async () => {
    await loadPyodideScript();
    const pyodide = await window.loadPyodide({ indexURL: "https://cdn.jsdelivr.net/pyodide/v0.26.2/full/" });

    // Stage required Python + data files into the in-browser FS.
    pyodide.FS.mkdirTree("/app");
    pyodide.FS.mkdirTree("/app/references");
    const [serverPy, korokJson, completionJson, hashesCsv, recipeRefIds] = await Promise.all([
      fetch(pyodideAssetUrl("server.py"), { cache: "no-store" }).then((r) => r.text()),
      fetch(pyodideAssetUrl("references/korok_data.json"), { cache: "no-store" }).then((r) => r.text()),
      fetch(pyodideAssetUrl("completion_data.json"), { cache: "no-store" }).then((r) => r.text()),
      fetch(pyodideAssetUrl("references/zelda-totk.hashes.csv"), { cache: "no-store" }).then((r) => r.text()),
      fetch(pyodideAssetUrl("references/recipe_ids_mine_228.txt"), { cache: "no-store" }).then((r) => r.text()),
    ]);
    pyodide.FS.writeFile("/app/server.py", serverPy, { encoding: "utf8" });
    pyodide.FS.writeFile("/app/references/korok_data.json", korokJson, { encoding: "utf8" });
    pyodide.FS.writeFile("/app/completion_data.json", completionJson, { encoding: "utf8" });
    pyodide.FS.writeFile("/app/references/zelda-totk.hashes.csv", hashesCsv, { encoding: "utf8" });
    pyodide.FS.writeFile("/app/references/recipe_ids_mine_228.txt", recipeRefIds, { encoding: "utf8" });

    // Define a small Python entrypoint that reuses the existing parsing logic from server.py,
    // but avoids filesystem scanning / HTTP server pieces.
    await pyodide.runPythonAsync(`
import sys, time
from pathlib import Path

sys.path.insert(0, "/app")
import server as _srv

_srv.initialize_data()

def parse_uploaded_save(path: str, filename: str = "progress.sav", mtime: float | None = None):
    data = Path(path).read_bytes()
    save_modified = int(mtime if mtime is not None else time.time())
    return _srv.build_save_payload(data, filename, save_modified, snapshot=[], update_latest_state=False)
`);
    _pyodideReady = true;
    return pyodide;
  })();
  return _pyodidePromise;
}

async function uploadManualSaveViaPyodide(file) {
  setSaveLoading(true, "Loading");
  const pyodide = await ensurePyodide();
  const bytes = new Uint8Array(await file.arrayBuffer());
  pyodide.FS.mkdirTree("/tmp");
  pyodide.FS.writeFile("/tmp/upload.sav", bytes);

  setSaveLoading(true, "Loading");
  const mtime = Math.floor((file.lastModified || Date.now()) / 1000);
  const pyResult = await pyodide.runPythonAsync(`parse_uploaded_save("/tmp/upload.sav", ${JSON.stringify(file.name || "progress.sav")}, ${mtime})`);
  const result = pyResult.toJs({ dict_converter: Object.fromEntries });
  pyResult.destroy?.();
  return result;
}

let lastHealthKey = null;

function isTabVisible() {
  return document.visibilityState === "visible";
}

async function refreshHealth() {
  if (!isTabVisible()) {
    return;
  }
  try {
    const response = await fetch("/api/health", { cache: "no-store" });
    if (!response.ok) {
      const msg = await response.text();
      throw new Error(msg || "Health check failed");
    }

    const key = (await response.text()).trim() || null;
    const changed = key && key !== lastHealthKey;
    lastHealthKey = key;

    if (changed) {
      await refreshKoroks();
    }
  } catch (error) {
    console.error(error);
  }
}

function renderLog(entries) {
  if (logPanel) {
    const hasEntries = Boolean(entries?.length);
    logPanel.hidden = !hasEntries;
    logPanel.setAttribute("aria-hidden", hasEntries ? "false" : "true");
  }
  const signature = entries.map((entry) => `${entry.time}|${entry.message}`).join("\n");
  if (signature === lastLogSignature) {
    return;
  }
  lastLogSignature = signature;

  const fragment = document.createDocumentFragment();
  for (const entry of entries.slice().reverse()) {
    const row = document.createElement("div");
    row.className = "log-entry";

    const time = document.createElement("span");
    time.className = "log-time";
    time.textContent = entry.time;

    const message = document.createElement("span");
    message.textContent = entry.message;

    row.append(time, message);
    fragment.appendChild(row);
  }
  logEntries.replaceChildren(fragment);
}

async function refreshLog() {
  if (!isTabVisible()) {
    return;
  }
  try {
    const response = await fetch(`/api/delta_log?last_id=${encodeURIComponent(lastLogId)}`, { cache: "no-store" });
    const payload = await response.json();
    if (response.ok) {
      const entries = payload.entries || [];
      if (entries.length) {
        // Merge deltas into the existing rendered log by re-rendering.
        // LOG_LIMIT is small, so this is cheap and avoids UI complexity.
        // Fetch full log only once (first run) or when we detect a gap.
        const maxId = Math.max(...entries.map((e) => e.id || 0));
        lastLogId = Math.max(lastLogId, maxId, payload.latestId || 0);
      } else if (payload.latestId) {
        lastLogId = Math.max(lastLogId, payload.latestId);
      }

      // If we haven't rendered anything yet, or we got new entries, refresh full list once.
      if (!lastLogSignature || entries.length) {
        const full = await fetch("/api/log", { cache: "no-store" });
        const fullPayload = await full.json();
        if (full.ok) {
          renderLog(fullPayload.entries || []);
        }
      }
    }
  } catch (error) {
    console.error(error);
  }
}

mapImage.addEventListener("load", () => {
  const nw = mapImage.naturalWidth;
  const nh = mapImage.naturalHeight;
  const sameDimensions =
    imageWidth > 0 && imageHeight > 0 && nw === imageWidth && nh === imageHeight;

  imageWidth = nw;
  imageHeight = nh;
  loadingState.classList.add("hidden");

  if (!hasLoadedAnyMapImage) {
    hasLoadedAnyMapImage = true;
    centerMap();
  } else if (!sameDimensions) {
    centerMap();
  } else {
    updateTransform();
  }

  if (pendingPanPoint && (!pendingPanPoint.point.layer || pendingPanPoint.point.layer === activeLayer)) {
    panToMapPoint(pendingPanPoint.point.mapX, pendingPanPoint.point.mapY, pendingPanPoint.nextScale);
    pendingPanPoint = null;
    return;
  }

  // If save data arrived before the image loaded, the guide arrow may have been skipped
  // (it requires imageWidth/imageHeight). Re-render now that the map is ready.
  renderGuide(korokMarkers);
  renderMarkers();
});

mapImage.addEventListener("error", () => {
  loadingState.textContent = "Map image failed to load. Check your network connection.";
});

// Prevent the browser's native image drag from ever activating during panning.
mapImage.addEventListener("dragstart", (event) => {
  event.preventDefault();
});
viewport.addEventListener("dragstart", (event) => {
  event.preventDefault();
});

viewport.addEventListener("wheel", (event) => {
  event.preventDefault();
  const nextScale = event.deltaY > 0 ? scale / wheelZoomFactor : scale * wheelZoomFactor;
  zoomAt(nextScale, event.clientX, event.clientY);
  // If the user zooms while dragging, keep dragStart in sync so the map doesn't jump
  // on the next pointermove (which uses dragStart.offsetX/Y as the baseline).
  if (activePointers.size === 1 && dragStart) {
    dragStart.x = event.clientX;
    dragStart.y = event.clientY;
    dragStart.offsetX = offsetX;
    dragStart.offsetY = offsetY;
  }
}, { passive: false });

viewport.addEventListener("pointerdown", (event) => {
  viewport.setPointerCapture(event.pointerId);
  activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  viewport.classList.add("dragging");
  didPanThisGesture = false;

  if (activePointers.size === 1) {
    dragStart = {
      x: event.clientX,
      y: event.clientY,
      offsetX,
      offsetY,
    };
  }

  if (activePointers.size === 2) {
    const points = Array.from(activePointers.values());
    const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
    pinchStart = {
      distance,
      scale,
      midpointX: (points[0].x + points[1].x) / 2,
      midpointY: (points[0].y + points[1].y) / 2,
    };
  }
});

viewport.addEventListener("pointermove", (event) => {
  const rect = viewport.getBoundingClientRect();
  const mapX = Math.round((event.clientX - rect.left - offsetX) / scale);
  const mapY = Math.round((event.clientY - rect.top - offsetY) / scale);
  if (!imageWidth) {
    cursorValue.textContent = "--, --";
  } else {
    const world = mapToWorld(mapX, mapY);
    cursorValue.textContent = `X ${Math.round(world.x)}, Z ${Math.round(world.z)}`;
  }

  // If a hover-tooltip is visible but we're not over a marker (and it's not pinned), dismiss it.
  // This catches cases where pointerleave didn't fire (e.g. DOM re-render while hovering).
  if (!isTooltipPinned && !mapTooltip.hidden && !viewport.classList.contains("dragging")) {
    const underPointer = document.elementFromPoint(event.clientX, event.clientY);
    const overTooltip = underPointer instanceof HTMLElement && underPointer.closest("#mapTooltip");
    const overMarker = underPointer instanceof HTMLElement
      && underPointer.closest(".korok-marker, .completion-marker, .link-marker");
    if (!overTooltip && !overMarker) {
      mapTooltip.hidden = true;
    }
  }

  if (!activePointers.has(event.pointerId)) {
    return;
  }

  activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

  if (activePointers.size === 1 && dragStart) {
    if (Math.hypot(event.clientX - dragStart.x, event.clientY - dragStart.y) > 3) {
      didPanThisGesture = true;
    }
    offsetX = dragStart.offsetX + event.clientX - dragStart.x;
    offsetY = dragStart.offsetY + event.clientY - dragStart.y;
    updateTransform();
  }

  if (activePointers.size === 2 && pinchStart) {
    const points = Array.from(activePointers.values());
    const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
    const midpointX = (points[0].x + points[1].x) / 2;
    const midpointY = (points[0].y + points[1].y) / 2;
    zoomAt(pinchStart.scale * (distance / pinchStart.distance), midpointX, midpointY);
  }
});

function endPointer(event) {
  activePointers.delete(event.pointerId);
  viewport.classList.toggle("dragging", activePointers.size > 0);
  if (!activePointers.size) {
    lastDragEndAtMs = performance.now();
    if (didPanThisGesture) {
      lastPanEndAtMs = lastDragEndAtMs;
    }
  }
  dragStart = null;
  pinchStart = null;

  if (!activePointers.size && didPanThisGesture && !isTooltipPinned && !mapTooltip.hidden) {
    const underPointer = document.elementFromPoint(event.clientX, event.clientY);
    const isMarker = underPointer instanceof HTMLElement
      && underPointer.closest(".korok-marker, .completion-marker, .link-marker");
    // If the drag ended away from a marker (or on the tooltip itself), dismiss hover tooltip.
    if (!isMarker) {
      mapTooltip.hidden = true;
    }
  }

  // If the gesture started on an icon and we did NOT pan, treat it as a click and pin the tooltip.
  if (
    tooltipPinCandidate
    && tooltipPinCandidate.pointerId === event.pointerId
    && !didPanThisGesture
    && tooltipPinCandidate.element instanceof HTMLElement
  ) {
    tooltipPinnedAtMs = performance.now();
    if (tooltipPinnedOwner instanceof HTMLElement) {
      tooltipPinnedOwner.classList.remove("tooltip-pinned-owner");
    }
    tooltipPinnedOwner = tooltipPinCandidate.element;
    tooltipPinnedOwner.classList.add("tooltip-pinned-owner");
    setTooltipContent(tooltipPinCandidate.html, { pinned: true });
    setTooltipPinned(true);
    requestAnimationFrame(() => {
      positionPinnedMapTooltip();
    });
  }
  if (tooltipPinCandidate && tooltipPinCandidate.pointerId === event.pointerId) {
    tooltipPinCandidate = null;
  }

  if (activePointers.size === 1) {
    const point = Array.from(activePointers.values())[0];
    dragStart = {
      x: point.x,
      y: point.y,
      offsetX,
      offsetY,
    };
  }
}

viewport.addEventListener("pointerup", endPointer);
viewport.addEventListener("pointercancel", endPointer);
viewport.addEventListener("pointerleave", () => {
  if (!activePointers.size) {
    cursorValue.textContent = "--, --";
  }
});

document.querySelector("#zoomIn").addEventListener("click", () => {
  const rect = viewport.getBoundingClientRect();
  zoomAt(scale * buttonZoomFactor, rect.left + rect.width / 2, rect.top + rect.height / 2);
});

document.querySelector("#zoomOut").addEventListener("click", () => {
  const rect = viewport.getBoundingClientRect();
  zoomAt(scale / buttonZoomFactor, rect.left + rect.width / 2, rect.top + rect.height / 2);
});

document.querySelector("#resetView").addEventListener("click", centerMap);

layerButtons.forEach((button) => {
  button.addEventListener("click", () => loadLayer(button.dataset.layer));
});

Object.values(overlayInputs).forEach((input) => {
  input.addEventListener("change", () => {
    if (input === overlayInputs.playerAutoPan) {
      panToPlayerNow();
    }
    rerenderOverlays();
  });
});

Object.values(completionInputs).forEach((input) => {
  input.addEventListener("change", rerenderOverlays);
});

Object.entries(completionObtainedToggles).forEach(([id, button]) => {
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    completionShowObtained[id] = !completionShowObtained[id];
    updateCompletionCounts(completionCategories);
    renderMarkers();
  });
});

if (completionEyesToggle) {
  completionEyesToggle.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const anyOpen = anyCompletionEyesOpen();
    setAllCompletionEyes(!anyOpen);
    updateCompletionCounts(completionCategories);
    renderMarkers();
  });
}

Object.entries(groupInputs).forEach(([groupName, input]) => {
  input.addEventListener("click", (event) => {
    event.stopPropagation();
  });
  input.addEventListener("change", () => {
    const items = enabledGroupItems(overlayGroups[groupName]);
    const checkedCount = items.filter((item) => item.checked).length;
    // Clicks on "−" often hit the label, not the input, so preventDefault on the input never runs.
    // Browser then does indeterminate → checked without updating children: header true, children still mixed.
    if (input.checked && checkedCount > 0 && checkedCount < items.length) {
      setGroupChecked(groupName, false);
      if (groupName === "player") {
        panToPlayerNow();
      }
      return;
    }
    setGroupChecked(groupName, input.checked);
    if (groupName === "player") {
      panToPlayerNow();
    }
  });
});

viewPlayer.addEventListener("click", viewPlayerLocation);
manualSaveInput.addEventListener("change", () => {
  uploadManualSave(manualSaveInput.files?.[0] || null);
});

if (demoSaveButton) {
  demoSaveButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    setDemoModalOpen(true);
  });
}

if (demoModalCancel) {
  demoModalCancel.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    setDemoModalOpen(false);
  });
}

if (demoModal) {
  demoModal.addEventListener("click", (event) => {
    if (event.target === demoModal) {
      setDemoModalOpen(false);
    }
  });
}

if (demoModalConfirm) {
  demoModalConfirm.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    setDemoModalOpen(false);
    try {
      setSaveLoading(true, "Loading");
      const demoSave = selectedDemoSave();
      const response = await fetch(demoSave.src, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Could not load demo file (HTTP ${response.status})`);
      }
      const bytes = await response.arrayBuffer();
      const demoFile = new File([bytes], demoSave.filename, { type: "application/octet-stream" });
      await uploadManualSave(demoFile, {
        loadedLabel: demoSave.label,
        sourceLabel: "Demo save",
      });
    } catch (error) {
      setSaveLoading(false, "Demo load failed");
      console.error(error);
    }
  });
}

if (saveDropLayer) {
  window.addEventListener("dragenter", (event) => {
    if (!hasFileDragTransfer(event)) {
      return;
    }
    event.preventDefault();
    if (!document.body.classList.contains("save-drop-active")) {
      showManualSaveDropUi();
    }
  });

  window.addEventListener("dragover", (event) => {
    if (!hasFileDragTransfer(event)) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  });

  // Note: "dragend" often won't fire on window when dragging files from the OS.
  // Keep it anyway, but also hide on other "abort" signals below.
  window.addEventListener("dragend", hideManualSaveDropUi);
  window.addEventListener("drop", hideManualSaveDropUi);
  window.addEventListener("blur", hideManualSaveDropUi);
  window.addEventListener("dragleave", (event) => {
    // When leaving the browser window entirely, relatedTarget is usually null.
    if (!document.body.classList.contains("save-drop-active")) {
      return;
    }
    if (!hasFileDragTransfer(event)) {
      return;
    }
    if (event.relatedTarget == null) {
      hideManualSaveDropUi();
    }
  });

  saveDropLayer.addEventListener("drop", (event) => {
    if (!document.body.classList.contains("save-drop-active")) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const file = event.dataTransfer.files?.[0] || null;
    hideManualSaveDropUi();
    if (file) {
      uploadManualSave(file);
    }
  });

  saveDropLayer.addEventListener("dragleave", (event) => {
    if (saveDropLayer.hidden) {
      return;
    }
    const rt = event.relatedTarget;
    if (rt instanceof Node && saveDropLayer.contains(rt)) {
      return;
    }
    hideManualSaveDropUi();
  });
}
completionStatSummaries.forEach((config) => {
  attachStatTooltip(config.element, () =>
    statListTooltip(currentCompletionStats[config.id], config.title, config.tooltipCompleteText),
  );
});
attachStatTooltip(completionistSummary, completionistTooltip, { onClick: pulseMarkersMenu });
if (recipesSummary) attachStatTooltip(recipesSummary, () => recipesTooltip(currentRecipes));
if (lifeSummary) attachStatTooltip(lifeSummary, () => playerLifeTooltip(currentPlayerStats));
if (staminaSummary) attachStatTooltip(staminaSummary, () => playerStaminaTooltip(currentPlayerStats));
if (batterySummary) attachStatTooltip(batterySummary, () => playerBatteryTooltip(currentPlayerStats));

if (liveSaveCompletedToggle) {
  liveSaveCompletedToggle.addEventListener("click", () => {
    liveSaveCompletedExpanded = !liveSaveCompletedExpanded;
    updateLiveSaveRows();
  });
}

window.addEventListener("resize", preserveMapCenterOnViewportResize);
window.addEventListener("resize", updateNarrowLayoutClass);

updateNarrowLayoutClass();
loadLayer(activeLayer);
syncAllGroupStates();
if (window.TOTK_USE_PYODIDE) {
  // Static/manual mode: no backend polling. Manual uploads are parsed in-browser.
  setSaveLoading(false, "Manual upload mode");
  saveStatus.textContent = "Manual upload";
  if (!hasLoadedAnySave) {
    document.body.classList.add("awaiting-manual-save");
  }
  if (logPanel) {
    logPanel.hidden = true;
    logPanel.setAttribute("aria-hidden", "true");
  }
} else {
  setSaveLoading(false, "Live tracking active");
  refreshHealth();
  refreshLog();
  setInterval(refreshHealth, 1000);
  setInterval(refreshLog, 2500);
}

document.addEventListener("visibilitychange", () => {
  if (window.TOTK_USE_PYODIDE) {
    return;
  }
  if (isTabVisible()) {
    refreshHealth();
    refreshLog();
  }
});
