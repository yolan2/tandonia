// api/index.js - Main serverless function for Vercel
// Load local environment variables from .env when present
try {
  require('dotenv').config();
} catch (e) {
  // dotenv is optional in production environments
}

const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');

// Configure Supabase admin client when service credentials are available.
// Keeps reference defined even when env vars are missing to avoid ReferenceErrors.
let supabaseAdmin = null;
try {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (supabaseUrl && supabaseServiceRoleKey) {
    supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
  }
} catch (err) {
  console.warn('Supabase admin client initialization failed:', err.message);
  supabaseAdmin = null;
}

const SUPABASE_SPECIES_TABLES = (process.env.SUPABASE_SPECIES_TABLES || 'species,pill_clams')
  .split(',')
  .map((table) => table.trim())
  .filter(Boolean);

const normalizeNewsRow = (row, idx = 0) => ({
  id: row.id ?? row.news_id ?? idx + 1,
  title: row.title || row.Title || row.headline || 'Untitled',
  content: row.content || row.Content || row.body || row.excerpt || '',
  published_date: row.published_date || row.published_at || row.date || row.Date || null,
  image_url: row.image_url || row.image || row.ImageUrl || row.Image_URL || null,
  author: row.author || row.Author || row.byline || null,
  license: row.license || row.License || null
});

const normalizeSpeciesRow = (row, idx = 0) => {
  const id = row.id ?? row.species_id ?? row.slug_id ?? idx + 1;
  const scientificName = row.scientific_name || row.scientificName || row.species || row.name || row.title || '';
  const dutchName = row.dutch_name || row.dutchName || row.common_name || row.dutch || null;
  const observationCount = parseInt(
    row.observation_count ?? row.count ?? row.observationCount ?? row.observations ?? 0,
    10
  ) || 0;
  return {
    id,
    scientific_name: scientificName,
    dutch_name: dutchName,
    observation_count: observationCount
  };
};

const parseGeometry = (value) => {
  if (!value) return null;
  if (typeof value === 'object') return value;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch (_err) {
      return null;
    }
  }
  return null;
};

const normalizeGridCellRow = (row, idx = 0) => {
  const id = row.id ?? row.grid_id ?? row.name ?? `cell-${idx}`;
  const properties = row.properties || {};
  const geometry = row.geometry || row.geom || row.geojson || row.geo_json || null;
  const parsedGeometry = parseGeometry(geometry);
  if (!parsedGeometry) return null;
  return {
    type: 'Feature',
    id,
    geometry: parsedGeometry,
    properties
  };
};

const fetchSupabaseSpeciesTables = async () => {
  if (!supabaseAdmin) return null;
  for (const table of SUPABASE_SPECIES_TABLES) {
    try {
      const { data, error } = await supabaseAdmin.from(table).select('*');
      if (error) {
        if (error.code !== '42P01') {
          console.warn(`Supabase table ${table} query failed:`, error.message);
        }
        continue;
      }
      if (data && data.length) {
        const normalized = data.map((row, idx) => normalizeSpeciesRow(row, idx));
        normalized.sort((a, b) => (b.observation_count || 0) - (a.observation_count || 0));
        return normalized;
      }
    } catch (err) {
      console.warn(`Supabase table ${table} exception:`, err.message);
    }
  }
  return null;
};

const fetchPostgresSpeciesJoin = async () => {
  if (!pool) return null;
  try {
    const result = await pool.query(`
      SELECT id, scientific_name, dutch_name, COALESCE(observation_count, 0) AS observation_count
      FROM species
      ORDER BY observation_count DESC
    `);
    return result.rows;
  } catch (err) {
    console.warn('Postgres species table query failed:', err.message);
    return null;
  }
};

const app = express();
app.use(express.json());

// Enable CORS for the frontend site(s). Adjust origins as needed for other environments.
// Configure CORS with an allow-list. Add dev origins as needed.
const allowed = [
  'https://www.tandonia.be',
  'https://tandonia.be',
  'http://localhost:3000'
];

// dynamic origin check
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true); // allow server-to-server or curl (no Origin)
    // If origin is in the allow-list, allow it. If not, do NOT throw an error here
    // because some deployments propagate thrown errors as HTTP 500 responses
    // which can break clients and hide the real runtime error. Returning
    // `callback(null, false)` simply denies CORS for that origin without
    // generating a server exception.
    return allowed.indexOf(origin) !== -1 ? callback(null, true) : callback(null, false);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  credentials: true
}));

// ensure preflight allowed
app.options('*', cors());

// Database connection
let pool = null;
if (process.env.DATABASE_URL) {
  try {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });
  } catch (err) {
    console.warn('Postgres pool initialization failed:', err.message);
    pool = null;
  }
} else {
  console.warn('DATABASE_URL not set; Postgres-dependent endpoints will rely on Supabase only.');
}

