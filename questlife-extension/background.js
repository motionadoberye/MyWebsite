// ==========================================
// QuestLife Extension — background.js
// Service Worker: blocking, timers, alarms
// ==========================================

// ──────────────────────────────────────────
// Constants
// ──────────────────────────────────────────

/** Default domains to block when no custom list exists */
const DEFAULT_BLOCKED_SITES = [
  'youtube.com',
  'tiktok.com',
  'twitter.com',
  'x.com',
  'instagram.com',
  'reddit.com',
  'twitch.tv',
  'vk.com',
];

/** The URL of the blocked-page that replaces blocked sites */
const BLOCKED_PAGE_URL = chrome.runtime.getURL('blocked.html');

/** Rule ID base for dynamic blocking rules (one rule per domain) */
const RULE_ID_BASE = 1000;

// ──────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────

/** Read a value from chrome.storage.local, returns default if missing */
async function storageGet(key, defaultValue = null) {
  return new Promise(resolve => {
    chrome.storage.local.get([key], result => {
      resolve(result[key] !== undefined ? result[key] : defaultValue);
    });
  });
}

/** Write one or more key-value pairs to chrome.storage.local */
async function storageSet(data) {
  return new Promise(resolve => chrome.storage.local.set(data, resolve));
}

// ──────────────────────────────────────────
// Blocking rules management
// ──────────────────────────────────────────

/** Subdomains that should never be blocked even if parent domain is in the list */
const WHITELISTED_SUBDOMAINS = [
  'music.youtube.com',
];

/**
 * Rebuild all declarativeNetRequest dynamic rules based on:
 *  - blockedSites list (all domains that should be blocked)
 *  - activeTimers list (domains currently unlocked)
 *
 * We remove ALL existing dynamic rules first, then add back only
 * the domains that are NOT currently unlocked by an active running timer.
 */
async function rebuildBlockingRules() {
  const blockedSites = await storageGet('blockedSites', DEFAULT_BLOCKED_SITES);
  const activeTimers = await storageGet('activeTimers', []);
  const now = Date.now();

  // Collect domains that are currently unlocked (running, not paused, not expired).
  // Real expiry time = startTime + (duration - elapsed) * 1000, because `duration`
  // is total seconds and `elapsed` is seconds already consumed in prior run intervals.
  const unlockedDomains = new Set(
    activeTimers
      .filter(t => {
        if (t.status !== 'running') return false;
        const remainingMs = Math.max(0, t.duration - t.elapsed) * 1000;
        return t.startTime + remainingMs > now;
      })
      .map(t => t.domain)
  );

  // Remove ALL existing dynamic rules
  const existingRules = await new Promise(resolve =>
    chrome.declarativeNetRequest.getDynamicRules(resolve)
  );
  const removeIds = existingRules.map(r => r.id);

  // Build new rules for blocked (but not unlocked) domains
  const addRules = blockedSites
    .filter(domain => !unlockedDomains.has(domain))
    .map((domain, idx) => {
      // Find whitelisted subdomains for this domain
      const excluded = WHITELISTED_SUBDOMAINS.filter(sub => sub.endsWith('.' + domain));
      const condition = {
        urlFilter:     `||${domain}^`,
        resourceTypes: ['main_frame'],
      };
      if (excluded.length > 0) {
        condition.excludedRequestDomains = excluded;
      }
      return {
        id:       RULE_ID_BASE + idx,
        priority: 1,
        action: {
          type:     'redirect',
          redirect: {
            url: `${BLOCKED_PAGE_URL}?domain=${encodeURIComponent(domain)}`,
          },
        },
        condition,
      };
    });

  await new Promise(resolve =>
    chrome.declarativeNetRequest.updateDynamicRules(
      { removeRuleIds: removeIds, addRules },
      resolve
    )
  );
}

// ──────────────────────────────────────────
// Timer management
// ──────────────────────────────────────────

