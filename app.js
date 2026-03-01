// ==========================================
// Quest Manager — app.js
// A gamified task manager SPA
// ==========================================

// ==========================================
// Constants
// ==========================================

/** Difficulty definitions: XP and coin rewards */
const DIFFICULTY = {
  easy:   { label: 'Easy',   emoji: '🟢', xp: 10,  coins: 5  },
  medium: { label: 'Medium', emoji: '🟡', xp: 25,  coins: 15 },
  hard:   { label: 'Hard',   emoji: '🟠', xp: 50,  coins: 30 },
  epic:   { label: 'Epic',   emoji: '🔴', xp: 100, coins: 60 },
};

/** Category definitions with emoji icons */
const CATEGORY = {
  work:     { label: 'Work',     emoji: '💼' },
  study:    { label: 'Study',    emoji: '📚' },
  health:   { label: 'Health',   emoji: '💪' },
  personal: { label: 'Personal', emoji: '🏠' },
  creative: { label: 'Creative', emoji: '🎨' },
};

/** Default rewards pre-loaded on first run */
const DEFAULT_REWARDS = [
  { id: 'r-default-1', title: 'Пицца',       emoji: '🍕', price: 50,  timerMinutes: null },
  { id: 'r-default-2', title: 'Час Netflix',  emoji: '🎬', price: 30,  timerMinutes: 60   },
  { id: 'r-default-3', title: 'Новая игра',   emoji: '🎮', price: 200, timerMinutes: null },
];

/** Colors for category breakdown bars */
const CATEGORY_COLORS = {
  work:     'var(--accent-purple)',
  study:    'var(--accent-green)',
  health:   'var(--accent-yellow)',
  personal: 'var(--accent-orange)',
  creative: 'var(--accent-red)',
};

/** Colors for difficulty breakdown bars */
const DIFFICULTY_COLORS = {
  easy:   'var(--accent-green)',
  medium: 'var(--accent-yellow)',
  hard:   'var(--accent-orange)',
  epic:   'var(--accent-red)',
};

// ==========================================
// Application State
// ==========================================

let state = {
  tasks:            [],   // active tasks
  completedTasks:   [],   // completed tasks
  rewards:          [],   // available rewards in the shop
  purchasedRewards: [],   // history of purchased rewards
  userStats: {
    level:            1,
    xp:               0,
    coins:            0,
    currentStreak:    0,
    bestStreak:       0,
    totalXpEarned:    0,
    totalCoinsEarned: 0,
  },
  activityLog:  {},  // { "YYYY-MM-DD": completedCount }
  dailyTasks:   [],  // recurring daily quest objects
  dailyStats: {
    lastResetDate:        null,  // 'YYYY-MM-DD' — last day we reset completion flags
    dailyStreak:          0,     // consecutive days with all daily tasks completed
    dailyBestStreak:      0,
    lastAllCompletedDate: null,  // 'YYYY-MM-DD' when all dailies were last completed
    lastBonusDate:        null,  // 'YYYY-MM-DD' to prevent double bonus
  },
  activeTimers: [],  // countdown timers for timed rewards
};

// ==========================================
// localStorage Persistence
// ==========================================

/** Save all state slices to localStorage */
function saveState() {
  localStorage.setItem('qm_tasks',            JSON.stringify(state.tasks));
  localStorage.setItem('qm_completedTasks',   JSON.stringify(state.completedTasks));
  localStorage.setItem('qm_rewards',          JSON.stringify(state.rewards));
  localStorage.setItem('qm_purchasedRewards', JSON.stringify(state.purchasedRewards));
  localStorage.setItem('qm_userStats',        JSON.stringify(state.userStats));
  localStorage.setItem('qm_activityLog',      JSON.stringify(state.activityLog));
  localStorage.setItem('qm_dailyTasks',       JSON.stringify(state.dailyTasks));
  localStorage.setItem('qm_dailyStats',       JSON.stringify(state.dailyStats));
  localStorage.setItem('qm_activeTimers',     JSON.stringify(state.activeTimers));
}

/** Load state from localStorage, falling back to defaults */
function loadState() {
  const parse = (key, fallback) => {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
    catch { return fallback; }
  };

  state.tasks            = parse('qm_tasks',            []);
  state.completedTasks   = parse('qm_completedTasks',   []);
  state.rewards          = parse('qm_rewards',          [...DEFAULT_REWARDS]);
  state.purchasedRewards = parse('qm_purchasedRewards', []);
  state.activityLog      = parse('qm_activityLog',      {});
  state.dailyTasks       = parse('qm_dailyTasks',       []);
  state.activeTimers     = parse('qm_activeTimers',     []);

  const savedStats = parse('qm_userStats', null);
  if (savedStats) state.userStats = { ...state.userStats, ...savedStats };

  const savedDailyStats = parse('qm_dailyStats', null);
  if (savedDailyStats) state.dailyStats = { ...state.dailyStats, ...savedDailyStats };
}

// ==========================================
// XP & Level System
// ==========================================

/**
 * XP required to advance from level N to N+1.
 * Base 100 XP for level 1→2, each subsequent level requires 10 more XP.
 * Formula: level N → needs 100 + (N-1) * 10 XP.
 */
function xpForLevel(level) {
  return 100 + (level - 1) * 10;
}

