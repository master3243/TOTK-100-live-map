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

const {
  mapViewport: viewport, mapImage, guideLayer, markerLayer, mapTooltip, statTooltip, loadingState,
  nearestCoords,
  zoomValue, cursorValue, liveSaveList, liveSaveCompletedToggleRow, liveSaveCompletedToggle,
  saveStatus, saveVersion, seedCount, locationCount, recipesSummary, lifeSummary, staminaSummary, batterySummary,
  completionistSummary, armorInventorySummary, armorUpgradedSummary, compendiumSummary,
  pristineWeaponsSummary, fabricsSummary, materialsSummary, keyItemsSummary,
  questsMainSummary, questsAdventureSummary, questsSideSummary, questsShrineSummary,
  manualSaveInput, manualSaveStatus, demoSaveButton,
  demoModal, demoModalCancel, demoModalConfirm, markersMenu, saveLoadingOverlay, saveDropLayer,
  sidebarToggle, sidebarBackdrop, sidebarClose, logEntries, viewPlayer,
} = byId(
  "mapViewport", "mapImage", "guideLayer", "markerLayer", "mapTooltip", "statTooltip", "loadingState",
  "nearestCoords",
  "zoomValue", "cursorValue", "liveSaveList", "liveSaveCompletedToggleRow", "liveSaveCompletedToggle",
  "saveStatus", "saveVersion", "seedCount", "locationCount", "recipesSummary", "lifeSummary", "staminaSummary",
  "batterySummary", "completionistSummary", "armorInventorySummary", "armorUpgradedSummary",
  "compendiumSummary", "pristineWeaponsSummary", "fabricsSummary", "materialsSummary",
  "keyItemsSummary", "questsMainSummary", "questsAdventureSummary", "questsSideSummary",
  "questsShrineSummary", "manualSaveInput", "manualSaveStatus",
  "demoSaveButton", "demoModal", "demoModalCancel", "demoModalConfirm", "markersMenu", "saveLoadingOverlay",
  "saveDropLayer", "sidebarToggle", "sidebarBackdrop", "sidebarClose", "logEntries", "viewPlayer",
);
const demoSaveInputs = document.querySelectorAll('input[name="demoSave"]');
const logPanel = logEntries?.closest(".log-panel") || null;
const layerButtons = document.querySelectorAll(".layer-button");
let currentCompletionStats = {};
let currentPlayerStats = null;
let currentRecipes = null;
const completionStatSummaries = [
  {
    id: "armor_inventory",
    title: "Armor",
    element: armorInventorySummary,
    missingPrefix: "Still missing",
    completeText: "All armor collected",
    tooltipCompleteText: "All armor collected.",
    emptyText: "No armor data loaded",
  },
  {
    id: "armor_upgraded",
    title: "Armor (4-star upgraded)",
    element: armorUpgradedSummary,
    missingPrefix: "Still left",
    completeText: "All upgradeable armor is at 4 stars",
    tooltipCompleteText: "All upgradeable armor is at 4 stars.",
    emptyText: "No armor upgrade data loaded",
  },
  {
    id: "compendium",
    title: "Compendium",
    element: compendiumSummary,
    missingPrefix: "Still missing",
    completeText: "All compendium pictures registered",
    tooltipCompleteText: "All compendium pictures registered.",
    emptyText: "No compendium data loaded",
  },
  {
    id: "pristine_weapons",
    title: "Pristine Weapons",
    element: pristineWeaponsSummary,
    missingPrefix: "Still locked",
    completeText: "All pristine weapons unlocked",
    tooltipCompleteText: "All pristine weapons unlocked.",
    emptyText: "No pristine weapon data loaded",
  },
  {
    id: "fabrics",
    title: "Fabrics",
    element: fabricsSummary,
    missingPrefix: "Still left",
    completeText: "All fabrics collected",
    tooltipCompleteText: "All fabrics collected.",
    emptyText: "No fabric data loaded",
  },
  {
    id: "materials",
    title: "Materials",
    element: materialsSummary,
    missingPrefix: "Still missing",
    completeText: "All materials collected",
    tooltipCompleteText: "All materials collected.",
    emptyText: "No material data loaded",
  },
  {
    id: "key_items",
    title: "Key Items",
    element: keyItemsSummary,
    missingPrefix: "Still missing",
    completeText: "All key items collected",
    tooltipCompleteText: "All key items collected.",
    emptyText: "No key item data loaded",
  },
  {
    id: "quests_main",
    title: "Main Quests",
    element: questsMainSummary,
    missingPrefix: "Still left",
    completeText: "All main quests completed",
    tooltipCompleteText: "All main quests completed.",
    emptyText: "No quest data loaded",
  },
  {
    id: "quests_adventure",
    title: "Side Adventures",
    element: questsAdventureSummary,
    missingPrefix: "Still left",
    completeText: "All side adventures completed",
    tooltipCompleteText: "All side adventures completed.",
    emptyText: "No quest data loaded",
  },
  {
    id: "quests_side",
    title: "Side Quests",
    element: questsSideSummary,
    missingPrefix: "Still left",
    completeText: "All side quests completed",
    tooltipCompleteText: "All side quests completed.",
    emptyText: "No quest data loaded",
  },
  {
    id: "quests_shrine",
    title: "Shrine Quests",
    element: questsShrineSummary,
    missingPrefix: "Still left",
    completeText: "All shrine quests completed",
    tooltipCompleteText: "All shrine quests completed.",
    emptyText: "No quest data loaded",
  },
];
const overlayInputs = {
  playerLocation: document.querySelector("#showPlayerLocation"),
  playerGuide: document.querySelector("#showPlayerGuide"),
  playerAutoPan: document.querySelector("#playerAutoPan"),
};

