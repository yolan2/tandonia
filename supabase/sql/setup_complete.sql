-- Complete Supabase setup for Tandonia checklist system
-- Run this entire file in your Supabase SQL Editor (or via CLI)
-- This will: enable PostGIS, create the RPC function, and apply RLS policies

-- ============= 1. Enable PostGIS Extension =============
CREATE EXTENSION IF NOT EXISTS postgis;

-- ============= 2. Create RPC Function for Checklist Insertion =============
-- This function inserts checklists with species observations and location geometries
-- Expects a JSONB payload with: user_id (uuid), grid_cell_id (text), time_spent_minutes (int), locations (jsonb), species (jsonb)
-- Returns: { success: true, id: <inserted_id> }

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

  -- Insert main checklist record
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

  -- Insert location geometries if present (with PostGIS transform from WGS84 to SRID 31370)
  IF payload ? 'locations' THEN
    FOR lockey, loc IN SELECT key, value FROM jsonb_each(payload -> 'locations') LOOP
      BEGIN
        IF (loc ->> 'lat') IS NOT NULL AND (loc ->> 'lng') IS NOT NULL THEN
          lat := (loc ->> 'lat')::double precision;
          lng := (loc ->> 'lng')::double precision;
          -- Transform WGS84 (SRID 4326) to Belgian Lambert 72 (SRID 31370)
          INSERT INTO public.checklist_locations (checklist_id, location_type, geom)
          VALUES (inserted_id, lockey, ST_Transform(ST_SetSRID(ST_MakePoint(lng, lat), 4326), 31370));
        END IF;
      EXCEPTION WHEN OTHERS THEN
        -- Log but don't fail the entire transaction if one location fails
        RAISE NOTICE 'Location insert failed for %: %', lockey, SQLERRM;
      END;
    END LOOP;
  END IF;

  RETURN jsonb_build_object('success', true, 'id', inserted_id);
END;
$$;

-- Grant execute permission to authenticated users (optional, service_role bypasses this)
-- Uncomment the next line if you want authenticated users to call this RPC directly:
-- GRANT EXECUTE ON FUNCTION public.insert_checklist(jsonb) TO authenticated;

-- ============= 3. Enable Row Level Security (RLS) =============

-- Enable RLS on all checklist-related tables
ALTER TABLE IF EXISTS public.checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.species_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.checklist_locations ENABLE ROW LEVEL SECURITY;

-- CHECKLISTS policies: users can only insert/select/update/delete their own checklists
CREATE POLICY IF NOT EXISTS checklists_insert_policy ON public.checklists
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (user_id = auth.uid()::uuid) AND
    (grid_cell_id IS NOT NULL) AND
    (time_spent_minutes IS NULL OR time_spent_minutes >= 0)
  );

CREATE POLICY IF NOT EXISTS checklists_select_policy ON public.checklists
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid()::uuid);

CREATE POLICY IF NOT EXISTS checklists_update_policy ON public.checklists
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid()::uuid)
  WITH CHECK (user_id = auth.uid()::uuid);

CREATE POLICY IF NOT EXISTS checklists_delete_policy ON public.checklists
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid()::uuid);

-- SPECIES_OBSERVATIONS policies: users can insert/select/update observations for their own checklists
CREATE POLICY IF NOT EXISTS species_observations_insert_policy ON public.species_observations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.checklists c
      WHERE c.id = checklist_id
        AND c.user_id = auth.uid()::uuid
    )
  );

CREATE POLICY IF NOT EXISTS species_observations_select_policy ON public.species_observations
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.checklists c
      WHERE c.id = species_observations.checklist_id
        AND c.user_id = auth.uid()::uuid
    )
  );

CREATE POLICY IF NOT EXISTS species_observations_update_policy ON public.species_observations
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.checklists c
      WHERE c.id = species_observations.checklist_id
        AND c.user_id = auth.uid()::uuid
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.checklists c
      WHERE c.id = species_observations.checklist_id
        AND c.user_id = auth.uid()::uuid
    )
  );

-- CHECKLIST_LOCATIONS policies: users can insert/select/update locations for their own checklists
CREATE POLICY IF NOT EXISTS checklist_locations_insert_policy ON public.checklist_locations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.checklists c
      WHERE c.id = checklist_id
        AND c.user_id = auth.uid()::uuid
    )
  );

CREATE POLICY IF NOT EXISTS checklist_locations_select_policy ON public.checklist_locations
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.checklists c
      WHERE c.id = checklist_locations.checklist_id
        AND c.user_id = auth.uid()::uuid
    )
  );

CREATE POLICY IF NOT EXISTS checklist_locations_update_policy ON public.checklist_locations
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.checklists c
      WHERE c.id = checklist_locations.checklist_id
        AND c.user_id = auth.uid()::uuid
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.checklists c
      WHERE c.id = checklist_locations.checklist_id
        AND c.user_id = auth.uid()::uuid
    )
  );

-- ============= Setup Complete =============
-- Your Supabase database now has:
-- 1. PostGIS extension enabled
-- 2. insert_checklist RPC function (with SECURITY DEFINER, bypasses RLS when called via service role)
-- 3. RLS policies for checklists, species_observations, and checklist_locations
--
-- Next steps:
-- - Ensure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in your backend environment
-- - Test the RPC by calling it from your backend or directly via Supabase client
