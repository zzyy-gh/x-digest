// auth.js — Session check + headed login flow.

import { chromium } from 'playwright';

/**
 * Check if we're logged into X.com.
 * @param {import('playwright').BrowserContext} context
 * @returns {{ loggedIn: boolean, username?: string, page: import('playwright').Page }}
 */
export async function checkSession(context) {
  const page = context.pages()[0] || await context.newPage();
  await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded', timeout: 30000 });

  // Wait for page to settle — X briefly redirects even with valid sessions
  await page.waitForTimeout(5000);

  // Check if we landed on login
  const url = page.url();
  if (url.includes('/i/flow/login') || url.includes('/login')) {
    return { loggedIn: false, page };
  }

  // Wait for timeline to appear as confirmation
  try {
    await page.waitForSelector('[data-testid="primaryColumn"]', { timeout: 10000 });
  } catch {
    // If primary column doesn't appear, check URL again
    const url2 = page.url();
    if (url2.includes('/login') || url2.includes('/flow/')) {
      return { loggedIn: false, page };
    }
  }

  // Extract username from profile link in nav
  let username = null;
  try {
    const profileLink = await page.getAttribute(
      'a[data-testid="AppTabBar_Profile_Link"]', 'href', { timeout: 5000 }
    );
    if (profileLink) {
      username = profileLink.replace('/', '');
    }
  } catch { /* couldn't find profile link */ }

  return { loggedIn: true, username, page };
}

/**
 * Run the headed login flow for manual 2FA login.
 * @param {string} sessionDir - Path to browser user data directory
 * @param {number} loginTimeout - Max ms to wait for login
 * @param {string} [accountName] - Account name to display in prompt
 * @returns {{ success: boolean }}
 */
export async function loginFlow(sessionDir, loginTimeout, accountName) {
  const context = await chromium.launchPersistentContext(sessionDir, {
    headless: false,
    channel: 'chrome',
    args: ['--disable-blink-features=AutomationControlled'],
    ignoreDefaultArgs: ['--enable-automation'],
    viewport: { width: 1280, height: 800 },
  });

  const page = context.pages()[0] || await context.newPage();
  await page.goto('https://x.com/login', { waitUntil: 'domcontentloaded', timeout: 30000 });

  const who = accountName && accountName !== 'main' ? ` as ${accountName}` : '';
  process.stderr.write(`\nBrowser opened at x.com/login. Please log in${who} (including 2FA).\n`);
  process.stderr.write('Login will be auto-detected.\n\n');

  let success = false;

  try {
    success = await pollUntilLoggedIn(page, 3000, loginTimeout);
  } catch (e) {
    if (e.message === 'Login timeout') {
      process.stderr.write('Login timed out.\n');
      success = false;
    } else {
      // Browser was closed by user — treat as session saved
      success = true;
    }
  }

  // Give browser time to flush cookies to disk
  if (success) {
    await page.waitForTimeout(3000).catch(() => {});
  }

  try { await context.close(); } catch { /* already closed */ }
  return { success };
}

/**
 * Poll page URL until it leaves /login or /flow/.
 */
function pollUntilLoggedIn(page, interval, timeout) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = async () => {
      try {
        const url = page.url();
        if (!url.includes('/login') && !url.includes('/flow/')) {
          resolve(true);
          return;
        }
      } catch {
        // Page or context was closed by user
        reject(new Error('Browser closed'));
        return;
      }

      if (Date.now() - start > timeout) {
        reject(new Error('Login timeout'));
        return;
      }
      setTimeout(check, interval);
    };
    setTimeout(check, interval);
  });
}
