// scrape-loop.js — Self-contained scrape loop for browser_run_code
// Expects window._scrapeConfig = { days, outputFile } set before execution.
// Uses Playwright's download API to write files (no require('fs') needed in sandbox).

const startTime = Date.now();

const { days, outputFile } = await page.evaluate(() => window._scrapeConfig);
const cutoff = startTime - days * 24 * 60 * 60 * 1000;

// Write JSON string to disk via blob download + download.saveAs()
async function saveToFile(filePath, jsonString) {
  const downloadPromise = page.waitForEvent('download');
  await page.evaluate((content) => {
    const blob = new Blob([content], { type: 'application/octet-stream' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'data.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, jsonString);
  const download = await downloadPromise;
  await download.saveAs(filePath);
}

// All posts accumulate here (keyed by handle)
const allPosts = {};

function mergeBatch(batch) {
  for (const [handle, posts] of Object.entries(batch)) {
    if (!allPosts[handle]) allPosts[handle] = [];
    allPosts[handle].push(...posts);
  }
}

await page.evaluate(({ cutoff }) => {
  window._cfg = { cutoff };
  window._posts = {};
  window._seenUrls = new Set();
  window._noNewCount = 0;
  window._done = false;
}, { cutoff });

await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(1500);

const MAX_POSTS = 1000;
const FLUSH_EVERY = 50;
let error = null;

try {
  for (let i = 0; ; i++) {

    // Single evaluate: parse tweets, check done, count posts
    const { done, currentCount } = await page.evaluate(() => {
      const { cutoff } = window._cfg;
      const articles = document.querySelectorAll('article[data-testid="tweet"]');
      let allOld = true;
      let qualifyingCount = 0;

      articles.forEach(article => {
        if (article.querySelector('[data-testid="socialContext"]')) return;
        if (article.innerText.includes('Replying to')) return;

        const timeEl = article.querySelector('time');
        const linkEl = article.querySelector('a[href*="/status/"]');
        if (!timeEl || !linkEl) return;

        const handle = (linkEl.href.match(/x\.com\/([^/]+)\/status\//) || [])[1];
        if (!handle) return;

        const profileLink = article.querySelector('a[href="/' + handle + '"]');
        let displayName = handle;
        if (profileLink) {
          const nameSpan = profileLink.querySelector('span');
          if (nameSpan) displayName = nameSpan.textContent.trim();
        }

        const postTime = new Date(timeEl.getAttribute('datetime')).getTime();
        qualifyingCount++;
        if (postTime < cutoff) return;
        allOld = false;

        if (window._seenUrls.has(linkEl.href)) return;
        window._seenUrls.add(linkEl.href);
        if (!window._posts[handle]) window._posts[handle] = [];

        const textEl = article.querySelector('[data-testid="tweetText"]');
        const text = textEl ? textEl.innerText.trim() : '';

        const metrics = {};
        ['reply', 'retweet', 'like'].forEach(action => {
          const btn = article.querySelector('[data-testid="' + action + '"]');
          if (btn) {
            const countEl = btn.querySelector('[data-testid]') || btn;
            metrics[action] = countEl.textContent.trim() || '0';
          }
        });

        const externalLinks = [];
        if (textEl) {
          textEl.querySelectorAll('a[href]').forEach(a => {
            const href = a.href;
            if (href && !href.includes('x.com/') && !href.includes('twitter.com/'))
              externalLinks.push({ url: href, text: a.textContent.trim() });
          });
        }
        const cardLink = article.querySelector('[data-testid="card.wrapper"] a[href]');
        if (cardLink && !cardLink.href.includes('x.com/') && !cardLink.href.includes('twitter.com/')) {
          if (!externalLinks.some(l => l.url === cardLink.href))
            externalLinks.push({ url: cardLink.href, text: cardLink.textContent.trim() });
        }

        const images = [];
        article.querySelectorAll('[data-testid="tweetPhoto"] img').forEach(img => {
          if (img.src) images.push(img.src);
        });

        window._posts[handle].push({
          text: text.slice(0, 800), time: timeEl.getAttribute('datetime'),
          url: linkEl.href, displayName, externalLinks, images, metrics
        });
      });

      // Only count as "all old" when qualifying articles exist
      if (qualifyingCount > 0 && allOld) {
        window._noNewCount++;
      } else {
        window._noNewCount = 0;
      }
      if (window._noNewCount >= 3) window._done = true;

      // Count posts in browser
      let count = 0;
      for (const arr of Object.values(window._posts)) count += arr.length;

      return { done: window._done, currentCount: count };
    });

    if (done) break;

    // Count total so far
    let accumulated = 0;
    for (const arr of Object.values(allPosts)) accumulated += arr.length;
    if (accumulated + currentCount >= MAX_POSTS) break;

    // Collect from browser every FLUSH_EVERY scrolls to free browser memory
    if ((i + 1) % FLUSH_EVERY === 0) {
      const batch = await page.evaluate(() => {
        const out = window._posts;
        window._posts = {};
        return out;
      });
      mergeBatch(batch);
    }

    await page.evaluate(() => window.scrollBy(0, 1000));
    await page.waitForTimeout(700);

    // Extra pause every 5th scroll for lazy-loaded content
    if ((i + 1) % 5 === 0) {
      await page.waitForTimeout(300);
    }
  }
} catch (e) {
  error = e.message || String(e);
}

// Post-loop operations: each wrapped individually so a page crash doesn't lose flushed data

// Final collect from browser
try {
  const remaining = await page.evaluate(() => window._posts);
  mergeBatch(remaining);
} catch (e) {
  // Page may have crashed — we still have data from earlier flushes
}

// Count totals
let totalPosts = 0, totalAccounts = 0;
for (const arr of Object.values(allPosts)) {
  totalPosts += arr.length;
  totalAccounts++;
}

// Write all posts to disk via download
try {
  await saveToFile(outputFile, JSON.stringify(allPosts, null, 2));
} catch (e) {
  error = error || ('Failed to save file: ' + (e.message || String(e)));
}

let hitCutoff = false;
try {
  hitCutoff = await page.evaluate(() => window._noNewCount >= 3);
} catch (e) {
  // Page unavailable — default to false
}

const endTime = Date.now();

return { startTime, endTime, stats: { totalPosts, totalAccounts, hitCutoff }, error };
