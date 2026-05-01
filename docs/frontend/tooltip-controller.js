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

function pinMapTooltip(element, html) {
  tooltipPinnedAtMs = performance.now();
  if (tooltipPinnedOwner instanceof HTMLElement) {
    tooltipPinnedOwner.classList.remove("tooltip-pinned-owner");
  }
  tooltipPinnedOwner = element;
  tooltipPinnedOwner.classList.add("tooltip-pinned-owner");
  setTooltipContent(html, { pinned: true });
  setTooltipPinned(true);
  requestAnimationFrame(() => {
    positionPinnedMapTooltip();
  });
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
  element.addEventListener("pointerup", (event) => {
    if (viewport.contains(element) || !tooltipPinCandidate || tooltipPinCandidate.pointerId !== event.pointerId) {
      return;
    }
    pinMapTooltip(element, html);
    tooltipPinCandidate = null;
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
