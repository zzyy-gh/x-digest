---
name: x-scrape
description: >
  Scrapes X.com feeds (Following or lists) — handles session detection, login flow,
  and feed scraping. Returns raw post data for downstream analysis.
  Trigger phrases: "scrape feed", "scrape following", "scrape my X", "get feed data".
compatibility: "Requires playwright (headed) and playwright-headless MCP servers."
---

# X Feed Scraper

Authenticates to X.com and scrapes feed data (posts, links, images, metrics) for downstream analysis.

---

## Input Contract

Receives from the pipeline orchestrator:

- **`source`** — `"following"` or an X list URL (e.g. `https://x.com/i/lists/123456`)
- **`days`** — lookback window (default: 1)
- **`account`** — account identifier for session management
- **`filename`** — file prefix for output naming

---

## Browser Modes

Two MCP servers, both sharing `--user-data-dir` so sessions carry over:

- **`playwright-headless:browser_*`** — headless, used for all scraping/navigation/data collection
- **`playwright:browser_*`** — headed, used only for login (Step 1.2)

---

## Step 1 — Auth

### 1.1 — Session check (headless)

Use `playwright-headless:browser_navigate` to navigate to `https://x.com/home`. Then **wait for the page to fully settle** — use `playwright-headless:browser_wait_for` with `textGone: "Loading"` or wait a few seconds — before inspecting the final URL. The initial navigation may briefly redirect to a login URL even when the session is valid.

**Decision tree (check AFTER page has fully loaded):**

1. **Final URL is still on `/i/flow/login` AND page snapshot shows login form elements** → not logged in → go to Step 1.2
2. **Home timeline loads** (nav bar, profile link, timeline visible) → logged in. Extract current username from the Profile link in the snapshot (e.g., `/dailyupdat26439`).
   Then check account:
   - If `account` is specified in config → verify current username matches. If mismatch → go to Step 1.2
   - If `account` is unset or `"main"` → accept whatever account is logged in, proceed to Step 1.3

### 1.2 — Login (headed)

1. Close the headless browser: `playwright-headless:browser_close` (release session dir lock)
2. If wrong account, clear the session:
   ```bash
   rm -rf "C:/Users/zzyy/playwright-session/Default"
   ```
3. Launch headed browser: `playwright:browser_navigate` to `https://x.com/login`
4. Tell user: *"Browser window opened at x.com/login. Please log in as [account name] (including 2FA). I'll detect when you're done."*
5. Poll with `playwright:browser_snapshot` every ~5 seconds. Check for:
   - **Login success**: URL no longer contains `/login` or `/flow/` — user reached the home timeline → `playwright:browser_close` and go to Step 1.1
   - **Browser closed**: MCP tool call returns an error / "no open tabs" → treat as session saved, go straight to Step 1.1 (re-opens headless)
6. Go back to Step 1.1

### 1.3 — Private list check (headless)

Always runs when source is a list URL:

1. `playwright-headless:browser_navigate` → list URL
2. Error / empty / "This list doesn't exist" → **stop and report to user**: *"List at [URL] appears to be private or inaccessible with this account. Please check the URL or switch to an account with access."*
3. List loads with posts → proceed to scraping

---

## Bundled Resources

| Asset | Purpose |
|-------|---------|
| `assets/scrape-loop.js` | Self-contained scroll + extract loop executed via single `browser_run_code` call |

---

## Step 2 — Scrape the feed (single-call)

### Source selection

Based on the `source` input:

- **Following feed** (default): Navigate to `https://x.com/home` with `playwright-headless:browser_navigate`, click the **Following** tab, then scroll.
- **X list URL**: Navigate directly to the list URL with `playwright-headless:browser_navigate`. No tab switching needed — just scroll the list feed.

### Parameters
- `days` — lookback window (default: **1**)
- Post types: **original posts only** (skip retweets and replies)

No per-account cap and no news outlet blocklist by default. Capture everything during the
scroll pass. Filtering happens at the analysis stage.

### 2a. Read the scrape script

Read `.claude/skills/x-scrape/assets/scrape-loop.js` with the Read tool.

### 2b. Execute scrape (single `browser_run_code` call)

Build the code string and pass it to `playwright-headless:browser_run_code`:

```
async (page) => {
  await page.evaluate(cfg => { window._scrapeConfig = cfg; }, {
    days: DAYS_VALUE,
    outputFile: 'ABSOLUTE_PATH/outputs/{filename}-scrape-{YYYY-MM-DD}.json'
  });
  SCRAPE_LOOP_JS_CONTENTS
}
```

Where:
- `DAYS_VALUE` is the numeric days from config
- `ABSOLUTE_PATH` is the full project root path (e.g. `C:/Users/zzyy/Desktop/x-digest`) — required because the playwright MCP server's CWD may differ
- `{filename}` is the `filename` value from list config
- `SCRAPE_LOOP_JS_CONTENTS` is the full file contents read in 2a

Returns `{ startTime, endTime, stats, error }`. Posts are written to the output file via Playwright's download API (`page.waitForEvent('download')` + `download.saveAs()`) — they do NOT pass through the MCP response.

If `error` is non-null, log it but continue with partial results (the file will contain whatever was collected before the error).

### 2c. Record timing

Save `startTime` and `endTime` from the result for downstream use.

---

## Output Contract

This skill produces:

- **`outputs/{filename}-scrape-{YYYY-MM-DD}.json`** — file keyed by handle, each value an array of post objects with: `text`, `time`, `url`, `displayName`, `externalLinks`, `images`, `metrics`
- **Scrape timing** — `startTime` and `endTime` timestamps

---

## Edge Cases

| Situation | Handling |
|-----------|----------|
| Not logged in | Headed login via `playwright` MCP (Step 1.2) |
| Wrong account logged in | Clear session, headed login with correct account |
| Session expires mid-run | Re-run Step 1.2 |
| Private/inaccessible list | Stop and report to user |
| account unset or "main" | Accept whatever account is logged in |
| List URL invalid or inaccessible | Report error, suggest checking the URL |
| Very large feed (many posts) | Capped at 1000 posts. Posts accumulate in-memory (collected from browser every 50 scrolls to free browser memory), written to disk once at the end via blob download. |
| Browser closed during login | Treat as session saved; proceed to Step 1.1 to verify |
| User asks for > 7 days lookback | Warn about time; proceed if confirmed |

---

## MCP Tool Naming

- **`playwright:browser_*`** — headed, login only (Step 1.2)
- **`playwright-headless:browser_*`** — headless, all scraping/navigation/data collection
