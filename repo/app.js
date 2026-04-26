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
const loadingState = document.querySelector("#loadingState");
const zoomValue = document.querySelector("#zoomValue");
const cursorValue = document.querySelector("#cursorValue");
const saveStatus = document.querySelector("#saveStatus");
const seedCount = document.querySelector("#seedCount");
const locationCount = document.querySelector("#locationCount");
const logEntries = document.querySelector("#logEntries");
const viewLatest = document.querySelector("#viewLatest");
const viewPlayer = document.querySelector("#viewPlayer");
const layerButtons = document.querySelectorAll(".layer-button");
const overlayInputs = {
  obtainedSingle: document.querySelector("#showObtainedSingle"),
  obtainedPair: document.querySelector("#showObtainedPair"),
  unobtainedSingle: document.querySelector("#showUnobtainedSingle"),
  unobtainedPair: document.querySelector("#showUnobtainedPair"),
  guide: document.querySelector("#showGuide"),
  autoPan: document.querySelector("#autoPan"),
  playerLocation: document.querySelector("#showPlayerLocation"),
  playerGuide: document.querySelector("#showPlayerGuide"),
  playerAutoPan: document.querySelector("#playerAutoPan"),
};
const groupInputs = {
  obtained: document.querySelector("#groupObtained"),
  unobtained: document.querySelector("#groupUnobtained"),
  player: document.querySelector("#groupPlayer"),
  completion: document.querySelector("#groupCompletion"),
};
const completionInputs = {
  caves: document.querySelector("#completion-caves"),
  hudson_sign: document.querySelector("#completion-hudson_sign"),
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
  sage_will: document.querySelector("#completion-sage_will"),
};
const completionCounts = Object.fromEntries(
  Object.keys(completionInputs).map((id) => [id, document.querySelector(`#completionCount-${id}`)]),
);
const overlayGroups = {
  obtained: [overlayInputs.obtainedSingle, overlayInputs.obtainedPair],
  unobtained: [overlayInputs.unobtainedSingle, overlayInputs.unobtainedPair, overlayInputs.guide, overlayInputs.autoPan],
  player: [overlayInputs.playerLocation, overlayInputs.playerGuide, overlayInputs.playerAutoPan],
  completion: Object.values(completionInputs),
};

const minScale = 0.18;
const maxScale = 6;

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
let latestObtainedId = null;
let previousLatestObtainedId = null;
let nearestUnobtainedId = null;
let linkNearestUnobtainedId = null;
let didInitialLatestPan = false;
let lastLogSignature = "";
let lastLogId = 0;
let pendingPanPoint = null;
let lastPlayerPanKey = null;

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
}

