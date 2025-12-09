-- Enable RLS and add read policy for existing pill_clams table
ALTER TABLE public.pill_clams ENABLE ROW LEVEL SECURITY;

-- Allow read access to all (drop if exists first to avoid error)
DROP POLICY IF EXISTS "Allow read access to pill_clams" ON public.pill_clams;
CREATE POLICY "Allow read access to pill_clams" ON public.pill_clams
    FOR SELECT USING (true);