/**
 * Award XP to the player and handle level-ups.
 * Loops to support multiple level-ups from a single action.
 */
function addXP(amount) {
  state.userStats.xp           += amount;
  state.userStats.totalXpEarned += amount;

  while (state.userStats.xp >= xpForLevel(state.userStats.level)) {
    state.userStats.xp    -= xpForLevel(state.userStats.level);
    state.userStats.level += 1;
    showLevelUp(state.userStats.level);
  }
}

// ==========================================
// Date Utilities
// ==========================================

/** Today's date string in YYYY-MM-DD format (UTC-stable via local) */
function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Get an array of the last N day strings, oldest first */
function lastNDays(n) {
  const days = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    days.push(`${y}-${m}-${day}`);
  }
  return days;
}

/** Recalculate currentStreak and bestStreak from activityLog */
function recalcStreak() {
  const today    = todayStr();
  const hasToday = (state.activityLog[today] || 0) > 0;

  let streak = 0;
  const d = new Date();

  // If no tasks today yet, start counting from yesterday
  if (!hasToday) d.setDate(d.getDate() - 1);

  while (true) {
    const y   = d.getFullYear();
    const m   = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const key = `${y}-${m}-${day}`;

    if ((state.activityLog[key] || 0) > 0) {
      streak++;
      d.setDate(d.getDate() - 1);
    } else {
      break;
    }
  }

  state.userStats.currentStreak = streak;
  if (streak > state.userStats.bestStreak) {
    state.userStats.bestStreak = streak;
  }
}

// ==========================================
// Task Operations (CRUD)
// ==========================================

/** Build a new task object */
function createTask(title, desc, difficulty, category, bonusReward) {
  return {
    id:          `task-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    title,
    desc,
    difficulty,
    category,
    bonusReward: bonusReward || '',  // optional custom reward text
    createdAt:   new Date().toISOString(),
  };
}

/** Add a new task to the active list */
function addTask(title, desc, difficulty, category, bonusReward) {
  const task = createTask(title, desc, difficulty, category, bonusReward);
  state.tasks.unshift(task);
  saveState();
  renderActiveTasks();
  showToast('Quest added! ⚔️', 'info');
}

/** Mark an active task as complete, award XP + coins */
function completeTask(taskId) {
  const idx = state.tasks.findIndex(t => t.id === taskId);
  if (idx === -1) return;

  const task       = state.tasks.splice(idx, 1)[0];
  task.completedAt = new Date().toISOString();
  state.completedTasks.unshift(task);

  // Award XP and coins
  const diff = DIFFICULTY[task.difficulty];
  addXP(diff.xp);
  state.userStats.coins            += diff.coins;
  state.userStats.totalCoinsEarned += diff.coins;

  // Record in activity log
  const today = todayStr();
  state.activityLog[today] = (state.activityLog[today] || 0) + 1;
  recalcStreak();

  saveState();
  renderActiveTasks();
  renderCompletedTasks();
  updateHeader();
  updateCompletedCount();
  showToast(`+${diff.xp} XP  +${diff.coins} 🪙  "${escapeHtml(task.title)}"`, 'success');

  // Show bonus reward notification if the quest had one
  if (task.bonusReward) {
    setTimeout(() => showToast(`🎁 Bonus reward: ${escapeHtml(task.bonusReward)}`, 'success'), 600);
  }
}

/** Delete a task (active or completed) */
function deleteTask(taskId, fromCompleted = false) {
  if (fromCompleted) {
    state.completedTasks = state.completedTasks.filter(t => t.id !== taskId);
  } else {
    state.tasks = state.tasks.filter(t => t.id !== taskId);
  }
  saveState();
  renderActiveTasks();
  renderCompletedTasks();
  updateCompletedCount();
}

// ==========================================
// Rewards Operations
// ==========================================

/** Add a custom reward to the shop */
function addReward(title, emoji, price, timerMinutes) {
  const reward = {
    id:           `reward-${Date.now()}`,
    title,
    emoji:        emoji || '🎁',
    price:        parseInt(price, 10),
    timerMinutes: timerMinutes || null,  // optional countdown timer in minutes
  };
  state.rewards.push(reward);
  saveState();
  renderRewards();
  showToast(`Reward "${escapeHtml(title)}" added!`, 'info');
}

/** Remove a reward from the shop */
function deleteReward(rewardId) {
  state.rewards = state.rewards.filter(r => r.id !== rewardId);
  saveState();
  renderRewards();
}

/** Purchase a reward — deduct coins and record history */
function buyReward(rewardId) {
  const reward = state.rewards.find(r => r.id === rewardId);
  if (!reward) return;

  if (state.userStats.coins < reward.price) {
    showToast(`Not enough coins! Need ${reward.price} 🪙`, 'error');
    return;
  }

  state.userStats.coins -= reward.price;

  const purchase = {
    ...reward,
    purchaseId:  `p-${Date.now()}`,
    purchasedAt: new Date().toISOString(),
  };
  state.purchasedRewards.unshift(purchase);

  saveState();
  renderRewards();
  renderPurchasedRewards();
  updateHeader();
  showToast(`Bought "${escapeHtml(reward.title)}" ${reward.emoji} for ${reward.price} 🪙`, 'success');

  // Start countdown timer if the reward has one
  if (reward.timerMinutes) {
    startTimer(reward.title, reward.emoji, reward.timerMinutes);
  }
}

// ==========================================
// Render — Header
// ==========================================

/** Sync header level badge, XP bar, and coin display */
function updateHeader() {
  const { level, xp, coins } = state.userStats;
  const required = xpForLevel(level);
  const pct      = Math.min((xp / required) * 100, 100);

  document.getElementById('header-level').textContent = level;
  document.getElementById('xp-bar').style.width       = `${pct}%`;
  document.getElementById('xp-text').textContent      = `${xp} / ${required} XP`;
  document.getElementById('header-coins').textContent  = coins;
}

// ==========================================
// Render — Quests
// ==========================================

function renderActiveTasks() {
  const container = document.getElementById('active-tasks');

  if (state.tasks.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⚔️</div>
        <div class="empty-title">No active quests</div>
        <div class="empty-hint">Click "New Quest" to begin your adventure!</div>
      </div>`;
    return;
  }

  container.innerHTML = state.tasks.map(task => renderTaskItem(task, false)).join('');
  attachTaskEvents(container, false);
}

