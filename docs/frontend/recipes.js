const recipesStatus = document.querySelector("#recipesStatus");
const recipeCookedSummary = document.querySelector("#recipeCookedSummary");
const recipeMissingSummary = document.querySelector("#recipeMissingSummary");
const recipesTableBody = document.querySelector("#recipesTableBody");
const showAllRecipes = document.querySelector("#showAllRecipes");
const copyRecipesButton = document.querySelector("#copyRecipesButton");
const recipesBackLink = document.querySelector(".materials-back-link");
const recipesStickyTop = document.querySelector(".materials-sticky-top");
let recipesPayload = null;
let recipesHealthTimer = null;
let lastRecipesHealthKey = null;
let recipesLoading = false;

function setRecipesStatus(text) {
  recipesStatus.textContent = text;
}

function updateRecipesTableHeaderOffset() {
  if (!recipesStickyTop) {
    return;
  }
  document.body.style.setProperty(
    "--materials-table-header-top",
    `${Math.max(0, Math.ceil(recipesStickyTop.getBoundingClientRect().height) - 2)}px`,
  );
}

function recipeCell(text, className = "") {
  const cell = document.createElement("td");
  cell.textContent = text;
  if (className) {
    cell.className = className;
  }
  return cell;
}

function tsvEscape(value) {
  return String(value ?? "").replaceAll("\t", " ").replaceAll("\r", " ").replaceAll("\n", " ");
}

function sortedRecipes(payload) {
  return [...(payload.recipes || [])].sort((a, b) =>
    Number(a.recipeBookId || 0) - Number(b.recipeBookId || 0),
  );
}

function recipesClipboardText(payload) {
  const headers = ["Checklist", "Recipe book #", "Name", "Recipe", "", "", "", ""];
  const rows = sortedRecipes(payload).map((recipe) => {
    const ingredients = [...(recipe.recipeIngredients || [])].slice(0, 5);
    while (ingredients.length < 5) {
      ingredients.push("");
    }
    return [
      recipe.obtained ? "TRUE" : "FALSE",
      recipe.recipeBookId || "",
      recipe.recipeName || recipe.label || recipe.id,
      ...ingredients,
    ];
  });
  return [headers, ...rows].map((row) => row.map(tsvEscape).join("\t")).join("\n");
}

function renderRecipes(payload) {
  recipesPayload = payload;
  const recipes = sortedRecipes(payload);
  const missing = recipes.filter((recipe) => !recipe.obtained);
  const visible = showAllRecipes.checked ? recipes : missing;
  const summary = payload.summary || {};
  recipeCookedSummary.textContent = `${summary.obtained ?? 0} / ${summary.total ?? recipes.length}`;
  recipeMissingSummary.textContent = `${summary.remaining ?? missing.length}`;

  recipesTableBody.replaceChildren();
  if (!visible.length) {
    const row = document.createElement("tr");
    row.append(recipeCell(showAllRecipes.checked ? "No recipes found" : "All recipes cooked", "empty-table-cell"));
    row.firstChild.colSpan = 5;
    recipesTableBody.append(row);
    updateRecipesTableHeaderOffset();
    return;
  }

  for (const recipe of visible) {
    const row = document.createElement("tr");
    row.className = recipe.obtained ? "material-done-row" : "material-short-row";
    row.append(
      recipeCell(recipe.recipeBookId || "", "numeric recipe-id-cell"),
      recipeCell(recipe.recipeName || recipe.label || recipe.id),
      recipeCell((recipe.recipeIngredients || []).join(", ")),
      recipeCell(recipe.actorName || ""),
      recipeCell(recipe.obtained ? "Cooked" : "Missing", "recipe-status-cell"),
    );
    recipesTableBody.append(row);
  }
  updateRecipesTableHeaderOffset();
}

async function loadRecipesFromStoredSave() {
  const file = storedUploadedSaveFile();
  if (!file) {
    return false;
  }
  setRecipesStatus(`Loading ${file.name}`);
  renderRecipes(await recipesViaPyodide(file));
  setRecipesStatus(`Loaded ${file.name}`);
  return true;
}

async function uploadRecipesFromStoredSave() {
  const file = storedUploadedSaveFile();
  if (!file) {
    return false;
  }
  setRecipesStatus(`Loading ${file.name}`);
  const response = await fetch("/api/upload_recipes", {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream", "X-Filename": file.name || "progress.sav" },
    body: await file.arrayBuffer(),
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || `Upload failed (${response.status})`);
  }
  renderRecipes(payload);
  setRecipesStatus(`Loaded ${file.name}`);
  return true;
}

async function loadLiveRecipes() {
  if (recipesLoading) {
    return;
  }
  recipesLoading = true;
  const storedFile = storedUploadedSaveFile();
  try {
    if (storedFile && window.TOTK_USE_PYODIDE) {
      setRecipesStatus(`Loading ${storedFile.name}`);
      return renderRecipes(await recipesViaPyodide(storedFile));
    }

    if (window.TOTK_USE_PYODIDE) {
      throw new Error("No uploaded save is available on this page. Return to the map and upload a save first.");
    }

    setRecipesStatus("Loading live save");
    const response = await fetch("/api/recipes", { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || `Request failed (${response.status})`);
    }
    renderRecipes(payload);
    setRecipesStatus(`Loaded ${payload.savePath || "save"}`);
  } catch (error) {
    if (!window.TOTK_USE_PYODIDE && storedFile) {
      try {
        return await uploadRecipesFromStoredSave();
      } catch {
        // keep original error below
      }
    }
    setRecipesStatus(error.message || "Could not load recipes");
    const row = document.createElement("tr");
    row.append(recipeCell("Could not load recipes.", "empty-table-cell"));
    row.firstChild.colSpan = 5;
    recipesTableBody.replaceChildren(row);
    console.error(error);
  } finally {
    recipesLoading = false;
  }
}

async function pollRecipesHealth() {
  if (window.TOTK_USE_PYODIDE || document.visibilityState !== "visible") {
    return;
  }
  try {
    const response = await fetch("/api/health", { cache: "no-store" });
    const key = response.ok ? await response.text() : "";
    if (key && key !== lastRecipesHealthKey) {
      lastRecipesHealthKey = key;
      await loadLiveRecipes();
    }
  } catch (error) {
    setRecipesStatus(`Error: ${error.message}`);
  }
}

showAllRecipes?.addEventListener("change", () => {
  if (recipesPayload) {
    renderRecipes(recipesPayload);
  }
});

copyRecipesButton?.addEventListener("click", async () => {
  if (!recipesPayload) {
    return;
  }
  try {
    await navigator.clipboard.writeText(recipesClipboardText(recipesPayload));
    copyRecipesButton.textContent = "Copied";
    setTimeout(() => {
      copyRecipesButton.textContent = "Copy table";
    }, 1200);
  } catch (error) {
    setRecipesStatus("Could not copy table");
    console.error(error);
  }
});

if (recipesBackLink) {
  recipesBackLink.href = pyodideAwarePageUrl("index.html");
}

new ResizeObserver(updateRecipesTableHeaderOffset).observe(recipesStickyTop);
window.addEventListener("resize", updateRecipesTableHeaderOffset);
document.addEventListener("visibilitychange", pollRecipesHealth);

(async () => {
  if (window.TOTK_USE_PYODIDE) {
    await loadLiveRecipes();
    return;
  }
  await pollRecipesHealth();
  recipesHealthTimer = window.setInterval(pollRecipesHealth, 1000);
})();
