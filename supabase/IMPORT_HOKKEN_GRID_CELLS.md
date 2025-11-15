# Import hokken_website.geojson into Supabase / Postgres

This small guide explains how to import the attached `hokken_website.geojson` file into your Supabase project's Postgres database table `public.grid_cells`.

Two convenient options are provided:

- Option A: Run the included Node script locally (recommended)
- Option B: Copy & paste a SQL approach into the Supabase SQL editor (advanced)

## Option A — Run the Node import script locally

1. Open a PowerShell in the repository root (where `hokken_website.geojson` is present).
2. Install dependencies (node and npm must be installed):

```powershell
cd "C:\Users\yolan\OneDrive\Documenten\SPOTTEN\slakken website"
npm install pg
```

3. Set the Postgres connection string (use your Supabase database connection string or a secure user with write rights).
   - The script reads the connection string from the `PG_CONN` environment variable.
   - Example (PowerShell):

```powershell
$env:PG_CONN = "postgres://username:password@host:5432/dbname"
```

4. Run the script (adjust the path to the GeoJSON if needed):

```powershell
# Run - pass geojson path as first arg or rely on default './hokken_website.geojson'
node .\scripts\import_geojson_to_supabase.js .\hokken_website.geojson
```

5. What it does:
   - Creates PostGIS extension if missing
   - Creates `public.grid_cells` if it does not exist (columns: id, properties jsonb, geom geometry(MultiPolygon,4326))
   - Inserts each feature's properties as JSONB and geometry via ST_GeomFromGeoJSON

Notes & caveats:
- Use the Supabase project's provided connection string (found in Project Settings → Database → Connection string). Prefer using a restricted DB user or rotate keys after import.
- If the table already exists with a different schema, the script will still attempt to insert into `properties` and `geom` columns — if those columns don't exist adjust the script or create compatible columns first.

## Option B — Run SQL in the Supabase SQL editor

If you prefer running SQL directly in the Supabase UI, you can open the SQL editor and run an INSERT that uses `ST_GeomFromGeoJSON`. For large GeoJSON files it's more convenient to copy the file contents into a SQL variable or use the Node script above.

Example fragment (concept only):

```sql
-- Create table (if needed)
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE TABLE IF NOT EXISTS public.grid_cells (
  id bigserial primary key,
  properties jsonb,
  geom geometry(MultiPolygon,4326)
);

-- If you paste the GeoJSON into a variable called 'data', you can do:
INSERT INTO public.grid_cells (properties, geom)
SELECT (f->'properties')::jsonb,
       ST_SetSRID(ST_GeomFromGeoJSON((f->'geometry')::text), 4326)
FROM json_array_elements(<your_geojson_here>::json->'features') AS f;
```

## After import

- Verify row count:

```powershell
# Example using psql (if available)
# psql "postgres://user:pass@host:5432/dbname" -c "SELECT count(*) FROM public.grid_cells;"
```

## Help

If you want, I can:
- run the script locally for you (I can't access your Supabase project without credentials — not recommended), or
- generate a SQL file with the full embedded GeoJSON if you'd rather run it from the Supabase SQL editor.

If you want me to produce the SQL with the embedded GeoJSON, tell me and I'll place it in the repo (note: very large SQL file).
