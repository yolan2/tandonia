-- Create pill_clams table for species identification
CREATE TABLE IF NOT EXISTS pill_clams (
  id SERIAL PRIMARY KEY,
  species VARCHAR(255) NOT NULL,
  image_url TEXT,
  glossy INTEGER,
  shape TEXT,
  striation_regular INTEGER,
  posterior_point INTEGER,
  callus_present NUMERIC,
  c4_shape TEXT,
  c2_shape TEXT,
  plica TEXT,
  ligament_long INTEGER,
  umbo_taal TEXT,
  ligamentpit_shape TEXT,
  umbo_prominent INTEGER,
  umbo_width INTEGER,
  ligament_pit_width INTEGER,
  laterals_developed TEXT,
  striation_strength TEXT,
  size_mm NUMERIC,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Insert pill clam species data
INSERT INTO pill_clams (species, image_url, glossy, shape, striation_regular, posterior_point, callus_present, c4_shape, c2_shape, plica, ligament_long, umbo_taal, ligamentpit_shape, umbo_prominent, umbo_width, ligament_pit_width, laterals_developed, striation_strength, size_mm) VALUES
('euglesa casertanum', 'https://waarneming.nl/media/photo/15886950.jpg', 0, 'oval to sub-triangular', NULL, 0, 0.0, 'straight - slightly curved', 'strong', 'not present', 1, 'prominent', 'moderatly broad', 0, 2, 4, '1', 'very faint', 500.0),
('euglesa ponderosa', 'https://waarneming.nl/media/photo/40644291.jpg', 0, 'rounded triangular', NULL, 0, 0.0, 'straight-slightly curved', 'strong', 'present', 1, 'prominent', 'broad', 0, 2, 5, '1', 'very faint', 600.0),
('euglesa conventus', NULL, NULL, 'oval to sub-triangular', 0, NULL, 0.0, 'straight-slightly curved', 'straight-slightly curved', 'not present', 1, 'prominent', 'narrow', 0, 2, 1, '0', 'very fine', 250.0),
('euglesa henslowanum', 'https://waarneming.nl/media/photo/12826721.jpg', 0, 'obliquely ovale to e1ate', 1, 0, 0.0, 'straight', 'curved', 'present', 1, 'non prominent', 'narrow', 1, -2, 1, '1', 'stands out', 500.0),
('euglesa hibernicum', 'https://waarneming.nl/media/photo/18150160.jpg', NULL, 'rounded, oval', 1, 1, 0.0, 'straight-slightly curved', 'straight-slightly curved', 'not present', 0, 'non prominent', 'broad', 1, 2, 5, '1', 'fine', 300.0),
('euglesa lilljeborgii', NULL, NULL, 'rounded', 0, 0, 0.0, 'straight-slightly curved', 'strong', 'not present', 1, 'non prominent', 'narrow', 1, -1, 1, '1', 'coarse', 400.0),
('euglesa milium', 'https://waarnemingen.be/media/photo/30607315.jpg?w=500&h=375', 1, 'rounded rectangular', 0, 1, 0.0, 'straight-slightly curved', 'straight-slightly curved', 'not present', 1, 'non prominent', 'moderatly broad', 1, 2, 4, 'm', 'well defined', 350.0),
('odhneripisidium moitessierianum', 'https://waarneming.nl/media/photo/105763723.jpg', 0, 'quadrangular, wedge shaped', 1, NULL, 0.0, 'curved', 'strong', 'present', 0, 'no data', 'broad', NULL, NULL, 5, '1', 'well defined', 200.0),
('euglesa nitidum', 'https://waarneming.nl/media/photo/19316663.jpg', 1, 'oval', 0, 1, 0.0, 'slightly curved', 'slightly curved', 'not present', 0, 'prominent', 'broad', 0, 2, 5, 'm', NULL, 350.0),
('euglesa crassa', 'https://waarneming.nl/media/photo/32256920.jpg?w=500&h=375', 0, 'oval to sub-triangular', 1, NULL, 0.0, 'variable', 'strong', 'not present', 0, 'prominent', 'broad', 0, 2, 5, '1', NULL, 350.0),
('euglesa obtusale', 'https://waarneming.nl/media/photo/18874858.jpg', 1, 'swollen oval', 1, 1, 1.0, 'straight', 'straight', 'not present', 0, 'non prominent', 'no data', 1, 2, NULL, NULL, 'very faint', 300.0),
('euglesa personata', 'https://waarneming.nl/media/photo/24106427.jpg', 0, 'unknown', 0, 0, 1.0, 'straight', 'curved', 'not present', 1, 'prominent', 'broadend', 0, 2, NULL, NULL, 'very faint', 350.0),
('euglesa pseudosphaerium', 'https://waarneming.nl/media/photo/22113701.jpg', 0, 'oval to slightly quadrangular', 1, 1, 0.0, 'straight-slightly curved', 'straight-slightly curved', 'not present', 1, 'prominent', 'very broad', 0, 2, 6, '0', 'very faint', 300.0),
('euglesa pulchellum', 'https://inaturalist-open-data.s3.amazonaws.com/photos/299492862/large.jpg', 1, 'obliquely ovale', 1, 1, 0.0, 'slightly curved', 'slightly curved', 'not present', NULL, 'no data', 'moderatly broad', NULL, 2, 4, '1', 'stands out', 400.0),
('euglesa subtrancatum', 'https://waarnemingen.be/media/photo/84168196.jpg?w=500&h=375', NULL, 'obliquely ovale', 1, 1, 0.0, 'slightly curved', 'slightly curved', 'not present', 1, 'non prominent', 'broadend', 1, 2, NULL, 'm', 'stands out', 400.0),
('euglesa supinum', 'https://waarneming.nl/media/photo/15055063.jpg', 0, 'obliquely triangular', 1, 0, 0.0, 'straight-slightly curved', 'strong', 'present', 1, 'non prominent', 'narrow', 1, -2, 2, '1', 'stands out', 400.0),
('odhneripisidium tenuilineatum', 'https://api.gbif.org/v1/image/cache/fit-in/500x/occurrence/3011314639/media/6e827d24007d9a017ce4a0467b36ed3b', 0, 'obliq1ely triangular', 1, 1, 0.0, 'slightly curved', 'slightly curved', 'not present', 1, 'non prominent', 'broad', 1, 1, 5, '1', NULL, 200.0),
('euglesa compressa', 'https://waarneming.nl/media/photo/19003629.jpg', 0, 'sub-triangular', 0, 0, 0.0, 'straight-slightly curved', 'strong', 'present', 1, 'non prominent', 'narrow', 1, -1, 1, '1', 'well defined', 400.0),
('euglesa interstitiatilis', NULL, 0, 'near circular', 0, 0, 1.0, 'straight', 'slightly curved', 'not present', 0, 'prominent', 'broadend', 0, 2, NULL, NULL, 'fine', 260.0),
('euglesa globularis', 'https://waarneming.nl/media/photo/62153760.jpg', 0, 'subtriangular to rounded', 1, 0, 0.0, 'straight-slightly curved', 'strong', 'not present', 1, 'prominent', 'moderatly broad', 0, 2, 4, '1', 'very faint', 500.0);

-- Create index for faster querying
CREATE INDEX IF NOT EXISTS idx_pill_clams_species ON pill_clams(species);

-- Grant appropriate permissions (adjust based on your Supabase RLS policies)
-- Example: Allow public read access
ALTER TABLE pill_clams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to pill_clams"
  ON pill_clams
  FOR SELECT
  TO public
  USING (true);
