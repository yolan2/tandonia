#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function usage() {
  console.error('Usage: node scripts/split_chunk_into_parts.js <input.sql> <outDir> <parts>');
  process.exit(2);
}

const inPath = process.argv[2] || 'supabase/chunks/chunk_002.sql';
const outDir = process.argv[3] || 'supabase/chunks/parts';
const parts = parseInt(process.argv[4] || '20', 10);

if (!inPath || !parts || parts < 1) usage();

if (!fs.existsSync(inPath)) {
  console.error('Input file not found:', inPath);
  process.exit(3);
}

const content = fs.readFileSync(inPath, 'utf8');

// Find the first $$ ... $$ JSON block
const re = /\$\$([\s\S]*?)\$\$/;
const m = re.exec(content);
if (!m) {
  console.error('Could not find $$ ... $$ JSON block in', inPath);
  process.exit(4);
}

const jsonText = m[1];
let doc;
try {
  doc = JSON.parse(jsonText);
} catch (err) {
  console.error('JSON parse error at input JSON block:', err.message);
  process.exit(5);
}

if (!Array.isArray(doc.features)) {
  console.error('JSON does not look like a FeatureCollection with a features array');
  process.exit(6);
}

const features = doc.features;
const per = Math.ceil(features.length / parts);

const prefix = content.slice(0, m.index);
const matched = m[0]; // includes the two $$ delimiters
const suffix = content.slice(m.index + matched.length);

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

let written = 0;
for (let i = 0; i < parts; i++) {
  const slice = features.slice(i * per, (i + 1) * per);
  if (slice.length === 0) continue;
  const newDoc = { type: 'FeatureCollection', features: slice };
  const jsonBlock = JSON.stringify(newDoc, null, 2);
  const outSql = prefix + '$$' + jsonBlock + '$$' + suffix;
  const filename = path.join(outDir, `chunk_002_part${String(i + 1).padStart(3, '0')}.sql`);
  fs.writeFileSync(filename, outSql, 'utf8');
  const stats = fs.statSync(filename);
  console.log('Wrote', filename, `(${stats.size} bytes, ${slice.length} features)`);
  written++;
}

console.log(`Done. Wrote ${written} part file(s) into ${outDir}`);