/** Start (or restart) a timer for a given domain unlock */
async function startTimer(data) {
  const { id, domain, rewardName, duration } = data;
  const activeTimers = await storageGet('activeTimers', []);

  // Remove any existing timer for the same ID or domain
  const filtered = activeTimers.filter(t => t.id !== id && t.domain !== domain);

  const timer = {
    id,
    domain,
    rewardName: rewardName || domain,
    duration,            // total seconds
    startTime:  Date.now(),
    pausedAt:   null,
    elapsed:    0,       // seconds consumed while paused
    status:     'running',
  };

  filtered.push(timer);
  await storageSet({ activeTimers: filtered });

  // Schedule an alarm for when this timer expires
  chrome.alarms.create(`timer_${id}`, { delayInMinutes: duration / 60 });

  // Unblock the domain
  await rebuildBlockingRules();

  // Notify active tabs on the blocked page to refresh
  notifyBlockedTabs(domain);
}

/** Pause a running timer */
async function pauseTimer(timerId) {
  const activeTimers = await storageGet('activeTimers', []);
  const timer = activeTimers.find(t => t.id === timerId);
  if (!timer || timer.status !== 'running') return;

  const now = Date.now();
  // Seconds run since the last start/resume (startTime is reset on each resume,
  // so we just add this interval to the already-accumulated elapsed total).
  const secondsThisInterval = Math.max(0, Math.floor((now - timer.startTime) / 1000));
  timer.elapsed  += secondsThisInterval;
  timer.pausedAt  = now;
  timer.status    = 'paused';

  // Cancel the pending alarm
  chrome.alarms.clear(`timer_${timerId}`);

  await storageSet({ activeTimers });
  await rebuildBlockingRules();
}

/** Resume a paused timer */
async function resumeTimer(timerId) {
  const activeTimers = await storageGet('activeTimers', []);
  const timer = activeTimers.find(t => t.id === timerId);
  if (!timer || timer.status !== 'paused') return;

  const remaining = timer.duration - timer.elapsed; // seconds left
  if (remaining <= 0) {
    await expireTimer(timerId);
    return;
  }

  timer.startTime = Date.now();
  timer.pausedAt  = null;
  timer.status    = 'running';

  // Re-schedule the alarm for the remaining time
  chrome.alarms.create(`timer_${timerId}`, { delayInMinutes: remaining / 60 });

  await storageSet({ activeTimers });
  await rebuildBlockingRules();
}

/** Stop a timer immediately (user cancelled) */
async function stopTimer(timerId) {
  const activeTimers = await storageGet('activeTimers', []);
  const updated = activeTimers.filter(t => t.id !== timerId);
  chrome.alarms.clear(`timer_${timerId}`);
  await storageSet({ activeTimers: updated });
  await rebuildBlockingRules();
}

/**
 * Immediately redirect any currently-open tabs on `domain` (or its
 * subdomains) to the blocked page. declarativeNetRequest only acts on
 * new requests, so already-loaded tabs keep working until navigation —
 * this closes that gap the moment a timer expires.
 */
async function redirectOpenTabsForDomain(domain) {
  const tabs = await new Promise(resolve => chrome.tabs.query({}, resolve));
  for (const tab of tabs) {
    if (!tab.url || !tab.id) continue;
    try {
      const url = new URL(tab.url);
      const hostname = url.hostname.replace(/^www\./, '');
      if (WHITELISTED_SUBDOMAINS.includes(hostname)) continue;
      if (hostname === domain || hostname.endsWith('.' + domain)) {
        chrome.tabs.update(tab.id, {
          url: `${BLOCKED_PAGE_URL}?domain=${encodeURIComponent(domain)}`,
        });
      }
    } catch (_) { /* ignore invalid URLs */ }
  }
}

/** Mark a timer as expired and (re)block its domain */
async function expireTimer(timerId) {
  const activeTimers = await storageGet('activeTimers', []);
  const timer = activeTimers.find(t => t.id === timerId);
  if (!timer) return;

  timer.status = 'expired';
  await storageSet({ activeTimers });
  await rebuildBlockingRules();
  await redirectOpenTabsForDomain(timer.domain);

  // Show browser notification
  chrome.notifications.create(`expired_${timerId}`, {
    type:    'basic',
    iconUrl: 'icons/icon48.png',
    title:   '⏰ Время вышло!',
    message: `${timer.rewardName} — ${timer.domain} заблокирован снова.`,
  });

  // Tell the QuestLife site the timer expired (so it can update its UI)
  broadcastToQuestLife({ type: 'QUESTLIFE_TIMER_EXPIRED', data: { id: timerId, domain: timer.domain } });
}

