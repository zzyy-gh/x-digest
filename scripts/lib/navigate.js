// navigate.js — Feed navigation: Following tab click or list URL.

/**
 * Navigate to the target feed.
 * @param {import('playwright').Page} page
 * @param {string} source - "following" or a list URL
 */
export async function navigateToFeed(page, source) {
  if (source === 'following') {
    await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Click the "Following" tab
    const tab = page.locator('[role="tab"]').filter({ hasText: 'Following' });
    await tab.click({ timeout: 10000 });
    await page.waitForTimeout(2000);
  } else {
    // List URL — navigate directly
    await page.goto(source, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Check for error states
    const body = await page.textContent('body');
    if (body.includes("doesn't exist") || body.includes('Something went wrong')) {
      throw new Error(`List inaccessible: ${source}`);
    }
  }
}
