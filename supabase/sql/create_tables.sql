-- Create checklist-related tables for Tandonia
-- Run this in Supabase SQL Editor before running setup_complete.sql

-- Enable PostGIS first
CREATE EXTENSION IF NOT EXISTS postgis;

-- Create checklists table
CREATE TABLE IF NOT EXISTS public.checklists (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL,
  grid_cell_id TEXT NOT NULL,
  time_spent_minutes INTEGER,
  submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create species_observations table
CREATE TABLE IF NOT EXISTS public.species_observations (
  id SERIAL PRIMARY KEY,
  checklist_id INTEGER NOT NULL REFERENCES public.checklists(id) ON DELETE CASCADE,
  species_name TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0
);

-- Create checklist_locations table with PostGIS geometry
CREATE TABLE IF NOT EXISTS public.checklist_locations (
  id SERIAL PRIMARY KEY,
  checklist_id INTEGER NOT NULL REFERENCES public.checklists(id) ON DELETE CASCADE,
  location_type TEXT NOT NULL,
  geom GEOMETRY(Point, 31370) NOT NULL
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_checklists_user_id ON public.checklists(user_id);
CREATE INDEX IF NOT EXISTS idx_checklists_grid_cell_id ON public.checklists(grid_cell_id);
CREATE INDEX IF NOT EXISTS idx_species_observations_checklist_id ON public.species_observations(checklist_id);
CREATE INDEX IF NOT EXISTS idx_checklist_locations_checklist_id ON public.checklist_locations(checklist_id);
CREATE INDEX IF NOT EXISTS idx_checklist_locations_geom ON public.checklist_locations USING GIST(geom);