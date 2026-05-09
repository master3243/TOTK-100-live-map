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
  renderGuide();
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

function isMapTooltipOwnerElement(target) {
  return target instanceof HTMLElement
    && target.closest(".completion-marker, .link-marker, .nearest-coords-icon");
}

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
    cursorValue.textContent = `X ${Math.round(world.x)}, Z ${Math.round(-world.z)}`;
  }

  // If a hover-tooltip is visible but we're not over a marker (and it's not pinned), dismiss it.
  // This catches cases where pointerleave didn't fire (e.g. DOM re-render while hovering).
  if (!isTooltipPinned && !mapTooltip.hidden && !viewport.classList.contains("dragging")) {
    const underPointer = document.elementFromPoint(event.clientX, event.clientY);
    const overTooltip = underPointer instanceof HTMLElement && underPointer.closest("#mapTooltip");
    const overMarker = isMapTooltipOwnerElement(underPointer);
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
    const isMarker = isMapTooltipOwnerElement(underPointer);
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
    pinMapTooltip(tooltipPinCandidate.element, tooltipPinCandidate.html);
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

if (armorUpgradedSummary) {
  armorUpgradedSummary.closest("[data-live-row]")?.addEventListener("click", (event) => {
    event.preventDefault();
    window.location.href = "armor-upgrade-materials.html";
  });
}

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
bindSaveEvents({
  manualSaveInput, demoSaveButton, demoModal, demoModalCancel, demoModalConfirm, saveDropLayer,
  uploadManualSave, selectedDemoSave, setDemoModalOpen, setSaveLoading, hasFileDragTransfer,
  hideManualSaveDropUi, showManualSaveDropUi,
});

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
