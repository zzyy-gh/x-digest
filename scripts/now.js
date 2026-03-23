// now.js — Prints current local time in various formats as JSON to stdout.
// Zero dependencies.

const now = new Date();
const offset = -now.getTimezoneOffset();
const sign = offset >= 0 ? '+' : '-';
const absH = Math.floor(Math.abs(offset) / 60);
const absM = Math.abs(offset) % 60;
const offsetStr = `UTC${sign}${absH}${absM ? ':' + String(absM).padStart(2, '0') : ''}`;

// YYYY-MM-DD in local timezone
const y = now.getFullYear();
const m = String(now.getMonth() + 1).padStart(2, '0');
const d = String(now.getDate()).padStart(2, '0');
const date = `${y}-${m}-${d}`;

// Human-readable datetime: "March 23, 2026 7:10 PM UTC+8"
const formatter = new Intl.DateTimeFormat('en-US', {
  year: 'numeric', month: 'long', day: 'numeric',
  hour: 'numeric', minute: '2-digit', hour12: true,
});
const datetime = `${formatter.format(now).replace(' at ', ' ')} ${offsetStr}`;

// ISO 8601 with offset
const hh = String(Math.abs(absH)).padStart(2, '0');
const mm = String(absM).padStart(2, '0');
const offsetISO = `${sign}${hh}:${mm}`;
const iso = `${y}-${m}-${d}T${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}.${String(now.getMilliseconds()).padStart(3, '0')}${offsetISO}`;

console.log(JSON.stringify({ date, datetime, iso, offset: offsetStr }));
