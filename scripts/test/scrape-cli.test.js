// Test: scripts/scrape.js CLI arg validation
// Run: node scripts/test/scrape-cli.test.js

import { execFileSync } from 'node:child_process';
import { strict as assert } from 'node:assert';

const cwd = 'C:/Users/zzyy/Desktop/x-digest';

// Test: missing --output without --login-only should exit 1
try {
  execFileSync('node', ['scripts/scrape.js'], { cwd, encoding: 'utf-8', stdio: 'pipe' });
  assert.fail('should have exited with error');
} catch (e) {
  assert.equal(e.status, 1, `expected exit code 1, got ${e.status}`);
  assert.ok(e.stderr.includes('--output'), `stderr should mention --output: ${e.stderr}`);
}

// Test: unknown flag should fail
try {
  execFileSync('node', ['scripts/scrape.js', '--bogus', 'x'], { cwd, encoding: 'utf-8', stdio: 'pipe' });
  assert.fail('should have exited with error for unknown flag');
} catch (e) {
  assert.notEqual(e.status, 0, 'should fail on unknown flag');
}

// Test: --login-only does not require --output (will fail on browser launch, but not on arg validation)
try {
  execFileSync('node', ['scripts/scrape.js', '--login-only'], { cwd, encoding: 'utf-8', stdio: 'pipe', timeout: 10000 });
} catch (e) {
  // Expected to fail (no browser available in test), but NOT due to missing --output
  assert.ok(!e.stderr.includes('--output'), `should not complain about --output with --login-only: ${e.stderr}`);
}

console.log('scrape-cli: all tests passed');
