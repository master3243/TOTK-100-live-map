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

const viewport = document.querySelector("#mapViewport");
const mapImage = document.querySelector("#mapImage");
const guideLayer = document.querySelector("#guideLayer");
const markerLayer = document.querySelector("#markerLayer");
const mapTooltip = document.querySelector("#mapTooltip");
const statTooltip = document.querySelector("#statTooltip");
const loadingState = document.querySelector("#loadingState");
const zoomValue = document.querySelector("#zoomValue");
const cursorValue = document.querySelector("#cursorValue");
const saveStatus = document.querySelector("#saveStatus");
const seedCount = document.querySelector("#seedCount");
const locationCount = document.querySelector("#locationCount");
const completionistSummary = document.querySelector("#completionistSummary");
const compendiumSummary = document.querySelector("#compendiumSummary");
const pristineWeaponsSummary = document.querySelector("#pristineWeaponsSummary");
const fabricsSummary = document.querySelector("#fabricsSummary");
const manualSaveInput = document.querySelector("#manualSaveInput");
const manualSaveStatus = document.querySelector("#manualSaveStatus");
const saveDropLayer = document.querySelector("#saveDropLayer");
const sidebarToggle = document.querySelector("#sidebarToggle");
const sidebarBackdrop = document.querySelector("#sidebarBackdrop");
const sidebarClose = document.querySelector("#sidebarClose");
const logEntries = document.querySelector("#logEntries");
const viewPlayer = document.querySelector("#viewPlayer");
const layerButtons = document.querySelectorAll(".layer-button");
let currentPristineWeaponsStat = null;
let currentFabricsStat = null;
const overlayInputs = {
  obtainedKoroks: document.querySelector("#showObtainedKoroks"),
  unobtainedKoroks: document.querySelector("#showUnobtainedKoroks"),
  playerLocation: document.querySelector("#showPlayerLocation"),
  playerGuide: document.querySelector("#showPlayerGuide"),
  playerAutoPan: document.querySelector("#playerAutoPan"),
};
const groupInputs = {
  korok: document.querySelector("#groupKorok"),
  player: document.querySelector("#groupPlayer"),
  completion: document.querySelector("#groupCompletion"),
};
const completionInputs = {
  towers: document.querySelector("#completion-towers"),
  shrines: document.querySelector("#completion-shrines"),
  lightroots: document.querySelector("#completion-lightroots"),
  caves: document.querySelector("#completion-caves"),
  bubbulfrogs: document.querySelector("#completion-bubbulfrogs"),
  hudson_sign: document.querySelector("#completion-hudson_sign"),
  dungeon_bosses: document.querySelector("#completion-dungeon_bosses"),
  flux_construct: document.querySelector("#completion-flux_construct"),
  hinox: document.querySelector("#completion-hinox"),
  stone_talus: document.querySelector("#completion-stone_talus"),
  molduga: document.querySelector("#completion-molduga"),
  frox: document.querySelector("#completion-frox"),
  gleeok: document.querySelector("#completion-gleeok"),
  wells: document.querySelector("#completion-wells"),
  chasms: document.querySelector("#completion-chasms"),
  yiga_schematic: document.querySelector("#completion-yiga_schematic"),
  old_map: document.querySelector("#completion-old_map"),
  armor: document.querySelector("#completion-armor"),
  sage_will: document.querySelector("#completion-sage_will"),
  schema_stone: document.querySelector("#completion-schema_stone"),
  general_locations: document.querySelector("#completion-general_locations"),
};
const completionCounts = Object.fromEntries(
  Object.keys(completionInputs).map((id) => [id, document.querySelector(`#completionCount-${id}`)]),
);
const completionShowObtained = Object.fromEntries(Object.keys(completionInputs).map((id) => [id, false]));
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
  korok: [
    overlayInputs.obtainedKoroks,
    overlayInputs.unobtainedKoroks,
  ],
  player: [overlayInputs.playerLocation, overlayInputs.playerGuide, overlayInputs.playerAutoPan],
  completion: Object.values(completionInputs),
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
/** Max zoom when auto-framing the player guide arrow (200%). */
const playerGuideMaxScale = 2;

let activeLayer = "surface";
let scale = 1;
let offsetX = 0;
let offsetY = 0;
let imageWidth = 0;
let imageHeight = 0;
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

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function updateTransform() {
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
  scale = clamp(fit * 0.96, minScale, maxScale);
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

  scale = clamp(nextScale, minScale, maxScale);
  offsetX = pointX - mapX * scale;
  offsetY = pointY - mapY * scale;
  updateTransform();
}