function renderCompletedTasks() {
  const container = document.getElementById('completed-tasks');

  if (state.completedTasks.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🏁</div>
        <div class="empty-title">No completed quests yet</div>
        <div class="empty-hint">Complete a quest to see it here.</div>
      </div>`;
    return;
  }

  container.innerHTML = state.completedTasks.map(task => renderTaskItem(task, true)).join('');
  attachTaskEvents(container, true);
}

/** Build the HTML string for a single task card */
function renderTaskItem(task, completed) {
  const diff      = DIFFICULTY[task.difficulty];
  const cat       = CATEGORY[task.category];
  const itemClass = completed ? 'completed' : '';

  return `
    <div class="task-item ${itemClass}" data-id="${task.id}">
      ${completed
        ? `<div class="task-check checked" title="Completed"></div>`
        : `<button class="task-check" data-action="complete" data-id="${task.id}" title="Mark as complete" aria-label="Complete quest"></button>`
      }
      <div class="task-content">
        <div class="task-title">${escapeHtml(task.title)}</div>
        ${task.desc ? `<div class="task-desc">${escapeHtml(task.desc)}</div>` : ''}
        <div class="task-meta">
          <span class="badge badge-category">${cat.emoji} ${cat.label}</span>
          <span class="badge badge-${task.difficulty}">${diff.emoji} ${diff.label}</span>
          <span class="xp-reward">+${diff.xp} XP</span>
          <span class="coin-reward">+${diff.coins} 🪙</span>
          ${task.bonusReward ? `<span class="badge-bonus-reward">🎁 ${escapeHtml(task.bonusReward)}</span>` : ''}
        </div>
      </div>
      <div class="task-actions">
        <button class="btn btn-danger btn-sm" data-action="delete" data-id="${task.id}" data-completed="${completed}" title="Delete quest" aria-label="Delete">✕</button>
      </div>
    </div>`;
}

/** Attach click handlers for complete/delete actions inside a container */
function attachTaskEvents(container, completed) {
  container.querySelectorAll('[data-action="complete"]').forEach(btn => {
    btn.addEventListener('click', () => completeTask(btn.dataset.id));
  });
  container.querySelectorAll('[data-action="delete"]').forEach(btn => {
    btn.addEventListener('click', () => deleteTask(btn.dataset.id, completed));
  });
}

/** Update the completed task count badge */
function updateCompletedCount() {
  document.getElementById('completed-count').textContent = state.completedTasks.length;
}

// ==========================================
// Render — Rewards Shop
// ==========================================

function renderRewards() {
  const container = document.getElementById('rewards-list');

  if (state.rewards.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <div class="empty-icon">🏪</div>
        <div class="empty-title">Shop is empty</div>
        <div class="empty-hint">Add rewards to spend your hard-earned coins!</div>
      </div>`;
    return;
  }

  container.innerHTML = state.rewards.map(r => `
    <div class="reward-card">
      <span class="reward-emoji">${escapeHtml(r.emoji)}</span>
      <div class="reward-title">${escapeHtml(r.title)}</div>
      ${r.timerMinutes ? `<div class="reward-timer-badge">⏱️ ${r.timerMinutes} min timer</div>` : ''}
      <div class="reward-price"><span>🪙</span> ${r.price}</div>
      <div class="reward-actions">
        <button class="btn btn-green btn-sm" data-action="buy" data-id="${r.id}">Buy</button>
        <button class="btn btn-danger btn-sm" data-action="del-reward" data-id="${r.id}" title="Remove reward">✕</button>
      </div>
    </div>`).join('');

  container.querySelectorAll('[data-action="buy"]').forEach(btn => {
    btn.addEventListener('click', () => buyReward(btn.dataset.id));
  });
  container.querySelectorAll('[data-action="del-reward"]').forEach(btn => {
    btn.addEventListener('click', () => deleteReward(btn.dataset.id));
  });
}

