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

// Psychological mechanics constants
const DEBT_PAYOFF_XP_BONUS = 10;   // XP awarded when balance crosses from negative to zero
const INFLATION_INCREMENT  = 0.5;  // Price multiplier added per cheat-penalty press
const MS_PER_DAY           = 86400000; // Milliseconds in one day

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
  // ── Psychological mechanics ──
  inflationData: {
    multiplier:     1.0,   // current price multiplier (1 = no inflation, 1.5 = +50%, etc.)
    activatedDate:  null,  // 'YYYY-MM-DD' last activation date (reset at midnight)
    timesActivated: 0,     // total times ever activated
    maxMultiplier:  1.0,   // historical maximum multiplier
  },
  integrityData: {
    currentStreak:  0,     // consecutive days without cheating
    bestStreak:     0,     // record high streak
    timesReset:     0,     // how many times streak was manually reset
    lastUpdateDate: null,  // 'YYYY-MM-DD' when streak was last auto-incremented
  },
  debtStats: {
    timesWentNegative: 0,  // how many times balance dropped below 0
    biggestDebt:       0,  // absolute value of deepest negative balance
  },
  // ── Timer Stats ──
  timerStats: {
    completedOnTime:     0,  // tasks completed before deadline
    completedOverdue:    0,  // tasks completed after deadline
    penaltyQuestsCreated: 0, // total penalty quests auto-generated
    penaltyCoinsLost:    0,  // total coins lost via timer penalties
    bonusCoinsEarned:    0,  // total bonus coins earned for early completion
  },
  // ── Dreams ──
  dreams:          [],   // active dream goals
  completedDreams: [],   // achieved dream goals
  dreamStats: {
    created:      0,     // total dreams created
    achieved:     0,     // total dreams achieved
    xpFromDreams: 0,     // total XP earned from dreams
  },
  // ── Extension / Site Blocker ──
  blockedSites: [
    'youtube.com', 'tiktok.com', 'twitter.com', 'x.com',
    'instagram.com', 'reddit.com', 'twitch.tv', 'vk.com',
  ],
  // ── Daily Discount ──
  dailyDiscountData: {
    lastPurchaseDate: null,  // 'YYYY-MM-DD' of the last first-of-day purchase
    usedToday:        false, // whether today's discount has been used
  },
  // ── Daily Credit Limit ──
  creditData: {
    count:    0,    // number of credit purchases made today
    lastDate: null, // 'YYYY-MM-DD' of last credit use (used to detect new day)
  },
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
  localStorage.setItem('qm_inflationData',    JSON.stringify(state.inflationData));
  localStorage.setItem('qm_integrityData',    JSON.stringify(state.integrityData));
  localStorage.setItem('qm_debtStats',        JSON.stringify(state.debtStats));
  localStorage.setItem('qm_timerStats',       JSON.stringify(state.timerStats));
  localStorage.setItem('qm_dreams',          JSON.stringify(state.dreams));
  localStorage.setItem('qm_completedDreams', JSON.stringify(state.completedDreams));
  localStorage.setItem('qm_dreamStats',      JSON.stringify(state.dreamStats));
  localStorage.setItem('qm_blockedSites',    JSON.stringify(state.blockedSites));
  localStorage.setItem('qm_dailyDiscountData', JSON.stringify(state.dailyDiscountData));
  localStorage.setItem('qm_creditData',      JSON.stringify(state.creditData));
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

  // Load new psychological mechanics data (backward-compatible with existing saves)
  const savedInflation = parse('qm_inflationData', null);
  if (savedInflation) state.inflationData = { ...state.inflationData, ...savedInflation };

  const savedIntegrity = parse('qm_integrityData', null);
  if (savedIntegrity) state.integrityData = { ...state.integrityData, ...savedIntegrity };

  const savedDebt = parse('qm_debtStats', null);
  if (savedDebt) state.debtStats = { ...state.debtStats, ...savedDebt };

  // Load timer statistics (backward-compatible)
  const savedTimerStats = parse('qm_timerStats', null);
  if (savedTimerStats) state.timerStats = { ...state.timerStats, ...savedTimerStats };

  state.dreams          = parse('qm_dreams',          []);
  state.completedDreams = parse('qm_completedDreams', []);
  const savedDreamStats = parse('qm_dreamStats', null);
  if (savedDreamStats) state.dreamStats = { ...state.dreamStats, ...savedDreamStats };

  // Load blocked sites list (backward-compatible)
  const savedBlockedSites = parse('qm_blockedSites', null);
  if (savedBlockedSites) state.blockedSites = savedBlockedSites;

  // Load daily discount data (backward-compatible)
  const savedDailyDiscount = parse('qm_dailyDiscountData', null);
  if (savedDailyDiscount) state.dailyDiscountData = { ...state.dailyDiscountData, ...savedDailyDiscount };

  // Load daily credit limit data (backward-compatible)
  const savedCreditData = parse('qm_creditData', null);
  if (savedCreditData) state.creditData = { ...state.creditData, ...savedCreditData };
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

/**
 * Return half of a base reward value, rounded down.
 * Used for penalty quest rewards (50% of normal).
 * @param {number} base
 * @returns {number}
 */
function penaltyHalf(base) {
  return Math.floor(base / 2);
}

// ==========================================
// Task Timer Helpers
// ==========================================

/**
 * Check if a task's timer has expired.
 * @param {object} task
 * @param {number} now - current timestamp (ms)
 * @returns {boolean}
 */
function isTaskOverdue(task, now) {
  if (!task.timerDurationMs || !task.timerStartTime) return false;
  const deadline = new Date(task.timerStartTime).getTime() + task.timerDurationMs;
  return now >= deadline;
}

/**
 * Format milliseconds into a human-readable time string for task timers.
 * e.g. "1д 4ч 23м" for long durations, "45:12" for short ones.
 */
