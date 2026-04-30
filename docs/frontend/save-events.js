function bindSaveEvents({
  manualSaveInput,
  demoSaveButton,
  demoModal,
  demoModalCancel,
  demoModalConfirm,
  saveDropLayer,
  uploadManualSave,
  selectedDemoSave,
  setDemoModalOpen,
  setSaveLoading,
  hasFileDragTransfer,
  hideManualSaveDropUi,
  showManualSaveDropUi,
}) {
  manualSaveInput.addEventListener("change", () => {
    uploadManualSave(manualSaveInput.files?.[0] || null);
  });

  demoSaveButton?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    setDemoModalOpen(true);
  });

  demoModalCancel?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    setDemoModalOpen(false);
  });

  demoModal?.addEventListener("click", (event) => {
    if (event.target === demoModal) {
      setDemoModalOpen(false);
    }
  });

  demoModalConfirm?.addEventListener("click", async (event) => {
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

  if (!saveDropLayer) {
    return;
  }

  window.addEventListener("dragenter", (event) => {
    if (!hasFileDragTransfer(event)) return;
    event.preventDefault();
    if (!document.body.classList.contains("save-drop-active")) {
      showManualSaveDropUi();
    }
  });

  window.addEventListener("dragover", (event) => {
    if (!hasFileDragTransfer(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  });

  window.addEventListener("dragend", hideManualSaveDropUi);
  window.addEventListener("drop", hideManualSaveDropUi);
  window.addEventListener("blur", hideManualSaveDropUi);
  window.addEventListener("dragleave", (event) => {
    if (
      document.body.classList.contains("save-drop-active")
      && hasFileDragTransfer(event)
      && event.relatedTarget == null
    ) {
      hideManualSaveDropUi();
    }
  });

  saveDropLayer.addEventListener("drop", (event) => {
    if (!document.body.classList.contains("save-drop-active")) return;
    event.preventDefault();
    event.stopPropagation();
    const file = event.dataTransfer.files?.[0] || null;
    hideManualSaveDropUi();
    if (file) {
      uploadManualSave(file);
    }
  });

  saveDropLayer.addEventListener("dragleave", (event) => {
    if (saveDropLayer.hidden) return;
    const rt = event.relatedTarget;
    if (!(rt instanceof Node && saveDropLayer.contains(rt))) {
      hideManualSaveDropUi();
    }
  });
}
