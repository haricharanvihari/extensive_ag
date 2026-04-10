# URL Time Guard (Firefox Extension)

URL Time Guard is a productivity-focused Firefox extension that tracks time spent on selected websites and alerts users when daily limits are exceeded. It is designed to support mindful browsing by giving clear, real-time usage feedback without fully blocking access.

## Project Description

Many users lose focus due to unplanned time spent on high-distraction websites. URL Time Guard addresses this with a lightweight, configurable timer system:

- You choose which domains to track.
- You set per-site daily limits and snooze durations.
- The extension monitors active-tab time and updates usage continuously.
- Alerts appear when limits are crossed, with snooze support for temporary suppression.

This makes it useful for students, professionals, and anyone trying to reduce digital distractions while keeping full control of browsing.

## Key Features

- **Per-site tracking:** Add, edit, and remove domain rules.
- **Quick add from popup:** Add the current active website in a few clicks.
- **Flexible time limits:** Configure limits with minute + second precision.
- **Real-time badge feedback:**
  - Remaining time shown on badge while under limit.
  - Red `!` badge when limit is exceeded.
- **Limit alerts:** Browser notifications when a site crosses its limit.
- **Per-site snooze windows:** Temporarily pause repeated alerts for each site.
- **Master Timer toggle:** Pause/resume all tracking globally.
- **Per-site enable/disable:** Keep saved sites while turning individual limits on/off.
- **Backup and restore:** Export and import settings/data as JSON.
- **Reset today’s usage:** Quickly clear current day usage data.

## How It Works

1. A background script runs a 1-second ticker.
2. On each tick, it checks the currently active tab host.
3. If the host matches a tracked site, usage time is incremented.
4. Badge/title are updated to show remaining or exceeded state.
5. When over limit, a notification is sent (unless currently snoozed).

Only current-day usage is actively retained for live tracking behavior.

## Demo (Click below)
<a href="https://www.youtube.com/watch?v=29KCNZJGeG4">
  <img src="./icons/images/Screenshot20260410162156.png" width="400" alt="Watch the Demo here">
</a>

## Installation (Developer / Local)

1. Open Firefox and go to `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on**.
3. Select `manifest.json` from this project folder.
4. Pin the extension icon to the toolbar for quick access.

## Usage Guide

1. Open a target website in Firefox.
2. Click the extension icon to open the popup.
3. Set:
   - daily limit (minutes + seconds)
   - alert snooze duration (minutes + seconds)
4. Click **Add Current Site**.
5. Manage tracked sites from popup or options page:
   - edit domain/limit/snooze values
   - enable/disable site limits
   - delete site
6. When a limit is crossed:
   - badge changes to red `!`
   - notification appears
   - you can snooze alerts for that site

### Options Tools

In the options page, you can:

- Export all extension data as JSON.
- Import JSON backup to restore data.
- Reset today’s usage values.

## Permissions Used

- `tabs`: Detect active tab URL for host matching and time tracking.
- `storage`: Persist tracked sites, usage stats, and timer state.
- `notifications`: Show limit-exceeded alerts.
- `downloads`: Export JSON backup files to disk.
- `alarms`: Reserved in manifest for scheduling/extension timing workflows.

## Data and Privacy

- All data is stored locally using browser extension storage.
- No remote server calls are required for tracking.
- No account/login is needed.
- Export/import is user-initiated and file-based.

## Repository Structure

- `manifest.json`: Extension metadata and permissions.
- `background.js`: Tracking engine, alerts, and state orchestration.
- `popup.html` / `popup.js`: Quick daily controls.
- `options.html` / `options.js`: Full configuration and data tools.
- `icons/`: Extension and notification icons.
- `url_data/sites-data.json`: Example/export-compatible data file.