function formatTaskTime(ms) {
  if (ms <= 0) return '0:00';
  const totalSecs = Math.ceil(ms / 1000);
  const d  = Math.floor(totalSecs / 86400);
  const h  = Math.floor((totalSecs % 86400) / 3600);
  const m  = Math.floor((totalSecs % 3600) / 60);
  const s  = totalSecs % 60;

  if (d > 0) {
    // Long format: "1д 4ч 23м"
    const parts = [];
    if (d > 0) parts.push(`${d}д`);
    if (h > 0) parts.push(`${h}ч`);
    parts.push(`${m}м`);
    return parts.join(' ');
  }
  // Short format: "HH:MM" or "MM:SS"
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * Apply the penalty for a task whose timer has expired.
 * This is idempotent — checks timerExpiredPenaltyApplied flag.
 * @param {object} task - the task object (in state.tasks)
 * @param {boolean} showNotification - whether to show a toast
 */
function applyTaskPenalty(task, showNotification = true) {
  if (!task.penalty) return;
  if (task.timerExpiredPenaltyApplied) return;  // already applied

  task.timerExpiredPenaltyApplied = true;
  const penalty = task.penalty;

  // Deduct coins
  if (penalty.coins > 0) {
    const previousCoins = state.userStats.coins;
    state.userStats.coins -= penalty.coins;
    state.timerStats.penaltyCoinsLost += penalty.coins;

    if (previousCoins >= 0 && state.userStats.coins < 0) {
      state.debtStats.timesWentNegative++;
    }
    if (state.userStats.coins < 0) {
      const debtAbs = Math.abs(state.userStats.coins);
      if (debtAbs > state.debtStats.biggestDebt) {
        state.debtStats.biggestDebt = debtAbs;
      }
    }
    if (showNotification) {
      setTimeout(() => showToast(`💸 Штраф за просрочку: -${penalty.coins} 🪙  "${escapeHtml(task.title)}"`, 'error'), 200);
    }
  }

  // Create penalty quest
  if (penalty.questTitle && penalty.questTitle.trim()) {
    const penaltyTask = {
      id:          `task-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      title:       penalty.questTitle.trim(),
      desc:        `⚔️ Штрафной квест за просрочку: "${task.title}"`,
      difficulty:  penalty.questDifficulty || 'easy',
      category:    task.category,
      createdAt:   new Date().toISOString(),
      isPenaltyQuest: true,
      timerDurationMs: null,
      timerStartTime: null,
      bonus: null,
      penalty: null,
      timerExpiredPenaltyApplied: false,
    };
    state.tasks.unshift(penaltyTask);
    state.timerStats.penaltyQuestsCreated++;
    if (showNotification) {
      setTimeout(() => showToast(`⚔️ Штрафной квест добавлен: "${escapeHtml(penaltyTask.title)}"`, 'warning'), 600);
    }
  }
}

/**
 * Check all active tasks for expired timers and apply penalties.
 * Called on page load and periodically.
 */
function checkAndApplyExpiredPenalties() {
  const now = Date.now();
  let changed = false;

  state.tasks.forEach(task => {
    if (!task.isPenaltyQuest && isTaskOverdue(task, now) && !task.timerExpiredPenaltyApplied) {
      applyTaskPenalty(task, true);
      changed = true;
    }
  });

  if (changed) {
    saveState();
    renderActiveTasks();
    updateHeader();
    updateDebtWarning();
  }
}

/** Live-update the countdown displays on task cards (no full re-render) */
let taskTimerInterval = null;

function startTaskTimerTick() {
  if (taskTimerInterval) return;
  taskTimerInterval = setInterval(updateTaskTimerDisplays, 1000);
}

function updateTaskTimerDisplays() {
  const now = Date.now();
  let needFullRender = false;

  document.querySelectorAll('.task-timer[data-deadline]').forEach(el => {
    const deadline  = parseInt(el.dataset.deadline, 10);
    const duration  = parseInt(el.dataset.duration, 10);
    const remaining = deadline - now;
    const overdue   = remaining <= 0;
    const pctLeft   = Math.max(0, remaining / duration);

    // Check if it just became overdue
    if (overdue && !el.classList.contains('task-timer-red')) {
      needFullRender = true;
      return;
    }

    if (!overdue) {
      // Update color class
      el.classList.remove('task-timer-green', 'task-timer-yellow', 'task-timer-orange', 'task-timer-red');
      if (pctLeft < 0.25)      el.classList.add('task-timer-orange');
      else if (pctLeft < 0.50) el.classList.add('task-timer-yellow');
      else                     el.classList.add('task-timer-green');
      el.textContent = `⏱️ ${formatTaskTime(remaining)}`;
    }
  });

  if (needFullRender) {
    checkAndApplyExpiredPenalties();
    renderActiveTasks();
  }
}



/** Build a new task object */
function createTask(title, desc, difficulty, category, timerDurationMs, bonus, penalty, customReward, customRewardTimerMinutes, customRewardSite) {
  const now = new Date().toISOString();
  return {
    id:          `task-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    title,
    desc,
    difficulty,
    category,
    customReward: customReward || '',  // optional reward text shown on completion
    customRewardTimerMinutes: customRewardTimerMinutes || null,  // optional timer for custom reward (e.g. 20 minutes)
    customRewardSite: customRewardSite || null,  // optional site to unlock with custom reward (e.g. "youtube.com")
    createdAt:   now,
    // ── Timer ──
    timerDurationMs: timerDurationMs || null,  // null = no timer
    timerStartTime:  timerDurationMs ? now : null,
    // ── Bonus (earned if completed before deadline) ──
    bonus: timerDurationMs ? {
      coins:  bonus?.coins  || 0,
      pct:    bonus?.pct    || 0,
      custom: bonus?.custom || '',
    } : null,
    // ── Penalty (applied when timer expires) ──
    penalty: timerDurationMs ? {
      coins:          penalty?.coins          || 0,
      questTitle:     penalty?.questTitle     || '',
      questDifficulty: penalty?.questDifficulty || 'easy',
    } : null,
    // Status flags
    timerExpiredPenaltyApplied: false,  // true once penalty is applied
    isPenaltyQuest: false,              // true for auto-generated penalty tasks
  };
}

/** Add a new task to the active list */
function addTask(title, desc, difficulty, category, timerDurationMs, bonus, penalty, customReward, customRewardTimerMinutes, customRewardSite) {
  const task = createTask(title, desc, difficulty, category, timerDurationMs, bonus, penalty, customReward, customRewardTimerMinutes, customRewardSite);
  state.tasks.unshift(task);
  saveState();
  renderActiveTasks();
  showToast('Quest added! ⚔️', 'info');
  // Start task timer tick if this task has a timer
  if (timerDurationMs) startTaskTimerTick();
}

/** Mark an active task as complete, award XP + coins */
function completeTask(taskId) {
  const idx = state.tasks.findIndex(t => t.id === taskId);
  if (idx === -1) return;

  const task       = state.tasks.splice(idx, 1)[0];
  task.completedAt = new Date().toISOString();
  state.completedTasks.unshift(task);

  // Award XP and coins
  const diff           = DIFFICULTY[task.difficulty];
  const xpReward       = task.isPenaltyQuest ? penaltyHalf(diff.xp)    : diff.xp;
  const coinReward     = task.isPenaltyQuest ? penaltyHalf(diff.coins)  : diff.coins;
  const penaltyNote    = task.isPenaltyQuest ? ' (штрафной x0.5)' : '';
  const previousCoins  = state.userStats.coins;
  addXP(xpReward);
  state.userStats.coins            += coinReward;
  state.userStats.totalCoinsEarned += coinReward;

  // Detect debt payoff (balance crossed from negative to non-negative)
  checkDebtPayoff(previousCoins);

  // Record in activity log
  const today = todayStr();
  state.activityLog[today] = (state.activityLog[today] || 0) + 1;
  recalcStreak();

  // ── Timer bonus / penalty logic ──
  if (task.timerDurationMs && task.timerStartTime) {
    const deadline = new Date(task.timerStartTime).getTime() + task.timerDurationMs;
    const now      = Date.now();
    const isOnTime = now < deadline;

    if (isOnTime) {
      // Completed before deadline — award bonus
      state.timerStats.completedOnTime++;
      let bonusCoins = 0;
      const bonus = task.bonus || {};

      // Fixed bonus coins
      if (bonus.coins > 0) {
        bonusCoins += bonus.coins;
      }
      // Percentage bonus
      if (bonus.pct > 0) {
        bonusCoins += Math.round(diff.coins * bonus.pct / 100);
      }
      if (bonusCoins > 0) {
        state.userStats.coins            += bonusCoins;
        state.userStats.totalCoinsEarned += bonusCoins;
        state.timerStats.bonusCoinsEarned += bonusCoins;
      }

      const timeLeft = deadline - now;
      const timeLeftStr = formatTaskTime(timeLeft);
      const parts = [];
      if (bonusCoins > 0)    parts.push(`+${bonusCoins} 🪙 bonus`);
      if (bonus.pct > 0)     parts.push(`+${bonus.pct}% reward`);
      if (bonus.custom)      parts.push(`"${escapeHtml(bonus.custom)}"`);

      saveState();
      renderActiveTasks();
      renderCompletedTasks();
      updateHeader();
      updateCompletedCount();
      updateDebtWarning();
      showToast(`+${xpReward} XP  +${coinReward} 🪙${penaltyNote}  "${escapeHtml(task.title)}"`, 'success');
      setTimeout(() => {
        showToast(`🔥 Выполнено за ${timeLeftStr} до дедлайна!`, 'success');
        if (parts.length > 0) {
          setTimeout(() => showToast(`🎉 Бонус: ${parts.join(' · ')}`, 'success'), 600);
        }
        if (bonus.custom) {
          setTimeout(() => showToast(`🎁 Ты заслужил: ${escapeHtml(bonus.custom)}`, 'success'), 1200);
        }
        if (task.customReward) {
          setTimeout(() => showToast(`🎁 Награда: ${escapeHtml(task.customReward)}`, 'success'), bonus.custom ? 1800 : 1200);
        }
      }, 400);
    } else {
      // Completed after deadline — no bonus, penalty may have been applied already
      state.timerStats.completedOverdue++;
      // Apply penalty now if it wasn't applied automatically
      applyTaskPenalty(task, false);
      saveState();
      renderActiveTasks();
      renderCompletedTasks();
      updateHeader();
      updateCompletedCount();
      updateDebtWarning();
      showToast(`+${xpReward} XP  +${coinReward} 🪙${penaltyNote}  "${escapeHtml(task.title)}" (просрочено)`, 'warning');
      if (task.customReward) {
        setTimeout(() => showToast(`🎁 Награда: ${escapeHtml(task.customReward)}`, 'success'), 600);
      }
    }
  } else {
    // No timer — regular completion
    saveState();
    renderActiveTasks();
    renderCompletedTasks();
    updateHeader();
    updateCompletedCount();
    updateDebtWarning();
    showToast(`+${xpReward} XP  +${coinReward} 🪙${penaltyNote}  "${escapeHtml(task.title)}"`, 'success');
    if (task.customReward) {
      setTimeout(() => showToast(`🎁 Награда: ${escapeHtml(task.customReward)}`, 'success'), 600);
    }
  }

  // ── Custom Reward Timer (start site unlock timer after completion) ──
  if (task.customRewardTimerMinutes && task.customRewardSite) {
    setTimeout(() => {
      startTimer(
        task.customReward || `${task.customRewardSite} unlock`,
        '🎁',
        task.customRewardTimerMinutes,
        task.customRewardSite
      );
      showToast(`🔓 ${task.customRewardSite} разблокирован на ${task.customRewardTimerMinutes} минут!`, 'success');
    }, task.customReward ? 1200 : 600);
  }
}

/** Delete a task (active or completed) */
function deleteTask(taskId, fromCompleted = false) {
  // Penalty quests cannot be deleted — they must be completed
  if (!fromCompleted) {
    const task = state.tasks.find(t => t.id === taskId);
    if (task && task.isPenaltyQuest) {
      showToast('⚔️ Штрафной квест нельзя удалить — только выполнить!', 'warning');
      return;
    }
  }
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

/**
 * Add a custom reward to the shop.
 * @param {string}      title        - Display name of the reward
 * @param {string}      emoji        - Emoji icon
 * @param {number}      price        - Cost in coins
 * @param {number|null} timerMinutes - Optional countdown duration in minutes
 * @param {string|null} linkedSite   - Optional domain to unblock via the extension (e.g. "youtube.com")
 */
function addReward(title, emoji, price, timerMinutes, linkedSite) {
  const reward = {
    id:           `reward-${Date.now()}`,
    title,
    emoji:        emoji || '🎁',
    price:        parseInt(price, 10),
    timerMinutes: timerMinutes || null,  // optional countdown timer in minutes
    linkedSite:   linkedSite  || null,  // optional domain to unblock via extension
  };
  state.rewards.push(reward);
  saveState();
  renderRewards();
  showToast(`Reward "${escapeHtml(title)}" added!`, 'info');
  // Keep the extension in sync (so blocked.html can suggest this reward)
  if (extensionConnected) syncExtensionState();
}

/** Remove a reward from the shop */
function deleteReward(rewardId) {
  state.rewards = state.rewards.filter(r => r.id !== rewardId);
  saveState();
  renderRewards();
}

/** Calculate inflation-adjusted price for a reward */
function getInflatedPrice(basePrice) {
  return Math.ceil(basePrice * state.inflationData.multiplier);
}

/** Check if the daily first-purchase discount is available right now */
function isDailyDiscountAvailable() {
  const today = todayStr();
  if (state.dailyDiscountData.lastPurchaseDate === today && state.dailyDiscountData.usedToday) {
    return false; // already used today
  }
  return true;
}

/** Get today's discount percentage: 100% on weekends (Sat/Sun), 50% on weekdays */
function getDailyDiscountPercent() {
  const day = new Date().getDay(); // 0 = Sun, 6 = Sat
  return (day === 0 || day === 6) ? 100 : 50;
}

/** Apply daily discount to a price. Returns the discounted price (minimum 0). */
function applyDailyDiscount(price) {
  const pct = getDailyDiscountPercent();
  return Math.max(0, Math.ceil(price * (1 - pct / 100)));
}

/** Mark the daily discount as used for today */
function consumeDailyDiscount() {
  state.dailyDiscountData.lastPurchaseDate = todayStr();
  state.dailyDiscountData.usedToday = true;
}

/** Reset daily discount if a new day has started (called from init) */
function checkDailyDiscountReset() {
  const today = todayStr();
  if (state.dailyDiscountData.lastPurchaseDate !== today) {
    state.dailyDiscountData.usedToday = false;
    // Don't update lastPurchaseDate until an actual purchase happens
    saveState();
  }
}

// ── Daily Credit Limit ──
const DAILY_CREDIT_LIMIT = 3;

/** Returns true if the user has used all credit purchases for today */
function isCreditLimitReached() {
  const today = todayStr();
  if (state.creditData.lastDate !== today) return false;
  return state.creditData.count >= DAILY_CREDIT_LIMIT;
}

/** Reset the daily credit counter if a new calendar day has started */
function checkCreditLimitReset() {
  const today = todayStr();
  if (state.creditData.lastDate !== today) {
    state.creditData.count = 0;
    saveState();
  }
}

/** Returns the number of credit purchases made today */
function todayCreditCount() {
  return state.creditData.lastDate === todayStr() ? state.creditData.count : 0;
}

/** Purchase a reward — deduct coins (allows negative balance) and record history */
function buyReward(rewardId) {
  const reward = state.rewards.find(r => r.id === rewardId);
  if (!reward) return;

  let effectivePrice = getInflatedPrice(reward.price);

  // Apply daily first-purchase discount if available
  let discountApplied = false;
  let discountPct = 0;
  if (isDailyDiscountAvailable()) {
    discountPct = getDailyDiscountPercent();
    effectivePrice = applyDailyDiscount(effectivePrice);
    discountApplied = true;
    consumeDailyDiscount();
  }

  // Enforce daily credit limit: block if user can't afford and limit is reached
  const isOnCredit = state.userStats.coins < effectivePrice;
  if (isOnCredit) {
    checkCreditLimitReset();  // ensure count reflects the current calendar day
    if (isCreditLimitReached()) {
      showToast(`🚫 Лимит кредита исчерпан (${DAILY_CREDIT_LIMIT}/${DAILY_CREDIT_LIMIT} в день). Возвращайтесь завтра!`, 'warning');
      return;
    }
    // Consume one credit slot
    state.creditData.count++;
    state.creditData.lastDate = todayStr();
  }

  const previousCoins  = state.userStats.coins;

  state.userStats.coins -= effectivePrice;

  // Track debt statistics
  if (previousCoins >= 0 && state.userStats.coins < 0) {
    state.debtStats.timesWentNegative++;
  }
  if (state.userStats.coins < 0) {
    const debtAbs = Math.abs(state.userStats.coins);
    if (debtAbs > state.debtStats.biggestDebt) {
      state.debtStats.biggestDebt = debtAbs;
    }
  }

  const purchase = {
    ...reward,
    purchaseId:  `p-${Date.now()}`,
    purchasedAt: new Date().toISOString(),
    pricePaid:   effectivePrice,
  };
  state.purchasedRewards.unshift(purchase);

  // Start countdown timer BEFORE updateHeader/sync so the timer is in state
  // when the extension receives the sync data (prevents race condition)
  if (reward.timerMinutes) {
    startTimer(reward.title, reward.emoji, reward.timerMinutes, reward.linkedSite);
  }

  saveState();
  renderRewards();
  renderPurchasedRewards();
  updateHeader();
  updateDebtWarning();

  if (discountApplied && discountPct === 100) {
    showToast(`🎁 БЕСПЛАТНО (скидка выходного дня)! "${escapeHtml(reward.title)}" ${reward.emoji}`, 'success');
  } else if (discountApplied) {
    showToast(`🏷️ Скидка ${discountPct}%! "${escapeHtml(reward.title)}" ${reward.emoji} за ${effectivePrice} 🪙`, 'success');
  } else if (state.userStats.coins < 0) {
    showToast(`💳 Куплено в кредит: "${escapeHtml(reward.title)}" ${reward.emoji}. Баланс: ${state.userStats.coins} 🪙 (кредит: ${state.creditData.count}/${DAILY_CREDIT_LIMIT})`, 'warning');
  } else {
    showToast(`Bought "${escapeHtml(reward.title)}" ${reward.emoji} for ${effectivePrice} 🪙`, 'success');
  }
}

// ==========================================
// Render — Header
// ==========================================

/** Sync header level badge, XP bar, coin display, and integrity streak */
function updateHeader() {
  const { level, xp, coins } = state.userStats;
  const required = xpForLevel(level);
  const pct      = Math.min((xp / required) * 100, 100);

  document.getElementById('header-level').textContent = level;
  document.getElementById('xp-bar').style.width       = `${pct}%`;
  document.getElementById('xp-text').textContent      = `${xp} / ${required} XP`;

  const coinsEl   = document.getElementById('header-coins');
  const coinBadge = document.getElementById('coin-badge');
  coinsEl.textContent = coins;

  // Negative balance — red + pulsation
  if (coins < 0) {
    coinsEl.classList.add('coin-negative');
    if (coinBadge) coinBadge.classList.add('coin-badge-negative');
  } else {
    coinsEl.classList.remove('coin-negative');
    if (coinBadge) coinBadge.classList.remove('coin-badge-negative');
  }

  // Update integrity streak badge
  const iconEl  = document.getElementById('integrity-icon');
  const countEl = document.getElementById('integrity-count');
  if (iconEl)  iconEl.textContent  = getIntegrityIcon(state.integrityData.currentStreak);
  if (countEl) countEl.textContent = state.integrityData.currentStreak;

  // Keep extension stats in sync whenever the header updates
  if (extensionConnected) syncExtensionState();
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

  // Sort: penalty quests first, then overdue, then by creation time
  const now = Date.now();
  const sorted = [...state.tasks].sort((a, b) => {
    const aOverdue = isTaskOverdue(a, now);
    const bOverdue = isTaskOverdue(b, now);
    if (a.isPenaltyQuest && !b.isPenaltyQuest) return -1;
    if (!a.isPenaltyQuest && b.isPenaltyQuest) return 1;
    if (aOverdue && !bOverdue) return -1;
    if (!aOverdue && bOverdue) return 1;
    return 0;
  });

  container.innerHTML = sorted.map(task => renderTaskItem(task, false)).join('');
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
  const xpDisplay   = task.isPenaltyQuest ? penaltyHalf(diff.xp)    : diff.xp;
  const coinDisplay = task.isPenaltyQuest ? penaltyHalf(diff.coins) : diff.coins;
  const itemClass = completed ? 'completed' : '';

  // ── Timer display ──
  let timerHtml = '';
  if (!completed && task.timerDurationMs && task.timerStartTime) {
    const deadline   = new Date(task.timerStartTime).getTime() + task.timerDurationMs;
    const now        = Date.now();
    const remaining  = deadline - now;
    const overdue    = remaining <= 0;
    const pctLeft    = Math.max(0, remaining / task.timerDurationMs);

    let timerClass = 'task-timer-green';
    if (overdue)           timerClass = 'task-timer-red';
    else if (pctLeft < 0.25) timerClass = 'task-timer-orange';
    else if (pctLeft < 0.50) timerClass = 'task-timer-yellow';

    const display = overdue
      ? '⚠️ ПРОСРОЧЕНО'
      : `⏱️ ${formatTaskTime(remaining)}`;

    timerHtml = `<div class="task-timer ${timerClass}" data-task-id="${task.id}" data-deadline="${deadline}" data-duration="${task.timerDurationMs}">${display}</div>`;
  }

  // ── Penalty quest indicator ──
  const penaltyBadge = task.isPenaltyQuest
    ? `<span class="badge badge-penalty-quest">⚔️ ШТРАФНОЙ</span>`
    : '';

  // ── Overdue styling ──
  const overdueClass = (!completed && isTaskOverdue(task, Date.now())) ? ' task-overdue' : '';

  return `
    <div class="task-item ${itemClass}${overdueClass}${task.isPenaltyQuest ? ' task-penalty-quest' : ''}" data-id="${task.id}">
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
          <span class="xp-reward">+${xpDisplay} XP</span>
          <span class="coin-reward">+${coinDisplay} 🪙</span>
          ${penaltyBadge}
          ${task.isPenaltyQuest ? '<span class="badge badge-penalty-reward">⚔️ Штрафной — награда x0.5</span>' : ''}
          ${task.bonus && (task.bonus.coins > 0 || task.bonus.pct > 0 || task.bonus.custom) ? `<span class="badge-bonus-reward">🎁 Бонус</span>` : ''}
          ${task.customReward ? `<span class="badge-custom-reward">🎁 ${escapeHtml(task.customReward)}</span>` : ''}
          ${task.customRewardTimerMinutes && task.customRewardSite ? `<span class="badge-custom-reward">🔓 ${task.customRewardSite} · ${task.customRewardTimerMinutes} мин</span>` : ''}
        </div>
        ${timerHtml}
      </div>
      <div class="task-actions">
        ${!completed
          ? `<button class="btn btn-edit btn-sm" data-action="edit" data-id="${task.id}" title="Edit quest" aria-label="Edit">✏️</button>`
          : ''
        }
        ${!task.isPenaltyQuest
          ? `<button class="btn btn-danger btn-sm" data-action="delete" data-id="${task.id}" data-completed="${completed}" title="Delete quest" aria-label="Delete">✕</button>`
          : ''
        }
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
  container.querySelectorAll('[data-action="edit"]').forEach(btn => {
    btn.addEventListener('click', () => openTaskEditModal(btn.dataset.id));
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
    updateDailyDiscountBanner();
    return;
  }

  const multiplier = state.inflationData.multiplier;
  const isInflated = multiplier > 1.0;
  const discountAvailable = isDailyDiscountAvailable();
  const discountPct = discountAvailable ? getDailyDiscountPercent() : 0;

  container.innerHTML = state.rewards.map(r => {
    const basePrice      = r.price;
    const inflatedPrice  = getInflatedPrice(basePrice);
    // Show what the first purchase would cost with discount
    const discountedPrice = discountAvailable ? applyDailyDiscount(inflatedPrice) : inflatedPrice;
    const displayPrice    = discountAvailable ? discountedPrice : inflatedPrice;
    const canAfford       = state.userStats.coins >= displayPrice;

    // Price display
    let priceHtml;
    if (discountAvailable && discountPct === 100) {
      priceHtml = `<div class="reward-price">
        <span class="reward-price-original">🪙 ${inflatedPrice}</span>
        <span class="reward-price-discount">🎁 БЕСПЛАТНО</span>
      </div>`;
    } else if (discountAvailable) {
      priceHtml = `<div class="reward-price">
        <span class="reward-price-original">🪙 ${inflatedPrice}</span>
        <span class="reward-price-discount">🪙 ${discountedPrice} <small>🏷️-${discountPct}%</small></span>
      </div>`;
    } else if (isInflated) {
      priceHtml = `<div class="reward-price">
           <span class="reward-price-original">🪙 ${basePrice}</span>
           <span class="reward-price-inflated">🪙 ${inflatedPrice} <small>📈+${Math.round((multiplier - 1) * 100)}%</small></span>
         </div>`;
    } else {
      priceHtml = `<div class="reward-price"><span>🪙</span> ${basePrice}</div>`;
    }

    // Buy button: green when affordable, orange "on credit" when not, grey when limit reached
    const creditLimitReached = !canAfford && isCreditLimitReached();
    const buyLabel = canAfford ? 'Купить' : (creditLimitReached ? '🚫 Лимит' : '💳 В кредит');
    const buyClass = canAfford ? 'btn-green' : (creditLimitReached ? 'btn-disabled' : 'btn-credit');
    const buyDisabled = creditLimitReached ? 'disabled' : '';

    return `
    <div class="reward-card">
      <span class="reward-emoji">${escapeHtml(r.emoji)}</span>
      <div class="reward-title">${escapeHtml(r.title)}</div>
      ${r.timerMinutes ? `<div class="reward-timer-badge">⏱️ ${r.timerMinutes} min timer${r.linkedSite ? ` · 🔓 ${escapeHtml(r.linkedSite)}` : ''}</div>` : ''}
      ${priceHtml}
      ${!canAfford ? `<div class="credit-limit-info">💳 Кредит: ${todayCreditCount()}/${DAILY_CREDIT_LIMIT} сегодня</div>` : ''}
      <div class="reward-actions">
        <button class="btn ${buyClass} btn-sm" data-action="buy" data-id="${r.id}" ${buyDisabled}>${buyLabel}</button>
        <button class="btn btn-edit btn-sm" data-action="edit-reward" data-id="${r.id}" title="Edit reward">✏️</button>
        <button class="btn btn-danger btn-sm" data-action="del-reward" data-id="${r.id}" title="Remove reward">✕</button>
      </div>
    </div>`;
  }).join('');

  container.querySelectorAll('[data-action="buy"]').forEach(btn => {
    btn.addEventListener('click', () => buyReward(btn.dataset.id));
  });
  container.querySelectorAll('[data-action="del-reward"]').forEach(btn => {
    btn.addEventListener('click', () => deleteReward(btn.dataset.id));
  });
  container.querySelectorAll('[data-action="edit-reward"]').forEach(btn => {
    btn.addEventListener('click', () => openRewardEditModal(btn.dataset.id));
  });

  // Keep the inflation banner and debt warning in sync
  updateInflationBanner();
  updateDebtWarning();
  updateDailyDiscountBanner();
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
        <div class="purchased-price">-${r.pricePaid || r.price} 🪙</div>
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

  // Psychological mechanics stats
  document.getElementById('stat-integrity-streak').textContent = state.integrityData.currentStreak;
  document.getElementById('stat-integrity-best').textContent   = state.integrityData.bestStreak;
  document.getElementById('stat-integrity-resets').textContent = state.integrityData.timesReset;
  document.getElementById('stat-times-negative').textContent   = state.debtStats.timesWentNegative;
  document.getElementById('stat-biggest-debt').textContent     = state.debtStats.biggestDebt;
  document.getElementById('stat-times-inflated').textContent   = state.inflationData.timesActivated;

  // Timer stats
  document.getElementById('stat-completed-on-time').textContent  = state.timerStats.completedOnTime;
  document.getElementById('stat-completed-overdue').textContent  = state.timerStats.completedOverdue;
  document.getElementById('stat-penalty-quests').textContent     = state.timerStats.penaltyQuestsCreated;
  document.getElementById('stat-penalty-coins-lost').textContent = state.timerStats.penaltyCoinsLost;
  document.getElementById('stat-bonus-coins-earned').textContent = state.timerStats.bonusCoinsEarned;

  // Dreams stats
  const dreamsCreatedEl  = document.getElementById('stat-dreams-created');
  const dreamsAchievedEl = document.getElementById('stat-dreams-achieved');
  const dreamsXpEl       = document.getElementById('stat-dreams-xp');
  if (dreamsCreatedEl)  dreamsCreatedEl.textContent  = state.dreamStats.created;
  if (dreamsAchievedEl) dreamsAchievedEl.textContent = state.dreamStats.achieved;
  if (dreamsXpEl)       dreamsXpEl.textContent       = state.dreamStats.xpFromDreams;

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

let selectedDifficulty        = 'easy';
let selectedCategory          = 'work';
let selectedPenaltyDifficulty = 'easy';
let editingTaskId   = null;  // null = create mode, taskId = edit mode
let editingRewardId = null;  // null = create mode, rewardId = edit mode

function openTaskEditModal(taskId) {
  const task = state.tasks.find(t => t.id === taskId);
  if (!task) return;
  editingTaskId = taskId;
  document.querySelector('#task-modal .modal-title').textContent = 'Редактировать квест';
  document.getElementById('save-task-btn').textContent = 'Сохранить изменения';
  document.getElementById('task-title').value       = task.title;
  document.getElementById('task-desc').value        = task.desc || '';
  document.getElementById('task-custom-reward').value = task.customReward || '';
  document.getElementById('task-custom-reward-timer').value = task.customRewardTimerMinutes || '';
  document.getElementById('task-custom-reward-site').value = task.customRewardSite || '';
  selectedDifficulty = task.difficulty;
  document.querySelectorAll('#difficulty-options .option-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.value === task.difficulty));
  selectedCategory = task.category;
  document.querySelectorAll('#category-options .option-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.value === task.category));
  // Timer
  const timerSection    = document.getElementById('timer-section');
  const bonusSection    = document.getElementById('bonus-penalty-section');
  const timerArrow      = document.getElementById('timer-toggle-arrow');
  if (task.timerDurationMs && task.timerStartTime) {
    const deadline  = new Date(task.timerStartTime).getTime() + task.timerDurationMs;
    const remaining = Math.max(0, deadline - Date.now());
    if (remaining > 0) {
      const totalSecs = Math.ceil(remaining / 1000);
      const d = Math.floor(totalSecs / 86400);
      const h = Math.floor((totalSecs % 86400) / 3600);
      const m = Math.floor((totalSecs % 3600) / 60);
      document.getElementById('task-timer-days').value    = d > 0 ? d : '';
      document.getElementById('task-timer-hours').value   = h > 0 ? h : '';
      document.getElementById('task-timer-minutes').value = m > 0 ? m : '';
      timerSection.style.display = 'block';
      timerArrow.textContent     = '▲';
      bonusSection.style.display = 'block';
      if (task.bonus) {
        document.getElementById('task-bonus-coins').value  = task.bonus.coins  || '';
        document.getElementById('task-bonus-pct').value    = task.bonus.pct    || '';
        document.getElementById('task-bonus-custom').value = task.bonus.custom || '';
      }
      if (task.penalty) {
        document.getElementById('task-penalty-coins').value       = task.penalty.coins      || '';
        document.getElementById('task-penalty-quest-title').value = task.penalty.questTitle || '';
        selectedPenaltyDifficulty = task.penalty.questDifficulty || 'easy';
        document.querySelectorAll('#penalty-difficulty-options .option-btn').forEach(b =>
          b.classList.toggle('active', b.dataset.value === selectedPenaltyDifficulty));
      }
    } else {
      timerSection.style.display = 'none';
      timerArrow.textContent     = '▼';
      bonusSection.style.display = 'none';
    }
  } else {
    timerSection.style.display = 'none';
    timerArrow.textContent     = '▼';
    bonusSection.style.display = 'none';
    document.getElementById('task-timer-days').value    = '';
    document.getElementById('task-timer-hours').value   = '';
    document.getElementById('task-timer-minutes').value = '';
  }
  openModal('task-modal');
  setTimeout(() => document.getElementById('task-title').focus(), 100);
}

function updateTask(taskId, title, desc, difficulty, category, timerDurationMs, bonus, penalty, customReward, customRewardTimerMinutes, customRewardSite) {
  const task = state.tasks.find(t => t.id === taskId);
  if (!task) return;
  task.title        = title;
  task.desc         = desc;
  task.difficulty   = difficulty;
  task.category     = category;
  task.customReward = customReward || '';
  task.customRewardTimerMinutes = customRewardTimerMinutes || null;
  task.customRewardSite = customRewardSite || null;
  if (timerDurationMs) {
    task.timerDurationMs = timerDurationMs;
    task.timerStartTime  = new Date().toISOString();
    task.bonus           = bonus;
    task.penalty         = penalty;
    task.timerExpiredPenaltyApplied = false;
    startTaskTimerTick();
  } else {
    task.timerDurationMs = null;
    task.timerStartTime  = null;
    task.bonus           = null;
    task.penalty         = null;
    task.timerExpiredPenaltyApplied = false;
  }
  saveState();
  renderActiveTasks();
  showToast('Quest updated! ✏️', 'info');
}

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

  // Penalty difficulty selector
  document.querySelectorAll('#penalty-difficulty-options .option-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#penalty-difficulty-options .option-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedPenaltyDifficulty = btn.dataset.value;
    });
  });

  // Timer toggle
  document.getElementById('timer-toggle-btn').addEventListener('click', () => {
    const section = document.getElementById('timer-section');
    const arrow   = document.getElementById('timer-toggle-arrow');
    const visible = section.style.display !== 'none';
    section.style.display     = visible ? 'none' : 'block';
    arrow.textContent         = visible ? '▼' : '▲';
    // If collapsing, also hide bonus/penalty section
    if (visible) {
      document.getElementById('bonus-penalty-section').style.display = 'none';
    }
  });

  // Show/hide bonus+penalty sections when timer inputs change
  const timerInputs = ['task-timer-days', 'task-timer-hours', 'task-timer-minutes'];
  timerInputs.forEach(id => {
    document.getElementById(id).addEventListener('input', () => {
      const days    = parseInt(document.getElementById('task-timer-days').value,    10) || 0;
      const hours   = parseInt(document.getElementById('task-timer-hours').value,   10) || 0;
      const minutes = parseInt(document.getElementById('task-timer-minutes').value, 10) || 0;
      const hasTimer = (days + hours + minutes) > 0;
      document.getElementById('bonus-penalty-section').style.display = hasTimer ? 'block' : 'none';
    });
  });

  // Timer preset buttons (fill inputs)
  document.querySelectorAll('.task-preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('task-timer-days').value    = btn.dataset.d;
      document.getElementById('task-timer-hours').value   = btn.dataset.h;
      document.getElementById('task-timer-minutes').value = btn.dataset.m;
      document.querySelectorAll('.task-preset-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('bonus-penalty-section').style.display = 'block';
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
  document.getElementById('task-custom-reward').value = '';
  document.getElementById('task-custom-reward-timer').value = '';
  document.getElementById('task-custom-reward-site').value = '';
  document.getElementById('task-timer-days').value   = '';
  document.getElementById('task-timer-hours').value  = '';
  document.getElementById('task-timer-minutes').value = '';
  document.getElementById('task-bonus-coins').value  = '';
  document.getElementById('task-bonus-pct').value    = '';
  document.getElementById('task-bonus-custom').value = '';
  document.getElementById('task-penalty-coins').value = '';
  document.getElementById('task-penalty-quest-title').value = '';
  selectedDifficulty        = 'easy';
  selectedCategory          = 'work';
  selectedPenaltyDifficulty = 'easy';

  document.querySelectorAll('#difficulty-options .option-btn').forEach((b, i) =>
    b.classList.toggle('active', i === 0));
  document.querySelectorAll('#category-options .option-btn').forEach((b, i) =>
    b.classList.toggle('active', i === 0));
  document.querySelectorAll('#penalty-difficulty-options .option-btn').forEach((b, i) =>
    b.classList.toggle('active', i === 0));
  document.querySelectorAll('.task-preset-btn').forEach(b => b.classList.remove('active'));

  // Collapse timer section
  document.getElementById('timer-section').style.display       = 'none';
  document.getElementById('bonus-penalty-section').style.display = 'none';
  document.getElementById('timer-toggle-arrow').textContent    = '▼';
  editingTaskId = null;
  document.querySelector('#task-modal .modal-title').textContent = 'New Quest';
  document.getElementById('save-task-btn').textContent = 'Add Quest';
}

function submitTask() {
  const title = document.getElementById('task-title').value.trim();
  if (!title) {
    document.getElementById('task-title').focus();
    showToast('Please enter a quest title!', 'warning');
    return;
  }
  const desc = document.getElementById('task-desc').value.trim();

  // ── Timer ──
  const days    = parseInt(document.getElementById('task-timer-days').value,    10) || 0;
  const hours   = parseInt(document.getElementById('task-timer-hours').value,   10) || 0;
  const minutes = parseInt(document.getElementById('task-timer-minutes').value, 10) || 0;
  const totalMs = (days * 86400 + hours * 3600 + minutes * 60) * 1000;
  const timerDurationMs = totalMs > 0 ? totalMs : null;

  // ── Bonus ──
  const bonusCoins  = parseInt(document.getElementById('task-bonus-coins').value,  10) || 0;
  const bonusPct    = parseInt(document.getElementById('task-bonus-pct').value,    10) || 0;
  const bonusCustom = document.getElementById('task-bonus-custom').value.trim();
  const bonus = timerDurationMs ? { coins: bonusCoins, pct: bonusPct, custom: bonusCustom } : null;

  // ── Penalty ──
  const penaltyCoins      = parseInt(document.getElementById('task-penalty-coins').value, 10) || 0;
  const penaltyQuestTitle = document.getElementById('task-penalty-quest-title').value.trim();
  const penalty = timerDurationMs ? {
    coins:          penaltyCoins,
    questTitle:     penaltyQuestTitle,
    questDifficulty: selectedPenaltyDifficulty,
  } : null;

  // ── Custom Quest Reward ──
  const customReward = document.getElementById('task-custom-reward').value.trim();
  const customRewardTimerMinutes = parseInt(document.getElementById('task-custom-reward-timer').value, 10) || null;
  const customRewardSite = document.getElementById('task-custom-reward-site').value.trim().toLowerCase().replace(/^www\./, '') || null;

  if (editingTaskId) {
    updateTask(editingTaskId, title, desc, selectedDifficulty, selectedCategory, timerDurationMs, bonus, penalty, customReward, customRewardTimerMinutes, customRewardSite);
  } else {
    addTask(title, desc, selectedDifficulty, selectedCategory, timerDurationMs, bonus, penalty, customReward, customRewardTimerMinutes, customRewardSite);
  }
  closeModal('task-modal');
}

// ==========================================
// Reward Modal
// ==========================================

function openRewardEditModal(rewardId) {
  const reward = state.rewards.find(r => r.id === rewardId);
  if (!reward) return;
  editingRewardId = rewardId;
  document.querySelector('#reward-modal .modal-title').textContent = 'Редактировать награду';
  document.getElementById('save-reward-btn').textContent = 'Сохранить изменения';
  document.getElementById('reward-title').value = reward.title;
  document.getElementById('reward-emoji').value = reward.emoji || '';
  document.getElementById('reward-price').value = reward.price;
  document.getElementById('reward-timer').value = reward.timerMinutes || '';
  document.querySelectorAll('#reward-modal .preset-btn').forEach(b => b.classList.remove('active'));
  // Show linked-site selector if timer is set
  updateLinkedSiteVisibility();
  if (reward.linkedSite) {
    // Populate select first, then set value
    // If the linkedSite is in the blockedSites list, select it; otherwise use custom input
    if (state.blockedSites.includes(reward.linkedSite)) {
      populateLinkedSiteSelect(reward.linkedSite);
    } else {
      // Use custom domain input
      populateLinkedSiteSelect('__custom__');
      const customInput = document.getElementById('reward-linked-site-custom');
      if (customInput) {
        customInput.style.display = '';
        customInput.value = reward.linkedSite;
      }
    }
  } else {
    populateLinkedSiteSelect('');
  }
  openModal('reward-modal');
  setTimeout(() => document.getElementById('reward-title').focus(), 100);
}

function updateReward(rewardId, title, emoji, price, timerMinutes, linkedSite) {
  const reward = state.rewards.find(r => r.id === rewardId);
  if (!reward) return;
  reward.title        = title;
  reward.emoji        = emoji || '🎁';
  reward.price        = parseInt(price, 10);
  reward.timerMinutes = timerMinutes || null;
  reward.linkedSite   = linkedSite  || null;
  saveState();
  renderRewards();
  showToast(`Reward updated! ✏️`, 'info');
  if (extensionConnected) syncExtensionState();
}

function initRewardModal() {
  document.getElementById('add-reward-btn').addEventListener('click', () => {
    editingRewardId = null;
    document.querySelector('#reward-modal .modal-title').textContent = 'New Reward';
    document.getElementById('save-reward-btn').textContent = 'Add Reward';
    document.getElementById('reward-title').value = '';
    document.getElementById('reward-emoji').value = '';
    document.getElementById('reward-price').value = '';
    document.getElementById('reward-timer').value = '';
    // Reset linked-site to "no binding"
    populateLinkedSiteSelect('');
    const customInput = document.getElementById('reward-linked-site-custom');
    if (customInput) { customInput.value = ''; customInput.style.display = 'none'; }
    // Clear active preset highlight
    document.querySelectorAll('#reward-modal .preset-btn').forEach(b => b.classList.remove('active'));
    updateLinkedSiteVisibility();
    openModal('reward-modal');
    setTimeout(() => document.getElementById('reward-title').focus(), 100);
  });

  // Show/hide linked-site selector based on whether a timer is entered
  document.getElementById('reward-timer').addEventListener('input', updateLinkedSiteVisibility);

  // Timer preset quick-select buttons
  document.querySelectorAll('#reward-modal .preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('reward-timer').value = btn.dataset.minutes;
      document.querySelectorAll('#reward-modal .preset-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      updateLinkedSiteVisibility();
    });
  });

  // Show/hide custom domain input when "Other domain…" is selected
  document.getElementById('reward-linked-site').addEventListener('change', updateLinkedSiteCustomInput);

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
  const linkedSite   = timerMinutes ? getLinkedSiteValue() : null;

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
  // Validate custom domain input when "custom" is selected
  if (timerMinutes) {
    const sel = document.getElementById('reward-linked-site');
    if (sel && sel.value === '__custom__' && !linkedSite) {
      document.getElementById('reward-linked-site-custom').focus();
      showToast('Please enter a domain to link (e.g. discord.com)', 'warning');
      return;
    }
  }

  if (editingRewardId) {
    updateReward(editingRewardId, title, emoji, price, timerMinutes, linkedSite);
  } else {
    addReward(title, emoji, price, timerMinutes, linkedSite);
  }
  editingRewardId = null;
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
      if (target === 'dreams') { renderDreams(); renderAchievedDreams(); updateAchievedDreamsCount(); }
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
// Psychological Mechanics — Shared Helpers
// ==========================================

/**
 * Check if the user just paid off their debt (balance crossed from negative to non-negative).
 * Awards DEBT_PAYOFF_XP_BONUS XP and shows a celebration toast.
 * @param {number} previousCoins - Coin balance before the change
 */
function checkDebtPayoff(previousCoins) {
  if (previousCoins < 0 && state.userStats.coins >= 0) {
    addXP(DEBT_PAYOFF_XP_BONUS);
    saveState();
    updateHeader();
    setTimeout(() => showToast(`🎉 Долг погашен! Ты свободен! +${DEBT_PAYOFF_XP_BONUS} XP`, 'success'), 300);
  }
}

/** Update the debt-warning banner and progress bar in the rewards section */
function updateDebtWarning() {
  const debtWarning = document.getElementById('debt-warning');
  const debtBar     = document.getElementById('debt-bar');
  const debtLabel   = document.getElementById('debt-bar-label');
  if (!debtWarning) return;

  if (state.userStats.coins < 0) {
    debtWarning.style.display = 'block';
    const debtAmt  = Math.abs(state.userStats.coins);
    const maxRef   = Math.max(debtAmt, state.debtStats.biggestDebt, 1);
    const pct      = Math.min((debtAmt / maxRef) * 100, 100);
    if (debtBar)   debtBar.style.width = `${pct}%`;
    if (debtLabel) debtLabel.textContent = `Долг: ${debtAmt} 🪙 (до нуля: ${debtAmt})`;
  } else {
    debtWarning.style.display = 'none';
  }
}

/** Show or hide the inflation banner based on current multiplier */
function updateInflationBanner() {
  const banner = document.getElementById('inflation-banner');
  if (!banner) return;

  if (state.inflationData.multiplier > 1.0) {
    const pctIncrease = Math.round((state.inflationData.multiplier - 1) * 100);
    banner.style.display = 'block';
    const pctEl = document.getElementById('inflation-pct');
    if (pctEl) pctEl.textContent = pctIncrease;
  } else {
    banner.style.display = 'none';
  }
}

/** Show or hide the daily discount banner */
function updateDailyDiscountBanner() {
  const banner = document.getElementById('daily-discount-banner');
  if (!banner) return;

  if (isDailyDiscountAvailable()) {
    const pct = getDailyDiscountPercent();
    const isWeekend = pct === 100;
    const pctEl = document.getElementById('discount-pct');
    if (pctEl) pctEl.textContent = pct;
    const typeEl = document.getElementById('discount-type');
    if (typeEl) typeEl.textContent = isWeekend ? 'выходной' : 'будний день';
    banner.style.display = 'block';
  } else {
    banner.style.display = 'none';
  }
}

// ==========================================
// Mechanic 2 — Laziness Inflation
// ==========================================

/**
 * Check if inflation should be reset (date has changed since last activation).
 * Called on every page load.
 */
function checkInflationReset() {
  const today = todayStr();
  if (state.inflationData.activatedDate && state.inflationData.activatedDate !== today) {
    state.inflationData.multiplier    = 1.0;
    state.inflationData.activatedDate = null;
    saveState();
  }
}

/** Apply +50% price inflation (stacks per click, resets at midnight) */
function applyCheatPenalty() {
  const today = todayStr();
  // Add INFLATION_INCREMENT per press (rounded to avoid floating point drift)
  const precision = Math.round(1 / INFLATION_INCREMENT);
  state.inflationData.multiplier    = Math.round((state.inflationData.multiplier + INFLATION_INCREMENT) * precision) / precision;
  state.inflationData.activatedDate = today;
  state.inflationData.timesActivated++;
  if (state.inflationData.multiplier > state.inflationData.maxMultiplier) {
    state.inflationData.maxMultiplier = state.inflationData.multiplier;
  }

  // Cheat penalty also resets integrity streak
  doResetIntegrityStreak();

  saveState();
  renderRewards();
  updateHeader();

  const pct = Math.round((state.inflationData.multiplier - 1) * 100);
  showToast(`📈 Инфляция! +${pct}% к ценам до полуночи. Стрик сброшен.`, 'warning');
}

/** Initialise the Cheat Penalty confirmation modal */
function initCheatPenaltyModal() {
  const penaltyBtn  = document.getElementById('cheat-penalty-btn');
  const modal       = document.getElementById('cheat-penalty-modal');
  const closeBtn    = document.getElementById('close-cheat-penalty-modal');
  const cancelBtn   = document.getElementById('cancel-cheat-penalty-btn');
  const confirmBtn  = document.getElementById('confirm-cheat-penalty-btn');
  const infoEl      = document.getElementById('cheat-penalty-info');

  penaltyBtn.addEventListener('click', () => {
    const currentPct = Math.round((state.inflationData.multiplier - 1) * 100);
    const nextPct    = Math.round((state.inflationData.multiplier + 0.5 - 1) * 100);
    if (infoEl) {
      infoEl.textContent = currentPct > 0
        ? `Текущая инфляция: +${currentPct}%. После нажатия станет: +${nextPct}%.`
        : '';
    }
    openModal('cheat-penalty-modal');
  });

  confirmBtn.addEventListener('click', () => {
    applyCheatPenalty();
    closeModal('cheat-penalty-modal');
  });

  closeBtn.addEventListener('click',  () => closeModal('cheat-penalty-modal'));
  cancelBtn.addEventListener('click', () => closeModal('cheat-penalty-modal'));
  modal.addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal('cheat-penalty-modal');
  });
}

// ==========================================
// Mechanic 3 — Integrity Streak
// ==========================================

/** Return the emoji icon(s) for a given integrity streak length */
function getIntegrityIcon(days) {
  if (days >= 100) return '💎🔥';
  if (days >= 30)  return '⭐🔥';
  if (days >= 14)  return '🔥🔥🔥';
  if (days >= 7)   return '🔥🔥';
  return '🔥';
}

/** Return a motivational milestone message for a given streak milestone */
function getStreakMilestoneMessage(days) {
  const msgs = {
    3:   '🔥 3 дня без читерства! Отличное начало!',
    7:   '🔥🔥 Целая неделя честности! Потрясающе!',
    14:  '🔥🔥🔥 2 недели! Ты непобедим!',
    30:  '⭐🔥 30 дней! Месяц честного прогресса! 🏆',
    60:  '⭐🔥 60 дней! Ты настоящая легенда!',
    100: '💎🔥 100 ДНЕЙ БЕЗ ЧИТЕРСТВА! 💎 Ты — образец честности!',
  };
  return msgs[days] || `🔥 ${days} дней без читерства!`;
}

/**
 * Auto-increment integrity streak for each new day since the last update.
 * Called on every page load before rendering.
 */
function updateIntegrityStreakForNewDay() {
  const today = todayStr();

  if (state.integrityData.lastUpdateDate === null) {
    // First-ever launch — initialise
    state.integrityData.lastUpdateDate = today;
    saveState();
    return;
  }

  if (state.integrityData.lastUpdateDate === today) return;  // already updated today

  const lastDate  = new Date(state.integrityData.lastUpdateDate);
  const todayDate = new Date(today);
  const diffDays  = Math.round((todayDate - lastDate) / MS_PER_DAY);

  if (diffDays > 0) {
    const oldStreak = state.integrityData.currentStreak;
    state.integrityData.currentStreak  += diffDays;
    state.integrityData.lastUpdateDate  = today;

    if (state.integrityData.currentStreak > state.integrityData.bestStreak) {
      state.integrityData.bestStreak = state.integrityData.currentStreak;
    }

    // Check milestone notifications (show once per milestone crossing)
    const milestones = [3, 7, 14, 30, 60, 100];
    milestones.forEach(m => {
      if (oldStreak < m && state.integrityData.currentStreak >= m) {
        setTimeout(() => showToast(getStreakMilestoneMessage(m), 'success'), 800);
      }
    });

    saveState();
  }
}

/** Internal: reset streak counter and record the event (no side effects) */
function doResetIntegrityStreak() {
  state.integrityData.currentStreak  = 0;
  state.integrityData.timesReset++;
  state.integrityData.lastUpdateDate = todayStr();
}

/** Trigger a brief red flash on the whole screen */
function flashScreenRed() {
  const overlay = document.getElementById('red-flash-overlay');
  if (!overlay) return;
  overlay.classList.add('active');
  setTimeout(() => overlay.classList.remove('active'), 700);
}

/** Initialise the "I Cheated" streak-reset modal */
function initStreakResetModal() {
  const iCheatedBtn  = document.getElementById('i-cheated-btn');
  const modal        = document.getElementById('streak-reset-modal');
  const closeBtn     = document.getElementById('close-streak-reset-modal');
  const cancelBtn    = document.getElementById('cancel-streak-reset-btn');
  const confirmBtn   = document.getElementById('confirm-streak-reset-btn');
  const daysEl       = document.getElementById('streak-reset-days');

  iCheatedBtn.addEventListener('click', () => {
    if (daysEl) daysEl.textContent = state.integrityData.currentStreak;
    openModal('streak-reset-modal');
  });

  confirmBtn.addEventListener('click', () => {
    doResetIntegrityStreak();
    saveState();
    updateHeader();
    closeModal('streak-reset-modal');
    flashScreenRed();
    setTimeout(() => showToast('Стрик сброшен. Начни заново! 💪', 'warning'), 500);
  });

  closeBtn.addEventListener('click',  () => closeModal('streak-reset-modal'));
  cancelBtn.addEventListener('click', () => closeModal('streak-reset-modal'));
  modal.addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal('streak-reset-modal');
  });
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

/**
 * Start a new countdown timer for a reward.
 * @param {string}      title      - Reward name shown in the floating widget
 * @param {string}      emoji      - Emoji icon for the widget
 * @param {number}      minutes    - Timer duration in minutes
 * @param {string|null} linkedSite - Domain to unblock via the extension while the timer runs
 */
function startTimer(title, emoji, minutes, linkedSite) {
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
    linkedSite:      linkedSite || null,
  };
  state.activeTimers.push(timer);
  saveState();
  renderTimers();
  startTimerTick();
  showToast(`⏱️ Timer started: ${escapeHtml(title)} (${minutes} min)`, 'info');

  // Notify the extension to unblock the linked site
  if (linkedSite) {
    const msg = {
      type: 'QUESTLIFE_START_TIMER',
      data: {
        id:         timer.id,
        domain:     linkedSite,
        rewardName: title,
        duration:   minutes * 60,
      },
    };
    extensionSendMessage(msg);
    // Retry after 500ms — MV3 service worker may need time to wake up
    setTimeout(() => extensionSendMessage(msg), 500);
    // Force a full sync after 1s so extension can reconcile if both messages were lost
    if (extensionConnected) {
      setTimeout(() => syncExtensionState(), 1000);
    }
  }
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
    // Notify extension to resume block lift
    if (timer.linkedSite) {
      extensionSendMessage({ type: 'QUESTLIFE_RESUME_TIMER', data: { id: timerId } });
    }
  } else {
    // Pause: store remaining ms
    timer.pausedRemaining = Math.max(0, timer.endTime - Date.now());
    timer.paused          = true;
    // Notify extension to re-block while paused
    if (timer.linkedSite) {
      extensionSendMessage({ type: 'QUESTLIFE_PAUSE_TIMER', data: { id: timerId } });
    }
  }
  saveState();
  renderTimers();
}

/** Remove a timer */
function stopTimer(timerId) {
  const timer = state.activeTimers.find(t => t.id === timerId);
  if (timer && timer.linkedSite) {
    extensionSendMessage({ type: 'QUESTLIFE_STOP_TIMER', data: { id: timerId } });
  }
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

  if (needsFullRender) {
    renderTimers();
  } else {
    // Keep blocked-site statuses live (e.g. countdown minutes)
    refreshBlockedSiteStatuses();
  }
}

/** Render all floating timer widgets */
function renderTimers() {
  const container = document.getElementById('timers-container');
  if (!container) return;

  if (state.activeTimers.length === 0) {
    container.innerHTML = '';
    refreshBlockedSiteStatuses();
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
          <div class="timer-title">${escapeHtml(timer.title)}${timer.linkedSite ? ` <span class="timer-site-badge">🔓 ${escapeHtml(timer.linkedSite)}</span>` : ''}</div>
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

  // Update blocked-site status badges to reflect current timer state
  refreshBlockedSiteStatuses();
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
  const diff          = DIFFICULTY[task.difficulty];
  const previousCoins = state.userStats.coins;
  addXP(diff.xp);
  state.userStats.coins            += diff.coins;
  state.userStats.totalCoinsEarned += diff.coins;

  // Detect debt payoff
  checkDebtPayoff(previousCoins);

  // Record in activity log
  state.activityLog[today] = (state.activityLog[today] || 0) + 1;
  recalcStreak();

  saveState();
  renderDailyTasks();
  updateDailyProgress();
  updateHeader();
  updateDebtWarning();
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
        (new Date(today) - new Date(last)) / MS_PER_DAY
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

// ==========================================
// Dreams System
// ==========================================

let selectedDreamEmoji = '🌟';
let editingDreamId     = null;

/** Create and add a new dream */
function addDream(title, desc, emoji, xpReward, coinReward, customReward, totalStages, stageLabels, timerDurationMs, bonus, penalty) {
  const now = new Date().toISOString();
  const dream = {
    id:             `dream-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    title,
    desc,
    emoji:          emoji || '🌟',
    xpReward:       Math.max(1, parseInt(xpReward, 10) || 100),
    coinReward:     Math.max(0, parseInt(coinReward, 10) || 0),
    customReward:   customReward || '',
    totalStages:    Math.max(0, parseInt(totalStages, 10) || 0),
    completedStages: 0,
    stageLabels:    stageLabels || [],  // array of strings for each stage
    timerDurationMs: timerDurationMs || null,
    timerStartTime:  timerDurationMs ? now : null,
    timerExpiredPenaltyApplied: false,
    bonus: timerDurationMs ? { coins: bonus?.coins || 0, custom: bonus?.custom || '' } : null,
    penalty: timerDurationMs ? { coins: penalty?.coins || 0 } : null,
    createdAt: now,
    achievedAt: null,
  };
  state.dreams.unshift(dream);
  state.dreamStats.created++;
  saveState();
  renderDreams();
  renderAchievedDreams();
  updateAchievedDreamsCount();
  showToast('🌟 Мечта добавлена!', 'info');
}

/** Update an existing dream */
function updateDream(dreamId, title, desc, emoji, xpReward, coinReward, customReward, totalStages, stageLabels, timerDurationMs, bonus, penalty) {
  const dream = state.dreams.find(d => d.id === dreamId);
  if (!dream) return;
  dream.title        = title;
  dream.desc         = desc;
  dream.emoji        = emoji || '🌟';
  dream.xpReward     = Math.max(1, parseInt(xpReward, 10) || 100);
  dream.coinReward   = Math.max(0, parseInt(coinReward, 10) || 0);
  dream.customReward = customReward || '';
  dream.totalStages  = Math.max(0, parseInt(totalStages, 10) || 0);
  dream.stageLabels  = stageLabels || [];
  if (timerDurationMs) {
    dream.timerDurationMs = timerDurationMs;
    dream.timerStartTime  = new Date().toISOString();
    dream.timerExpiredPenaltyApplied = false;
    dream.bonus   = { coins: bonus?.coins || 0, custom: bonus?.custom || '' };
    dream.penalty = { coins: penalty?.coins || 0 };
  } else {
    dream.timerDurationMs = null;
    dream.timerStartTime  = null;
    dream.timerExpiredPenaltyApplied = false;
    dream.bonus   = null;
    dream.penalty = null;
  }
  saveState();
  renderDreams();
  showToast('Dream updated! ✏️', 'info');
}

/** Delete a dream */
function deleteDream(dreamId) {
  state.dreams = state.dreams.filter(d => d.id !== dreamId);
  saveState();
  renderDreams();
  showToast('Dream removed.', 'info');
}

/** Delete an achieved dream from history */
function deleteAchievedDream(dreamId) {
  state.completedDreams = state.completedDreams.filter(d => d.id !== dreamId);
  saveState();
  renderAchievedDreams();
  updateAchievedDreamsCount();
}

/** Mark one stage as completed and award partial rewards */
function completeStage(dreamId) {
  const dream = state.dreams.find(d => d.id === dreamId);
  if (!dream || dream.totalStages === 0 || dream.completedStages >= dream.totalStages) return;

  dream.completedStages++;
  const stageXp    = Math.floor(dream.xpReward    / dream.totalStages);
  const stageCoins = Math.floor(dream.coinReward   / dream.totalStages);
  const previousCoins = state.userStats.coins;
  addXP(stageXp);
  state.userStats.coins            += stageCoins;
  state.userStats.totalCoinsEarned += stageCoins;
  state.dreamStats.xpFromDreams    += stageXp;
  checkDebtPayoff(previousCoins);
  recalcStreak();
  const today = todayStr();
  state.activityLog[today] = (state.activityLog[today] || 0) + 1;
  saveState();
  renderDreams();
  updateHeader();
  updateDebtWarning();
  const stageLabel = (dream.stageLabels && dream.stageLabels[dream.completedStages - 1]) || `Этап ${dream.completedStages}`;
  showToast(`✅ ${escapeHtml(stageLabel)} (${dream.completedStages}/${dream.totalStages}) выполнен! +${stageXp} XP  +${stageCoins} 🪙`, 'success');
}

/** Achieve (complete) a dream */
function achieveDream(dreamId) {
  const idx = state.dreams.findIndex(d => d.id === dreamId);
  if (idx === -1) return;

  const dream = state.dreams.splice(idx, 1)[0];
  dream.achievedAt = new Date().toISOString();

  // Always award the full configured dream reward on achievement.
  // Stage completions are progressive partial bonuses — the complete
  // reward is only fully unlocked when the dream is achieved.
  const awardedXp    = dream.xpReward;
  const awardedCoins = dream.coinReward;

  // Check early completion bonus
  let bonusCoins = 0;
  if (dream.timerDurationMs && dream.timerStartTime) {
    const deadline = new Date(dream.timerStartTime).getTime() + dream.timerDurationMs;
    const now      = Date.now();
    if (now < deadline && dream.bonus) {
      bonusCoins = dream.bonus.coins || 0;
    }
  }

  const previousCoins = state.userStats.coins;
  addXP(awardedXp);
  state.userStats.coins            += awardedCoins + bonusCoins;
  state.userStats.totalCoinsEarned += awardedCoins + bonusCoins;
  state.dreamStats.xpFromDreams    += awardedXp;
  state.dreamStats.achieved++;

  const today = todayStr();
  state.activityLog[today] = (state.activityLog[today] || 0) + 1;
  recalcStreak();
  checkDebtPayoff(previousCoins);

  state.completedDreams.unshift(dream);
  saveState();
  renderDreams();
  renderAchievedDreams();
  updateAchievedDreamsCount();
  updateHeader();
  updateDebtWarning();

  showDreamAchieved(dream, awardedXp, awardedCoins, bonusCoins);
}

/** Check and apply expired penalties for dreams with timers */
function checkDreamPenalties() {
  const now = Date.now();
  let changed = false;
  state.dreams.forEach(dream => {
    if (dream.timerDurationMs && dream.timerStartTime && !dream.timerExpiredPenaltyApplied) {
      const deadline = new Date(dream.timerStartTime).getTime() + dream.timerDurationMs;
      if (now >= deadline) {
        dream.timerExpiredPenaltyApplied = true;
        if (dream.penalty && dream.penalty.coins > 0) {
          const previousCoins = state.userStats.coins;
          state.userStats.coins -= dream.penalty.coins;
          state.timerStats.penaltyCoinsLost += dream.penalty.coins;
          if (previousCoins >= 0 && state.userStats.coins < 0) {
            state.debtStats.timesWentNegative++;
          }
          if (state.userStats.coins < 0) {
            const debtAbs = Math.abs(state.userStats.coins);
            if (debtAbs > state.debtStats.biggestDebt) state.debtStats.biggestDebt = debtAbs;
          }
          // Small delay avoids the toast competing visually with the re-render triggered above
          setTimeout(() => showToast(`💸 Просрочена мечта: -${dream.penalty.coins} 🪙 "${escapeHtml(dream.title)}"`, 'error'), 200);
        }
        changed = true;
      }
    }
  });
  if (changed) {
    saveState();
    renderDreams();
    updateHeader();
    updateDebtWarning();
  }
}

/** Render active dreams */
function renderDreams() {
  const container = document.getElementById('dreams-list');
  if (!container) return;
  if (state.dreams.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🌟</div>
        <div class="empty-title">No dreams yet</div>
        <div class="empty-hint">Add a dream to track your biggest goals!</div>
      </div>`;
    return;
  }
  const now = Date.now();
  container.innerHTML = state.dreams.map(dream => renderDreamCard(dream, now)).join('');
  // Attach events
  container.querySelectorAll('[data-action="stage"]').forEach(btn =>
    btn.addEventListener('click', () => completeStage(btn.dataset.id)));
  container.querySelectorAll('[data-action="achieve"]').forEach(btn =>
    btn.addEventListener('click', () => achieveDream(btn.dataset.id)));
  container.querySelectorAll('[data-action="edit-dream"]').forEach(btn =>
    btn.addEventListener('click', () => openDreamEditModal(btn.dataset.id)));
  container.querySelectorAll('[data-action="delete-dream"]').forEach(btn =>
    btn.addEventListener('click', () => deleteDream(btn.dataset.id)));
}

/** Build HTML for a single dream card */
function renderDreamCard(dream, now) {
  // Progress bar + stage list
  let progressHtml = '';
  if (dream.totalStages > 0) {
    const pct = Math.round((dream.completedStages / dream.totalStages) * 100);
    const labels = dream.stageLabels || [];
    let stageListHtml = '';
    for (let i = 0; i < dream.totalStages; i++) {
      const done = i < dream.completedStages;
      const label = labels[i] || `Этап ${i + 1}`;
      stageListHtml += `
        <div class="dream-stage-item ${done ? 'done' : ''}">
          <span class="dream-stage-check">${done ? '✅' : '⬜'}</span>
          <span class="dream-stage-label">${escapeHtml(label)}</span>
        </div>`;
    }
    progressHtml = `
      <div class="dream-progress">
        <div class="dream-progress-label">
          <span>${dream.completedStages}/${dream.totalStages} этапов (${pct}%)</span>
        </div>
        <div class="dream-progress-bar-wrapper">
          <div class="dream-progress-bar" style="width:${pct}%"></div>
        </div>
        <div class="dream-stages-list">${stageListHtml}</div>
      </div>`;
  }
  // Timer
  let timerHtml = '';
  if (dream.timerDurationMs && dream.timerStartTime) {
    const deadline  = new Date(dream.timerStartTime).getTime() + dream.timerDurationMs;
    const remaining = deadline - now;
    const overdue   = remaining <= 0;
    const pctLeft   = Math.max(0, remaining / dream.timerDurationMs);
    let timerClass  = 'task-timer-green';
    if (overdue)             timerClass = 'task-timer-red';
    else if (pctLeft < 0.25) timerClass = 'task-timer-orange';
    else if (pctLeft < 0.50) timerClass = 'task-timer-yellow';
    const display = overdue ? '⚠️ ПРОСРОЧЕНО' : `⏱️ ${formatTaskTime(remaining)}`;
    timerHtml = `<div class="task-timer ${timerClass}" data-deadline="${deadline}" data-duration="${dream.timerDurationMs}">${display}</div>`;
  }
  // Stage button
  const stageBtn = dream.totalStages > 0 && dream.completedStages < dream.totalStages
    ? `<button class="btn btn-stage btn-sm" data-action="stage" data-id="${dream.id}">✅ Отметить этап</button>`
    : '';
  return `
    <div class="dream-card" data-id="${dream.id}">
      <div class="dream-card-glow"></div>
      <div class="dream-card-inner">
        <div class="dream-card-header">
          <span class="dream-emoji">${escapeHtml(dream.emoji)}</span>
          <div class="dream-card-title-block">
            <div class="dream-title">${escapeHtml(dream.title)}</div>
            ${dream.desc ? `<div class="dream-desc">${escapeHtml(dream.desc)}</div>` : ''}
          </div>
        </div>
        ${progressHtml}
        ${timerHtml}
        <div class="dream-rewards">
          <span class="xp-reward">+${dream.xpReward} XP</span>
          <span class="coin-reward">+${dream.coinReward} 🪙</span>
          ${dream.customReward ? `<span class="dream-custom-reward">🎁 ${escapeHtml(dream.customReward)}</span>` : ''}
        </div>
        <div class="dream-actions">
          ${stageBtn}
          <button class="btn btn-dream-achieve btn-sm" data-action="achieve" data-id="${dream.id}">🏆 Мечта достигнута!</button>
          <button class="btn btn-edit btn-sm" data-action="edit-dream" data-id="${dream.id}" title="Edit dream">✏️</button>
          <button class="btn btn-danger btn-sm" data-action="delete-dream" data-id="${dream.id}" title="Delete dream">🗑️</button>
        </div>
      </div>
    </div>`;
}

/** Render achieved dreams archive */
function renderAchievedDreams() {
  const container = document.getElementById('achieved-dreams-list');
  if (!container) return;
  if (state.completedDreams.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🏆</div>
        <div class="empty-title">No achieved dreams yet</div>
        <div class="empty-hint">Achieve your first dream!</div>
      </div>`;
    return;
  }
  container.innerHTML = state.completedDreams.map(dream => {
    const date = new Date(dream.achievedAt).toLocaleDateString('ru-RU', { day:'numeric', month:'long', year:'numeric' });
    return `
      <div class="dream-card dream-card-achieved" data-id="${dream.id}">
        <div class="dream-card-inner">
          <div class="dream-card-header">
            <span class="dream-emoji">${escapeHtml(dream.emoji)}</span>
            <div class="dream-card-title-block">
              <div class="dream-title">${escapeHtml(dream.title)}</div>
              <div class="dream-achieved-date">🏆 Достигнуто ${date}</div>
            </div>
          </div>
          ${dream.customReward ? `<div class="dream-custom-reward" style="margin-top:0.5rem;">🎁 ${escapeHtml(dream.customReward)}</div>` : ''}
          <div class="dream-actions" style="justify-content:flex-end;">
            <button class="btn btn-danger btn-sm" data-action="del-achieved" data-id="${dream.id}" title="Remove from history">🗑️</button>
          </div>
        </div>
      </div>`;
  }).join('');
  container.querySelectorAll('[data-action="del-achieved"]').forEach(btn =>
    btn.addEventListener('click', () => deleteAchievedDream(btn.dataset.id)));
}

/** Update achieved dreams count badge */
function updateAchievedDreamsCount() {
  const el = document.getElementById('achieved-dreams-count');
  if (el) el.textContent = state.completedDreams.length;
}

/** Show the epic "dream achieved" overlay */
function showDreamAchieved(dream, xpReward, coinReward, bonusCoins) {
  const overlay    = document.getElementById('dream-achieved-overlay');
  const nameEl     = document.getElementById('dream-achieved-name');
  const rewardsEl  = document.getElementById('dream-achieved-rewards');
  const customEl   = document.getElementById('dream-achieved-custom');
  if (!overlay) return;
  if (nameEl)    nameEl.textContent    = dream.title;
  if (rewardsEl) rewardsEl.textContent = `+${xpReward} XP  +${coinReward + bonusCoins} 🪙${bonusCoins > 0 ? ` (включая бонус +${bonusCoins} 🪙)` : ''}`;
  if (customEl)  customEl.textContent  = dream.customReward ? `🎁 ${dream.customReward}` : '';
  overlay.classList.add('show');
  // Auto-dismiss after 8s; user can also click anywhere to dismiss immediately
  setTimeout(() => overlay.classList.remove('show'), 8000);
  showToast(`🌟 МЕЧТА ДОСТИГНУТА: "${escapeHtml(dream.title)}"!`, 'success');
  setTimeout(() => showToast(`+${xpReward} XP  +${coinReward + bonusCoins} 🪙`, 'success'), 500);
  if (dream.customReward) {
    setTimeout(() => showToast(`🎁 ${escapeHtml(dream.customReward)}`, 'success'), 1000);
  }
}

/** Open the dream creation/edit modal */
function openDreamEditModal(dreamId) {
  const dream = state.dreams.find(d => d.id === dreamId);
  if (!dream) return;
  editingDreamId = dreamId;
  document.getElementById('dream-modal-title').textContent = 'Редактировать мечту';
  document.getElementById('save-dream-btn').textContent    = 'Сохранить изменения';
  selectedDreamEmoji = dream.emoji || '🌟';
  document.querySelectorAll('.dream-emoji-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.emoji === selectedDreamEmoji));
  document.getElementById('dream-title').value         = dream.title;
  document.getElementById('dream-desc').value          = dream.desc || '';
  document.getElementById('dream-custom-reward').value = dream.customReward || '';
  document.getElementById('dream-xp').value            = dream.xpReward;
  document.getElementById('dream-coins').value         = dream.coinReward;
  document.getElementById('dream-stages').value        = dream.totalStages || '';
  // Render stage label inputs with existing labels
  renderDreamStageInputs(dream.totalStages || 0, dream.stageLabels || []);
  const timerSection = document.getElementById('dream-timer-section');
  const bonusSection = document.getElementById('dream-bonus-penalty-section');
  const timerArrow   = document.getElementById('dream-timer-toggle-arrow');
  if (dream.timerDurationMs && dream.timerStartTime) {
    const deadline  = new Date(dream.timerStartTime).getTime() + dream.timerDurationMs;
    const remaining = Math.max(0, deadline - Date.now());
    if (remaining > 0) {
      const totalSecs = Math.ceil(remaining / 1000);
      const d = Math.floor(totalSecs / 86400);
      const h = Math.floor((totalSecs % 86400) / 3600);
      const m = Math.floor((totalSecs % 3600) / 60);
      document.getElementById('dream-timer-days').value    = d > 0 ? d : '';
      document.getElementById('dream-timer-hours').value   = h > 0 ? h : '';
      document.getElementById('dream-timer-minutes').value = m > 0 ? m : '';
      timerSection.style.display = 'block';
      timerArrow.textContent     = '▲';
      bonusSection.style.display = 'block';
      if (dream.bonus) {
        document.getElementById('dream-bonus-coins').value  = dream.bonus.coins  || '';
        document.getElementById('dream-bonus-custom').value = dream.bonus.custom || '';
      }
      if (dream.penalty) {
        document.getElementById('dream-penalty-coins').value = dream.penalty.coins || '';
      }
    } else {
      timerSection.style.display = 'none';
      timerArrow.textContent     = '▼';
      bonusSection.style.display = 'none';
    }
  } else {
    timerSection.style.display = 'none';
    timerArrow.textContent     = '▼';
    bonusSection.style.display = 'none';
    document.getElementById('dream-timer-days').value    = '';
    document.getElementById('dream-timer-hours').value   = '';
    document.getElementById('dream-timer-minutes').value = '';
  }
  openModal('dream-modal');
  setTimeout(() => document.getElementById('dream-title').focus(), 100);
}

/** Reset the dream form to defaults */
function resetDreamForm() {
  editingDreamId = null;
  selectedDreamEmoji = '🌟';
  document.getElementById('dream-modal-title').textContent = '🌟 New Dream';
  document.getElementById('save-dream-btn').textContent    = 'Add Dream';
  document.getElementById('dream-title').value         = '';
  document.getElementById('dream-desc').value          = '';
  document.getElementById('dream-custom-reward').value = '';
  document.getElementById('dream-xp').value            = '';
  document.getElementById('dream-coins').value         = '';
  document.getElementById('dream-stages').value        = '';
  renderDreamStageInputs(0, []);
  document.getElementById('dream-timer-days').value    = '';
  document.getElementById('dream-timer-hours').value   = '';
  document.getElementById('dream-timer-minutes').value = '';
  document.getElementById('dream-bonus-coins').value   = '';
  document.getElementById('dream-bonus-custom').value  = '';
  document.getElementById('dream-penalty-coins').value = '';
  document.querySelectorAll('.dream-emoji-btn').forEach((b, i) =>
    b.classList.toggle('active', b.dataset.emoji === '🌟'));
  document.querySelectorAll('.dream-preset-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('dream-timer-section').style.display       = 'none';
  document.getElementById('dream-bonus-penalty-section').style.display = 'none';
  document.getElementById('dream-timer-toggle-arrow').textContent    = '▼';
}

/** Submit the dream creation/edit form */
function submitDream() {
  const title = document.getElementById('dream-title').value.trim();
  if (!title) {
    document.getElementById('dream-title').focus();
    showToast('Please enter a dream title!', 'warning');
    return;
  }
  const desc         = document.getElementById('dream-desc').value.trim();
  const customReward = document.getElementById('dream-custom-reward').value.trim();
  const xpReward     = parseInt(document.getElementById('dream-xp').value,     10) || 100;
  const coinReward   = parseInt(document.getElementById('dream-coins').value,   10) || 0;
  const totalStages  = parseInt(document.getElementById('dream-stages').value,  10) || 0;

  // Collect stage labels from dynamic inputs
  const stageLabels = [];
  const stageContainer = document.getElementById('dream-stage-labels');
  if (stageContainer) {
    stageContainer.querySelectorAll('.dream-stage-input').forEach((input, i) => {
      stageLabels[i] = input.value.trim() || `Этап ${i + 1}`;
    });
  }

  const days    = parseInt(document.getElementById('dream-timer-days').value,    10) || 0;
  const hours   = parseInt(document.getElementById('dream-timer-hours').value,   10) || 0;
  const minutes = parseInt(document.getElementById('dream-timer-minutes').value, 10) || 0;
  const totalMs = (days * 86400 + hours * 3600 + minutes * 60) * 1000;
  const timerDurationMs = totalMs > 0 ? totalMs : null;

  const bonusCoins  = parseInt(document.getElementById('dream-bonus-coins').value,   10) || 0;
  const bonusCustom = document.getElementById('dream-bonus-custom').value.trim();
  const bonus       = timerDurationMs ? { coins: bonusCoins, custom: bonusCustom } : null;

  const penaltyCoins = parseInt(document.getElementById('dream-penalty-coins').value, 10) || 0;
  const penalty      = timerDurationMs ? { coins: penaltyCoins } : null;

  if (editingDreamId) {
    updateDream(editingDreamId, title, desc, selectedDreamEmoji, xpReward, coinReward, customReward, totalStages, stageLabels, timerDurationMs, bonus, penalty);
  } else {
    addDream(title, desc, selectedDreamEmoji, xpReward, coinReward, customReward, totalStages, stageLabels, timerDurationMs, bonus, penalty);
  }
  closeModal('dream-modal');
}

/**
 * Render dynamic stage label text inputs inside the dream modal.
 * @param {number} count — how many stages
 * @param {string[]} existingLabels — pre-filled labels (for editing)
 */
function renderDreamStageInputs(count, existingLabels) {
  const container = document.getElementById('dream-stage-labels');
  if (!container) return;
  if (count <= 0) {
    container.innerHTML = '';
    container.style.display = 'none';
    return;
  }
  container.style.display = 'block';
  const labels = existingLabels || [];
  let html = '<label class="form-label" style="margin-bottom:0.4rem;">Названия этапов</label>';
  for (let i = 0; i < count; i++) {
    const val = labels[i] || '';
    html += `<input class="form-input dream-stage-input" type="text" placeholder="Этап ${i + 1}" value="${escapeHtml(val)}" maxlength="100" style="margin-bottom:0.35rem;">`;
  }
  container.innerHTML = html;
}

/** Init the dream modal event listeners */
function initDreamModal() {
  document.querySelectorAll('.dream-emoji-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.dream-emoji-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedDreamEmoji = btn.dataset.emoji;
    });
  });

  document.getElementById('dream-timer-toggle-btn').addEventListener('click', () => {
    const section = document.getElementById('dream-timer-section');
    const arrow   = document.getElementById('dream-timer-toggle-arrow');
    const visible = section.style.display !== 'none';
    section.style.display = visible ? 'none' : 'block';
    arrow.textContent     = visible ? '▼' : '▲';
    if (visible) document.getElementById('dream-bonus-penalty-section').style.display = 'none';
  });

  const dreamTimerInputs = ['dream-timer-days', 'dream-timer-hours', 'dream-timer-minutes'];
  dreamTimerInputs.forEach(id => {
    document.getElementById(id).addEventListener('input', () => {
      const d = parseInt(document.getElementById('dream-timer-days').value,    10) || 0;
      const h = parseInt(document.getElementById('dream-timer-hours').value,   10) || 0;
      const m = parseInt(document.getElementById('dream-timer-minutes').value, 10) || 0;
      document.getElementById('dream-bonus-penalty-section').style.display = (d+h+m) > 0 ? 'block' : 'none';
    });
  });

  document.querySelectorAll('.dream-preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('dream-timer-days').value    = btn.dataset.d;
      document.getElementById('dream-timer-hours').value   = btn.dataset.h;
      document.getElementById('dream-timer-minutes').value = btn.dataset.m;
      document.querySelectorAll('.dream-preset-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('dream-bonus-penalty-section').style.display = 'block';
    });
  });

  // Dynamic stage label inputs — regenerate when stage count changes
  document.getElementById('dream-stages').addEventListener('input', () => {
    const count = Math.min(100, Math.max(0, parseInt(document.getElementById('dream-stages').value, 10) || 0));
    renderDreamStageInputs(count, []);
  });

  document.getElementById('add-dream-btn').addEventListener('click', () => {
    resetDreamForm();
    openModal('dream-modal');
    setTimeout(() => document.getElementById('dream-title').focus(), 100);
  });

  document.getElementById('close-dream-modal').addEventListener('click', () => closeModal('dream-modal'));
  document.getElementById('cancel-dream-btn').addEventListener('click', () => closeModal('dream-modal'));
  document.getElementById('save-dream-btn').addEventListener('click', submitDream);
  document.getElementById('dream-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal('dream-modal');
  });
  document.getElementById('dream-title').addEventListener('keydown', e => {
    if (e.key === 'Enter') submitDream();
  });

  // Dream achieved overlay — click anywhere to dismiss
  const dreamAchievedOverlay = document.getElementById('dream-achieved-overlay');
  if (dreamAchievedOverlay) {
    dreamAchievedOverlay.addEventListener('click', () => dreamAchievedOverlay.classList.remove('show'));
  }
}

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
      'qm_inflationData', 'qm_integrityData', 'qm_debtStats', 'qm_timerStats',
      'qm_dreams', 'qm_completedDreams', 'qm_dreamStats', 'qm_blockedSites',
      'qm_dailyDiscountData', 'qm_creditData',
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
// Chrome Extension Integration
// ==========================================