function updateIconScale() {
  // The map is scaled via CSS transform; compensate marker size so icons stay readable.
  // ZeldaDungeon-style: markers remain closer to a consistent pixel size while zooming.
  // When zoomed OUT (small scale) we want icons to get larger for visibility.
  const normalized = Math.max(scale || 1, 0.12);
  const iconScale = clamp(1 / (normalized ** 1.1), 0.55, 4.0);
  markerLayer.style.setProperty("--iconScale", iconScale.toFixed(4));
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

    const isPair = marker.kind === "carry";

    if (marker.obtained && !isPair && !overlayInputs.obtainedSingle.checked) {
      return false;
    }
    if (marker.obtained && isPair && !overlayInputs.obtainedPair.checked) {
      return false;
    }
    if (!marker.obtained && !isPair && !overlayInputs.unobtainedSingle.checked) {
      return false;
    }
    if (!marker.obtained && isPair && !overlayInputs.unobtainedPair.checked) {
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

function syncAutoPanPair(changedInput) {
  if (changedInput === overlayInputs.autoPan && overlayInputs.autoPan.checked) {
    overlayInputs.playerAutoPan.checked = false;
  }
  if (changedInput === overlayInputs.playerAutoPan && overlayInputs.playerAutoPan.checked) {
    overlayInputs.autoPan.checked = false;
  }
}

function setGroupChecked(groupName, checked) {
  for (const item of enabledGroupItems(overlayGroups[groupName])) {
    item.checked = checked;
  }
  if (checked && groupName === "unobtained" && overlayInputs.autoPan.checked) {
    overlayInputs.playerAutoPan.checked = false;
  }
  if (checked && groupName === "player" && overlayInputs.playerAutoPan.checked) {
    overlayInputs.autoPan.checked = false;
  }
  rerenderOverlays();
}

function completionLabel(marker) {
  const note = marker.note ? ` - ${marker.note}` : "";
  return `Missing ${marker.categoryLabel}${note}`;
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

function tooltipRows(title, rows) {
  const rowHtml = rows
    .filter((row) => row.value !== undefined && row.value !== null && row.value !== "")
    .map((row) => `<div><dt>${escapeHtml(row.label)}</dt><dd>${escapeHtml(row.value)}</dd></div>`)
    .join("");
  return `<strong>${escapeHtml(title)}</strong><dl>${rowHtml}</dl>`;
}

function korokTooltip(marker) {
  return tooltipRows(markerLabel(marker), [
    { label: "Status", value: marker.obtained ? "Obtained" : "Unobtained" },
    { label: "Type", value: marker.kind === "carry" ? "Pair, 2 seeds" : "Single seed" },
    { label: "Layer", value: formatLayer(marker.layer) },
    { label: "World", value: `X ${formatNumber(marker.x)}, Y ${formatNumber(marker.y)}, Z ${formatNumber(marker.z)}` },
    { label: "Map", value: `${formatNumber(marker.mapX)}, ${formatNumber(marker.mapY)}` },
    { label: "Save value", value: marker.rawValue },
  ]);
}

function completionTooltip(marker) {
  return tooltipRows(completionLabel(marker), [
    { label: "Category", value: marker.categoryLabel },
    { label: "Status", value: "Unobtained" },
    { label: "Layer", value: formatLayer(marker.layer) },
    { label: "World", value: `X ${formatNumber(marker.x)}, Y ${formatNumber(marker.y)}, Z ${formatNumber(marker.z)}` },
    { label: "Map", value: `${formatNumber(marker.mapX)}, ${formatNumber(marker.mapY)}` },
    { label: "Source", value: marker.note },
  ]);
}

function playerTooltip(position) {
  return tooltipRows("Link's current location", [
    { label: "Layer", value: formatLayer(position.layer) },
    { label: "World", value: `X ${formatNumber(position.x)}, Y ${formatNumber(position.y)}, Z ${formatNumber(position.z)}` },
    { label: "Map", value: `${formatNumber(position.mapX)}, ${formatNumber(position.mapY)}` },
    position.raw ? { label: "Raw save", value: `X ${formatNumber(position.raw.x)}, Y ${formatNumber(position.raw.y)}, Z ${formatNumber(position.raw.z)}` } : {},
  ]);
}

function positionTooltip(event) {
  const rect = viewport.getBoundingClientRect();
  const gap = 14;
  mapTooltip.hidden = false;
  const tooltipRect = mapTooltip.getBoundingClientRect();
  let left = event.clientX - rect.left + gap;
  let top = event.clientY - rect.top + gap;

  if (left + tooltipRect.width > rect.width - 8) {
    left = event.clientX - rect.left - tooltipRect.width - gap;
  }
  if (top + tooltipRect.height > rect.height - 8) {
    top = event.clientY - rect.top - tooltipRect.height - gap;
  }

  mapTooltip.style.left = `${Math.max(8, left)}px`;
  mapTooltip.style.top = `${Math.max(8, top)}px`;
}

function attachTooltip(element, html) {
  element.addEventListener("pointerenter", (event) => {
    mapTooltip.innerHTML = html;
    positionTooltip(event);
  });
  element.addEventListener("pointermove", positionTooltip);
  element.addEventListener("pointerleave", () => {
    mapTooltip.hidden = true;
  });
}

function findNearestUnobtained(origin, markers) {
  let nearest = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const marker of markers) {
    if (marker.obtained) {
      continue;
    }

    const distance = Math.hypot(marker.x - origin.x, marker.z - origin.z);
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
  arrow.style.transform = `translate(-50%, -50%) rotate(${direction.angle}rad)`;
  return arrow;
}

function updateLatestObtained(markers, state) {
  latestObtainedId = state.latestObtainedId || null;
  if (!latestObtainedId) {
    previousLatestObtainedId = null;
    return;
  }

  const latest = markers.find((marker) => marker.id === latestObtainedId && marker.obtained);
  if (!latest) {
    return;
  }

  const changedLatest = previousLatestObtainedId !== latestObtainedId;
  if (overlayInputs.autoPan.checked && (changedLatest || !didInitialLatestPan)) {
    panToPoint(latest, Math.max(scale, 0.72));
    didInitialLatestPan = true;
  }
  previousLatestObtainedId = latestObtainedId;
}

function getLatestMarker() {
  if (!latestObtainedId) {
    return null;
  }
  return korokMarkers.find((marker) => marker.id === latestObtainedId && marker.obtained) || null;
}

function updateTargetControls() {
  const latest = getLatestMarker();
  viewLatest.disabled = !latest;
  viewPlayer.disabled = !playerPosition;
  overlayInputs.playerLocation.disabled = !playerPosition;
  overlayInputs.playerGuide.disabled = !playerPosition;
  overlayInputs.playerAutoPan.disabled = !playerPosition;
  syncAllGroupStates();
}

function renderGuide(markers) {
  guideLayer.replaceChildren();
  nearestUnobtainedId = null;
  linkNearestUnobtainedId = null;

  if (!overlayInputs.guide.checked && !overlayInputs.playerGuide.checked) {
    return;
  }

  const visibleUnobtained = markers.filter((marker) => {
    const isPair = marker.kind === "carry";
    return marker.layer === activeLayer
      && !marker.obtained
      && ((!isPair && overlayInputs.unobtainedSingle.checked) || (isPair && overlayInputs.unobtainedPair.checked));
  });

  if (!visibleUnobtained.length) {
    return;
  }

  const fragment = document.createDocumentFragment();

  const latest = markers.find((marker) => marker.id === latestObtainedId && marker.obtained && marker.layer === activeLayer);
  if (latest && overlayInputs.guide.checked) {
    const nearest = findNearestUnobtained(latest, visibleUnobtained);
    if (nearest) {
      nearestUnobtainedId = nearest.id;
      const arrow = appendCompassArrow(latest, nearest, "latest-arrow");
      if (arrow) {
        fragment.appendChild(arrow);
      }
    }
  }

  if (playerPosition && playerPosition.layer === activeLayer && overlayInputs.playerGuide.checked) {
    const nearestFromLink = findNearestUnobtained(playerPosition, visibleUnobtained);
    if (nearestFromLink) {
      linkNearestUnobtainedId = nearestFromLink.id;
      const arrow = appendCompassArrow(playerPosition, nearestFromLink, "link-arrow");
      if (arrow) {
        fragment.appendChild(arrow);
      }
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
    if (marker.id === latestObtainedId) {
      classes.push("latest");
    }
    if (marker.id === nearestUnobtainedId) {
      classes.push("nearest");
    }
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

    for (const marker of category.items) {
      if (marker.layer !== activeLayer) {
        continue;
      }

      const element = document.createElement("span");
      element.className = `completion-marker completion-${marker.categoryId}`;
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
  for (const category of categories) {
    const count = completionCounts[category.id];
    if (count) {
      const remaining = category.remaining ?? 0;
      const obtained = category.obtained ?? 0;
      const total = category.total ?? remaining + obtained;
      count.textContent = `${remaining} (${obtained}/${total})`;
    }
  }
}

function updateSaveSummary(payload) {
  const modified = new Date(payload.lastModified * 1000);
  saveStatus.textContent = modified.toLocaleTimeString();
  seedCount.textContent = `${payload.counts.totalSeeds} / ${payload.counts.availableSeeds}`;
  locationCount.textContent = `${payload.counts.totalLocations} / ${payload.counts.availableLocations}`;
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

function viewLatestMarker() {
  const latest = getLatestMarker();
  if (latest) {
    panToPoint(latest);
  }
}

function viewPlayerLocation() {
  if (playerPosition) {
    panToPoint(playerPosition);
  }
}

async function refreshKoroks() {
  try {
    const response = await fetch("/api/koroks", { cache: "no-store" });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || "Could not load save data");
    }

    playerPosition = payload.player || null;
    completionCategories = payload.completion || [];
    updateLatestObtained(payload.markers, payload.state);
    updatePlayerAutoPan(payload);
    updateCompletionCounts(completionCategories);
    renderGuide(payload.markers);
    renderMarkers(payload.markers, completionCategories);
    updateSaveSummary(payload);
    updateTargetControls();
  } catch (error) {
    saveStatus.textContent = "Error";
    seedCount.textContent = "-- / --";
    locationCount.textContent = "-- / --";
    console.error(error);
  }
}

let lastHealthKey = null;

async function refreshHealth() {
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
  imageWidth = mapImage.naturalWidth;
  imageHeight = mapImage.naturalHeight;
  loadingState.classList.add("hidden");
  centerMap();
  if (pendingPanPoint && (!pendingPanPoint.point.layer || pendingPanPoint.point.layer === activeLayer)) {
    panToMapPoint(pendingPanPoint.point.mapX, pendingPanPoint.point.mapY, pendingPanPoint.nextScale);
    pendingPanPoint = null;
    return;
  }
  const latest = korokMarkers.find((marker) => marker.id === latestObtainedId);
  if (latest && overlayInputs.autoPan.checked) {
    panToMapPoint(latest.mapX, latest.mapY);
  }
});

mapImage.addEventListener("error", () => {
  loadingState.textContent = "Map image failed to load. Check your network connection.";
});

viewport.addEventListener("wheel", (event) => {
  event.preventDefault();
  const direction = event.deltaY > 0 ? 0.9 : 1.1;
  zoomAt(scale * direction, event.clientX, event.clientY);
}, { passive: false });

viewport.addEventListener("pointerdown", (event) => {
  viewport.setPointerCapture(event.pointerId);
  activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  viewport.classList.add("dragging");

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

  if (!activePointers.has(event.pointerId)) {
    return;
  }

  activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

  if (activePointers.size === 1 && dragStart) {
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
  dragStart = null;
  pinchStart = null;

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
    syncAutoPanPair(input);
    if (input === overlayInputs.playerAutoPan) {
      panToPlayerNow();
    }
    rerenderOverlays();
  });
});

Object.values(completionInputs).forEach((input) => {
  input.addEventListener("change", rerenderOverlays);
});

Object.entries(groupInputs).forEach(([groupName, input]) => {
  input.addEventListener("click", (event) => {
    event.stopPropagation();
  });
  input.addEventListener("change", () => {
    setGroupChecked(groupName, input.checked);
    if (groupName === "player") {
      panToPlayerNow();
    }
  });
});

viewLatest.addEventListener("click", viewLatestMarker);
viewPlayer.addEventListener("click", viewPlayerLocation);

window.addEventListener("resize", preserveMapCenterOnViewportResize);

loadLayer(activeLayer);
syncAllGroupStates();
refreshHealth();
refreshLog();
setInterval(refreshHealth, 1000);
setInterval(refreshLog, 2500);
