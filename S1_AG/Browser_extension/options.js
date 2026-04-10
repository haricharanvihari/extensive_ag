function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function normalizePattern(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");
}

function makeId() {
  return `site-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function toSeconds(minutesValue, secondsValue) {
  const minutes = Math.max(0, Math.floor(Number(minutesValue) || 0));
  const seconds = Math.max(0, Math.min(59, Math.floor(Number(secondsValue) || 0)));
  return minutes * 60 + seconds;
}

function splitSeconds(total) {
  const value = Math.max(0, Math.floor(Number(total) || 0));
  return { minutes: Math.floor(value / 60), seconds: value % 60 };
}

function formatMmSs(total) {
  const value = Math.max(0, Math.floor(Number(total) || 0));
  const mm = String(Math.floor(value / 60)).padStart(2, "0");
  const ss = String(value % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

async function getState() {
  return browser.runtime.sendMessage({ type: "GET_STATE" });
}

async function saveSites(sites) {
  return browser.runtime.sendMessage({ type: "SAVE_SITES", sites });
}

function setStatus(message, isError = false) {
  const status = document.getElementById("importExportStatus");
  status.textContent = message;
  status.style.color = isError ? "#b91c1c" : "#4b5563";
}

function usageSeconds(state, siteId) {
  return Number(state.usageByDate?.[todayKey()]?.[siteId] || 0);
}

async function renderSites() {
  const state = await getState();
  document.getElementById("timerEnabled").checked = state.timerEnabled !== false;
  const container = document.getElementById("sitesContainer");
  const template = document.getElementById("siteTemplate");
  container.innerHTML = "";

  if (!state.sites.length) {
    const empty = document.createElement("div");
    empty.className = "meta";
    empty.textContent = "No websites configured yet.";
    container.appendChild(empty);
    return;
  }

  state.sites.forEach((site) => {
    const row = template.content.firstElementChild.cloneNode(true);
    const used = usageSeconds(state, site.id);
    const limit = Number(site.limitSeconds || (Number(site.limitMinutes || 0) * 60));
    const snooze = Number(site.snoozeSeconds || (Number(site.snoozeMinutes || site.hibernateMinutes || 10) * 60));
    const enabled = site.enabled !== false;
    const over = enabled && used >= limit;
    row.querySelector(".pattern").textContent = site.pattern;
    row.querySelector(".meta").textContent = `Today: ${formatMmSs(used)}/${formatMmSs(limit)} | Snooze: ${formatMmSs(snooze)} | Site limit: ${
      enabled ? "On" : "Off"
    }${over ? " (Exceeded)" : ""}`;
    const toggle = document.createElement("input");
    toggle.type = "checkbox";
    toggle.checked = enabled;
    toggle.disabled = state.timerEnabled === false;
    toggle.title = state.timerEnabled === false ? "Turn on Master Timer first" : "Apply limit for this site";
    toggle.addEventListener("change", async () => {
      site.enabled = toggle.checked;
      await saveSites(state.sites);
      await renderSites();
    });
    const toggleLabel = document.createElement("label");
    toggleLabel.className = "meta";
    toggleLabel.textContent = "Site limit";
    const switchWrap = document.createElement("label");
    switchWrap.className = "switch";
    const slider = document.createElement("span");
    slider.className = "slider";
    switchWrap.appendChild(toggle);
    switchWrap.appendChild(slider);
    toggleLabel.appendChild(document.createTextNode(" "));
    toggleLabel.appendChild(switchWrap);
    row.querySelector(".actions").prepend(toggleLabel);
    row.querySelector(".editBtn").addEventListener("click", () => editSite(site.id));
    row.querySelector(".deleteBtn").addEventListener("click", () => deleteSite(site.id));
    container.appendChild(row);
  });
}

async function addWebsite() {
  const patternInput = document.getElementById("patternInput");
  const limitMinutesInput = document.getElementById("limitMinutesInput");
  const limitSecondsInput = document.getElementById("limitSecondsInput");
  const snoozeMinutesInput = document.getElementById("snoozeMinutesInput");
  const snoozeSecondsInput = document.getElementById("snoozeSecondsInput");
  const pattern = normalizePattern(patternInput.value);
  const limitSeconds = toSeconds(limitMinutesInput.value, limitSecondsInput.value);
  const snoozeSeconds = toSeconds(snoozeMinutesInput.value, snoozeSecondsInput.value);

  if (!pattern) {
    window.alert("Please enter a valid website URL/domain.");
    return;
  }
  if (limitSeconds < 1) {
    window.alert("Limit must be at least 1 second.");
    return;
  }
  if (snoozeSeconds < 1) {
    window.alert("Snooze must be at least 1 second.");
    return;
  }

  const state = await getState();
  const existing = state.sites.find((site) => site.pattern === pattern);
  if (existing) {
    existing.limitSeconds = limitSeconds;
    existing.snoozeSeconds = snoozeSeconds;
    existing.enabled = true;
  } else {
    state.sites.push({ id: makeId(), pattern, limitSeconds, snoozeSeconds, enabled: true });
  }

  await saveSites(state.sites);
  patternInput.value = "";
  await renderSites();
}

async function editSite(siteId) {
  const state = await getState();
  const site = state.sites.find((entry) => entry.id === siteId);
  if (!site) {
    return;
  }
  const pattern = normalizePattern(window.prompt("Website URL/domain", site.pattern));
  if (!pattern) {
    return;
  }
  const currentLimit = splitSeconds(Number(site.limitSeconds || (Number(site.limitMinutes || 0) * 60)));
  const limitMinutes = Number(window.prompt("Limit minutes", String(currentLimit.minutes)));
  const limitRemainderSeconds = Number(window.prompt("Limit seconds (0-59)", String(currentLimit.seconds)));
  const limit = toSeconds(limitMinutes, limitRemainderSeconds);
  if (limit < 1) {
    window.alert("Limit must be at least 1 second.");
    return;
  }
  const currentSnooze = splitSeconds(Number(site.snoozeSeconds || (Number(site.snoozeMinutes || site.hibernateMinutes || 10) * 60)));
  const snoozeMinutes = Number(window.prompt("Snooze minutes", String(currentSnooze.minutes)));
  const snoozeRemainderSeconds = Number(window.prompt("Snooze seconds (0-59)", String(currentSnooze.seconds)));
  const snooze = toSeconds(snoozeMinutes, snoozeRemainderSeconds);
  if (snooze < 1) {
    window.alert("Snooze must be at least 1 second.");
    return;
  }
  const enabledInput = window.prompt("Enable limits? (yes/no)", site.enabled !== false ? "yes" : "no");
  if (!enabledInput) {
    return;
  }
  const enabled = enabledInput.trim().toLowerCase().startsWith("y");

  site.pattern = pattern;
  site.limitSeconds = limit;
  site.snoozeSeconds = snooze;
  site.enabled = enabled;
  await saveSites(state.sites);
  await renderSites();
}

async function deleteSite(siteId) {
  if (!window.confirm("Delete this website from tracking?")) {
    return;
  }
  const state = await getState();
  const sites = state.sites.filter((entry) => entry.id !== siteId);
  await saveSites(sites);
  await renderSites();
}

async function exportDataToJson() {
  try {
    const data = await browser.runtime.sendMessage({ type: "EXPORT_DATA" });
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    await browser.downloads.download({
      url,
      filename: "sites-data.json",
      saveAs: true,
      conflictAction: "uniquify"
    });
    URL.revokeObjectURL(url);
    setStatus("Data exported.");
  } catch (_err) {
    setStatus("Export failed. Please try again.", true);
  }
}

async function importDataFromFile(file) {
  if (!file) {
    return;
  }
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const result = await browser.runtime.sendMessage({ type: "IMPORT_DATA", data: parsed });
    if (!result?.ok) {
      throw new Error(result?.error || "Import failed.");
    }
    await renderSites();
    setStatus("Data imported successfully.");
  } catch (_err) {
    setStatus("Could not import JSON. Please choose a valid data file.", true);
  }
}

document.getElementById("addBtn").addEventListener("click", addWebsite);
document.getElementById("timerEnabled").addEventListener("change", async (event) => {
  await browser.runtime.sendMessage({ type: "SET_TIMER_ENABLED", enabled: event.target.checked });
  await renderSites();
});
document.getElementById("exportDataBtn").addEventListener("click", exportDataToJson);
document.getElementById("importDataBtn").addEventListener("click", () => {
  document.getElementById("importFileInput").click();
});
document.getElementById("importFileInput").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  await importDataFromFile(file);
  event.target.value = "";
});
document.getElementById("resetUsageBtn").addEventListener("click", async () => {
  await browser.runtime.sendMessage({ type: "RESET_USAGE_TODAY" });
  await renderSites();
});

renderSites();
