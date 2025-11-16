-- SQL: create a server-side import function for GeoJSON FeatureCollection
-- Usage (via PostgREST RPC): POST /rest/v1/rpc/import_grid_cells with JSON body {"data": <featurecollection_json>}

CREATE OR REPLACE FUNCTION public.import_grid_cells(data jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  inserted_count integer := 0;
BEGIN
    -- Coerce all geometries to MultiPolygon to avoid mismatch errors
    INSERT INTO public.grid_cells (properties, geom)
    SELECT (feat->'properties')::jsonb,
      ST_SetSRID(ST_Multi(ST_GeomFromGeoJSON((feat->'geometry')::text)), 4326)
    FROM jsonb_array_elements(data->'features') AS feat;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;

  RETURN inserted_count;
END;
$$;

-- Optional: grant execute to anon (not recommended). Prefer calling this via service_role key from Edge Function.
-- GRANT EXECUTE ON FUNCTION public.import_grid_cells(jsonb) TO authenticated;

-- If your existing `geom` column is declared as `geometry(Polygon,4326)` you can convert it
-- to MultiPolygon with the following SQL (run once before importing):
-- ALTER TABLE public.grid_cells
--   ALTER COLUMN geom TYPE geometry(MultiPolygon,4326)
--   USING ST_Multi(geom);

-- If some rows have NULL geometries or different SRIDs, consider running a safer migration:
-- UPDATE public.grid_cells SET geom = ST_SetSRID(ST_Multi(ST_ForceCollection(ST_GeomFromEWKT(ST_AsText(geom)))),4326) WHERE geom IS NOT NULL;
-- then run the ALTER TABLE shown above.
