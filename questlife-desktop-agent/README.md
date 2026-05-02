# QuestLife Desktop Agent

Windows-only companion for QuestLife. It watches the foreground app, counts seconds per process, and exposes local stats for the website at `http://127.0.0.1:17321/stats`.

## Start

From this folder:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\Start-QuestLifeAgent.ps1
```

Keep the PowerShell window open while you want app time tracking to work.

## Configure Apps

Edit `config.json` and add process names to `trackedApps`.

The agent still records all foreground apps it sees, but `trackedApps` decides what counts toward the highlighted "games/tracked" total in QuestLife.

## Test

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\Start-QuestLifeAgent.ps1 -Once
```