/** Stop all timers and block everything */
async function blockAll() {
  const activeTimers = await storageGet('activeTimers', []);
  const domainsToClose = [];
  activeTimers.forEach(t => {
    chrome.alarms.clear(`timer_${t.id}`);
    t.status = 'expired';
    if (t.domain) domainsToClose.push(t.domain);
  });
  await storageSet({ activeTimers });
  await rebuildBlockingRules();
  for (const d of domainsToClose) {
    await redirectOpenTabsForDomain(d);
  }
}

// ──────────────────────────────────────────
// Overtime penalty tracking
// ──────────────────────────────────────────

/**
 * Every minute, check if any expired-timer domain is still open in a tab.
 * If so, charge the user −1 coin per tab (via storage penalty queue).
 */
async function checkOvertime() {
  const activeTimers = await storageGet('activeTimers', []);
  const expiredDomains = activeTimers
    .filter(t => t.status === 'expired')
    .map(t => t.domain);

  if (expiredDomains.length === 0) return;

  const tabs = await new Promise(resolve =>
    chrome.tabs.query({}, resolve)
  );

  const penalties = [];
  for (const tab of tabs) {
    if (!tab.url) continue;
    try {
      const url = new URL(tab.url);
      const hostname = url.hostname.replace(/^www\./, '');
      // Skip whitelisted subdomains
      if (WHITELISTED_SUBDOMAINS.includes(hostname)) continue;
      const match = expiredDomains.find(d => hostname === d || hostname.endsWith('.' + d));
      if (match) {
        penalties.push({ domain: match, tabId: tab.id });
        // Close or redirect the tab to the blocked page
        chrome.tabs.update(tab.id, {
          url: `${BLOCKED_PAGE_URL}?domain=${encodeURIComponent(match)}&overtime=1`,
        });
      }
    } catch (_) { /* ignore invalid URLs */ }
  }

  if (penalties.length > 0) {
    // Queue a coin penalty for the website to pick up
    const existing = await storageGet('pendingPenalties', []);
    const updated = [...existing, ...penalties.map(p => ({
      domain:    p.domain,
      coins:     -1,
      timestamp: Date.now(),
    }))];
    await storageSet({ pendingPenalties: updated });
    broadcastToQuestLife({ type: 'QUESTLIFE_OVERTIME_PENALTY', data: { penalties } });
  }
}

// ──────────────────────────────────────────
// Tab-time tracker
// ──────────────────────────────────────────
//
// Watches which domain is currently in the focused tab. Every TICK_MS
// milliseconds, if that domain is one of the blocked-but-currently-unlocked
// sites, we add the elapsed seconds to `tabTimeToday[domain]`. This is the
// "time wasted on reward sites" metric shown in the Quest Manager dashboard.
//
// The counter is flushed to storage every ~10 s and reported back to the
// QuestLife site so it can render the total. Resets at local midnight via
// the existing `overtime_check` alarm (we piggy-back the same minute tick).

/** Domain → seconds accumulated during the current focused session. */
const tabTimeState = {
  focusedDomain:   null,  // domain currently in focused tab (or null)
  focusedTabId:    null,
  sessionStart:    null,  // timestamp when current session started
  lastFlushDate:   null,  // 'YYYY-MM-DD' — rolls counters at midnight
};

/** Pull the hostname from a URL string, stripping "www." */
function hostnameFromUrl(urlStr) {
  try {
    const u = new URL(urlStr);
    return u.hostname.replace(/^www\./, '');
  } catch { return null; }
}