function renderPurchasedRewards() {
  const container = document.getElementById('purchased-rewards');

  if (state.purchasedRewards.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🛒</div>
        <div class="empty-title">No purchases yet</div>
        <div class="empty-hint">Buy a reward from the shop above.</div>
      </div>`;
    return;
  }

  container.innerHTML = state.purchasedRewards.map(r => {
    const dateLabel = new Date(r.purchasedAt).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });
    return `
      <div class="purchased-item">
        <div class="purchased-info">
          <span class="purchased-emoji">${escapeHtml(r.emoji)}</span>
          <div>
            <div class="purchased-title">${escapeHtml(r.title)}</div>
            <div class="purchased-date">${dateLabel}</div>
          </div>
        </div>
        <div class="purchased-price">-${r.price} 🪙</div>
      </div>`;
  }).join('');
}

// ==========================================
// Render — Impact Dashboard
// ==========================================

/** Refresh all Impact section content */
function renderImpact() {
  const today      = todayStr();
  const todayCount = state.activityLog[today] || 0;
  const total      = state.completedTasks.length;

  document.getElementById('stat-total').textContent        = total;
  document.getElementById('stat-today').textContent        = todayCount;
  document.getElementById('stat-streak').textContent       = state.userStats.currentStreak;
  document.getElementById('stat-best-streak').textContent  = state.userStats.bestStreak;
  document.getElementById('stat-xp').textContent           = state.userStats.totalXpEarned;
  document.getElementById('stat-coins-earned').textContent = state.userStats.totalCoinsEarned;

  renderActivityChart();
  renderCategoryBreakdown();
  renderDifficultyBreakdown();
}

/** Render the 7-day activity bar chart */
function renderActivityChart() {
  const days   = lastNDays(7);
  const values = days.map(d => state.activityLog[d] || 0);
  const maxVal = Math.max(1, ...values);
  const today  = todayStr();

  const html = days.map((d, i) => {
    const count   = values[i];
    const pct     = Math.max((count / maxVal) * 100, count > 0 ? 8 : 3);
    const isToday = d === today;
    const [dy, dm, dd] = d.split('-').map(Number);
    const label   = new Date(dy, dm - 1, dd).toLocaleDateString('en-US', { weekday: 'short' });

    return `
      <div class="chart-col">
        <div class="chart-value">${count > 0 ? count : ''}</div>
        <div class="chart-bar-wrapper">
          <div class="chart-bar ${isToday ? 'chart-bar-today' : ''}"
               style="height: ${pct}%"
               title="${label}: ${count} task${count !== 1 ? 's' : ''}"></div>
        </div>
        <div class="chart-label">${label}</div>
      </div>`;
  }).join('');

  document.getElementById('activity-chart').innerHTML = html;
}

/** Render completed task counts per category with progress bars */
function renderCategoryBreakdown() {
  const counts = {};
  state.completedTasks.forEach(t => {
    counts[t.category] = (counts[t.category] || 0) + 1;
  });

  const total = state.completedTasks.length || 1;

  const html = Object.entries(CATEGORY).map(([key, cat]) => {
    const count = counts[key] || 0;
    const pct   = Math.round((count / total) * 100);
    return `
      <div class="breakdown-item">
        <div class="breakdown-header">
          <span class="breakdown-name">${cat.emoji} ${cat.label}</span>
          <span class="breakdown-count">${count}</span>
        </div>
        <div class="breakdown-bar-wrapper">
          <div class="breakdown-bar" style="width: ${pct}%; background: ${CATEGORY_COLORS[key]};"></div>
        </div>
      </div>`;
  }).join('');

  document.getElementById('category-breakdown').innerHTML = html ||
    '<p style="color:var(--text-muted);font-size:0.85rem;">Complete tasks to see the breakdown.</p>';
}

/** Render completed task counts per difficulty with progress bars */
function renderDifficultyBreakdown() {
  const counts = {};
  state.completedTasks.forEach(t => {
    counts[t.difficulty] = (counts[t.difficulty] || 0) + 1;
  });

  const total = state.completedTasks.length || 1;

  const html = Object.entries(DIFFICULTY).map(([key, diff]) => {
    const count = counts[key] || 0;
    const pct   = Math.round((count / total) * 100);
    return `
      <div class="breakdown-item">
        <div class="breakdown-header">
          <span class="breakdown-name">${diff.emoji} ${diff.label}</span>
          <span class="breakdown-count">${count}</span>
        </div>
        <div class="breakdown-bar-wrapper">
          <div class="breakdown-bar" style="width: ${pct}%; background: ${DIFFICULTY_COLORS[key]};"></div>
        </div>
      </div>`;
  }).join('');

  document.getElementById('difficulty-breakdown').innerHTML = html;
}

// ==========================================
// Toast Notifications
// ==========================================

/** Display a temporary toast notification */
function showToast(message, type = 'info') {
  const icons = { success: '✅', error: '❌', warning: '⚠️', info: '💬' };

  const container = document.getElementById('toast-container');
  const toast     = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span class="toast-icon">${icons[type] || '💬'}</span><span>${message}</span>`;
  container.appendChild(toast);

  // Auto-dismiss after 3 s
  setTimeout(() => {
    toast.style.animation = 'toastOut 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ==========================================
// Level Up Animation
// ==========================================

/** Show the full-screen level-up overlay */
function showLevelUp(level) {
  const overlay = document.getElementById('levelup-overlay');
  document.getElementById('levelup-number').textContent = level;
  overlay.classList.add('show');

  // Auto-dismiss after 2.5 s
  setTimeout(() => overlay.classList.remove('show'), 2500);
  showToast(`🎉 Level Up! You are now level ${level}!`, 'success');
}

// ==========================================
// Modal Helpers
// ==========================================

function openModal(id)  { document.getElementById(id).classList.add('open');    }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

// ==========================================
// Task Modal
// ==========================================

let selectedDifficulty = 'easy';
let selectedCategory   = 'work';

function initTaskModal() {
  // Difficulty selector
  document.querySelectorAll('#difficulty-options .option-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#difficulty-options .option-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedDifficulty = btn.dataset.value;
    });
  });

  // Category selector
  document.querySelectorAll('#category-options .option-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#category-options .option-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedCategory = btn.dataset.value;
    });
  });

  document.getElementById('add-task-btn').addEventListener('click', () => {
    resetTaskForm();
    openModal('task-modal');
    setTimeout(() => document.getElementById('task-title').focus(), 100);
  });

  document.getElementById('close-task-modal').addEventListener('click', () => closeModal('task-modal'));
  document.getElementById('cancel-task-btn').addEventListener('click', () => closeModal('task-modal'));
  document.getElementById('save-task-btn').addEventListener('click', submitTask);

  // Close on overlay backdrop click
  document.getElementById('task-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal('task-modal');
  });

  // Submit on Enter in title field
  document.getElementById('task-title').addEventListener('keydown', e => {
    if (e.key === 'Enter') submitTask();
  });
}

