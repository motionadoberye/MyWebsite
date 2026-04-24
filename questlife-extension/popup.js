// ==========================================
// QuestLife Extension — popup.js
// ==========================================

const QUESTLIFE_URL = 'https://motionadoberye.github.io/MyWebsite/';

// ── Helpers ──────────────────────────────────────────────────────────

function $(id) { return document.getElementById(id); }

function formatTime(seconds) {
  if (seconds <= 0) return "⏰ Время вышло!";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const parts = [];
  if (h > 0) parts.push(`${h}ч`);
  if (m > 0 || h > 0) parts.push(`${String(m).padStart(2, '0')}м`);
  parts.push(`${String(s).padStart(2, '0')}с`);
  return parts.join(' ');
}

function getRemainingSeconds(timer) {
  if (timer.status === 'expired') return 0;
  if (timer.status === 'paused') {
    return Math.max(0, timer.duration - timer.elapsed);
  }
  // running
  const now = Math.floor(Date.now() / 1000);
  const startSec = Math.floor(timer.startTime / 1000);
  const spentSec = now - startSec;
  return Math.max(0, timer.duration - timer.elapsed - spentSec);
}

// ── Render ────────────────────────────────────────────────────────────

function renderTimers(timers) {
  const list = $('timers-list');

  const visible = timers.filter(t => t.status !== 'expired');
  if (visible.length === 0) {
    list.innerHTML = '<div class="empty-msg">Нет активных таймеров</div>';
    return;
  }

  list.innerHTML = visible.map(t => {
    const secs   = getRemainingSeconds(t);
    const isPaused  = t.status === 'paused';
    const isExpired = secs <= 0;
    const timeClass = isExpired ? 'expired' : isPaused ? 'paused' : secs < 60 ? 'urgent' : '';

    return `
      <div class="timer-item" data-id="${escHtml(t.id)}">
        <span class="timer-emoji">⏱️</span>
        <div class="timer-info">
          <div class="timer-name">${escHtml(t.rewardName)}</div>
          <div class="timer-domain">${escHtml(t.domain)}</div>
          <div class="timer-time ${timeClass}">${isExpired ? "⏰ Время вышло!" : formatTime(secs)}</div>
        </div>
        <div class="timer-controls">
          ${!isExpired ? `
            <button class="btn btn-icon" data-action="${isPaused ? 'resume' : 'pause'}" data-timer="${escHtml(t.id)}"
              title="${isPaused ? 'Продолжить' : 'Пауза'}">${isPaused ? '▶' : '⏸'}</button>
          ` : ''}
          <button class="btn btn-icon" data-action="stop" data-timer="${escHtml(t.id)}" title="Остановить" style="color:#ef4444">✕</button>
        </div>
      </div>`;
  }).join('');

  // Attach listeners
  list.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const action  = btn.dataset.action;
      const timerId = btn.dataset.timer;
      if (action === 'pause')  await sendBg('POPUP_PAUSE_TIMER',  { id: timerId });
      if (action === 'resume') await sendBg('POPUP_RESUME_TIMER', { id: timerId });
      if (action === 'stop')   await sendBg('POPUP_STOP_TIMER',   { id: timerId });
      await refresh();
    });
  });
}

function renderSites(blockedSites, activeTimers) {
  const list = $('sites-list');
  if (!blockedSites || blockedSites.length === 0) {
    list.innerHTML = '<div class="empty-msg">Список пуст</div>';
    return;
  }

  const now = Date.now();
  const unlockedDomains = new Set(
    activeTimers
      .filter(t => t.status === 'running' && t.startTime + t.duration * 1000 > now)
      .map(t => t.domain)
  );

  list.innerHTML = blockedSites.map(domain => {
    const unlocked = unlockedDomains.has(domain);
    return `
      <div class="site-item">
        <span class="site-domain">${escHtml(domain)}</span>
        <span class="site-status ${unlocked ? 'unlocked' : 'blocked'}">${unlocked ? '🔓 Открыт' : '🔒 Заблокирован'}</span>
      </div>`;
  }).join('');
}

function renderStatus(connected) {
  const bar = $('status-bar');
  $('status-icon').textContent = connected ? '✅' : '❌';
  $('status-text').textContent = connected ? 'Подключено к QuestLife' : 'QuestLife не открыт';
  bar.className = `status-bar ${connected ? 'connected' : 'disconnected'}`;
}

function renderStats(stats) {
  if (!stats) return;
  $('popup-level').textContent = stats.level ?? '—';
  $('popup-coins').textContent = stats.coins ?? '—';
}

// ── Communication helpers ─────────────────────────────────────────────

function sendBg(type, data = {}) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type, data }, response => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(response);
      }
    });
  });
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Refresh state ─────────────────────────────────────────────────────

async function refresh() {
  try {
    const state = await sendBg('GET_STATE');
    renderTimers(state.activeTimers || []);
    renderSites(state.blockedSites || [], state.activeTimers || []);
    renderStats(state.questLifeStats);
  } catch (_) {
    // service worker may not be ready yet
  }
}

// Check if any QuestLife tab is open (heuristic: check if stats are synced)
async function checkConnection() {
  const tabs = await chrome.tabs.query({});
  const connected = tabs.some(t => {
    if (!t.url) return false;
    try {
      const u = new URL(t.url);
      return u.hostname === 'motionadoberye.github.io' || u.hostname === 'localhost';
    } catch (_) { return false; }
  });
  renderStatus(connected);
}

// ── Tick ──────────────────────────────────────────────────────────────

async function tick() {
  await refresh();
}

// ── Init ──────────────────────────────────────────────────────────────

async function init() {
  await refresh();
  await checkConnection();
  setInterval(tick, 1000);

  $('open-questlife-btn').addEventListener('click', () => {
    chrome.tabs.create({ url: QUESTLIFE_URL });
  });

  $('block-all-btn').addEventListener('click', async () => {
    await sendBg('POPUP_BLOCK_ALL');
    await refresh();
  });
}

document.addEventListener('DOMContentLoaded', init);