function panToMapPoint(mapX, mapY, nextScale = Math.max(scale, 0.72)) {
  const rect = viewport.getBoundingClientRect();
  scale = clamp(nextScale, minScale, maxScale);
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
    if (marker.obtained && !overlayInputs.obtainedKoroks.checked) {
      return false;
    }
    if (!marker.obtained && !overlayInputs.unobtainedKoroks.checked) {
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
  const note = marker.note ? ` - ${marker.note}` : "";
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
  const raw = (marker.hash || marker.value || "").trim();
  if (/^[0-9a-fA-F]{8}$/.test(raw)) {
    return `0x${raw}`;
  }
  return null;
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
  const base = tooltipRows(completionLabel(marker), [
    { label: "Category", value: marker.categoryLabel },
    { label: "Status", value: marker.obtained ? "Obtained" : "Unobtained" },
    { label: "Layer", value: formatLayer(marker.layer) },
    { label: "World", value: `X ${formatNumber(marker.x)}, Y ${formatNumber(marker.y)}, Z ${formatNumber(marker.z)}` },
    { label: "Map", value: `${formatNumber(marker.mapX)}, ${formatNumber(marker.mapY)}` },
    { label: "Source", value: marker.note },
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

function pristineWeaponsTooltip(stat) {
  return statListTooltip(stat, "Pristine Weapons", "All pristine weapons unlocked.");
}

function fabricsTooltip(stat) {
  return statListTooltip(stat, "Fabrics", "All fabrics collected.");
}

function sortStatMissingByLabel(items) {
  return [...(items || [])].sort((a, b) =>
    String(a.label || a.id || "").localeCompare(String(b.label || b.id || ""), undefined, { sensitivity: "base" }),
  );
}

function statListTooltip(stat, title, completeText) {
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
  if (!missing.length) {
    return `${rows}<p class="tooltip-note">${escapeHtml(completeText)}</p>`;
  }
  const items = missing.map((item) => `<li>${escapeHtml(item.label || item.id)}</li>`).join("");
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

function attachStatTooltip(element, getHtml) {
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

function findNearestUnobtained(origin, markers) {
  let nearest = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const marker of markers) {
    if (marker.obtained) {
      continue;
    }

    const distance = worldDistanceWorld3D(marker, origin);
    if (distance < nearestDistance) {
      nearest = marker;
      nearestDistance = distance;
    }
  }

  return nearest;
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

  scale = nextScale;
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
      && overlayInputs.unobtainedKoroks.checked;
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

  for (const marker of getVisibleMarkers(markers)) {
    const element = document.createElement("span");
    const classes = ["korok-marker", marker.kind, marker.obtained ? "obtained" : "unobtained"];
    if (marker.id === linkNearestUnobtainedId) {
      classes.push("link-nearest");
    }

    element.className = classes.join(" ");
    element.style.left = `${marker.mapX}px`;
    element.style.top = `${marker.mapY}px`;
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

function updateCompletionCounts(categories) {
  let totalObtained = 0;
  let totalTotal = 0;
  for (const category of categories) {
    const count = completionCounts[category.id];
    const input = completionInputs[category.id];
    const label = input?.closest("label");
    const remaining = category.remaining ?? 0;
    const obtained = category.obtained ?? 0;
    const total = category.total ?? remaining + obtained;
    totalObtained += obtained;
    totalTotal += total;
    if (count) {
      count.textContent = `${remaining} (${obtained}/${total})`;
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
      const complete = remaining === 0;
      label.classList.toggle("completion-row-complete", complete);
      label.classList.toggle("completion-row-incomplete", !complete);
    }
  }
  if (completionTotalSummary) {
    completionTotalSummary.textContent = categories.length ? `${totalObtained} / ${totalTotal}` : "-- / --";
    completionTotalSummary.setAttribute("title", "Obtained / total (all completion categories)");
  }
  updateCompletionEyesToggleUi();
}

function updateSaveSummary(payload) {
  const modified = new Date(payload.lastModified * 1000);
  saveStatus.textContent = modified.toLocaleTimeString();
  seedCount.textContent = `${payload.counts.totalSeeds} / ${payload.counts.availableSeeds}`;
  locationCount.textContent = `${payload.counts.totalLocations} / ${payload.counts.availableLocations}`;

  const categories = payload.completion || [];
  const totalCategories = categories.length;
  const completedCategories = categories.filter((c) => (c.remaining ?? 0) === 0).length;
  completionistSummary.textContent =
    totalCategories > 0 ? `${completedCategories} / ${totalCategories}` : "-- / --";

  const compendium = (payload.completionStats || []).find((stat) => stat.id === "compendium");
  compendiumSummary.textContent = compendium
    ? `${compendium.obtained} / ${compendium.total}`
    : "-- / --";

  const pristineWeapons = (payload.completionStats || []).find((stat) => stat.id === "pristine_weapons");
  currentPristineWeaponsStat = pristineWeapons || null;
  pristineWeaponsSummary.textContent = pristineWeapons
    ? `${pristineWeapons.obtained} / ${pristineWeapons.total}`
    : "-- / --";
  const missingWeapons = sortStatMissingByLabel(pristineWeapons?.missing);
  const hoverText = pristineWeapons
    ? missingWeapons.length
      ? `Still locked:\n${missingWeapons.map((item) => item.label || item.id).join("\n")}`
      : "All pristine weapons unlocked"
    : "No pristine weapon data loaded";
  pristineWeaponsSummary.removeAttribute("title");
  pristineWeaponsSummary.setAttribute("aria-label", hoverText);

  const fabrics = (payload.completionStats || []).find((stat) => stat.id === "fabrics");
  currentFabricsStat = fabrics || null;
  fabricsSummary.textContent = fabrics
    ? `${fabrics.obtained} / ${fabrics.total}`
    : "-- / --";
  const missingFabrics = sortStatMissingByLabel(fabrics?.missing);
  const fabricsHoverText = fabrics
    ? missingFabrics.length
      ? `Still left:\n${missingFabrics.map((item) => item.label || item.id).join("\n")}`
      : "All fabrics collected"
    : "No fabric data loaded";
  fabricsSummary.removeAttribute("title");
  fabricsSummary.setAttribute("aria-label", fabricsHoverText);
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
  playerPosition = payload.player || null;
  completionCategories = payload.completion || [];
  updatePlayerAutoPan(payload);
  updateCompletionCounts(completionCategories);
  renderGuide(payload.markers);
  renderMarkers(payload.markers, completionCategories);
  updateSaveSummary(payload);
  updateTargetControls();
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
    compendiumSummary.textContent = "-- / --";
    currentPristineWeaponsStat = null;
    currentFabricsStat = null;
    pristineWeaponsSummary.textContent = "-- / --";
    fabricsSummary.textContent = "-- / --";
    pristineWeaponsSummary.removeAttribute("title");
    fabricsSummary.removeAttribute("title");
    pristineWeaponsSummary.setAttribute("aria-label", "No pristine weapon data loaded");
    fabricsSummary.setAttribute("aria-label", "No fabric data loaded");
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

function showManualSaveDropUi() {
  document.body.classList.add("save-drop-active");
  if (saveDropLayer) {
    saveDropLayer.hidden = false;
    saveDropLayer.setAttribute("aria-hidden", "false");
  }
}

async function uploadManualSave(file) {
  hideManualSaveDropUi();
  if (!file) {
    return;
  }
  manualSaveStatus.textContent = "Uploading...";
  try {
    if (window.TOTK_USE_PYODIDE) {
      const payload = await uploadManualSaveViaPyodide(file);
      applySavePayload(payload);
      manualSaveStatus.textContent = `Loaded ${file.name || "save file"}`;
      saveStatus.textContent = "Manual upload";
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
    manualSaveStatus.textContent = `Loaded ${file.name || "save file"}`;
    saveStatus.textContent = "Manual upload";
  } catch (error) {
    // Helpful fallback for static hosting: if the backend is missing, try Pyodide once.
    if (!window.TOTK_USE_PYODIDE) {
      try {
        const payload = await uploadManualSaveViaPyodide(file);
        applySavePayload(payload);
        manualSaveStatus.textContent = `Loaded ${file.name || "save file"}`;
        saveStatus.textContent = "Manual upload";
        return;
      } catch {
        // keep original error below
      }
    }
    manualSaveStatus.textContent = "Upload failed";
    saveStatus.textContent = "Error";
    console.error(error);
  } finally {
    manualSaveInput.value = "";
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
    const [serverPy, korokJson, completionJson] = await Promise.all([
      fetch(pyodideAssetUrl("server.py"), { cache: "no-store" }).then((r) => r.text()),
      fetch(pyodideAssetUrl("korok_data.json"), { cache: "no-store" }).then((r) => r.text()),
      fetch(pyodideAssetUrl("completion_data.json"), { cache: "no-store" }).then((r) => r.text()),
    ]);
    pyodide.FS.writeFile("/app/server.py", serverPy, { encoding: "utf8" });
    pyodide.FS.writeFile("/app/korok_data.json", korokJson, { encoding: "utf8" });
    pyodide.FS.writeFile("/app/completion_data.json", completionJson, { encoding: "utf8" });

    // Define a small Python entrypoint that reuses the existing parsing logic from server.py,
    // but avoids filesystem scanning / HTTP server pieces.
    await pyodide.runPythonAsync(`
import sys, json, time
from pathlib import Path

sys.path.insert(0, "/app")
import server as _srv

_DATA_READY = False

def _ensure_data_ready():
    global _DATA_READY
    if _DATA_READY:
        return
    korok_data = _srv.load_korok_data()
    completion_data = _srv.load_completion_data()
    korok_hashes = {
        int(entry["hash"], 16)
        for group in ("hidden", "carry")
        for entry in korok_data[group]
    }
    completion_bool_hashes = {
        int(item["value"], 16)
        for category in completion_data["categories"]
        if category["kind"] == "bool"
        for item in category["items"]
    }
    completion_stat_hashes = {
        int(item["value"], 16)
        for stat in completion_data.get("stats", [])
        for item in stat["items"]
    }
    _srv._DATA["korok_data"] = korok_data
    _srv._DATA["completion_data"] = completion_data
    _srv._DATA["tracked_hashes"] = korok_hashes | completion_bool_hashes | completion_stat_hashes
    _DATA_READY = True

def parse_uploaded_save(path: str, filename: str = "progress.sav", mtime: float | None = None):
    _ensure_data_ready()
    data = Path(path).read_bytes()
    header = _srv.read_u32(data, 4)
    metadata_start = _srv.read_u32(data, 8)
    version_info = _srv.SAVE_VERSIONS.get(len(data))
    known_version = (
        version_info["version"]
        if version_info and version_info["header"] == header and version_info["metadata_start"] == metadata_start
        else "unknown/modded"
    )

    values = _srv.parse_save_values(data)
    guid_values = _srv.parse_guid_values(data)
    player_position = _srv.parse_player_position(data)
    markers = _srv.build_markers(values)
    completion = _srv.build_completion(values, guid_values)
    completion_stats = _srv.build_completion_stats(values)
    obtained_markers = [m for m in markers if m.get("obtained")]
    save_modified = int(mtime if mtime is not None else time.time())

    return {
        "savePath": filename,
        "trackedSaves": [],
        "lastModified": save_modified,
        "fileSize": len(data),
        "version": known_version,
        "player": player_position,
        "counts": {
            "hidden": sum(1 for m in obtained_markers if m.get("kind") == "hidden"),
            "carry": sum(1 for m in obtained_markers if m.get("kind") == "carry"),
            "totalLocations": len(obtained_markers),
            "totalSeeds": sum(m.get("seedValue", 1) for m in obtained_markers),
            "availableLocations": len(_srv._DATA["korok_data"]["hidden"]) + len(_srv._DATA["korok_data"]["carry"]),
            "availableSeeds": len(_srv._DATA["korok_data"]["hidden"]) + len(_srv._DATA["korok_data"]["carry"]) * 2,
        },
        "markers": markers,
        "completion": completion,
        "completionStats": completion_stats,
    }
`);
    _pyodideReady = true;
    return pyodide;
  })();
  return _pyodidePromise;
}

async function uploadManualSaveViaPyodide(file) {
  manualSaveStatus.textContent = "Loading Python parser…";
  const pyodide = await ensurePyodide();
  const bytes = new Uint8Array(await file.arrayBuffer());
  pyodide.FS.mkdirTree("/tmp");
  pyodide.FS.writeFile("/tmp/upload.sav", bytes);

  manualSaveStatus.textContent = "Parsing save…";
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

  if (!sameDimensions) {
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

viewport.addEventListener("wheel", (event) => {
  event.preventDefault();
  const direction = event.deltaY > 0 ? 0.9 : 1.1;
  zoomAt(scale * direction, event.clientX, event.clientY);
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
  cursorValue.textContent = imageWidth ? `${mapX}, ${mapY}` : "--, --";

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
  zoomAt(scale * 1.25, rect.left + rect.width / 2, rect.top + rect.height / 2);
});

document.querySelector("#zoomOut").addEventListener("click", () => {
  const rect = viewport.getBoundingClientRect();
  zoomAt(scale / 1.25, rect.left + rect.width / 2, rect.top + rect.height / 2);
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

  window.addEventListener("dragend", hideManualSaveDropUi);

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
attachStatTooltip(pristineWeaponsSummary, () => pristineWeaponsTooltip(currentPristineWeaponsStat));
attachStatTooltip(fabricsSummary, () => fabricsTooltip(currentFabricsStat));

window.addEventListener("resize", preserveMapCenterOnViewportResize);

loadLayer(activeLayer);
syncAllGroupStates();
if (window.TOTK_USE_PYODIDE) {
  // Static/manual mode: no backend polling. Manual uploads are parsed in-browser.
  manualSaveStatus.textContent = "Manual upload mode (Pyodide)";
  saveStatus.textContent = "Manual upload";
} else {
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