// Until we successfully parse at least one save payload, hide panels that depend on save data.
document.body.classList.add("no-save-loaded");
const groupInputs = {
  player: document.querySelector("#groupPlayer"),
  completion: document.querySelector("#groupCompletion"),
};
const completionIds = [
  "koroks", "towers", "shrines", "lightroots", "caves", "bubbulfrogs", "hudson_sign",
  "dungeon_bosses", "flux_construct", "hinox", "stone_talus", "molduga", "frox", "gleeok",
  "wells", "chasms", "yiga_schematic", "old_map", "armor", "sage_will", "schema_stone",
  "general_locations",
];
const completionInputs = Object.fromEntries(completionIds.map((id) => [id, $(`#completion-${id}`)]));
const completionCounts = Object.fromEntries(
  completionIds.map((id) => [id, $(`#completionCount-${id}`)]),
);
const completionShowObtained = Object.fromEntries(completionIds.map((id) => [id, false]));
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
  player: [overlayInputs.playerLocation, overlayInputs.playerGuide, overlayInputs.playerAutoPan],
  completion: [
    ...Object.values(completionInputs),
  ],
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
const zoomStep = 0.05;
const wheelZoomFactor = 1.1;
const buttonZoomFactor = 1.25;
/** Max zoom when auto-framing the player guide arrow (200%). */
const playerGuideMaxScale = 2;
const LIVE_SAVE_ROW_ORDER = [
  "quests-main",
  "quests-adventure",
  "quests-side",
  "quests-shrine",
  "completionist",
  "seeds",
  "koroks",
  "life",
  "stamina",
  "battery",
  "armor",
  "armor-upgraded",
  "compendium",
  "pristine-weapons",
  "recipes",
  "fabrics",
  "key-items",
  "materials",
];

const PLAYER_MAX_LIFE_HEARTS = 40;
const PLAYER_MAX_STAMINA_WHEELS = 3;
const PLAYER_MAX_BATTERY_CELLS = 48;
const PLAYER_MAX_BLESSINGS = 53;  // 152 shrines + 3 starting hearts + 6 hearts from dungeons + 1 from first statue + 5 starting stamina
const playerStatSummaries = [
  {
    element: lifeSummary,
    value: (stats) => stats && Math.min(stats.lifeHearts, PLAYER_MAX_LIFE_HEARTS),
    total: PLAYER_MAX_LIFE_HEARTS,
  },
  {
    element: staminaSummary,
    value: (stats) => stats && formatStaminaUnits(stats.maxStamina),
    total: PLAYER_MAX_STAMINA_WHEELS,
  },
  {
    element: batterySummary,
    value: (stats) => stats && Math.min(stats.batteryCells, PLAYER_MAX_BATTERY_CELLS),
    total: PLAYER_MAX_BATTERY_CELLS,
  },
];

let activeLayer = "surface";
let scale = 1;
let offsetX = 0;
let offsetY = 0;
let imageWidth = 0;
let imageHeight = 0;
let hasLoadedAnyMapImage = false;
let activePointers = new Map();
let dragStart = null;
let pinchStart = null;
let completionCategories = [];
let playerPosition = null;
let linkNearestCompletionId = null;
let pendingPanPoint = null;
let lastPlayerPanKey = null;
/** When unchanged, skip re-applying player-guide zoom/pan (avoids jumps on unrelated overlay toggles). */
let lastPlayerGuideFrameKey = "";
let hasLoadedAnySave = false;
let liveSaveCompletedExpanded = false;
