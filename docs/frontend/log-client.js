function createLogClient({ logEntries, logPanel, isTabVisible }) {
  let lastLogSignature = "";
  let lastLogId = 0;

  function renderLog(entries) {
    if (logPanel) {
      const hasEntries = Boolean(entries?.length);
      logPanel.hidden = !hasEntries;
      logPanel.setAttribute("aria-hidden", hasEntries ? "false" : "true");
    }
    const signature = entries.map((entry) => `${entry.time}|${entry.message}`).join("\n");
    if (signature === lastLogSignature) {
      return;
    }
    lastLogSignature = signature;

    const fragment = document.createDocumentFragment();
    for (const entry of entries.slice().reverse()) {
      const row = document.createElement("div");
      row.className = "log-entry";

      const time = document.createElement("span");
      time.className = "log-time";
      time.textContent = entry.time;

      const message = document.createElement("span");
      message.textContent = entry.message;

      row.append(time, message);
      fragment.appendChild(row);
    }
    logEntries.replaceChildren(fragment);
  }

  async function refreshLog() {
    if (!isTabVisible()) {
      return;
    }
    try {
      const response = await fetch(`/api/delta_log?last_id=${encodeURIComponent(lastLogId)}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) {
        return;
      }
      const entries = payload.entries || [];
      if (entries.length) {
        const maxId = Math.max(...entries.map((entry) => entry.id || 0));
        lastLogId = Math.max(lastLogId, maxId, payload.latestId || 0);
      } else if (payload.latestId) {
        lastLogId = Math.max(lastLogId, payload.latestId);
      }

      if (!lastLogSignature || entries.length) {
        const full = await fetch("/api/log", { cache: "no-store" });
        const fullPayload = await full.json();
        if (full.ok) {
          renderLog(fullPayload.entries || []);
        }
      }
    } catch (error) {
      console.error(error);
    }
  }

  return { refreshLog };
}
