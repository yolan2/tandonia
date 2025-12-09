-- Create pill_clams table
CREATE TABLE IF NOT EXISTS public.pill_clams (
    id SERIAL PRIMARY KEY,
    species TEXT,
    image_url TEXT,
    glossy INTEGER,
    shape TEXT,
    striation_regular INTEGER,
    posterior_point INTEGER,
    callus_present REAL,
    c4_shape TEXT,
    c2_shape TEXT,
    plica TEXT,
    ligament_long INTEGER,
    umbo_taal TEXT,
    ligamentpit_shape TEXT,
    umbo_prominent INTEGER,
    umbo_width TEXT,
    ligament_pit_width INTEGER,
    laterals_developed INTEGER,
    striation_strength TEXT,
    size_mm REAL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.pill_clams ENABLE ROW LEVEL SECURITY;

-- Allow read access to all
CREATE POLICY "Allow read access to pill_clams" ON public.pill_clams
    FOR SELECT USING (true);