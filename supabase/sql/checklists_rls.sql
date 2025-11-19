-- Supabase Row Level Security (RLS) for checklists, species_observations, and checklist_locations
-- Run in Supabase SQL editor or via CLI.

-- Enable RLS
ALTER TABLE IF EXISTS public.checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.species_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.checklist_locations ENABLE ROW LEVEL SECURITY;

-- CHECKLISTS: Allow authenticated users to insert, select, update and delete their own checklists
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

-- SPECIES_OBSERVATIONS: Allow insert/select/update only if the parent checklist belongs to the current user
CREATE POLICY IF NOT EXISTS species_observations_insert_policy ON public.species_observations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.checklists c
      WHERE c.id = new.checklist_id
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

-- CHECKLIST_LOCATIONS: Allow insert/select/update only if the parent checklist belongs to the current user
CREATE POLICY IF NOT EXISTS checklist_locations_insert_policy ON public.checklist_locations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.checklists c
      WHERE c.id = new.checklist_id
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

-- End of RLS script
