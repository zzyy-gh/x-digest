// Test: scripts/now.js
// Run: node scripts/test/now.test.js

import { execFileSync } from 'node:child_process';
import { strict as assert } from 'node:assert';

const out = execFileSync('node', ['scripts/now.js'], {
  cwd: 'C:/Users/zzyy/Desktop/x-digest',
  encoding: 'utf-8',
}).trim();

const data = JSON.parse(out);

// All fields present
assert.ok(data.date, 'missing date');
assert.ok(data.datetime, 'missing datetime');
assert.ok(data.iso, 'missing iso');
assert.ok(data.offset, 'missing offset');

// date is YYYY-MM-DD
assert.match(data.date, /^\d{4}-\d{2}-\d{2}$/, `date format wrong: ${data.date}`);

// datetime contains the date's month and year, plus offset
assert.ok(data.datetime.includes(data.offset), `datetime missing offset: ${data.datetime}`);
assert.ok(!data.datetime.includes(' at '), `datetime should not contain "at": ${data.datetime}`);

// iso is valid ISO 8601 with offset
assert.match(data.iso, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{2}:\d{2}$/, `iso format wrong: ${data.iso}`);

// offset is UTC+N or UTC-N
assert.match(data.offset, /^UTC[+-]\d{1,2}(:\d{2})?$/, `offset format wrong: ${data.offset}`);

// date in filename matches today
const now = new Date();
const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
assert.equal(data.date, expected, `date mismatch: got ${data.date}, expected ${expected}`);

console.log('now.js: all tests passed');
