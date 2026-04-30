function formatNumber(value) {
  return Number.isFinite(value) ? Math.round(value).toLocaleString() : "--";
}

function formatLayer(layer) {
  return ({ surface: "surface", sky: "sky", depths: "depths" })[layer] || layer || "unknown";
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

function parseLeadingUInt64FromNote(note) {
  const match = typeof note === "string" ? /^(\d{12,})/.exec(note.trim()) : null;
  if (!match) return null;
  try { return BigInt(match[1]); } catch { return null; }
}

function parseAnyUInt64FromNote(note) {
  const match = typeof note === "string" ? /\b(\d{12,})\b/.exec(note) : null;
  if (!match) return null;
  try { return BigInt(match[1]); } catch { return null; }
}

function parseLeadingHex64FromNote(note) {
  const match = typeof note === "string" ? /^(0x[0-9a-fA-F]{16})\b/.exec(note.trim()) : null;
  return match ? match[1] : null;
}

function parseLocationFlagFromNote(note) {
  const match = typeof note === "string" ? /\b(IsVisitLocation\.[\w_]+)\b/.exec(note) : null;
  return match ? match[1] : null;
}

function parseLeadingFlagFromNote(note) {
  const match = typeof note === "string" ? /^([A-Za-z_][\w_]*(?:\.[\w_]+)*)\b/.exec(note.trim()) : null;
  return match ? match[1] : null;
}

function formatHexId(value, { pad64 = false } = {}) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const hexMatch = /^0x([0-9a-fA-F]+)$/.exec(raw);
  if (hexMatch) {
    const hex = hexMatch[1].toLowerCase();
    return `0x${pad64 ? hex.padStart(16, "0") : hex}`;
  }
  if (/^[0-9a-fA-F]{8}$/.test(raw)) return `0x${raw.toLowerCase()}`;
  if (!/^\d{12,}$/.test(raw)) return null;
  try { return `0x${BigInt(raw).toString(16).padStart(16, "0")}`; } catch { return null; }
}

function markerHexId(marker) {
  const objmapId = formatHexId(marker.objmapId, { pad64: true });
  if (objmapId && /^0x[0-9a-f]{16}$/.test(objmapId)) return objmapId;
  const noteHex = parseLeadingHex64FromNote(marker.note);
  if (noteHex) return noteHex.toLowerCase();
  const noteUInt64 = parseLeadingUInt64FromNote(marker.note);
  return noteUInt64 == null
    ? formatHexId(marker.hash, { pad64: true }) || formatHexId(marker.value, { pad64: true })
    : `0x${noteUInt64.toString(16).padStart(16, "0")}`;
}

function markerObjmapQuery(marker) {
  const objmapQuery = (marker.objmapQuery || "").trim();
  const objmapId = (marker.objmapId || "").trim();
  if (objmapQuery) return objmapQuery;
  if (/^0x[0-9a-fA-F]{16}$/.test(objmapId)) return objmapId;
  if (marker.categoryId === "yiga_schematic") return "yiga";
  if (marker.categoryId === "schema_stone") return "Abandoned Mine";
  if (marker.categoryId === "old_map") return parseAnyUInt64FromNote(marker.note)?.toString(10) || null;
  if (marker.categoryId === "general_locations") return parseLeadingFlagFromNote(marker.note)?.replaceAll(".", " ") || null;
  const locationFlag = parseLocationFlagFromNote(marker.note);
  if (locationFlag) return locationFlag.replaceAll(".", " ");
  const noteId = parseLeadingHex64FromNote(marker.note) || parseLeadingUInt64FromNote(marker.note);
  if (noteId != null) return typeof noteId === "bigint" ? `0x${noteId.toString(16).padStart(16, "0")}` : noteId;
  if (marker.categoryId === "bubbulfrogs" && /^\d+$/.test(String(marker.value || ""))) {
    return `0x${BigInt(marker.value).toString(16).padStart(16, "0")}`;
  }
  const raw = (marker.hash || marker.value || "").trim();
  return /^[0-9a-fA-F]{8}$/.test(raw) ? `0x${raw}` : null;
}

function displayMarkerNote(marker) {
  const note = marker.note || "";
  return marker.categoryId === "bubbulfrogs" && note.startsWith("xxxxxxxxxxxxxxx")
    ? `${marker.value}${note.slice("xxxxxxxxxxxxxxx".length)}`
    : note;
}

function formatLayerForObjmap(layer) {
  const map = { surface: "Surface", sky: "Sky", depths: "Depths" };
  return layer && map[layer] ? map[layer] : (layer ? layer.charAt(0).toUpperCase() + layer.slice(1).toLowerCase() : "Surface");
}

function buildObjmapTotkUrl(marker) {
  const q = markerObjmapQuery(marker);
  if (q == null || !Number.isFinite(marker.x) || !Number.isFinite(marker.z)) return null;
  return `https://objmap-totk.zeldamods.org/#/map/z${OBJMAP_TOTK_ZOOM},${Math.round(marker.x)},${Math.round(marker.z)},${formatLayerForObjmap(marker.layer)}?q=${encodeURIComponent(q)}`;
}

function tooltipExternalLinks(links) {
  if (!links.length) return "";
  const anchors = links
    .map((link) => `<a class="tooltip-link" href="${escapeHtml(link.href)}" target="_blank" rel="noopener noreferrer">${EXTERNAL_LINK_ICON}<span>${escapeHtml(link.label)}</span></a>`)
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

function zeldaDungeonSeedUrl(marker) {
  const match = /^(hidden|carry)-(\d+)$/.exec(marker.id || "");
  const kind = match?.[1] || null;
  const index = match ? Number.parseInt(match[2], 10) : null;
  const zdNumber = kind === "hidden" && Number.isFinite(index)
    ? index + 99
    : (kind === "carry" && Number.isFinite(index) ? index - 1 : null);
  return zdNumber == null
    ? null
    : `https://www.zeldadungeon.net/tears-of-the-kingdom-interactive-map/?m=${encodeURIComponent(`Korok${String(zdNumber).padStart(4, "0")}`)}`;
}
