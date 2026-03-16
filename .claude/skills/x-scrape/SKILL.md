---
name: x-scrape
description: >
  Scrapes X.com feeds (Following or lists) — handles session detection, login flow,
  following list extraction, and feed scraping. Returns raw post data for downstream analysis.
  Trigger phrases: "scrape feed", "scrape following", "scrape my X", "get feed data".
compatibility: "Requires playwright-headless MCP (primary) and playwright MCP (headed, for login). Both must share the same user-data-dir."
---

# X Feed Scraper

Authenticates to X.com and scrapes feed data (posts, links, images, metrics) for downstream analysis.

---

## Input Contract

Receives from the pipeline orchestrator:

- **`source`** — `"following"` or an X list URL (e.g. `https://x.com/i/lists/123456`)
- **`days`** — lookback window (default: 1)
- **`account`** — account identifier for session management

---

## Step 1 — Detect session (headless first)

Use **playwright-headless** to navigate to `https://x.com/home`.

- If home timeline loads → session active, proceed.
- If redirected to login → no session, go to Step 2.
- Extract username:
  ```js
  document.querySelector('a[data-testid="AppTabBar_Profile_Link"]').href
  ```

---

## Step 2 — Login flow (headed browser)

Switch to **playwright** (headed).

1. Tell user: *"No saved session found. Browser window is open — please log in (including 2FA). Let me know when done."*
2. Navigate to `https://x.com/login`, wait for confirmation, verify URL is `/home`.

---

## Step 3 — Scrape the following list (Following source only)
Skip this step if source is an X list URL.

Navigate to `https://x.com/<username>/following` with **playwright-headless**.

Use the virtualised-DOM accumulator pattern:

```js
await page.evaluate(() => { window._following = {}; });
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(1500);

let noNewCount = 0, lastTotal = 0;
for (let i = 0; i < 100; i++) {
  await page.evaluate(() => {
    document.querySelectorAll('[data-testid="UserCell"]').forEach(cell => {
      const links = cell.querySelectorAll('a[href^="/"]');
      let handle = '';
      links.forEach(l => {
        const href = l.getAttribute('href');
        if (href && href.match(/^\/[^/?]+$/) && !href.startsWith('/i/')) handle = href.slice(1);
      });
      if (!handle) return;
      const nameEl = cell.querySelector('[dir="ltr"] > span:first-child');
      window._following[handle] = nameEl ? nameEl.textContent.trim() : handle;
    });
  });
  const total = await page.evaluate(() => Object.keys(window._following).length);
  await page.evaluate(() => window.scrollBy(0, 600));
  await page.waitForTimeout(800);
  if (total === lastTotal) { if (++noNewCount >= 5) break; } else noNewCount = 0;
  lastTotal = total;
}
const following = await page.evaluate(() => window._following);
```

---

## Step 4 — Scrape the feed

### Source selection

Based on the `source` input:

- **Following feed** (default): Navigate to `https://x.com/home`, click the **Following** tab, then scroll.
- **X list URL**: Navigate directly to the list URL (e.g. `https://x.com/i/lists/123456`). No tab switching needed — just scroll the list feed.

### Parameters
- `days` — lookback window (default: **1**)
- Post types: **original posts only** (skip retweets and replies)

No per-account cap and no news outlet blocklist by default. Capture everything during the
scroll pass. Filtering happens at the analysis stage. All posts are collected; low-value
ones are filtered at the analysis stage.

### Feed scrape (with external links and images)

```js
const startTime = Date.now();
const cutoff = startTime - days * 24 * 60 * 60 * 1000;

await page.evaluate(({ cutoff }) => {
  window._cfg = { cutoff };
  window._posts = {};
}, { cutoff });

await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(1500);

let done = false, noNewCount = 0;

for (let i = 0; i < 200 && !done; i++) {
  const reachedEnd = await page.evaluate(() => {
    const { cutoff } = window._cfg;
    const articles = document.querySelectorAll('article[data-testid="tweet"]');
    let allOld = true;

    articles.forEach(article => {
      // Skip retweets and replies
      if (article.querySelector('[data-testid="socialContext"]')) return;
      if (article.innerText.includes('Replying to')) return;

      const timeEl = article.querySelector('time');
      const linkEl = article.querySelector('a[href*="/status/"]');
      if (!timeEl || !linkEl) return;

      const handle = (linkEl.href.match(/x\.com\/([^/]+)\/status\//) || [])[1];
      if (!handle) return;

      const postTime = new Date(timeEl.getAttribute('datetime')).getTime();
      if (postTime < cutoff) return;
      allOld = false;

      if (!window._posts[handle]) window._posts[handle] = [];

      const alreadyAdded = window._posts[handle].some(p => p.url === linkEl.href);
      if (alreadyAdded) return;

      // Text content
      const textEl = article.querySelector('[data-testid="tweetText"]');
      const text = textEl ? textEl.innerText.trim() : '';

      // Engagement metrics
      const metrics = {};
      ['reply', 'retweet', 'like'].forEach(action => {
        const btn = article.querySelector(`[data-testid="${action}"]`);
        if (btn) {
          const countEl = btn.querySelector('[data-testid]') || btn;
          const num = countEl.textContent.trim();
          metrics[action] = num || '0';
        }
      });

      // External links
      const externalLinks = [];
      if (textEl) {
        textEl.querySelectorAll('a[href]').forEach(a => {
          const href = a.href;
          if (href && !href.includes('x.com/') && !href.includes('twitter.com/')) {
            externalLinks.push({ url: href, text: a.textContent.trim() });
          }
        });
      }
      const cardLink = article.querySelector('[data-testid="card.wrapper"] a[href]');
      if (cardLink && !cardLink.href.includes('x.com/') && !cardLink.href.includes('twitter.com/')) {
        const alreadyHave = externalLinks.some(l => l.url === cardLink.href);
        if (!alreadyHave) {
          externalLinks.push({ url: cardLink.href, text: cardLink.textContent.trim() });
        }
      }

      // Image URLs
      const images = [];
      article.querySelectorAll('[data-testid="tweetPhoto"] img').forEach(img => {
        if (img.src) images.push(img.src);
      });

      window._posts[handle].push({
        text: text.slice(0, 800),
        time: timeEl.getAttribute('datetime'),
        url: linkEl.href,
        externalLinks,
        images,
        metrics
      });
    });

    return allOld;
  });

  if (reachedEnd) { if (++noNewCount >= 3) { done = true; } } else noNewCount = 0;
  await page.evaluate(() => window.scrollBy(0, 800));
  await page.waitForTimeout(1000);
}

const posts   = await page.evaluate(() => window._posts);
const endTime = Date.now();
```

---

## Output Contract

This skill produces:

- **`posts`** — object keyed by handle, each value an array of post objects with: `text`, `time`, `url`, `externalLinks`, `images`, `metrics`
- **`following`** — object mapping handle → display name
- **Scrape timing** — `startTime` and `endTime` timestamps

---

## Edge Cases

| Situation | Handling |
|-----------|----------|
| No session | Fall back to headed login (Step 2) |
| List URL invalid or inaccessible | Report error, suggest checking the URL |
| Very large feed (many posts) | Scroll continues up to 200 iterations; cutoff-based termination handles rest |
| User asks for > 7 days lookback | Warn about time; proceed if confirmed |

---

## MCP Tool Naming

- **Headless**: `playwright-headless:browser_navigate`, `playwright-headless:browser_run_code`, etc.
- **Headed**: `playwright:browser_navigate`, `playwright:browser_run_code`, etc.

Both share the same `user-data-dir` — sessions persist across modes.