/** Whether the QuestLife extension is installed and responding */
let extensionConnected = false;

/**
 * Send a message to the background service worker via the content script bridge.
 * The content script listens for window.postMessage and forwards to chrome.runtime.
 */
function extensionSendMessage(message) {
  window.postMessage(message, '*');
}

/** Listen for messages relayed back from the extension */
window.addEventListener('message', event => {
  if (!event.data || typeof event.data !== 'object') return;
  if (event.data._from !== 'questlife_extension') return;

  const { type, data } = event.data;

  switch (type) {
    case 'QUESTLIFE_PONG':
      if (!extensionConnected) {
        extensionConnected = true;
        updateExtensionStatus(true);
        // Send current state to the extension on first connect
        syncExtensionState();
      }
      break;

    case 'QUESTLIFE_TIMER_EXPIRED': {
      // Extension tells us a timer has expired — mark it finished in site state
      const timer = state.activeTimers.find(t => t.id === data.id);
      if (timer && !timer.finished) {
        timer.finished = true;
        saveState();
        renderTimers();
        showToast(`⏰ Время вышло! ${escapeHtml(data.domain)} заблокирован`, 'warning');
      }
      break;
    }

    case 'QUESTLIFE_TIMER_PAUSED': {
      const pt = state.activeTimers.find(t => t.id === data.id);
      if (pt && !pt.finished) {
        pt.pausedRemaining = Math.max(0, pt.endTime - Date.now());
        pt.paused = true;
        saveState();
      }
      renderTimers();
      break;
    }

    case 'QUESTLIFE_TIMER_RESUMED': {
      const rt = state.activeTimers.find(t => t.id === data.id);
      if (rt && rt.paused) {
        rt.endTime = Date.now() + (rt.pausedRemaining || 0);
        rt.paused = false;
        rt.pausedRemaining = null;
        saveState();
        startTimerTick();
      }
      renderTimers();
      break;
    }

    case 'QUESTLIFE_TIMER_STOPPED': {
      // Extension stopped the timer — remove from site state too
      state.activeTimers = state.activeTimers.filter(t => t.id !== data.id);
      saveState();
      renderTimers();
      if (state.activeTimers.length === 0 && timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
      }
      break;
    }
  }
});