/** Reset the task creation form to defaults */
function resetTaskForm() {
  document.getElementById('task-title').value        = '';
  document.getElementById('task-desc').value         = '';
  document.getElementById('task-bonus-reward').value = '';
  selectedDifficulty = 'easy';
  selectedCategory   = 'work';

  document.querySelectorAll('#difficulty-options .option-btn').forEach((b, i) =>
    b.classList.toggle('active', i === 0));
  document.querySelectorAll('#category-options .option-btn').forEach((b, i) =>
    b.classList.toggle('active', i === 0));
}

function submitTask() {
  const title = document.getElementById('task-title').value.trim();
  if (!title) {
    document.getElementById('task-title').focus();
    showToast('Please enter a quest title!', 'warning');
    return;
  }
  const desc        = document.getElementById('task-desc').value.trim();
  const bonusReward = document.getElementById('task-bonus-reward').value.trim();
  addTask(title, desc, selectedDifficulty, selectedCategory, bonusReward);
  closeModal('task-modal');
}

// ==========================================
// Reward Modal
// ==========================================

function initRewardModal() {
  document.getElementById('add-reward-btn').addEventListener('click', () => {
    document.getElementById('reward-title').value = '';
    document.getElementById('reward-emoji').value = '';
    document.getElementById('reward-price').value = '';
    document.getElementById('reward-timer').value = '';
    // Clear active preset highlight
    document.querySelectorAll('#reward-modal .preset-btn').forEach(b => b.classList.remove('active'));
    openModal('reward-modal');
    setTimeout(() => document.getElementById('reward-title').focus(), 100);
  });

  // Timer preset quick-select buttons
  document.querySelectorAll('#reward-modal .preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('reward-timer').value = btn.dataset.minutes;
      document.querySelectorAll('#reward-modal .preset-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  document.getElementById('close-reward-modal').addEventListener('click', () => closeModal('reward-modal'));
  document.getElementById('cancel-reward-btn').addEventListener('click', () => closeModal('reward-modal'));
  document.getElementById('save-reward-btn').addEventListener('click', submitReward);

  document.getElementById('reward-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal('reward-modal');
  });

  document.getElementById('reward-price').addEventListener('keydown', e => {
    if (e.key === 'Enter') submitReward();
  });
}

function submitReward() {
  const title        = document.getElementById('reward-title').value.trim();
  const emoji        = document.getElementById('reward-emoji').value.trim();
  const price        = parseInt(document.getElementById('reward-price').value, 10);
  const timerRaw     = parseInt(document.getElementById('reward-timer').value, 10);
  const timerMinutes = (!isNaN(timerRaw) && timerRaw >= 1) ? timerRaw : null;

  if (!title) {
    document.getElementById('reward-title').focus();
    showToast('Please enter a reward title!', 'warning');
    return;
  }
  if (!price || price < 1) {
    document.getElementById('reward-price').focus();
    showToast('Please enter a valid price (≥ 1)!', 'warning');
    return;
  }

  addReward(title, emoji, price, timerMinutes);
  closeModal('reward-modal');
}

// ==========================================
// Navigation
// ==========================================

function initNav() {
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;

      document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));

      tab.classList.add('active');
      document.getElementById(`section-${target}`).classList.add('active');

      // Refresh Impact data each time the tab is opened
      if (target === 'impact') renderImpact();
      // Refresh daily tasks when switching to daily tab
      if (target === 'daily') { renderDailyTasks(); updateDailyProgress(); }
    });
  });
}

// ==========================================
// Utility
// ==========================================

/** Safely escape HTML special characters to prevent XSS */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#39;');
}

// ==========================================
// Countdown Timer System (Features 4 & 5)
// ==========================================

let timerInterval = null; // single shared interval for all active timers

