-- SQL function: insert a checklist with species and location geometries on Supabase (Postgres + PostGIS)
-- Expects a JSONB payload with fields: user_id (uuid string), grid_cell_id (text), time_spent_minutes (int), locations (jsonb), species (jsonb)
-- Returns inserted id

CREATE OR REPLACE FUNCTION public.insert_checklist(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  inserted_id integer;
  loc jsonb;
  lockey text;
  lat double precision;
  lng double precision;
  spname text;
  spcount int;
  species_elem jsonb;
BEGIN
  -- Basic validation
  IF payload ->> 'user_id' IS NULL THEN
    RAISE EXCEPTION 'Missing user_id';
  END IF;
  IF payload ->> 'grid_cell_id' IS NULL THEN
    RAISE EXCEPTION 'Missing grid_cell_id';
  END IF;

  INSERT INTO public.checklists (user_id, grid_cell_id, time_spent_minutes, submitted_at)
  VALUES (
    (payload ->> 'user_id')::uuid,
    payload ->> 'grid_cell_id',
    (payload ->> 'time_spent_minutes')::int,
    NOW()
  )
  RETURNING id INTO inserted_id;

  -- Insert species observations if present
  IF payload ? 'species' THEN
    FOR species_elem IN SELECT * FROM jsonb_each(payload -> 'species') LOOP
      spname := species_elem.key;
      spcount := (species_elem.value)::int;
      IF spcount > 0 THEN
        INSERT INTO public.species_observations (checklist_id, species_name, count)
        VALUES (inserted_id, spname, spcount);
      END IF;
    END LOOP;
  END IF;

  -- Insert location geometries if present (only if lat & lng are provided)
  IF payload ? 'locations' THEN
    FOR lockey, loc IN SELECT key, value FROM jsonb_each(payload -> 'locations') LOOP
      BEGIN
        IF (loc ->> 'lat') IS NOT NULL AND (loc ->> 'lng') IS NOT NULL THEN
          lat := (loc ->> 'lat')::double precision;
          lng := (loc ->> 'lng')::double precision;
          INSERT INTO public.checklist_locations (checklist_id, location_type, geom)
          VALUES (inserted_id, lockey, ST_SetSRID(ST_MakePoint(lng, lat), 31370));
        END IF;
      EXCEPTION WHEN OTHERS THEN
        -- ignore location insert failures, continue
        RAISE NOTICE 'Location insert failed for %: %', lockey, SQLERRM;
      END;
    END LOOP;
  END IF;

  RETURN jsonb_build_object('success', true, 'id', inserted_id);
END;
$$;

-- Grant execute to authenticated (if desired) or call via service_role key
-- GRANT EXECUTE ON FUNCTION public.insert_checklist(jsonb) TO authenticated;

-- Note: This function assumes PostGIS is enabled and `checklist_locations.geom` is a geometry column with SRID 31370.
-- If your input lat/lng coordinates are WGS84 (4326), you should transform them appropriately. The original server code uses 31370.