/** Update the extension status indicator in the UI */
function updateExtensionStatus(connected) {
  const icon = document.getElementById('ext-status-icon');
  const text = document.getElementById('ext-status-text');
  const link = document.getElementById('ext-install-link');
  if (!icon || !text) return;

  if (connected) {
    icon.textContent = '🧩';
    text.textContent = 'Расширение QuestLife подключено ✅';
    if (link) link.style.display = 'none';
  } else {
    icon.textContent = '⚠️';
    text.textContent = 'Расширение не установлено';
    if (link) link.style.display = 'inline';
  }
}

/** Sync current site state to the extension */
/** Sync current site state to the extension */
function syncExtensionState() {
  extensionSendMessage({
    type: 'QUESTLIFE_SYNC',
    data: {
      level:        state.userStats.level,
      coins:        state.userStats.coins,
      blockedSites: state.blockedSites,
      // Always send full active timer list so extension can reconcile
      // (add missing timers, remove orphans)
      activeTimers: state.activeTimers
        .filter(t => !t.finished)
        .map(t => ({
          id:         t.id,
          title:      t.title,
          emoji:      t.emoji,
          linkedSite: t.linkedSite,
          endTime:    t.endTime,
          totalMs:    t.totalMs,
          paused:     t.paused,
          pausedRemaining: t.pausedRemaining,
        })),
      // Include rewards so blocked.html can show "Buy and unlock" suggestions
      rewards:      state.rewards.map(r => ({
        id:           r.id,
        title:        r.title,
        emoji:        r.emoji,
        price:        r.price,
        timerMinutes: r.timerMinutes,
        linkedSite:   r.linkedSite || null,
      })),
    },
  });
}

