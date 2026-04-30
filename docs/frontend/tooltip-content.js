
function formatWorldCoordsXZy(position) {
  return `X ${formatNumber(position.x)}   Z ${formatNumber(position.z)}   (Y ${formatNumber(position.y)})`;
}

function completionTooltip(marker) {
  const displayNote = displayMarkerNote(marker);
  const extraRows = marker.seedValue
    ? [
        { label: "Type", value: marker.seedValue === 2 ? "Pair, 2 seeds" : "Single seed" },
        { label: "Save value", value: marker.rawValue },
      ]
    : [];
  const base = tooltipRows(completionLabel(marker), [
    { label: "Category", value: marker.categoryLabel },
    { label: "Status", value: marker.obtained ? "Obtained" : "Unobtained" },
    ...extraRows,
    { label: "Layer", value: formatLayer(marker.layer) },
    { label: "Map", value: `${formatNumber(marker.mapX)}, ${formatNumber(marker.mapY)}` },
    { label: "Hex", value: markerHexId(marker) },
    { label: "Source", value: displayNote },
    { label: "World", value: formatWorldCoordsXZy(marker) },
  ]);
  const links = [];
  const zdUrl = marker.seedValue ? zeldaDungeonSeedUrl(marker) : null;
  const objmapUrl = buildObjmapTotkUrl(marker);
  if (zdUrl) {
    links.push({ href: zdUrl, label: "Zelda Dungeon" });
  }
  if (objmapUrl) {
    links.push({ href: objmapUrl, label: "Zelda DB" });
  }
  if (!links.length) {
    return base;
  }
  return `${base}${tooltipExternalLinks(links)}`;
}

function playerTooltip(position) {
  return tooltipRows("Link's current location", [
    { label: "Layer", value: formatLayer(position.layer) },
    { label: "Map", value: `${formatNumber(position.mapX)}, ${formatNumber(position.mapY)}` },
    position.raw ? { label: "Raw save", value: formatWorldCoordsXZy(position.raw) } : {},
    { label: "World", value: formatWorldCoordsXZy(position) },
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
