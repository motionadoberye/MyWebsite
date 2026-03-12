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

---

## 🧩 QuestLife Chrome Extension — Site Blocker

The `questlife-extension/` folder contains a **Chrome Manifest V3** extension that:

- **Blocks distracting sites** (YouTube, TikTok, Twitter, Instagram, Reddit, Twitch, VK, etc.) by default using `chrome.declarativeNetRequest`
- **Unblocks sites** automatically when you purchase a timed reward in QuestLife (e.g. "1 час YouTube 🎬")
- **Pauses / resumes** the unlock timer — while paused the site is blocked again
- Shows a **beautiful blocked page** with a motivational quote and a button to open QuestLife
- **Syncs** level, coins, and the blocked-sites list with the QuestLife website in real time

### File Structure

```
questlife-extension/
├── manifest.json   — Manifest V3 config
├── background.js   — Service worker: blocking rules, timers, alarms
├── popup.html/css/js — Extension popup (dark theme)
├── content.js      — Bridge: postMessage ↔ chrome.runtime
├── blocked.html/css/js — Blocked-site placeholder page
├── rules.json      — Initial (empty) declarativeNetRequest rules
└── icons/          — icon16/48/128.png
```

### How to Install (Developer Mode)

1. Open Chrome and navigate to `chrome://extensions`
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **Load unpacked**
4. Select the `questlife-extension/` folder
5. The QuestLife icon will appear in your toolbar 🎉

### How to Connect to the Site

1. Open the [QuestLife website](https://motionadoberye.github.io/MyWebsite/)
2. The extension detects the site automatically — you should see **"Расширение QuestLife подключено ✅"** in the Rewards section
3. The current blocked-sites list is sent to the extension on every page load

### How Site-Unlocking Works

1. Go to the **Reward Shop**
2. Create (or edit) a reward — enable the **Timer Duration** and pick a **Linked Site** from the dropdown (e.g. `youtube.com` for 60 minutes)
3. Buy the reward — the extension immediately unblocks the domain
4. A floating timer widget appears on the page with **⏸ Pause** / **✕ Stop** controls
5. When you pause, the site is blocked again and the timer stops — resume when ready
6. When the timer expires, the site is blocked automatically and you get a browser notification

### Blocked Sites Management

In the Rewards section, expand **"🔒 Заблокированные сайты"** to:
- See the current list with live block/unlock status
- Add custom domains (e.g. `twitch.tv`)
- Remove domains you don't want to block

All changes are synced to the extension instantly.