/** Return today's date as YYYY-MM-DD in local timezone. */
function localDateStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/** Commit any in-progress focus session into the persisted counter. */
async function flushTabTime() {
  if (!tabTimeState.focusedDomain || !tabTimeState.sessionStart) return;
  const now = Date.now();
  const elapsed = Math.max(0, Math.floor((now - tabTimeState.sessionStart) / 1000));
  if (elapsed <= 0) {
    tabTimeState.sessionStart = now;
    return;
  }

  // Only count if the domain is a currently-unlocked blocked site.
  // (We don't track random browsing — only reward-site time.)
  const blockedSites = await storageGet('blockedSites', DEFAULT_BLOCKED_SITES);
  const activeTimers = await storageGet('activeTimers', []);
  const unlocked = new Set(
    activeTimers.filter(t => t.status === 'running').map(t => t.domain)
  );
  const domain = tabTimeState.focusedDomain;
  const isTracked = blockedSites.includes(domain) && unlocked.has(domain);

  if (isTracked) {
    const today = localDateStr();
    const tracker = (await storageGet('tabTimeTracker', null)) || {
      today: {}, date: today, totalAllTime: 0,
    };
    // Roll the daily counter if the date changed
    if (tracker.date !== today) {
      tracker.date  = today;
      tracker.today = {};
    }
    tracker.today[domain]   = (tracker.today[domain] || 0) + elapsed;
    tracker.totalAllTime    = (tracker.totalAllTime || 0) + elapsed;
    await storageSet({ tabTimeTracker: tracker });
    // Push the update to any open site tabs so they can re-render live.
    broadcastToQuestLife({
      type: 'QUESTLIFE_TAB_TIME_UPDATE',
      data: { tracker },
    });
  }

  tabTimeState.sessionStart = now;
}

/** Start a new focus session on the given tab. */
async function startTabTimeSession(tabId, url) {
  await flushTabTime();
  const host = url ? hostnameFromUrl(url) : null;
  tabTimeState.focusedTabId  = tabId;
  tabTimeState.focusedDomain = host;
  tabTimeState.sessionStart  = Date.now();
}

/** Stop tracking entirely (no focused tab). */
async function stopTabTimeSession() {
  await flushTabTime();
  tabTimeState.focusedTabId  = null;
  tabTimeState.focusedDomain = null;
  tabTimeState.sessionStart  = null;
}

// Hook into Chrome's tab lifecycle events
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await new Promise(resolve => chrome.tabs.get(tabId, t => resolve(t)));
    if (tab && tab.url) {
      await startTabTimeSession(tabId, tab.url);
    }
  } catch (_) { /* tab gone */ }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (changeInfo.url && tabId === tabTimeState.focusedTabId) {
    await startTabTimeSession(tabId, changeInfo.url);
  }
});

chrome.windows.onFocusChanged.addListener(async windowId => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    await stopTabTimeSession();
  } else {
    try {
      const [tab] = await new Promise(resolve =>
        chrome.tabs.query({ active: true, windowId }, tabs => resolve(tabs || []))
      );
      if (tab) await startTabTimeSession(tab.id, tab.url);
    } catch (_) { /* ignore */ }
  }
});

// ──────────────────────────────────────────
// Daily reminder scheduling
// ──────────────────────────────────────────

/**
 * (Re)schedule the daily reminder alarm based on user settings.
 * settings = { enabled: bool, time: "HH:MM", message?: string }
 */
async function scheduleDailyReminder(settings) {
  // Always clear any existing alarm first so we don't stack duplicates
  chrome.alarms.clear('daily_reminder');

  if (!settings || !settings.enabled) return;

  const [hhRaw, mmRaw] = String(settings.time || '20:00').split(':');
  const hh = Math.max(0, Math.min(23, parseInt(hhRaw, 10) || 20));
  const mm = Math.max(0, Math.min(59, parseInt(mmRaw, 10) || 0));

  const now  = new Date();
  const when = new Date();
  when.setHours(hh, mm, 0, 0);
  // If today's time already passed, schedule for tomorrow
  if (when.getTime() <= now.getTime()) {
    when.setDate(when.getDate() + 1);
  }

  chrome.alarms.create('daily_reminder', {
    when:            when.getTime(),
    periodInMinutes: 24 * 60, // repeat daily
  });
}

