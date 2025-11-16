#!/usr/bin/env node
const fs = require('fs');

if (process.argv.length < 3) {
  console.error('Usage: node scripts/json_error_context.js <file.geojson> [contextChars]');
  process.exit(1);
}

const file = process.argv[2];
const ctx = parseInt(process.argv[3] || '200', 10);

try {
  const s = fs.readFileSync(file, 'utf8');
  try {
    JSON.parse(s);
    console.log('JSON OK');
    process.exit(0);
  } catch (err) {
    const msg = err.message || String(err);
    console.error('JSON parse error:', msg);
    const m = /position (\d+)/.exec(msg) || /at (\d+)/.exec(msg);
    if (m) {
      const pos = parseInt(m[1], 10);
      const start = Math.max(0, pos - ctx);
      const end = Math.min(s.length, pos + ctx);
      const before = s.slice(start, pos);
      const after = s.slice(pos, end);
      const pre = s.slice(0, pos);
      const line = pre.split('\n').length;
      const col = pos - pre.lastIndexOf('\n');
      console.error(`At approx position ${pos} (line ${line}, col ${col})`);
      console.error('--- context before/error/after ---');
      console.error(before.replace(/\r/g,''));
      console.error('>>> ERROR HERE >>>');
      console.error(after.replace(/\r/g,''));
    }
    process.exit(2);
  }
} catch (e) {
  console.error('Failed to read file:', e.message);
  process.exit(3);
}
#!/usr/bin/env node
const fs = require('fs');

if (process.argv.length < 3) {
  console.error('Usage: node scripts/json_error_context.js <file.geojson> [contextChars]');
  process.exit(1);
}

const file = process.argv[2];
const ctx = parseInt(process.argv[3] || '200', 10);

try {
  const s = fs.readFileSync(file, 'utf8');
  try {
    JSON.parse(s);
    console.log('JSON OK');
    process.exit(0);
  } catch (err) {
    const msg = err.message || String(err);
    console.error('JSON parse error:', msg);
    const m = /position (\d+)/.exec(msg) || /at (\d+)/.exec(msg);
    if (m) {
      const pos = parseInt(m[1], 10);
      const start = Math.max(0, pos - ctx);
      const end = Math.min(s.length, pos + ctx);
      const before = s.slice(start, pos);
      const after = s.slice(pos, end);
      const pre = s.slice(0, pos);
      const line = pre.split('\n').length;
      const col = pos - pre.lastIndexOf('\n');
      console.error(`At approx position ${pos} (line ${line}, col ${col})`);
      console.error('--- context before/error/after ---');
      console.error(before.replace(/\r/g,''));
      console.error('>>> ERROR HERE >>>');
      console.error(after.replace(/\r/g,''));
    }
    process.exit(2);
  }
} catch (e) {
  console.error('Failed to read file:', e.message);
  process.exit(3);
}
#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

if (process.argv.length < 3) {
  console.error('Usage: node scripts/json_error_context.js <file.geojson> [contextChars]');
  process.exit(1);
}

const file = process.argv[2];
const ctx = parseInt(process.argv[3] || '200', 10);

try {
  const s = fs.readFileSync(file, 'utf8');
  try {
    JSON.parse(s);
    console.log('JSON OK');
    process.exit(0);
  } catch (err) {
    const msg = err.message || String(err);
    console.error('JSON parse error:', msg);
    // extract position if present
    const m = /position (\d+)/.exec(msg) || /at (\d+)/.exec(msg);
    if (m) {
      const pos = parseInt(m[1], 10);
      const start = Math.max(0, pos - ctx);
      const end = Math.min(s.length, pos + ctx);
      const before = s.slice(start, pos);
      const after = s.slice(pos, end);
      // compute line/col
      const pre = s.slice(0, pos);
      const line = pre.split('\n').length;
      const col = pos - pre.lastIndexOf('\n');
      console.error(`At approx position ${pos} (line ${line}, col ${col})`);
      console.error('--- context before/error/after ---');
      console.error(before.replace(/\r/g,''));
      console.error('>>> ERROR HERE >>>');
      console.error(after.replace(/\r/g,''));
    }
    process.exit(2);
  }
} catch (e) {
  console.error('Failed to read file:', e.message);
  process.exit(3);
}
