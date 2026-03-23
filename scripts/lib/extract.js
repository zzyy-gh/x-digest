// extract.js — DOM extraction logic for tweet parsing.
// Runs inside page.evaluate() — pure browser code, no Node APIs.

/**
 * Extract function to pass to page.evaluate().
 * Expects window._cfg = { cutoff } and window._seenUrls, window._posts,
 * window._noNewCount, window._done to be initialized.
 *
 * Returns { done, currentCount }.
 */
export const extractTweets = () => {
  const { cutoff } = window._cfg;
  const articles = document.querySelectorAll('article[data-testid="tweet"]');
  let allOld = true;
  let qualifyingCount = 0;

  articles.forEach(article => {
    // Skip retweets
    if (article.querySelector('[data-testid="socialContext"]')) return;
    // Skip replies
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
      text: text.slice(0, 800),
      time: timeEl.getAttribute('datetime'),
      url: linkEl.href,
      displayName,
      externalLinks,
      images,
      metrics,
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
};

/**
 * Initialize browser-side state for extraction.
 * Call via page.evaluate(initBrowserState, { cutoff }).
 */
export const initBrowserState = ({ cutoff }) => {
  window._cfg = { cutoff };
  window._posts = {};
  window._seenUrls = new Set();
  window._noNewCount = 0;
  window._done = false;
};

/**
 * Flush collected posts from browser and clear browser-side accumulator.
 * Call via page.evaluate(flushPosts).
 */
export const flushPosts = () => {
  const out = window._posts;
  window._posts = {};
  return out;
};
