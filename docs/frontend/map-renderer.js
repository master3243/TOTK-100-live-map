const WORLD_DISTANCE_Y_WEIGHT = Math.sqrt(2);

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

function markerHudWorld(marker) {
  return parseTargetWorldFromNote(marker.note) || marker;
}

function appendDeltaHud(targetWorld) {
  if (!playerPosition) {
    return;
  }
  const dx = targetWorld.x - playerPosition.x;
  const dz = targetWorld.z - playerPosition.z;
  const dy = targetWorld.y - playerPosition.y;
  const targetMap = worldToMap(targetWorld.x, targetWorld.z);
  const direction = arrowDirection(playerPosition, targetMap);
  const delta = document.createElement("span");
  delta.className = "nearest-delta";

  const separator = document.createElement("span");
  separator.className = "nearest-delta-separator";
  separator.textContent = "|";

  const horizontal = document.createElement("span");
  horizontal.className = "nearest-delta-group";
  horizontal.append(document.createTextNode(formatNumber(Math.hypot(dx, dz))));
  const horizontalArrow = document.createElement("span");
  horizontalArrow.className = "nearest-delta-arrow horizontal";
  horizontalArrow.style.setProperty("--delta-rotate", `${direction?.angle || 0}rad`);
  horizontalArrow.setAttribute("aria-hidden", "true");
  horizontal.append(horizontalArrow);

  const vertical = document.createElement("span");
  vertical.className = "nearest-delta-group vertical";
  vertical.append(document.createTextNode(`(${formatNumber(Math.abs(dy))}`));
  const verticalArrow = document.createElement("span");
  verticalArrow.className = `nearest-delta-arrow ${dy < 0 ? "down" : "up"}`;
  verticalArrow.setAttribute("aria-hidden", "true");
  vertical.append(verticalArrow, document.createTextNode(")"));

  delta.append(separator, horizontal, vertical);
  nearestCoords.append(delta);
}

function setNearestCoords(marker) {
  if (!nearestCoords) {
    return;
  }
  if (!marker) {
    nearestCoords.hidden = true;
    nearestCoords.setAttribute("aria-hidden", "true");
    nearestCoords.textContent = "";
    return;
  }
  const world = markerHudWorld(marker);
  nearestCoords.hidden = false;
  nearestCoords.setAttribute("aria-hidden", "false");
  nearestCoords.replaceChildren();
  const icon = document.createElement("span");
  icon.className = `nearest-coords-icon completion-${marker.categoryId}`;
  if (marker.kind) {
    icon.classList.add(marker.kind);
  }
  icon.setAttribute("aria-hidden", "true");
  nearestCoords.append(icon, document.createTextNode(`X ${formatNumber(world.x)}  Z ${formatNumber(world.z)}  (Y ${formatNumber(world.y)})`));
  appendDeltaHud(world);
}

function appendTargetLines(markers) {
  if (!imageWidth || !imageHeight) {
    return null;
  }
  const candidates = (markers || []).filter((marker) => marker && parseTargetWorldFromNote(marker.note));

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "target-lines");
  svg.setAttribute("width", String(imageWidth));
  svg.setAttribute("height", String(imageHeight));
  svg.style.position = "absolute";
  svg.style.left = "0";
  svg.style.top = "0";
  svg.style.pointerEvents = "none";

  let appended = 0;
  for (const marker of candidates) {
    const targetWorld = parseTargetWorldFromNote(marker.note);
    const targetMap = worldToMap(targetWorld.x, targetWorld.z);
    if (!Number.isFinite(marker.mapX) || !Number.isFinite(marker.mapY)) {
      continue;
    }
    if (!Number.isFinite(targetMap.mapX) || !Number.isFinite(targetMap.mapY)) {
      continue;
    }

    if (marker.seedValue) {
      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("cx", String(marker.mapX));
      circle.setAttribute("cy", String(marker.mapY));
      circle.setAttribute("r", marker.seedValue === 2 ? "3.3" : "3.0");
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

/** Closest target for the player guide: visible missing completion pins (world XYZ). */
function findNearestPlayerGuideTarget(origin, candidates) {
  let nearest = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const marker of candidates) {
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

function visibleCompletionMarkers() {
  const markers = [];
  for (const category of completionCategories) {
    const input = completionInputs[category.id];
    if (!input || !input.checked) {
      continue;
    }
    const categoryMarkers = completionShowObtained[category.id]
      ? [...category.items, ...(category.obtainedItems || [])]
      : category.items;
    for (const marker of categoryMarkers) {
      if (marker.layer === activeLayer) {
        markers.push(marker);
      }
    }
  }
  return markers;
}

function renderGuide() {
  guideLayer.replaceChildren();
  linkNearestCompletionId = null;
  setNearestCoords(null);

  if (!overlayInputs.playerGuide.checked) {
    lastPlayerGuideFrameKey = "";
  }

  if (!overlayInputs.playerGuide.checked) {
    return;
  }

  const visibleMissing = visibleCompletionMarkers();

  const fragment = document.createDocumentFragment();

  if (
    imageWidth
    && imageHeight
    && playerPosition
    && playerPosition.layer === activeLayer
    && overlayInputs.playerGuide.checked
  ) {
    const nearestFromLink = findNearestPlayerGuideTarget(playerPosition, visibleMissing);
    if (nearestFromLink) {
      linkNearestCompletionId = nearestFromLink.id;
      setNearestCoords(nearestFromLink);
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

function renderMarkers(categories = completionCategories) {
  completionCategories = categories;
  const fragment = document.createDocumentFragment();

  const visibleMarkers = visibleCompletionMarkers();
  const targetLines = appendTargetLines(visibleMarkers);
  if (targetLines) {
    fragment.appendChild(targetLines);
  }

  for (const marker of visibleMarkers) {
    const element = document.createElement("span");
    const classes = ["completion-marker", `completion-${marker.categoryId}`];
    if (marker.kind) {
      classes.push(marker.kind);
    }
    if (marker.obtained) {
      classes.push("obtained");
    }
    if (marker.id === linkNearestCompletionId) {
      classes.push("link-nearest");
    }
    const point = markerDisplayPoint(marker);
    element.className = classes.join(" ");
    element.style.left = `${point.mapX}px`;
    element.style.top = `${point.mapY}px`;
    element.removeAttribute("title");
    attachTooltip(element, completionTooltip(marker));
    fragment.appendChild(element);
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