/** Fire the daily reminder notification */
async function fireDailyReminder() {
  const settings = await storageGet('reminderSettings', null);
  if (!settings || !settings.enabled) return;

  const msg = settings.message ||
    'Открой Quest Manager и закрой ежедневные задачи — стрик не ждёт!';

  chrome.notifications.create(`daily_${Date.now()}`, {
    type:     'basic',
    iconUrl:  'icons/icon128.png',
    title:    '🗡️ Quest Manager',
    message:  msg,
    priority: 1,
  });
}

// ──────────────────────────────────────────
// Communication helpers
// ──────────────────────────────────────────

/** Send a message to all QuestLife tabs via content scripts */
async function broadcastToQuestLife(message) {
  const tabs = await new Promise(resolve =>
    chrome.tabs.query({}, resolve)
  );
  for (const tab of tabs) {
    if (!tab.id || !tab.url) continue;
    // Only send to http/https pages (not chrome://, etc.)
    if (!tab.url.startsWith('http')) continue;
    chrome.tabs.sendMessage(tab.id, { ...message, _from: 'background' }).catch(() => {});
  }
}

/** Tell any blocked-page tabs for a domain to reload (domain now unblocked) */
async function notifyBlockedTabs(domain) {
  const tabs = await new Promise(resolve =>
    chrome.tabs.query({}, resolve)
  );
  for (const tab of tabs) {
    if (!tab.url) continue;
    if (tab.url.startsWith(BLOCKED_PAGE_URL) && tab.url.includes(encodeURIComponent(domain))) {
      chrome.tabs.reload(tab.id);
    }
  }
}