/** Format milliseconds into HH:MM:SS or MM:SS string */
function formatTime(ms) {
  if (ms <= 0) return '00:00';
  const totalSecs = Math.ceil(ms / 1000);
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${String(h).padStart(2, '0')}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Start a new countdown timer for a reward */
function startTimer(title, emoji, minutes) {
  const totalMs = minutes * 60 * 1000;
  const timer = {
    id:              `timer-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    title,
    emoji:           emoji || '⏱️',
    endTime:         Date.now() + totalMs,
    totalMs,
    paused:          false,
    pausedRemaining: null,
    finished:        false,
  };
  state.activeTimers.push(timer);
  saveState();
  renderTimers();
  startTimerTick();
  showToast(`⏱️ Timer started: ${escapeHtml(title)} (${minutes} min)`, 'info');
}

/** Pause or resume a timer by id */
function pauseTimer(timerId) {
  const timer = state.activeTimers.find(t => t.id === timerId);
  if (!timer || timer.finished) return;

  if (timer.paused) {
    // Resume: restore endTime from remaining ms
    timer.endTime         = Date.now() + timer.pausedRemaining;
    timer.paused          = false;
    timer.pausedRemaining = null;
  } else {
    // Pause: store remaining ms
    timer.pausedRemaining = Math.max(0, timer.endTime - Date.now());
    timer.paused          = true;
  }
  saveState();
  renderTimers();
}

/** Remove a timer */
function stopTimer(timerId) {
  state.activeTimers = state.activeTimers.filter(t => t.id !== timerId);
  saveState();
  renderTimers();
  // Stop the tick loop if no timers remain
  if (state.activeTimers.length === 0 && timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

/** Start the per-second tick (no-op if already running) */
function startTimerTick() {
  if (timerInterval) return;
  timerInterval = setInterval(updateTimerDisplays, 1000);
}

/** Update timer countdown displays each second */
function updateTimerDisplays() {
  const container = document.getElementById('timers-container');
  if (!container) return;

  let needsFullRender = false;

  state.activeTimers.forEach(timer => {
    if (timer.paused || timer.finished) return;

    const remaining = timer.endTime - Date.now();
    if (remaining <= 0 && !timer.finished) {
      timer.finished = true;
      needsFullRender = true;
      saveState();
    }

    if (!needsFullRender) {
      // Surgically update just the time text
      const widget = container.querySelector(`.timer-widget[data-timer-id="${timer.id}"]`);
      if (!widget) return;
      const timeEl = widget.querySelector('.timer-time');
      if (!timeEl) return;
      timeEl.textContent = formatTime(remaining);
      if (remaining < 60000) timeEl.classList.add('urgent');
      else timeEl.classList.remove('urgent');
    }
  });

  if (needsFullRender) renderTimers();
}

/** Render all floating timer widgets */
function renderTimers() {
  const container = document.getElementById('timers-container');
  if (!container) return;

  if (state.activeTimers.length === 0) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = state.activeTimers.map(timer => {
    const remaining = timer.paused
      ? (timer.pausedRemaining || 0)
      : Math.max(0, timer.endTime - Date.now());
    const finished  = timer.finished || remaining <= 0;
    const isUrgent  = !finished && remaining < 60000;

    let timeClass = '';
    if (finished)      timeClass = 'finished';
    else if (isUrgent) timeClass = 'urgent';
    else if (timer.paused) timeClass = 'paused';

    const timeDisplay = finished ? "⏰ Time's up!" : formatTime(remaining);

    return `
      <div class="timer-widget${finished ? ' finished' : ''}" data-timer-id="${timer.id}">
        <span class="timer-emoji">${escapeHtml(timer.emoji)}</span>
        <div class="timer-info">
          <div class="timer-title">${escapeHtml(timer.title)}</div>
          <div class="timer-time ${timeClass}">${timeDisplay}</div>
        </div>
        <div class="timer-controls">
          ${!finished ? `
            <button class="btn btn-ghost btn-sm" data-action="timer-pause" data-timer-id="${timer.id}"
              title="${timer.paused ? 'Resume' : 'Pause'}" aria-label="${timer.paused ? 'Resume' : 'Pause'}">${timer.paused ? '▶' : '⏸'}</button>
          ` : ''}
          <button class="btn btn-danger btn-sm" data-action="timer-stop" data-timer-id="${timer.id}"
            title="Stop timer" aria-label="Stop timer">✕</button>
        </div>
      </div>`;
  }).join('');

  container.querySelectorAll('[data-action="timer-pause"]').forEach(btn => {
    btn.addEventListener('click', () => pauseTimer(btn.dataset.timerId));
  });
  container.querySelectorAll('[data-action="timer-stop"]').forEach(btn => {
    btn.addEventListener('click', () => stopTimer(btn.dataset.timerId));
  });
}

// ==========================================
// Daily Quests System (Feature 6)
// ==========================================

let selectedDailyDifficulty = 'easy';
let selectedDailyCategory   = 'work';

/** Reset daily task completion flags when a new day is detected */
function resetDailyTasksIfNewDay() {
  const today = todayStr();
  if (state.dailyStats.lastResetDate !== today) {
    state.dailyTasks.forEach(t => { t.completedDate = null; });
    state.dailyStats.lastResetDate = today;
    saveState();
  }
}

/** Add a new permanent daily quest */
function addDailyTask(title, desc, difficulty, category) {
  const task = {
    id:            `daily-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    title,
    desc,
    difficulty,
    category,
    createdAt:     new Date().toISOString(),
    completedDate: null,  // 'YYYY-MM-DD' of last completion
  };
  state.dailyTasks.unshift(task);
  saveState();
  renderDailyTasks();
  updateDailyProgress();
  showToast('Daily quest added! 📅', 'info');
}

/** Mark a daily task as done today */
function completeDailyTask(taskId) {
  const task = state.dailyTasks.find(t => t.id === taskId);
  if (!task) return;

  const today = todayStr();
  if (task.completedDate === today) return;  // already done today

  task.completedDate = today;

  // Award XP and coins
  const diff = DIFFICULTY[task.difficulty];
  addXP(diff.xp);
  state.userStats.coins            += diff.coins;
  state.userStats.totalCoinsEarned += diff.coins;

  // Record in activity log
  state.activityLog[today] = (state.activityLog[today] || 0) + 1;
  recalcStreak();

  saveState();
  renderDailyTasks();
  updateDailyProgress();
  updateHeader();
  showToast(`+${diff.xp} XP  +${diff.coins} 🪙  "${escapeHtml(task.title)}"`, 'success');

  // Check for all-completed bonus
  checkDailyCompletionBonus();
}

/** Remove a daily quest permanently */
function deleteDailyTask(taskId) {
  state.dailyTasks = state.dailyTasks.filter(t => t.id !== taskId);
  saveState();
  renderDailyTasks();
  updateDailyProgress();
}

/** If all daily tasks are completed today, award bonus coins (once per day) */
function checkDailyCompletionBonus() {
  if (state.dailyTasks.length === 0) return;
  const today   = todayStr();
  const allDone = state.dailyTasks.every(t => t.completedDate === today);

  if (allDone && state.dailyStats.lastBonusDate !== today) {
    state.dailyStats.lastBonusDate = today;

    const bonus = 50;
    state.userStats.coins            += bonus;
    state.userStats.totalCoinsEarned += bonus;

    // Update daily all-completed streak
    const last = state.dailyStats.lastAllCompletedDate;
    if (last) {
      const diffDays = Math.round(
        (new Date(today) - new Date(last)) / (1000 * 60 * 60 * 24)
      );
      state.dailyStats.dailyStreak = diffDays === 1
        ? state.dailyStats.dailyStreak + 1
        : 1;
    } else {
      state.dailyStats.dailyStreak = 1;
    }
    state.dailyStats.lastAllCompletedDate = today;
    if (state.dailyStats.dailyStreak > state.dailyStats.dailyBestStreak) {
      state.dailyStats.dailyBestStreak = state.dailyStats.dailyStreak;
    }

    saveState();
    updateHeader();
    updateDailyProgress();
    showToast(`🎉 All daily quests done! Streak ${state.dailyStats.dailyStreak} 🔥  +${bonus} 🪙 bonus!`, 'success');
  }
}

/** Render daily quest cards */
function renderDailyTasks() {
  const container = document.getElementById('daily-tasks-list');
  if (!container) return;

  if (state.dailyTasks.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📅</div>
        <div class="empty-title">No daily quests yet</div>
        <div class="empty-hint">Add recurring tasks to build daily habits!</div>
      </div>`;
    return;
  }

  const today = todayStr();
  container.innerHTML = state.dailyTasks
    .map(task => renderDailyTaskItem(task, today))
    .join('');

  container.querySelectorAll('[data-action="complete-daily"]').forEach(btn => {
    btn.addEventListener('click', () => completeDailyTask(btn.dataset.id));
  });
  container.querySelectorAll('[data-action="delete-daily"]').forEach(btn => {
    btn.addEventListener('click', () => deleteDailyTask(btn.dataset.id));
  });
}

/** Build HTML for a single daily task card */
function renderDailyTaskItem(task, today) {
  const diff      = DIFFICULTY[task.difficulty];
  const cat       = CATEGORY[task.category];
  const doneToday = task.completedDate === today;

  return `
    <div class="task-item${doneToday ? ' done-today' : ''}" data-id="${task.id}">
      ${doneToday
        ? `<div class="task-check checked" title="Done today"></div>`
        : `<button class="task-check" data-action="complete-daily" data-id="${task.id}"
             title="Mark as done today" aria-label="Complete today"></button>`
      }
      <div class="task-content">
        <div class="task-title">${escapeHtml(task.title)}</div>
        ${task.desc ? `<div class="task-desc">${escapeHtml(task.desc)}</div>` : ''}
        <div class="task-meta">
          <span class="badge badge-category">${cat.emoji} ${cat.label}</span>
          <span class="badge badge-${task.difficulty}">${diff.emoji} ${diff.label}</span>
          <span class="xp-reward">+${diff.xp} XP</span>
          <span class="coin-reward">+${diff.coins} 🪙</span>
          ${doneToday
            ? `<span class="badge" style="background:rgba(16,185,129,0.15);color:var(--accent-green);border:1px solid rgba(16,185,129,0.25);">✓ Done today</span>`
            : ''
          }
        </div>
      </div>
      <div class="task-actions">
        <button class="btn btn-danger btn-sm" data-action="delete-daily" data-id="${task.id}"
          title="Remove daily quest" aria-label="Delete">✕</button>
      </div>
    </div>`;
}

/** Update the daily progress bar + streak badge */
function updateDailyProgress() {
  const total   = state.dailyTasks.length;
  const today   = todayStr();
  const done    = state.dailyTasks.filter(t => t.completedDate === today).length;
  const pct     = total > 0 ? Math.round((done / total) * 100) : 0;

  const doneEl   = document.getElementById('daily-done-count');
  const totalEl  = document.getElementById('daily-total-count');
  const pbarEl   = document.getElementById('daily-pbar');
  const streakEl = document.getElementById('daily-streak-badge');

  if (doneEl)   doneEl.textContent  = done;
  if (totalEl)  totalEl.textContent = total;
  if (pbarEl)   pbarEl.style.width  = `${pct}%`;
  if (streakEl) streakEl.textContent = `🔥 ${state.dailyStats.dailyStreak}`;
}

/** Initialise the daily quest modal */
function initDailyModal() {
  document.querySelectorAll('#daily-difficulty-options .option-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#daily-difficulty-options .option-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedDailyDifficulty = btn.dataset.value;
    });
  });

  document.querySelectorAll('#daily-category-options .option-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#daily-category-options .option-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedDailyCategory = btn.dataset.value;
    });
  });

  document.getElementById('add-daily-btn').addEventListener('click', () => {
    resetDailyForm();
    openModal('daily-modal');
    setTimeout(() => document.getElementById('daily-title').focus(), 100);
  });

  document.getElementById('close-daily-modal').addEventListener('click', () => closeModal('daily-modal'));
  document.getElementById('cancel-daily-btn').addEventListener('click', () => closeModal('daily-modal'));
  document.getElementById('save-daily-btn').addEventListener('click', submitDailyTask);

  document.getElementById('daily-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal('daily-modal');
  });

  document.getElementById('daily-title').addEventListener('keydown', e => {
    if (e.key === 'Enter') submitDailyTask();
  });
}

function resetDailyForm() {
  document.getElementById('daily-title').value = '';
  document.getElementById('daily-desc').value  = '';
  selectedDailyDifficulty = 'easy';
  selectedDailyCategory   = 'work';
  document.querySelectorAll('#daily-difficulty-options .option-btn').forEach((b, i) =>
    b.classList.toggle('active', i === 0));
  document.querySelectorAll('#daily-category-options .option-btn').forEach((b, i) =>
    b.classList.toggle('active', i === 0));
}

function submitDailyTask() {
  const title = document.getElementById('daily-title').value.trim();
  if (!title) {
    document.getElementById('daily-title').focus();
    showToast('Please enter a quest title!', 'warning');
    return;
  }
  const desc = document.getElementById('daily-desc').value.trim();
  addDailyTask(title, desc, selectedDailyDifficulty, selectedDailyCategory);
  closeModal('daily-modal');
}

// ==========================================
// Reset Progress (Feature 1)
// ==========================================

/** Initialise the reset-all-progress modal */
function initResetModal() {
  const resetBtn    = document.getElementById('reset-progress-btn');
  const modal       = document.getElementById('reset-modal');
  const closeBtn    = document.getElementById('close-reset-modal');
  const cancelBtn   = document.getElementById('cancel-reset-btn');
  const confirmBtn  = document.getElementById('confirm-reset-btn');
  const confirmInput = document.getElementById('reset-confirm');

  resetBtn.addEventListener('click', () => {
    confirmInput.value  = '';
    confirmBtn.disabled = true;
    openModal('reset-modal');
    setTimeout(() => confirmInput.focus(), 100);
  });

  // Enable the button only when user has typed exactly "RESET"
  confirmInput.addEventListener('input', () => {
    confirmBtn.disabled = confirmInput.value.trim().toUpperCase() !== 'RESET';
  });

  confirmBtn.addEventListener('click', () => {
    if (confirmInput.value.trim().toUpperCase() !== 'RESET') return;
    // Wipe all localStorage keys and reload
    const keys = [
      'qm_tasks', 'qm_completedTasks', 'qm_rewards', 'qm_purchasedRewards',
      'qm_userStats', 'qm_activityLog', 'qm_dailyTasks', 'qm_dailyStats', 'qm_activeTimers',
    ];
    keys.forEach(k => localStorage.removeItem(k));
    location.reload();
  });

  closeBtn.addEventListener('click', () => closeModal('reset-modal'));
  cancelBtn.addEventListener('click', () => closeModal('reset-modal'));
  modal.addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal('reset-modal');
  });
}

// ==========================================
// Initialisation
// ==========================================

function init() {
  loadState();
  resetDailyTasksIfNewDay();  // Check and reset daily tasks if a new day has begun
  updateHeader();
  renderActiveTasks();
  renderCompletedTasks();
  updateCompletedCount();
  renderRewards();
  renderPurchasedRewards();
  renderDailyTasks();
  updateDailyProgress();
  renderImpact();
  initNav();
  initTaskModal();
  initRewardModal();
  initDailyModal();
  initResetModal();

  // Restore persisted timers and start the tick loop if any are active
  if (state.activeTimers.length > 0) {
    renderTimers();
    startTimerTick();
  }

  // Level-up overlay — click anywhere to dismiss early
  document.getElementById('levelup-overlay').addEventListener('click', () => {
    document.getElementById('levelup-overlay').classList.remove('show');
  });

  // Global Escape key closes any open modal
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeModal('task-modal');
      closeModal('reward-modal');
      closeModal('daily-modal');
      closeModal('reset-modal');
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