// JWT secret - set this in your environment variables
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Middleware to verify JWT token
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  // If supabase admin client is available, prefer verifying via Supabase
  if (supabaseAdmin) {
    try {
      const { data, error } = await supabaseAdmin.auth.getUser(token);
      if (error || !data?.user) {
        return res.status(403).json({ error: 'Invalid token' });
      }
      req.user = { id: data.user.id, email: data.user.email };
      return next();
    } catch (err) {
      console.error('Supabase token verification error:', err);
      return res.status(403).json({ error: 'Invalid token' });
    }
  }

  // Fallback to local JWT verification
  try {
    const user = jwt.verify(token, JWT_SECRET);
    req.user = user;
    return next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid token' });
  }
};

// ============= AUTH ENDPOINTS =============

// Register new user
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;

    // Check if user exists
    const existingUser = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert user
    const result = await pool.query(
      'INSERT INTO users (email, password, name, created_at) VALUES ($1, $2, $3, NOW()) RETURNING id, email, name',
      [email, hashedPassword, name]
    );

    const user = result.rows[0];

    // Generate JWT
    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, {
      expiresIn: '7d'
    });

    res.json({ user, token });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user
    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];

    // Check password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate JWT
    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, {
      expiresIn: '7d'
    });

    res.json({
      user: { id: user.id, email: user.email, name: user.name },
      token
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============= GRID CELLS ENDPOINT =============

// Get grid cells GeoJSON
app.get('/api/grid-cells', async (req, res) => {
  try {
    if (supabaseAdmin) {
      try {
        const { data, error } = await supabaseAdmin
          .from('grid_cells')
          .select('id, geom, properties');
        if (error && error.code !== '42P01') {
          console.warn('Supabase grid_cells query failed:', error.message);
        } else if (data && data.length) {
          const features = data
            .map((row, idx) =>
              normalizeGridCellRow({
                id: row.id,
                properties: row.properties,
                geometry: row.geom
              }, idx)
            )
            .filter(Boolean);
          if (features.length) {
            return res.json({ type: 'FeatureCollection', features });
          }
        }
      } catch (err) {
        console.warn('Supabase grid_cells exception:', err.message);
      }
    }

    if (pool) {
      try {
        const result = await pool.query(`
          SELECT 
            id,
            ST_AsGeoJSON(geom)::json as geometry,
            properties
          FROM grid_cells
        `);

        const geojson = {
          type: 'FeatureCollection',
          features: result.rows
            .map((row, idx) => normalizeGridCellRow(row, idx))
            .filter(Boolean)
        };

        if (geojson.features.length) {
          return res.json(geojson);
        }
      } catch (err) {
        console.warn('Grid cells via Postgres failed:', err.message);
      }
    }

    return res.status(503).json({ error: 'Grid cells unavailable' });
  } catch (error) {
    console.error('Grid cells error:', error && error.stack ? error.stack : error);
    if (process.env.DEBUG_API_ERRORS === 'true') {
      return res.status(500).json({ error: 'Server error', detail: error.message, stack: error.stack });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

// ============= CHECKLIST ENDPOINTS =============

// Submit checklist
app.post('/api/checklists', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    const { gridCellId, locations = {}, species, timeSpent } = req.body;
    const normalizedLocations = { ...locations };
    if (!normalizedLocations.anthropogenous && normalizedLocations.urban) {
      normalizedLocations.anthropogenous = normalizedLocations.urban;
    }
    const userId = req.user.id;

    // Insert checklist
    const checklistResult = await client.query(`
      INSERT INTO checklists (user_id, grid_cell_id, time_spent_minutes, submitted_at)
      VALUES ($1, $2, $3, NOW())
      RETURNING id
    `, [userId, gridCellId, timeSpent]);

    const checklistId = checklistResult.rows[0].id;

    // Insert locations
    const locationTypes = ['forest', 'swamp', 'anthropogenous'];
    for (const locType of locationTypes) {
      if (normalizedLocations[locType]) {
        const { lat, lng } = normalizedLocations[locType];
        await client.query(`
          INSERT INTO checklist_locations (checklist_id, location_type, geom)
          VALUES ($1, $2, ST_SetSRID(ST_MakePoint($3, $4), 31370))
        `, [checklistId, locType, lng, lat]);
      }
    }

    // Insert species observations
    for (const [speciesName, count] of Object.entries(species)) {
      if (count > 0) {
        await client.query(`
          INSERT INTO species_observations (checklist_id, species_name, count)
          VALUES ($1, $2, $3)
        `, [checklistId, speciesName, count]);
      }
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      checklistId,
      message: 'Checklist submitted successfully'
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Checklist submission error:', error);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// Get user's checklists
app.get('/api/checklists', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        c.id,
        c.grid_cell_id,
        c.time_spent_minutes,
        c.submitted_at,
        COUNT(DISTINCT cl.id) as location_count,
        COUNT(DISTINCT so.id) as species_count
      FROM checklists c
      LEFT JOIN checklist_locations cl ON c.id = cl.checklist_id
      LEFT JOIN species_observations so ON c.id = so.checklist_id
      WHERE c.user_id = $1
      GROUP BY c.id
      ORDER BY c.submitted_at DESC
    `, [req.user.id]);

    res.json(result.rows);
  } catch (error) {
    console.error('Get checklists error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get checklist details
app.get('/api/checklists/:id', authenticateToken, async (req, res) => {
  try {
    const checklistId = req.params.id;

    // Get checklist info
    const checklistResult = await pool.query(`
      SELECT * FROM checklists WHERE id = $1 AND user_id = $2
    `, [checklistId, req.user.id]);

    if (checklistResult.rows.length === 0) {
      return res.status(404).json({ error: 'Checklist not found' });
    }

    const checklist = checklistResult.rows[0];

    // Get locations
    const locationsResult = await pool.query(`
      SELECT 
        location_type,
        ST_Y(geom) as lat,
        ST_X(geom) as lng
      FROM checklist_locations
      WHERE checklist_id = $1
    `, [checklistId]);

    // Get species observations
    const speciesResult = await pool.query(`
      SELECT species_name, count
      FROM species_observations
      WHERE checklist_id = $1
      ORDER BY species_name
    `, [checklistId]);

    res.json({
      ...checklist,
      locations: locationsResult.rows,
      species: speciesResult.rows
    });

  } catch (error) {
    console.error('Get checklist details error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============= NEWS ENDPOINTS =============

// Get news items (public)
app.get('/api/news', async (req, res) => {
  try {
    if (supabaseAdmin) {
      const { data, error } = await supabaseAdmin
        .from('news')
        .select('*')
        .limit(50);
      if (error && error.code !== '42P01') {
        console.warn('Supabase news query failed:', error.message);
      } else if (data && data.length) {
        const normalized = data.map(normalizeNewsRow);
        normalized.sort((a, b) => {
          const aDate = new Date(a.published_date || 0).getTime();
          const bDate = new Date(b.published_date || 0).getTime();
          return bDate - aDate;
        });
        return res.json(normalized);
      }
    }

    if (pool) {
      try {
        const result = await pool.query(`
          SELECT to_jsonb(news.*) AS row
          FROM news
          ORDER BY COALESCE(news.published_date, news.date, news."Date", news.created_at) DESC
          LIMIT 50
        `);
        if (result.rows.length) {
          return res.json(result.rows.map((row, idx) => normalizeNewsRow(row.row, idx)));
        }
      } catch (err) {
        console.warn('Get news via Postgres failed:', err.message);
      }
    }

    return res.status(503).json({ error: 'News data unavailable' });
  } catch (error) {
    console.error('Get news error:', error && error.stack ? error.stack : error);
    if (process.env.DEBUG_API_ERRORS === 'true') {
      return res.status(500).json({ error: 'Server error', detail: error.message, stack: error.stack });
    }
    res.status(500).json({ error: 'Server error', detail: error.message });
  }
});

// ============= SPECIES ENDPOINT =============

// Returns species list with observation counts. Prefers Supabase tables (species or pill_clams)
// and falls back to Postgres or local JSON when upstream data is missing.
app.get('/api/species', async (req, res) => {
  try {
    const supabaseSpecies = await fetchSupabaseSpeciesTables();
    if (supabaseSpecies && supabaseSpecies.length) {
      return res.json(supabaseSpecies);
    }

    const postgresSpecies = await fetchPostgresSpeciesJoin();
    if (postgresSpecies && postgresSpecies.length) {
      return res.json(postgresSpecies);
    }

    return res.status(503).json({ error: 'Species data unavailable' });
  } catch (err) {
    console.error('Failed to load species:', err && err.stack ? err.stack : err);
    if (process.env.DEBUG_API_ERRORS === 'true') {
      return res.status(500).json({ error: 'Server error', detail: err.message, stack: err.stack });
    }
    return res.status(500).json({ error: 'Server error' });
  }
});

// Health check (lightweight, doesn't require DB)
app.get('/health', (req, res) => {
  res.json({ ok: true, uptime_seconds: process.uptime() });
});

// Export for Vercel serverless
module.exports = app;

// For local development
if (require.main === module) {
  const PORT = process.env.PORT || 3002;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

// --- Error handler: ensure CORS headers are present even on internal errors
// This prevents the browser from receiving a 500 with no CORS headers which
// would make debugging harder. It also ensures we return JSON errors.
app.use((err, req, res, next) => {
  try {
    // Mirror the Origin header if present and allowed, otherwise fall back to first allowed origin
    const origin = req.headers.origin;
    if (origin && allowed.indexOf(origin) !== -1) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    } else {
      res.setHeader('Access-Control-Allow-Origin', allowed[0] || '*');
    }
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,Accept');
  } catch (e) {
    // ignore header-setting errors
  }

  console.error('Unhandled error:', err && err.stack ? err.stack : err);
  if (res.headersSent) return next(err);
  res.status((err && err.status) || 500).json({ error: (err && err.message) || 'Server error' });
});