// ──────────────────────────────────────────
// Message handler (from content.js / popup.js)
// ──────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    switch (message.type) {

      // ── Commands from the QuestLife website ──

      case 'QUESTLIFE_START_TIMER':
        await startTimer(message.data);
        sendResponse({ ok: true });
        break;

      case 'QUESTLIFE_PAUSE_TIMER':
        await pauseTimer(message.data.id);
        sendResponse({ ok: true });
        break;

      case 'QUESTLIFE_RESUME_TIMER':
        await resumeTimer(message.data.id);
        sendResponse({ ok: true });
        break;

      case 'QUESTLIFE_STOP_TIMER':
        await stopTimer(message.data.id);
        sendResponse({ ok: true });
        break;

      case 'QUESTLIFE_SYNC':
        // Website sent updated state (level, coins, blocked sites list, rewards)
        if (message.data.blockedSites) {
          await storageSet({ blockedSites: message.data.blockedSites });
        }
        if (message.data.level !== undefined || message.data.coins !== undefined) {
          await storageSet({
            questLifeStats: {
              level:  message.data.level,
              coins:  message.data.coins,
            },
          });
        }
        // Store rewards so blocked.html can suggest "Buy and unlock" options
        if (Array.isArray(message.data.rewards)) {
          await storageSet({ questLifeRewards: message.data.rewards });
        }
        // ── Full timer reconciliation ──
        // The website is the source of truth. On every sync we rebuild the
        // extension's timer state from scratch using the site's absolute
        // `endTime` / `pausedRemaining` so any drift from pause/resume, lost
        // messages, or service-worker sleep is corrected immediately.
        if (Array.isArray(message.data.activeTimers)) {
          const siteTimers = message.data.activeTimers.filter(t => t.linkedSite);
          const extTimers  = await storageGet('activeTimers', []);
          const now        = Date.now();

          // Clear alarms for every extension timer that will be replaced or removed.
          for (const t of extTimers) {
            if (t.domain) chrome.alarms.clear(`timer_${t.id}`);
          }

          // Keep any extension-local timers that aren't tied to a domain (defensive).
          const reconciled = extTimers.filter(t => !t.domain);

          for (const st of siteTimers) {
            const totalSec = Math.max(1, Math.round(st.totalMs / 1000));
            const remainingMs = st.paused
              ? Math.max(0, st.pausedRemaining || 0)
              : Math.max(0, st.endTime - now);
            const remainSec = Math.max(0, Math.round(remainingMs / 1000));

            if (remainSec <= 0 && !st.paused) {
              // Timer already finished on the site — keep as expired so
              // rebuildBlockingRules re-blocks the domain immediately.
              reconciled.push({
                id:         st.id,
                domain:     st.linkedSite,
                rewardName: st.title || st.linkedSite,
                duration:   totalSec,
                startTime:  now,
                pausedAt:   null,
                elapsed:    totalSec,
                status:     'expired',
              });
              continue;
            }

            // Reconciled running/paused timer: startTime = now, elapsed
            // represents total - remaining so (duration - elapsed) === remaining.
            reconciled.push({
              id:         st.id,
              domain:     st.linkedSite,
              rewardName: st.title || st.linkedSite,
              duration:   totalSec,
              startTime:  now,
              pausedAt:   st.paused ? now : null,
              elapsed:    Math.max(0, totalSec - remainSec),
              status:     st.paused ? 'paused' : 'running',
            });

            if (!st.paused && remainSec > 0) {
              chrome.alarms.create(`timer_${st.id}`, { delayInMinutes: remainSec / 60 });
            }
          }

          // Orphan alarms for timers the site has removed were already cleared above.
          await storageSet({ activeTimers: reconciled });
        }
        // Always rebuild rules to reflect current state
        await rebuildBlockingRules();
        sendResponse({ ok: true });
        break;

      case 'QUESTLIFE_BLOCK_ALL':
        await blockAll();
        sendResponse({ ok: true });
        break;

      case 'QUESTLIFE_NOTIFY': {
        // Generic notification passthrough — the site can ask the extension
        // to show a native OS notification (e.g. level up, achievement).
        const { title, message: body, id, icon } = message.data || {};
        if (title && body) {
          chrome.notifications.create(id || `ql_${Date.now()}`, {
            type:     'basic',
            iconUrl:  icon || 'icons/icon128.png',
            title:    String(title),
            message:  String(body),
            priority: 1,
          });
        }
        sendResponse({ ok: true });
        break;
      }

      case 'QUESTLIFE_SET_REMINDERS': {
        // Save user reminder settings and (re-)schedule the daily alarm.
        const settings = message.data || {};
        await storageSet({ reminderSettings: settings });
        await scheduleDailyReminder(settings);
        sendResponse({ ok: true });
        break;
      }

      case 'QUESTLIFE_GET_TAB_TIME': {
        // Flush pending seconds, then return the latest tracker snapshot.
        await flushTabTime();
        const tracker = (await storageGet('tabTimeTracker', null)) || {
          today: {}, date: localDateStr(), totalAllTime: 0,
        };
        // Also push it to all open site tabs so every open window updates.
        broadcastToQuestLife({ type: 'QUESTLIFE_TAB_TIME_UPDATE', data: { tracker } });
        sendResponse({ ok: true, tracker });
        break;
      }

      case 'QUESTLIFE_RESET_TAB_TIME': {
        // Reset the daily counter (site triggers this on a new day).
        const tracker = {
          today: {},
          date:  localDateStr(),
          totalAllTime: (await storageGet('tabTimeTracker', null))?.totalAllTime || 0,
        };
        await storageSet({ tabTimeTracker: tracker });
        sendResponse({ ok: true, tracker });
        break;
      }

      // ── Queries from popup ──

      case 'GET_STATE':
        sendResponse({
          blockedSites:   await storageGet('blockedSites', DEFAULT_BLOCKED_SITES),
          activeTimers:   await storageGet('activeTimers', []),
          questLifeStats: await storageGet('questLifeStats', { level: 1, coins: 0 }),
        });
        break;

      case 'POPUP_PAUSE_TIMER':
        await pauseTimer(message.data.id);
        // Tell website
        broadcastToQuestLife({ type: 'QUESTLIFE_TIMER_PAUSED', data: message.data });
        sendResponse({ ok: true });
        break;

      case 'POPUP_RESUME_TIMER':
        await resumeTimer(message.data.id);
        broadcastToQuestLife({ type: 'QUESTLIFE_TIMER_RESUMED', data: message.data });
        sendResponse({ ok: true });
        break;

      case 'POPUP_STOP_TIMER':
        await stopTimer(message.data.id);
        broadcastToQuestLife({ type: 'QUESTLIFE_TIMER_STOPPED', data: message.data });
        sendResponse({ ok: true });
        break;

      case 'POPUP_BLOCK_ALL':
        await blockAll();
        broadcastToQuestLife({ type: 'QUESTLIFE_ALL_BLOCKED', data: {} });
        sendResponse({ ok: true });
        break;

      case 'ADD_BLOCKED_SITE': {
        const sites = await storageGet('blockedSites', DEFAULT_BLOCKED_SITES);
        const domain = message.data.domain.trim().toLowerCase().replace(/^www\./, '');
        if (domain && !sites.includes(domain)) {
          sites.push(domain);
          await storageSet({ blockedSites: sites });
          await rebuildBlockingRules();
        }
        sendResponse({ ok: true, blockedSites: sites });
        break;
      }

      case 'REMOVE_BLOCKED_SITE': {
        const sites = await storageGet('blockedSites', DEFAULT_BLOCKED_SITES);
        const updated = sites.filter(d => d !== message.data.domain);
        await storageSet({ blockedSites: updated });
        await rebuildBlockingRules();
        sendResponse({ ok: true, blockedSites: updated });
        break;
      }

      default:
        sendResponse({ ok: false, error: 'Unknown message type' });
    }
  })();
  return true; // keep message channel open for async response
});