/**
 * Show or hide the linked-site <select> in the reward modal
 * depending on whether a timer duration is entered.
 */
function updateLinkedSiteVisibility() {
  const timerVal = document.getElementById('reward-timer').value;
  const group    = document.getElementById('reward-linked-site-group');
  if (!group) return;
  const hasTimer = timerVal && parseInt(timerVal, 10) >= 1;
  group.style.display = hasTimer ? '' : 'none';
  if (!hasTimer) {
    // Also hide custom input when timer is cleared
    const customInput = document.getElementById('reward-linked-site-custom');
    if (customInput) customInput.style.display = 'none';
  }
}

/** Show or hide the custom domain input based on select value */
function updateLinkedSiteCustomInput() {
  const sel         = document.getElementById('reward-linked-site');
  const customInput = document.getElementById('reward-linked-site-custom');
  if (!sel || !customInput) return;
  if (sel.value === '__custom__') {
    customInput.style.display = '';
    customInput.focus();
  } else {
    customInput.style.display = 'none';
  }
}

/** Populate the linked-site <select> with the current blockedSites list + custom option */
function populateLinkedSiteSelect(preserveValue) {
  const sel = document.getElementById('reward-linked-site');
  if (!sel) return;
  // Remember the previously selected value so we can restore it
  const prev = preserveValue !== undefined ? preserveValue : sel.value;

  sel.innerHTML = '<option value="">— Нет привязки —</option>';

  // Collect all domains: saved list + any extras already shown
  const domains = [...state.blockedSites];

  domains.forEach(domain => {
    const opt = document.createElement('option');
    opt.value       = domain;
    opt.textContent = domain;
    sel.appendChild(opt);
  });

  // "Enter custom domain" option at the bottom
  const customOpt = document.createElement('option');
  customOpt.value       = '__custom__';
  customOpt.textContent = '🌐 Другой домен…';
  sel.appendChild(customOpt);

  // Restore previous value
  if (prev === '__custom__') {
    sel.value = '__custom__';
  } else if (prev) {
    // If the previous value is a domain not in the list, add it temporarily
    const exists = domains.includes(prev);
    if (!exists) {
      const tmpOpt = document.createElement('option');
      tmpOpt.value       = prev;
      tmpOpt.textContent = prev;
      // Insert before the custom option
      sel.insertBefore(tmpOpt, customOpt);
    }
    sel.value = prev;
  }
}

