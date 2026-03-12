// ==========================================
// QuestLife Extension — blocked.js
// Logic for the site-blocked page
// ==========================================

const QUESTLIFE_URL = 'https://motionadoberye.github.io/MyWebsite/';

const QUOTES = [
  "Великие дела требуют великих жертв. 💪",
  "Каждая минута дисциплины — это победа над собой. ⚔️",
  "Ты не пропускаешь видосик — ты строишь будущее. 🏆",
  "Заработай своё время. Ты сможешь. 🔥",
  "Прокрастинация — враг прогресса. 🚀",
  "Сначала дело — потом развлечение. ✅",
  "Дисциплина сегодня = свобода завтра. 🗝️",
  "Твоя цель важнее этого сайта. 🌟",
];

// ── Helpers ──────────────────────────────────────────────────────────

function getParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function formatTime(seconds) {
  if (seconds <= 0) return '0с';
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
  if (timer.status === 'paused') {
    return Math.max(0, timer.duration - timer.elapsed);
  }
  const now = Math.floor(Date.now() / 1000);
  const startSec = Math.floor(timer.startTime / 1000);
  return Math.max(0, timer.duration - timer.elapsed - (now - startSec));
}

/** Escape HTML to prevent XSS */
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Main ──────────────────────────────────────────────────────────────

async function init() {
  const domain   = getParam('domain') || 'этот сайт';
  const overtime = getParam('overtime') === '1';

  // Domain label
  document.getElementById('domain-label').textContent = domain;

  // Random motivational quote
  const quote = QUOTES[Math.floor(Math.random() * QUOTES.length)];
  document.getElementById('quote').textContent = `"${quote}"`;

  // Open QuestLife button (rewards tab)
  document.getElementById('open-questlife-btn').addEventListener('click', () => {
    window.location.href = QUESTLIFE_URL + '#rewards';
  });

  // Load state from extension storage
  try {
    const { activeTimers, questLifeStats, questLifeRewards } = await chrome.storage.local.get([
      'activeTimers',
      'questLifeStats',
      'questLifeRewards',
    ]);

    // Show coin balance if available
    if (questLifeStats && questLifeStats.coins !== undefined) {
      const coinBadge = document.getElementById('coin-badge');
      document.getElementById('coin-amount').textContent = questLifeStats.coins;
      coinBadge.style.display = 'flex';
    }

    // Show rewards that can unlock this domain
    const rewards = Array.isArray(questLifeRewards) ? questLifeRewards : [];
    const linkedRewards = rewards.filter(r => r.linkedSite === domain && r.timerMinutes);
    if (linkedRewards.length > 0) {
      const section = document.getElementById('linked-rewards');
      const list    = document.getElementById('linked-rewards-list');
      section.style.display = '';

      list.innerHTML = linkedRewards.map(r => `
        <div class="linked-reward-item">
          <div class="linked-reward-info">
            <span>${escHtml(r.emoji || '🎁')}</span>
            <span>${escHtml(r.title)}</span>
            ${r.timerMinutes ? `<span class="linked-reward-timer">⏱️ ${r.timerMinutes} мин</span>` : ''}
          </div>
          <span class="linked-reward-price">🪙 ${escHtml(String(r.price))}</span>
          <button class="btn btn-buy">🔓 Купить</button>
        </div>`).join('');

      // "Buy and unlock" — opens QuestLife rewards tab
      list.querySelectorAll('.btn-buy').forEach(btn => {
        btn.addEventListener('click', () => {
          // Navigate to QuestLife; the user will buy the reward manually
          // (cross-origin purchasing from a chrome-extension page isn't possible)
          chrome.tabs.create({ url: QUESTLIFE_URL + '#rewards' });
        });
      });
    }

    // Check if there is a paused timer for this domain
    const timers = activeTimers || [];
    const pausedTimer = timers.find(t => t.domain === domain && t.status === 'paused');

    if (pausedTimer) {
      const secs = getRemainingSeconds(pausedTimer);
      const hint = document.getElementById('paused-hint');
      document.getElementById('paused-hint-text').textContent =
        `У тебя есть ${formatTime(secs)} для ${domain} (на паузе)`;
      hint.style.display = 'flex';

      document.getElementById('resume-btn').addEventListener('click', async () => {
        await chrome.runtime.sendMessage({
          type: 'POPUP_RESUME_TIMER',
          data: { id: pausedTimer.id },
        });
        // Go to the previously blocked site
        window.location.href = `https://${domain}`;
      });
    }
  } catch (_) {
    // Extension storage may not be available in all contexts
  }
}

document.addEventListener('DOMContentLoaded', init);
