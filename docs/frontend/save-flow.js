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
  renderGuide();
  renderMarkers(completionCategories);
  updateTargetControls();
  closeSidebarAfterSaveIfNeeded();
}

async function refreshProgress() {
  try {
    const response = await fetch("/api/progress", { cache: "no-store" });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || "Could not load save data");
    }

    applySavePayload(payload);
  } catch (error) {
    resetSaveSummary("Error");
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
    const saveBuffer = await file.arrayBuffer();
    await rememberUploadedSave(file, saveBuffer);
    if (window.TOTK_USE_PYODIDE) {
      const payload = await uploadManualSaveViaPyodide(file, saveBuffer);
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
      body: saveBuffer,
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
        const payload = await uploadManualSaveViaPyodide(file, saveBuffer);
        applySavePayload(payload);
        setSaveLoading(false, `Loaded ${loadedLabel}`);
        saveStatus.textContent = sourceLabel;
        return;
      } catch {
        // keep original error below
      }
    }
    setSaveLoading(false, "Load failed");
    resetSaveSummary("Error");
    console.error(error);
  } finally {
    manualSaveInput.value = "";
    setSaveLoading(false);
  }
}

let lastHealthKey = null;

function isTabVisible() {
  return document.visibilityState === "visible";
}

const { refreshLog } = createLogClient({ logEntries, logPanel, isTabVisible });

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
      await refreshProgress();
    }
  } catch (error) {
    console.error(error);
  }
}
