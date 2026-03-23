// Test: scripts/lib/extract.js — verify exports and function shapes
// Run: node scripts/test/extract.test.js

import { strict as assert } from 'node:assert';
import { extractTweets, initBrowserState, flushPosts } from '../lib/extract.js';

// All three should be functions
assert.equal(typeof extractTweets, 'function', 'extractTweets should be a function');
assert.equal(typeof initBrowserState, 'function', 'initBrowserState should be a function');
assert.equal(typeof flushPosts, 'function', 'flushPosts should be a function');

// extractTweets takes no args (it reads from window globals)
assert.equal(extractTweets.length, 0, 'extractTweets should take 0 args');

// initBrowserState takes 1 arg ({ cutoff })
assert.equal(initBrowserState.length, 1, 'initBrowserState should take 1 arg');

// flushPosts takes no args
assert.equal(flushPosts.length, 0, 'flushPosts should take 0 args');

console.log('extract: all tests passed');
