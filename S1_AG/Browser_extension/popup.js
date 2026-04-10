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

function splitSeconds(total) {
  const value = Math.max(0, Math.floor(Number(total) || 0));
  return { minutes: Math.floor(value / 60), seconds: value % 60 };
}

function toSeconds(minutesValue, secondsValue) {
  const minutes = Math.max(0, Math.floor(Number(minutesValue) || 0));
  const seconds = Math.max(0, Math.min(59, Math.floor(Number(secondsValue) || 0)));
  return minutes * 60 + seconds;
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
  await browser.runtime.sendMessage({ type: "SAVE_SITES", sites });
}

async function setSiteEnabled(siteId, enabled) {
  const state = await getState();
  const site = state.sites.find((entry) => entry.id === siteId);
  if (!site) {
    return;
  }
  site.enabled = enabled;
  await saveSites(state.sites);
}

function getTodayUsage(state, siteId) {
  const usage = state.usageByDate?.[todayKey()]?.[siteId];
  return Number(usage || 0);
}

function createEmptyMessage(text) {
  const el = document.createElement("div");
  el.textContent = text;
  el.className = "meta";
  return el;
}

function collapseAllInlineEdits() {
  document.querySelectorAll(".edit-panel").forEach((panel) => {
    panel.classList.add("hidden");
  });
}

async function render() {
  const currentHostEl = document.getElementById("currentHost");
  const sitesList = document.getElementById("sitesList");
  const alertsList = document.getElementById("alertsList");
  const timerEnabledInput = document.getElementById("timerEnabled");

  const state = await getState();
  timerEnabledInput.checked = state.timerEnabled !== false;
  const current = await browser.runtime.sendMessage({ type: "GET_CURRENT_HOST" });
  const currentHost = current?.host || "";
  currentHostEl.textContent = currentHost || "Not available";

  sitesList.innerHTML = "";
  alertsList.innerHTML = "";

  if (!state.sites.length) {
    sitesList.appendChild(createEmptyMessage("No tracked websites yet."));
  }

  const template = document.getElementById("siteItemTemplate");
  state.sites.forEach((site) => {
    const used = getTodayUsage(state, site.id);
    const limit = Number(site.limitSeconds || (Number(site.limitMinutes || 0) * 60));
    const snooze = Number(site.snoozeSeconds || (Number(site.snoozeMinutes || site.hibernateMinutes || 10) * 60));
    const over = limit > 0 && used >= limit;

    const node = template.content.firstElementChild.cloneNode(true);
    node.querySelector(".pattern").textContent = site.pattern;
    node.querySelector(".meta").textContent = `Today: ${formatMmSs(used)}/${formatMmSs(limit)} | Snooze: ${formatMmSs(snooze)} | Site limit: ${
      site.enabled !== false ? "On" : "Off"
    }`;
    node.querySelector(".editBtn").addEventListener("click", () => openInlineEdit(node, site));
    node.querySelector(".deleteBtn").addEventListener("click", () => deleteSite(site.id));
    const siteToggle = node.querySelector(".siteEnabledToggle");
    siteToggle.checked = site.enabled !== false;
    siteToggle.disabled = state.timerEnabled === false;
    siteToggle.title = state.timerEnabled === false ? "Turn on Master Timer first" : "Apply limit for this site";
    siteToggle.addEventListener("change", async () => {
      await setSiteEnabled(site.id, siteToggle.checked);
      await render();
    });
    sitesList.appendChild(node);

    if (state.timerEnabled !== false && over && site.enabled !== false) {
      const alertNode = document.createElement("div");
      alertNode.className = "item alert-card";
      alertNode.innerHTML = `
        <div class="item-main">
          <div class="pattern">${site.pattern}</div>
          <div class="meta">Limit exceeded (${formatMmSs(used)}/${formatMmSs(limit)})</div>
        </div>
        <div class="item-actions">
          <button data-site="${site.id}" data-seconds="${snooze}" class="snoozeBtn">Snooze ${formatMmSs(snooze)}</button>
        </div>
      `;
      alertsList.appendChild(alertNode);
    }
  });

  if (state.timerEnabled === false) {
    alertsList.appendChild(createEmptyMessage("Master Timer is off. Alerts are paused."));
  } else if (!alertsList.children.length) {
    alertsList.appendChild(createEmptyMessage("No active alerts."));
  }

  Array.from(document.querySelectorAll(".snoozeBtn")).forEach((btn) => {
    btn.addEventListener("click", async () => {
      const siteId = btn.getAttribute("data-site");
      const seconds = Number(btn.getAttribute("data-seconds") || 600);
      await browser.runtime.sendMessage({ type: "SNOOZE_SITE", siteId, seconds });
      await render();
    });
  });
}