/**
 * Get the resolved linked-site value from the modal:
 * either the selected domain or the custom input value.
 */
function getLinkedSiteValue() {
  const sel = document.getElementById('reward-linked-site');
  if (!sel) return null;
  if (sel.value === '__custom__') {
    const customInput = document.getElementById('reward-linked-site-custom');
    const raw = customInput ? customInput.value.trim().toLowerCase().replace(/^www\./, '').replace(/\/.*$/, '') : '';
    return raw || null;
  }
  return sel.value || null;
}


/**
 * Find an active (running or paused, not yet finished) timer for a given domain.
 * @param {string} domain
 * @returns {object|undefined}
 */
function findActiveTimerForDomain(domain) {
  const now = Date.now();
  return state.activeTimers.find(t =>
    t.linkedSite === domain && !t.finished &&
    (t.paused || t.endTime > now)
  );
}

/** Build the HTML string for a blocked-site status badge */
function blockedSiteStatusHtml(domain) {
  const now   = Date.now();
  const timer = findActiveTimerForDomain(domain);
  if (timer) {
    if (timer.paused) {
      const remainMin = Math.ceil((timer.pausedRemaining || 0) / 60000);
      return `<span class="blocked-site-status unlocked">🔓 На паузе (${remainMin} мин)</span>`;
    }
    const remainMin = Math.ceil(Math.max(0, timer.endTime - now) / 60000);
    return `<span class="blocked-site-status unlocked">🔓 Открыт (${remainMin} мин)</span>`;
  }
  return `<span class="blocked-site-status blocked">🔒 Заблокирован</span>`;
}

