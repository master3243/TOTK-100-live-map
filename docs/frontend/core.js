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
    src: selected?.dataset.src || "assets/mypause.sav",
    filename: selected?.dataset.filename || "mypause.sav",
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

  renderGuide();
  renderMarkers();
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
  renderGuide();
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
