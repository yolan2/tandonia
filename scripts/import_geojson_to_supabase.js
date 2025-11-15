#!/usr/bin/env node
// scripts/import_geojson_to_supabase.js
// Simple script to import a GeoJSON FeatureCollection into a PostGIS table `public.grid_cells`.
// Usage (PowerShell):
//  $env:PG_CONN = "postgres://<user>:<pass>@<host>:5432/<db>"
//  node .\scripts\import_geojson_to_supabase.js "C:\path\to\hokken_website.geojson"
// The script will create `public.grid_cells` if it doesn't exist.

const fs = require('fs');
const { Client } = require('pg');

async function main() {
  const geojsonPath = process.argv[2] || process.env.GEOJSON_PATH || './hokken_website.geojson';
  const conn = process.env.PG_CONN || process.env.PG_CONNECTION_STRING || process.env.DATABASE_URL;

  if (!conn) {
    console.error('Error: no Postgres connection string provided. Set PG_CONN or PG_CONNECTION_STRING env var.');
    console.error('Example (PowerShell): $env:PG_CONN = "postgres://user:pass@host:5432/db"');
    process.exit(1);
  }

  if (!fs.existsSync(geojsonPath)) {
    console.error('GeoJSON file not found at', geojsonPath);
    process.exit(1);
  }

  const raw = fs.readFileSync(geojsonPath, 'utf8');
  let geo;
  try {
    geo = JSON.parse(raw);
  } catch (err) {
    console.error('Failed to parse GeoJSON:', err.message);
    process.exit(1);
  }

  if (!Array.isArray(geo.features)) {
    console.error('GeoJSON does not look like a FeatureCollection (missing features array).');
    process.exit(1);
  }

  const client = new Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });
  await client.connect();

  try {
    console.log('Ensuring PostGIS extension and table exist...');
    await client.query('CREATE EXTENSION IF NOT EXISTS postgis');
    await client.query(`CREATE TABLE IF NOT EXISTS public.grid_cells (
      id bigserial PRIMARY KEY,
      properties jsonb,
      geom geometry(MultiPolygon,4326)
    )`);

    let inserted = 0;
    for (const feature of geo.features) {
      const props = feature.properties || {};
      const geom = feature.geometry;
      if (!geom) continue;

      const geomText = JSON.stringify(geom);
      // Insert with ST_GeomFromGeoJSON and set SRID to 4326 (CRS84 uses lon/lat order)
      const q = 'INSERT INTO public.grid_cells (properties, geom) VALUES ($1, ST_SetSRID(ST_GeomFromGeoJSON($2::text), 4326))';
      await client.query(q, [props, geomText]);
      inserted += 1;
      if (inserted % 50 === 0) process.stdout.write(`Inserted ${inserted}...\r`);
    }

    console.log(`\nImport finished. Inserted ${inserted} features into public.grid_cells.`);
  } catch (err) {
    console.error('Import failed:', err.message);
    throw err;
  } finally {
    await client.end();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