/** Render the blocked-sites management list in the rewards section with timer status */
function renderBlockedSites() {
  populateLinkedSiteSelect();

  const list = document.getElementById('blocked-sites-list');
  if (!list) return;

  if (state.blockedSites.length === 0) {
    list.innerHTML = '<div style="color:var(--text-muted);font-size:0.85rem;padding:0.4rem 0;">Список пуст</div>';
    return;
  }

  list.innerHTML = state.blockedSites.map(domain => `
    <div class="blocked-site-item" data-domain="${escapeHtml(domain)}">
      <span class="blocked-site-domain">${escapeHtml(domain)}</span>
      ${blockedSiteStatusHtml(domain)}
      <button class="btn btn-ghost btn-sm blocked-site-remove" data-domain="${escapeHtml(domain)}" title="Удалить">✕</button>
    </div>`).join('');

  list.querySelectorAll('.blocked-site-remove').forEach(btn => {
    btn.addEventListener('click', () => removeBlockedSite(btn.dataset.domain));
  });
}

/**
 * Lightweight refresh of the blocked-site status badges only (no DOM rebuild).
 * Called from the timer tick so statuses stay live without rebuilding the full list.
 */
function refreshBlockedSiteStatuses() {
  const list = document.getElementById('blocked-sites-list');
  if (!list) return;

  list.querySelectorAll('.blocked-site-item').forEach(item => {
    const domain = item.dataset.domain;
    if (!domain) return;
    const statusEl = item.querySelector('.blocked-site-status');
    if (!statusEl) return;

    const timer = findActiveTimerForDomain(domain);
    const now   = Date.now();

    if (timer) {
      statusEl.className = 'blocked-site-status unlocked';
      if (timer.paused) {
        const remainMin = Math.ceil((timer.pausedRemaining || 0) / 60000);
        statusEl.textContent = `🔓 На паузе (${remainMin} мин)`;
      } else {
        const remainMin = Math.ceil(Math.max(0, timer.endTime - now) / 60000);
        statusEl.textContent = `🔓 Открыт (${remainMin} мин)`;
      }
    } else {
      statusEl.className  = 'blocked-site-status blocked';
      statusEl.textContent = '🔒 Заблокирован';
    }
  });
}

