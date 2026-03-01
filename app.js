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
  { id: 'r-default-1', title: 'Пицца',       emoji: '🍕', price: 50  },
  { id: 'r-default-2', title: 'Час Netflix',  emoji: '🎬', price: 30  },
  { id: 'r-default-3', title: 'Новая игра',   emoji: '🎮', price: 200 },
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
  activityLog: {},  // { "YYYY-MM-DD": completedCount }
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

  const savedStats       = parse('qm_userStats', null);
  if (savedStats) {
    state.userStats = { ...state.userStats, ...savedStats };
  }
}

// ==========================================
// XP & Level System
// ==========================================

/**
 * XP required to advance from level N to N+1.
 * Formula: level N → needs N * 100 XP.
 */
function xpForLevel(level) {
  return level * 100;
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
function createTask(title, desc, difficulty, category) {
  return {
    id:        `task-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    title,
    desc,
    difficulty,
    category,
    createdAt: new Date().toISOString(),
  };
}

/** Add a new task to the active list */
function addTask(title, desc, difficulty, category) {
  const task = createTask(title, desc, difficulty, category);
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
function addReward(title, emoji, price) {
  const reward = {
    id:    `reward-${Date.now()}`,
    title,
    emoji: emoji || '🎁',
    price: parseInt(price, 10),
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
  document.getElementById('task-title').value = '';
  document.getElementById('task-desc').value  = '';
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
  const desc = document.getElementById('task-desc').value.trim();
  addTask(title, desc, selectedDifficulty, selectedCategory);
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
    openModal('reward-modal');
    setTimeout(() => document.getElementById('reward-title').focus(), 100);
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
  const title = document.getElementById('reward-title').value.trim();
  const emoji = document.getElementById('reward-emoji').value.trim();
  const price = parseInt(document.getElementById('reward-price').value, 10);

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

  addReward(title, emoji, price);
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
// Initialisation
// ==========================================

function init() {
  loadState();
  updateHeader();
  renderActiveTasks();
  renderCompletedTasks();
  updateCompletedCount();
  renderRewards();
  renderPurchasedRewards();
  renderImpact();
  initNav();
  initTaskModal();
  initRewardModal();

  // Level-up overlay — click anywhere to dismiss early
  document.getElementById('levelup-overlay').addEventListener('click', () => {
    document.getElementById('levelup-overlay').classList.remove('show');
  });

  // Global Escape key closes any open modal
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeModal('task-modal');
      closeModal('reward-modal');
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
