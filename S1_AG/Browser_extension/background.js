const DEFAULTS = {
  sites: [],
  usageByDate: {},
  snoozedUntilBySite: {},
  alertStateBySite: {},
  timerEnabled: true
};

const TICK_SECONDS = 1;
const TICK_INTERVAL_MS = 1000;
let tickIntervalId = null;

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function normalizePattern(input) {
  if (!input || typeof input !== "string") {
    return "";
  }
  return input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

function clampNumber(value, min, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.max(min, numeric);
}

function parseDurationToSeconds(minutesValue, secondsValue, fallbackSeconds) {
  const minutes = clampNumber(minutesValue, 0, 0);
  const seconds = clampNumber(secondsValue, 0, 0);
  const total = Math.floor(minutes * 60 + seconds);
  return total > 0 ? total : fallbackSeconds;
}

function getSiteLimitSeconds(site) {
  if (Number.isFinite(Number(site.limitSeconds))) {
    return Math.max(1, Math.floor(Number(site.limitSeconds)));
  }
  if (Number.isFinite(Number(site.limitMinutes))) {
    return Math.max(1, Math.floor(Number(site.limitMinutes) * 60));
  }
  return 30 * 60;
}

function getSiteSnoozeSeconds(site) {
  if (Number.isFinite(Number(site.snoozeSeconds))) {
    return Math.max(1, Math.floor(Number(site.snoozeSeconds)));
  }
  if (Number.isFinite(Number(site.snoozeMinutes || site.hibernateMinutes))) {
    return Math.max(1, Math.floor(Number(site.snoozeMinutes || site.hibernateMinutes) * 60));
  }
  return 10 * 60;
}

function formatMmSs(totalSeconds) {
  const seconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

function hostMatchesPattern(hostname, pattern) {
  if (!hostname || !pattern) {
    return false;
  }
  return hostname === pattern || hostname.endsWith(`.${pattern}`);
}

function getHostFromUrl(url) {
  try {
    const parsed = new URL(url);
    if (!/^https?:$/.test(parsed.protocol)) {
      return null;
    }
    return parsed.hostname.toLowerCase();
  } catch (_err) {
    return null;
  }
}

async function getState() {
  const state = await browser.storage.local.get(DEFAULTS);
  return {
    sites: Array.isArray(state.sites) ? state.sites : [],
    usageByDate: state.usageByDate || {},
    snoozedUntilBySite: state.snoozedUntilBySite || {},
    alertStateBySite: state.alertStateBySite || {},
    timerEnabled: state.timerEnabled !== false
  };
}

async function setState(partial) {
  await browser.storage.local.set(partial);
}

function getTodayUsage(state) {
  const key = todayKey();
  if (!state.usageByDate[key]) {
    state.usageByDate[key] = {};
  }
  return state.usageByDate[key];
}

function cleanupOldUsage(state) {
  const key = todayKey();
  if (!state.usageByDate[key]) {
    state.usageByDate = { [key]: {} };
  } else {
    state.usageByDate = { [key]: state.usageByDate[key] };
  }
}

async function getActiveTabHost() {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tabs.length) {
    return null;
  }
  return getHostFromUrl(tabs[0].url);
}

function findMatchingSite(sites, host) {
  if (!host) {
    return null;
  }
  return sites.find((site) => site.enabled !== false && hostMatchesPattern(host, site.pattern)) || null;
}

async function updateBadgeForHost(host) {
  const state = await getState();
  cleanupOldUsage(state);
  if (!state.timerEnabled) {
    await browser.browserAction.setBadgeText({ text: "" });
    await browser.browserAction.setTitle({ title: "URL Time Guard (Timer Disabled)" });
    await setState({ usageByDate: state.usageByDate });
    return;
  }

  const site = findMatchingSite(state.sites, host);
  if (!site) {
    await browser.browserAction.setBadgeText({ text: "" });
    await browser.browserAction.setTitle({ title: "URL Time Guard" });
    await setState({ usageByDate: state.usageByDate });
    return;
  }

  const todayUsage = getTodayUsage(state);
  const used = Number(todayUsage[site.id] || 0);
  const limit = getSiteLimitSeconds(site);
  const isOver = limit > 0 && used >= limit;
  const remaining = Math.max(0, limit - used);

  await browser.browserAction.setBadgeBackgroundColor({
    color: isOver ? "#C62828" : "#1E88E5"
  });
  await browser.browserAction.setBadgeText({
    text: isOver ? "!" : formatMmSs(remaining)
  });
  await browser.browserAction.setTitle({
    title: isOver
      ? `${site.pattern}: limit exceeded (${formatMmSs(used)}/${formatMmSs(limit)})`
      : `${site.pattern}: ${formatMmSs(used)}/${formatMmSs(limit)} today`
  });
  await setState({ usageByDate: state.usageByDate });
}

async function notifyLimitExceeded(site, used, limit) {
  await browser.notifications.create(`over-${site.id}-${Date.now()}`, {
    type: "basic",
    iconUrl: browser.runtime.getURL("icons/alert-96.svg"),
    title: "URL Time Guard Alert",
    message: `You crossed your ${formatMmSs(limit)} limit on ${site.pattern}. Used: ${formatMmSs(used)}.`
  });
}

async function clearAllNotifications() {
  const all = await browser.notifications.getAll();
  await Promise.all(Object.keys(all).map((id) => browser.notifications.clear(id)));
}

async function processTick() {
  const host = await getActiveTabHost();
  const state = await getState();
  cleanupOldUsage(state);
  if (!state.timerEnabled) {
    await browser.browserAction.setBadgeText({ text: "" });
    await browser.browserAction.setTitle({ title: "URL Time Guard (Timer Disabled)" });
    await setState({ usageByDate: state.usageByDate });
    return;
  }

  const site = findMatchingSite(state.sites, host);
  if (!site) {
    await setState({ usageByDate: state.usageByDate });
    await updateBadgeForHost(host);
    return;
  }

  const todayUsage = getTodayUsage(state);
  const now = Date.now();
  const snoozeSeconds = getSiteSnoozeSeconds(site);

  todayUsage[site.id] = Number(todayUsage[site.id] || 0) + TICK_SECONDS;

  const used = todayUsage[site.id];
  const limit = getSiteLimitSeconds(site);
  const crossed = limit > 0 && used >= limit;
  const snoozedUntil = Number(state.snoozedUntilBySite[site.id] || 0);
  const canNotify = now >= snoozedUntil;

  if (crossed && canNotify) {
    state.snoozedUntilBySite[site.id] = now + snoozeSeconds * 1000;
    await notifyLimitExceeded(site, used, limit);
  }

  await setState({
    usageByDate: state.usageByDate,
    snoozedUntilBySite: state.snoozedUntilBySite
  });
  await updateBadgeForHost(host);
}

function ensureTickerRunning() {
  if (tickIntervalId !== null) {
    return;
  }
  tickIntervalId = setInterval(() => {
    processTick().catch(() => {});
  }, TICK_INTERVAL_MS);
}

browser.runtime.onInstalled.addListener(async () => {
  await browser.storage.local.set(DEFAULTS);
  ensureTickerRunning();
});

browser.runtime.onStartup.addListener(async () => {
  ensureTickerRunning();
  const host = await getActiveTabHost();
  await updateBadgeForHost(host);
});
ensureTickerRunning();

browser.tabs.onActivated.addListener(async () => {
  const host = await getActiveTabHost();
  await updateBadgeForHost(host);
});

browser.tabs.onUpdated.addListener(async (_tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.active) {
    const host = getHostFromUrl(tab.url);
    await updateBadgeForHost(host);
  }
});

