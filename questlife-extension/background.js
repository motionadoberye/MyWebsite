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

/**
 * Build a stable, deterministic rule ID for a given domain.
 * We use RULE_ID_BASE + index in the blocked list.
 * This avoids collisions with static rules (which start at 1).
 */
function ruleIdForDomain(domain, allDomains) {
  const idx = allDomains.indexOf(domain);
  return idx === -1 ? null : RULE_ID_BASE + idx;
}

// ──────────────────────────────────────────
// Blocking rules management
// ──────────────────────────────────────────

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

  // Collect domains that are currently unlocked (running, not paused, not expired)
  const unlockedDomains = new Set(
    activeTimers
      .filter(t => t.status === 'running' && t.startTime + t.duration * 1000 > now)
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
    .map((domain, idx) => ({
      id:       RULE_ID_BASE + idx,
      priority: 1,
      action: {
        type:        'redirect',
        redirect: {
          url: `${BLOCKED_PAGE_URL}?domain=${encodeURIComponent(domain)}`,
        },
      },
      condition: {
        urlFilter:     `||${domain}^`,
        resourceTypes: ['main_frame'],
      },
    }));

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
  const secondsRun = Math.floor((now - timer.startTime) / 1000) - timer.elapsed;
  timer.elapsed  += secondsRun;
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

/** Mark a timer as expired and (re)block its domain */
async function expireTimer(timerId) {
  const activeTimers = await storageGet('activeTimers', []);
  const timer = activeTimers.find(t => t.id === timerId);
  if (!timer) return;

  timer.status = 'expired';
  await storageSet({ activeTimers });
  await rebuildBlockingRules();

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
  activeTimers.forEach(t => {
    chrome.alarms.clear(`timer_${t.id}`);
    t.status = 'expired';
  });
  await storageSet({ activeTimers });
  await rebuildBlockingRules();
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
          await rebuildBlockingRules();
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
        sendResponse({ ok: true });
        break;

      case 'QUESTLIFE_BLOCK_ALL':
        await blockAll();
        sendResponse({ ok: true });
        break;

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
});

/** Re-apply blocking rules when the service worker restarts */
chrome.runtime.onStartup.addListener(async () => {
  await rebuildBlockingRules();
  // Recreate recurring overtime alarm if it's gone
  const existing = await new Promise(resolve => chrome.alarms.get('overtime_check', resolve));
  if (!existing) {
    chrome.alarms.create('overtime_check', { periodInMinutes: 1 });
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