function openInlineEdit(node, site) {
  const panel = node.querySelector(".edit-panel");
  const wasOpen = !panel.classList.contains("hidden");
  collapseAllInlineEdits();
  if (wasOpen) {
    panel.classList.add("hidden");
    return;
  }
  panel.classList.remove("hidden");
  const limit = splitSeconds(Number(site.limitSeconds || (Number(site.limitMinutes || 0) * 60)));
  const snooze = splitSeconds(Number(site.snoozeSeconds || (Number(site.snoozeMinutes || site.hibernateMinutes || 10) * 60)));

  node.querySelector(".editPattern").value = site.pattern;
  node.querySelector(".editLimitMinutes").value = String(limit.minutes);
  node.querySelector(".editLimitSeconds").value = String(limit.seconds);
  node.querySelector(".editSnoozeMinutes").value = String(snooze.minutes);
  node.querySelector(".editSnoozeSeconds").value = String(snooze.seconds);

  node.querySelector(".saveEditBtn").onclick = async () => {
    await saveInlineEdit(site.id, node);
  };
  node.querySelector(".cancelEditBtn").onclick = () => {
    panel.classList.add("hidden");
  };
}

async function saveInlineEdit(siteId, node) {
  const state = await getState();
  const site = state.sites.find((entry) => entry.id === siteId);
  if (!site) {
    return;
  }
  const pattern = normalizePattern(node.querySelector(".editPattern").value);
  const limitSeconds = toSeconds(
    node.querySelector(".editLimitMinutes").value,
    node.querySelector(".editLimitSeconds").value
  );
  const snoozeSeconds = toSeconds(
    node.querySelector(".editSnoozeMinutes").value,
    node.querySelector(".editSnoozeSeconds").value
  );
  if (!pattern) {
    window.alert("Please enter a valid website URL/domain.");
    return;
  }
  if (limitSeconds < 1 || snoozeSeconds < 1) {
    window.alert("Limit and snooze must be at least 1 second.");
    return;
  }
  site.pattern = pattern;
  site.limitSeconds = limitSeconds;
  site.snoozeSeconds = snoozeSeconds;
  await saveSites(state.sites);
  await render();
}

async function addCurrentSite() {
  const limitSeconds = toSeconds(
    document.getElementById("quickLimitMinutes").value,
    document.getElementById("quickLimitSeconds").value
  );
  const snoozeSeconds = toSeconds(
    document.getElementById("quickSnoozeMinutes").value,
    document.getElementById("quickSnoozeSeconds").value
  );
  if (limitSeconds < 1 || snoozeSeconds < 1) {
    window.alert("Limit and snooze must be at least 1 second.");
    return;
  }
  const current = await browser.runtime.sendMessage({ type: "GET_CURRENT_HOST" });
  const host = normalizePattern(current?.host);
  if (!host) {
    window.alert("No valid website in the current tab.");
    return;
  }

  const state = await getState();
  const existing = state.sites.find((site) => site.pattern === host);
  if (existing) {
    existing.limitSeconds = limitSeconds;
    existing.snoozeSeconds = snoozeSeconds;
    existing.enabled = true;
    await saveSites(state.sites);
    await render();
    return;
  }

  state.sites.push({
    id: makeId(),
    pattern: host,
    limitSeconds,
    snoozeSeconds,
    enabled: true
  });
  await saveSites(state.sites);
  await render();
}

async function deleteSite(siteId) {
  const confirmed = window.confirm("Delete this website from tracking?");
  if (!confirmed) {
    return;
  }
  const state = await getState();
  const sites = state.sites.filter((entry) => entry.id !== siteId);
  await saveSites(sites);
  await render();
}

document.getElementById("addCurrentBtn").addEventListener("click", addCurrentSite);
document.getElementById("timerEnabled").addEventListener("change", async (event) => {
  const enabled = event.target.checked;
  await browser.runtime.sendMessage({ type: "SET_TIMER_ENABLED", enabled });
  await render();
});
document.getElementById("openOptionsBtn").addEventListener("click", () => {
  browser.runtime.openOptionsPage();
});

render();