// ──────────────────────────────────────────
// Alarm handler — timer expiry
// ──────────────────────────────────────────

chrome.alarms.onAlarm.addListener(async alarm => {
  if (alarm.name.startsWith('timer_')) {
    const timerId = alarm.name.replace('timer_', '');
    await expireTimer(timerId);
  }
  if (alarm.name === 'overtime_check') {
    await checkOvertime();
    // Also flush the tab-time counter roughly every minute so the site
    // sees up-to-date numbers without needing a heartbeat ping.
    await flushTabTime();
  }
  if (alarm.name === 'daily_reminder') {
    await fireDailyReminder();
  }
});

// ──────────────────────────────────────────
// Startup / Install
// ──────────────────────────────────────────

/** On first install, initialise default storage and build blocking rules */
chrome.runtime.onInstalled.addListener(async () => {
  const existing = await storageGet('blockedSites', null);
  if (!existing) {
    await storageSet({ blockedSites: DEFAULT_BLOCKED_SITES });
  }
  await rebuildBlockingRules();

  // Set up recurring alarm for overtime checks (every 1 minute)
  chrome.alarms.create('overtime_check', { periodInMinutes: 1 });

  // Re-arm the daily reminder if user settings already exist
  const settings = await storageGet('reminderSettings', null);
  if (settings && settings.enabled) {
    await scheduleDailyReminder(settings);
  }
});

/** Re-apply blocking rules when the service worker restarts */
chrome.runtime.onStartup.addListener(async () => {
  await rebuildBlockingRules();
  // Recreate recurring overtime alarm if it's gone
  const existing = await new Promise(resolve => chrome.alarms.get('overtime_check', resolve));
  if (!existing) {
    chrome.alarms.create('overtime_check', { periodInMinutes: 1 });
  }
  // Recreate the daily reminder alarm if the user had one configured
  const reminderAlarm = await new Promise(resolve =>
    chrome.alarms.get('daily_reminder', resolve));
  if (!reminderAlarm) {
    const settings = await storageGet('reminderSettings', null);
    if (settings && settings.enabled) {
      await scheduleDailyReminder(settings);
    }
  }
  // Recreate alarms for running timers that may have been lost
  const activeTimers = await storageGet('activeTimers', []);
  const now = Date.now();
  for (const timer of activeTimers) {
    if (timer.status === 'running') {
      const remaining = (timer.duration - timer.elapsed) - Math.floor((now - timer.startTime) / 1000);
      if (remaining > 0) {
        chrome.alarms.create(`timer_${timer.id}`, { delayInMinutes: remaining / 60 });
      } else {
        await expireTimer(timer.id);
      }
    }
  }
});
