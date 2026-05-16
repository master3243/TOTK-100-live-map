function completionCountText(category) {
  const remaining = category.remaining ?? 0;
  const obtained = category.obtained ?? 0;
  const total = category.total ?? remaining + obtained;
  return `${remaining} (${obtained}/${total})`;
}

function updateCompletionRow(category) {
    const count = completionCounts[category.id];
    const input = completionInputs[category.id];
    const label = input?.closest("label");
    const remaining = category.remaining ?? 0;
    const obtained = category.obtained ?? 0;
    if (count) {
      count.textContent = category.unloaded ? "--" : completionCountText(category);
    }
    const toggle = completionObtainedToggles[category.id];
    if (toggle) {
      toggle.disabled = obtained === 0;
      toggle.classList.toggle("active", completionShowObtained[category.id]);
      toggle.setAttribute("aria-pressed", completionShowObtained[category.id] ? "true" : "false");
      toggle.title = completionShowObtained[category.id] ? "Hide obtained" : "Show obtained";
      toggle.setAttribute(
        "aria-label",
        `${completionShowObtained[category.id] ? "Hide" : "Show"} obtained ${category.label}`,
      );
    }
    if (label) {
      const complete = !category.unloaded && remaining === 0;
      label.classList.toggle("completion-row-complete", complete);
      label.classList.toggle("completion-row-incomplete", !complete);
    }
}

function updateCompletionCounts(categories) {
  let totalObtained = 0;
  let totalTotal = 0;

  for (const category of categories) {
    updateCompletionRow(category);
    totalObtained += category.obtained ?? 0;
    totalTotal += category.total ?? (category.remaining ?? 0) + (category.obtained ?? 0);
  }
  if (completionTotalSummary) {
    completionTotalSummary.textContent = categories.length ? `${totalObtained} / ${totalTotal}` : "-- / --";
    completionTotalSummary.setAttribute("title", "Obtained / total (all completion categories)");
  }
  updateCompletionEyesToggleUi();
}

function completionStatsById(stats) {
  return Object.fromEntries((stats || []).map((stat) => [stat.id, stat]));
}

function completionStatAriaText(stat, config) {
  if (!stat) {
    return config.emptyText;
  }
  const missing = sortStatMissingByLabel(stat.missing);
  if (!missing.length) {
    return config.completeText;
  }
  return `${config.missingPrefix}:\n${missing.map((item) => item.label || item.id).join("\n")}`;
}

function updateCompletionStatSummary(config) {
  if (!config.element) {
    return;
  }
  const stat = currentCompletionStats[config.id] || null;
  config.element.textContent = stat ? `${stat.obtained} / ${stat.total}` : "-- / --";
  config.element.removeAttribute("title");
  config.element.setAttribute("aria-label", completionStatAriaText(stat, config));
  if (config.id === "armor_upgraded") {
    const incomplete = Boolean(stat && stat.remaining > 0);
    config.element.classList.toggle("stat-danger", incomplete);
    config.element.classList.toggle("stat-link", Boolean(stat));
  }
}

function updatePlayerStatSummary(config) {
  if (!config.element) {
    return;
  }
  const value = currentPlayerStats ? config.value(currentPlayerStats) : null;
  config.element.textContent = value == null ? "--" : `${value} / ${config.total}`;
}

function resetSaveSummary(statusText = "Error") {
  saveStatus.textContent = statusText;
  saveVersion.textContent = "--";
  seedCount.textContent = "-- / --";
  locationCount.textContent = "-- / --";
  completionistSummary.textContent = "-- / --";
  recipesSummary?.classList.remove("stat-link", "stat-danger");
  currentRecipes = null;
  currentPlayerStats = null;
  playerStatSummaries.forEach(updatePlayerStatSummary);
  currentCompletionStats = {};
  completionStatSummaries.forEach(updateCompletionStatSummary);
  updateLiveSaveRows();
}

function updateSaveSummary(payload) {
  const modified = new Date(payload.lastModified * 1000);
  saveStatus.textContent = modified.toLocaleTimeString();
  saveVersion.textContent = payload.version || "--";
  seedCount.textContent = `${payload.counts.totalSeeds} / ${payload.counts.availableSeeds}`;
  locationCount.textContent = `${payload.counts.totalLocations} / ${payload.counts.availableLocations}`;
  const recipes = payload.recipes || null;
  currentRecipes = recipes;
  if (recipesSummary) {
    if (!recipes) {
      recipesSummary.textContent = "--";
      recipesSummary.classList.remove("stat-link", "stat-danger");
    } else {
      const extras = recipes.extras || [];
      const warningPrefix = extras.length ? "⚠️ " : "";
      recipesSummary.textContent = `${warningPrefix}${recipes.obtained} / ${recipes.total}`;
      recipesSummary.classList.add("stat-link");
      recipesSummary.classList.toggle("stat-danger", (recipes.total || 0) > (recipes.obtained || 0));
    }
  }
  const stats = payload.playerStats || null;
  currentPlayerStats = stats;
  playerStatSummaries.forEach(updatePlayerStatSummary);

  const categories = payload.completion || [];
  const totalCategories = categories.length;
  const completedCategories = categories.filter((c) => (c.remaining ?? 0) === 0).length;
  completionistSummary.textContent =
    totalCategories > 0 ? `${completedCategories} / ${totalCategories}` : "-- / --";

  currentCompletionStats = completionStatsById(payload.completionStats);
  completionStatSummaries.forEach(updateCompletionStatSummary);
  updateLiveSaveRows();
}
