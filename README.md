# ⚔️ Quest Manager

A **gamified task manager** single-page application built with vanilla HTML, CSS, and JavaScript — no frameworks, no dependencies beyond Google Fonts.

## Features

- **Quests (Tasks)** — Add tasks with title, description, difficulty (Easy / Medium / Hard / Epic), and category (Work, Study, Health, Personal, Creative). Complete or delete them at any time.
- **XP & Levels** — Earn XP on completion. Level formula: level N requires N × 100 XP to advance.
- **Coins** — Earn coins per difficulty. Spend them in the Reward Shop.
- **Reward Shop** — Create custom rewards with an emoji icon and coin price. Includes 3 default rewards. Purchase history is tracked.
- **Impact Dashboard** — Stats overview (total completed, today's count, current & best streak), 7-day activity bar chart, and breakdowns by category and difficulty.
- **Streak Tracking** — Consecutive days with at least one completed task.
- **Toast Notifications** — Non-blocking feedback for every action.
- **Level-Up Animation** — Full-screen overlay when you advance a level.
- **Persistent Storage** — All data saved to `localStorage`; survives page refreshes.

## File Structure

```
index.html   — App shell: header, nav, sections, modals
style.css    — All styles: dark theme, components, animations, responsive
app.js       — All logic: state, CRUD, XP/coins, streaks, charts, toasts
```

## Tech Stack

- Pure HTML5 / CSS3 / ES6+ JavaScript
- Google Fonts — Inter
- No build step required — open `index.html` in any modern browser

## Difficulty & Rewards

| Difficulty | XP  | Coins |
|------------|-----|-------|
| 🟢 Easy    | 10  | 5     |
| 🟡 Medium  | 25  | 15    |
| 🟠 Hard    | 50  | 30    |
| 🔴 Epic    | 100 | 60    |