browser.runtime.onMessage.addListener(async (message) => {
  if (!message || typeof message !== "object") {
    return null;
  }

  if (message.type === "GET_STATE") {
    const state = await getState();
    cleanupOldUsage(state);
    await setState({ usageByDate: state.usageByDate });
    return state;
  }

  if (message.type === "EXPORT_DATA") {
    const state = await getState();
    cleanupOldUsage(state);
    return {
      sites: state.sites,
      usageByDate: state.usageByDate,
      snoozedUntilBySite: state.snoozedUntilBySite,
      timerEnabled: state.timerEnabled,
      updatedAt: new Date().toISOString()
    };
  }

  if (message.type === "GET_CURRENT_HOST") {
    const host = await getActiveTabHost();
    return { host };
  }

  if (message.type === "SAVE_SITES") {
    const incomingSites = Array.isArray(message.sites) ? message.sites : [];
    const normalizedSites = incomingSites
      .map((site) => ({
        id: site.id,
        pattern: normalizePattern(site.pattern),
        limitSeconds: parseDurationToSeconds(site.limitMinutes, site.limitRemainderSeconds, getSiteLimitSeconds(site)),
        snoozeSeconds: parseDurationToSeconds(site.snoozeMinutes, site.snoozeRemainderSeconds, getSiteSnoozeSeconds(site)),
        enabled: site.enabled !== false
      }))
      .filter((site) => site.id && site.pattern);

    const state = await getState();
    const validIds = new Set(normalizedSites.map((site) => site.id));
    const todayUsage = getTodayUsage(state);

    Object.keys(todayUsage).forEach((siteId) => {
      if (!validIds.has(siteId)) {
        delete todayUsage[siteId];
        delete state.snoozedUntilBySite[siteId];
        delete state.alertStateBySite[siteId];
      }
    });

    await setState({
      sites: normalizedSites,
      usageByDate: state.usageByDate,
      snoozedUntilBySite: state.snoozedUntilBySite,
      alertStateBySite: state.alertStateBySite,
      timerEnabled: state.timerEnabled
    });

    const host = await getActiveTabHost();
    await updateBadgeForHost(host);
    return { ok: true };
  }

  if (message.type === "SNOOZE_SITE") {
    const siteId = message.siteId;
    const state = await getState();
    const site = state.sites.find((entry) => entry.id === siteId);
    const seconds = Math.max(1, Number(message.seconds || getSiteSnoozeSeconds(site)));
    if (!siteId) {
      return { ok: false };
    }
    state.snoozedUntilBySite[siteId] = Date.now() + seconds * 1000;
    state.alertStateBySite[siteId] = false;
    await setState({
      snoozedUntilBySite: state.snoozedUntilBySite,
      alertStateBySite: state.alertStateBySite
    });
    return { ok: true };
  }

  if (message.type === "SET_TIMER_ENABLED") {
    const enabled = message.enabled !== false;
    const state = await getState();
    if (!enabled) {
      state.snoozedUntilBySite = {};
      await clearAllNotifications();
    }
    await setState({
      timerEnabled: enabled,
      snoozedUntilBySite: state.snoozedUntilBySite
    });
    const activeHost = await getActiveTabHost();
    await updateBadgeForHost(enabled ? activeHost : null);
    if (!enabled) {
      await browser.browserAction.setBadgeText({ text: "" });
      await browser.browserAction.setTitle({ title: "URL Time Guard (Timer Disabled)" });
    }
    return { ok: true };
  }

  if (message.type === "IMPORT_DATA") {
    const incoming = message.data && typeof message.data === "object" ? message.data : null;
    if (!incoming) {
      return { ok: false, error: "Invalid import data." };
    }
    const incomingSites = Array.isArray(incoming.sites) ? incoming.sites : [];
    const normalizedSites = incomingSites
      .map((site) => ({
        id: site.id,
        pattern: normalizePattern(site.pattern),
        limitSeconds: parseDurationToSeconds(site.limitMinutes, site.limitRemainderSeconds, getSiteLimitSeconds(site)),
        snoozeSeconds: parseDurationToSeconds(site.snoozeMinutes, site.snoozeRemainderSeconds, getSiteSnoozeSeconds(site)),
        enabled: site.enabled !== false
      }))
      .filter((site) => site.id && site.pattern);

    const usageByDate = incoming.usageByDate && typeof incoming.usageByDate === "object" ? incoming.usageByDate : {};
    const snoozedUntilBySite =
      incoming.snoozedUntilBySite && typeof incoming.snoozedUntilBySite === "object" ? incoming.snoozedUntilBySite : {};
    const timerEnabled = incoming.timerEnabled !== false;

    await setState({
      sites: normalizedSites,
      usageByDate,
      snoozedUntilBySite,
      alertStateBySite: {},
      timerEnabled
    });
    const host = await getActiveTabHost();
    await updateBadgeForHost(host);
    return { ok: true };
  }

  if (message.type === "RESET_USAGE_TODAY") {
    const state = await getState();
    state.usageByDate[todayKey()] = {};
    state.alertStateBySite = {};
    await setState({
      usageByDate: state.usageByDate,
      alertStateBySite: state.alertStateBySite
    });
    const host = await getActiveTabHost();
    await updateBadgeForHost(host);
    return { ok: true };
  }

  return null;
});