/** Add a domain to the blocked-sites list */
function addBlockedSite(domain) {
  domain = domain.trim().toLowerCase().replace(/^www\./, '').replace(/\/.*$/, '');
  if (!domain) return;
  if (state.blockedSites.includes(domain)) {
    showToast(`${domain} уже в списке`, 'info');
    return;
  }
  state.blockedSites.push(domain);
  saveState();
  renderBlockedSites();
  // Notify extension
  extensionSendMessage({ type: 'QUESTLIFE_SYNC', data: { blockedSites: state.blockedSites } });
  showToast(`🔒 ${domain} добавлен в список`, 'success');
}

/** Remove a domain from the blocked-sites list */
function removeBlockedSite(domain) {
  state.blockedSites = state.blockedSites.filter(d => d !== domain);
  saveState();
  renderBlockedSites();
  extensionSendMessage({ type: 'QUESTLIFE_SYNC', data: { blockedSites: state.blockedSites } });
  showToast(`🔓 ${domain} удалён из списка`, 'info');
}

/** Initialise the blocked-sites UI (add-site input + button) */
function initBlockedSitesUI() {
  const addBtn   = document.getElementById('add-blocked-site-btn');
  const addInput = document.getElementById('new-blocked-site');
  if (!addBtn || !addInput) return;

  const doAdd = () => {
    const val = addInput.value.trim();
    if (!val) return;
    addBlockedSite(val);
    addInput.value = '';
  };

  addBtn.addEventListener('click', doAdd);
  addInput.addEventListener('keydown', e => { if (e.key === 'Enter') doAdd(); });
}

// ==========================================
// Initialisation
// ==========================================

function init() {
  loadState();
  resetDailyTasksIfNewDay();     // Check and reset daily tasks if a new day has begun
  checkInflationReset();         // Reset inflation if date has changed
  checkDailyDiscountReset();     // Reset daily first-purchase discount if new day
  checkCreditLimitReset();       // Reset daily credit counter if new day
  updateIntegrityStreakForNewDay(); // Auto-increment integrity streak for new day(s)
  checkAndApplyExpiredPenalties(); // Apply any pending task timer penalties on load
  updateHeader();
  renderActiveTasks();
  renderCompletedTasks();
  updateCompletedCount();
  renderRewards();
  renderPurchasedRewards();
  renderDailyTasks();
  updateDailyProgress();
  renderImpact();
  updateDebtWarning();
  updateInflationBanner();
  initNav();
  initTaskModal();
  initRewardModal();
  initDailyModal();
  initResetModal();
  initCheatPenaltyModal();
  initStreakResetModal();
  checkDreamPenalties();
  initDreamModal();
  renderDreams();
  renderAchievedDreams();
  updateAchievedDreamsCount();

  // Extension integration
  renderBlockedSites();
  initBlockedSitesUI();
  updateExtensionStatus(false);   // default: not connected until PONG
  // Ping the extension — the content script will reply with QUESTLIFE_PONG
  extensionSendMessage({ type: 'QUESTLIFE_PING' });
  // If pong doesn't arrive within 1 second, assume extension is absent
  setTimeout(() => {
    if (!extensionConnected) updateExtensionStatus(false);
  }, 1000);

  // Restore persisted timers and start the tick loop if any are active
  if (state.activeTimers.length > 0) {
    renderTimers();
    startTimerTick();
  }

  // Start task timer tick if any active tasks have timers
  if (state.tasks.some(t => t.timerDurationMs && !isTaskOverdue(t, Date.now()))) {
    startTaskTimerTick();
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
      closeModal('cheat-penalty-modal');
      closeModal('streak-reset-modal');
      closeModal('dream-modal');
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
