# AlgoVault

A Chrome Extension that automatically vaults your accepted LeetCode solutions to GitHub with smart organization, streak tracking, and topic tagging.

## Features

- **Auto-push on accept** — solutions are pushed to GitHub the moment your submission is accepted
- **Versioned files** — re-submitting the same problem creates `_v2`, `_v3` files instead of overwriting
- **Folder organization** — flat, by difficulty (`Easy/Medium/Hard`), or by language
- **Topic tags** — commit messages include LeetCode topic tags (`[Array, Hash Table]`)
- **Streak tracking** — tracks consecutive days you solve problems
- **Language distribution** — visual bar chart of languages used
- **Search & filter** — find any solution by title, difficulty, or language
- **Desktop notifications** — instant feedback when a solution is vaulted
- **Retry logic** — exponential backoff on GitHub API failures

## Project Structure

```
AlgoVault/
├── manifest.json              # Extension configuration
├── icon.png                   # Extension icon
└── src/
    ├── interceptor/
    │   ├── page_hook.js       # MAIN world — intercepts LeetCode network requests
    │   └── bridge.js          # ISOLATED world — relays messages to service worker
    ├── worker/
    │   └── service.js         # Background service worker — GitHub API, stats, notifications
    └── popup/
        ├── index.html         # Popup UI structure
        ├── style.css          # Popup styling (GitHub dark theme)
        └── app.js             # Popup logic — tabs, filters, settings
```

## Setup

1. Go to `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select this folder
2. Click the **AlgoVault** icon in the Chrome toolbar
3. Go to the **Settings** tab and fill in:
   - GitHub Personal Access Token (with `repo` scope)
   - Repository Owner (your GitHub username)
   - Repository Name (an existing repo)
   - Solutions Folder (optional, e.g. `solutions`)
4. Choose an organization mode and save

## How It Works

```
LeetCode page → page_hook.js (intercepts submission)
             → bridge.js (relays to background)
             → service.js (fetches metadata, pushes to GitHub)
             → Chrome Storage (updates stats)
             → Popup (displays dashboard)
```

## File Naming

| Submission | File name |
|------------|-----------|
| First attempt | `1_Two_Sum.py` |
| Second attempt | `1_Two_Sum_v2.py` |
| Different language | `1_Two_Sum.java` |

## Permissions Used

| Permission | Reason |
|------------|--------|
| `storage` | Save settings and statistics locally |
| `notifications` | Show desktop notification on successful push |
| `leetcode.com` host | Inject content scripts to intercept submissions |
| `api.github.com` host | Push files to GitHub repository |
