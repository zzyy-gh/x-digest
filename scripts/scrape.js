#!/usr/bin/env node
// scrape.js — Standalone X feed scraper.
// Usage: node scrape.js --source following --days 1 --output outputs/file.json

import { chromium } from 'playwright';
import { parseArgs } from 'node:util';
import { writeFileSync } from 'node:fs';
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';

import { checkSession, loginFlow } from './lib/auth.js';
import { extractTweets, initBrowserState, flushPosts } from './lib/extract.js';
import { navigateToFeed } from './lib/navigate.js';

// --- CLI args ---

const { values: args } = parseArgs({
  options: {
    source:        { type: 'string', default: 'following' },
    days:          { type: 'string', default: '1' },
    output:        { type: 'string' },
    account:       { type: 'string', default: 'main' },
    'session-dir': { type: 'string', default: 'C:/Users/zzyy/playwright-session-x-digest' },
    'login-only':  { type: 'boolean', default: false },
    'login-timeout': { type: 'string', default: '120000' },
  },
  strict: true,
});

const source = args.source;
const days = Number(args.days);
const outputPath = args.output ? resolve(args.output) : null;
const account = args.account;
const sessionDir = args['session-dir'];
const loginOnly = args['login-only'];
const loginTimeout = Number(args['login-timeout']);

if (!loginOnly && !outputPath) {
  process.stderr.write('Error: --output is required (unless --login-only)\n');
  process.exit(1);
}

// --- Main ---

const startTime = Date.now();

async function main() {
  let context = await chromium.launchPersistentContext(sessionDir, {
    headless: true,
    channel: 'chrome',
    args: ['--disable-blink-features=AutomationControlled'],
    ignoreDefaultArgs: ['--enable-automation'],
  });

  // Step 1: Check session
  let session = await checkSession(context);

  // Account mismatch check
  if (session.loggedIn && account !== 'main' && session.username && session.username !== account) {
    process.stderr.write(`Wrong account: logged in as ${session.username}, expected ${account}. Clearing session.\n`);
    await context.close();
    try { rmSync(resolve(sessionDir, 'Default'), { recursive: true, force: true }); } catch {}
    session = { loggedIn: false };
  }

  // Step 2: Login if needed
  if (!session.loggedIn) {
    try { await context.close(); } catch {}

    const login = await loginFlow(sessionDir, loginTimeout, account);
    if (!login.success) {
      process.stderr.write('Login failed or timed out.\n');
      output({ startTime, endTime: Date.now(), stats: null, error: 'Login failed' });
      process.exit(1);
    }

    // Re-launch headless and verify — must use same channel as login to avoid profile mismatch
    context = await chromium.launchPersistentContext(sessionDir, {
      headless: true,
      channel: 'chrome',
      args: ['--disable-blink-features=AutomationControlled'],
      ignoreDefaultArgs: ['--enable-automation'],
    });
    session = await checkSession(context);
    if (!session.loggedIn) {
      process.stderr.write('Session check failed after login.\n');
      await context.close();
      output({ startTime, endTime: Date.now(), stats: null, error: 'Session check failed after login' });
      process.exit(1);
    }
  }

  process.stderr.write(`Logged in as ${session.username || 'unknown'}.\n`);

  // Login-only mode
  if (loginOnly) {
    await context.close();
    output({ loggedIn: true, username: session.username });
    process.exit(0);
  }

  // Step 3: Navigate to feed
  const page = session.page || context.pages()[0] || await context.newPage();
  try {
    await navigateToFeed(page, source);
  } catch (e) {
    await context.close();
    output({ startTime, endTime: Date.now(), stats: null, error: e.message });
    process.exit(1);
  }

  // Step 4: Scrape loop
  const cutoff = startTime - days * 24 * 60 * 60 * 1000;
  const MAX_POSTS = 1000;
  const FLUSH_EVERY = 50;
  const allPosts = {};
  let error = null;

  function mergeBatch(batch) {
    for (const [handle, posts] of Object.entries(batch)) {
      if (!allPosts[handle]) allPosts[handle] = [];
      allPosts[handle].push(...posts);
    }
  }

  // Initialize browser-side state
  await page.evaluate(initBrowserState, { cutoff });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(1500);

  try {
    for (let i = 0; ; i++) {
      const { done, currentCount } = await page.evaluate(extractTweets);

      if (done) break;

      // Check accumulated total
      let accumulated = 0;
      for (const arr of Object.values(allPosts)) accumulated += arr.length;
      if (accumulated + currentCount >= MAX_POSTS) break;

      // Flush every N scrolls
      if ((i + 1) % FLUSH_EVERY === 0) {
        const batch = await page.evaluate(flushPosts);
        mergeBatch(batch);
      }

      // Scroll
      await page.evaluate(() => window.scrollBy(0, 1000));
      await page.waitForTimeout(700);

      // Extra pause every 5th scroll
      if ((i + 1) % 5 === 0) {
        await page.waitForTimeout(300);
      }
    }
  } catch (e) {
    error = e.message || String(e);
  }

  // Final flush
  try {
    const remaining = await page.evaluate(flushPosts);
    mergeBatch(remaining);
  } catch {
    // Page may have crashed — we still have data from earlier flushes
  }

  // Count totals
  let totalPosts = 0, totalAccounts = 0;
  for (const arr of Object.values(allPosts)) {
    totalPosts += arr.length;
    totalAccounts++;
  }

  // Write output file
  try {
    writeFileSync(outputPath, JSON.stringify(allPosts, null, 2));
  } catch (e) {
    error = error || ('Failed to save file: ' + (e.message || String(e)));
  }

  let hitCutoff = false;
  try { hitCutoff = await page.evaluate(() => window._noNewCount >= 3); } catch {}

  const endTime = Date.now();
  await context.close();
  output({ startTime, endTime, stats: { totalPosts, totalAccounts, hitCutoff }, error });
  process.exit(error ? 1 : 0);
}

function output(obj) {
  console.log(JSON.stringify(obj));
}

main().catch(e => {
  process.stderr.write(`Fatal: ${e.message}\n`);
  output({ startTime, endTime: Date.now(), stats: null, error: e.message });
  process.exit(1);
});
