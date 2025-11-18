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
const fs = require('fs');
const path = require('path');

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

// Lazy-load fallback JSON so the API can still respond when the database/Supabase
// credentials are missing in the deployment environment.
const fallbackCache = {};
const loadFallback = (file) => {
  if (fallbackCache[file]) return fallbackCache[file];
  try {
    const fullPath = path.join(__dirname, 'data', file);
    const raw = fs.readFileSync(fullPath, 'utf8');
    fallbackCache[file] = JSON.parse(raw);
    return fallbackCache[file];
  } catch (err) {
    console.warn(`Fallback data unavailable for ${file}:`, err.message);
    fallbackCache[file] = [];
    return fallbackCache[file];
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
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

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
    const result = await pool.query(`
      SELECT 
        id,
        ST_AsGeoJSON(geom)::json as geometry,
        properties
      FROM grid_cells
    `);

    const geojson = {
      type: 'FeatureCollection',
      features: result.rows.map(row => ({
        type: 'Feature',
        id: row.id,
        geometry: row.geometry,
        properties: row.properties || {}
      }))
    };

    res.json(geojson);
  } catch (error) {
    console.error('Grid cells error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============= CHECKLIST ENDPOINTS =============

// Submit checklist
app.post('/api/checklists', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    const { gridCellId, locations, species, timeSpent } = req.body;
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
      if (locations[locType]) {
        const { lat, lng } = locations[locType];
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
        .select('id, title, content, published_date, image_url, author, license')
        .order('published_date', { ascending: false })
        .limit(50);
      if (error) throw error;
      res.json(data || []);
    } else {
      // Fallback to pool if no supabaseAdmin
      const result = await pool.query(`
        SELECT id, title, content, published_date, image_url, author, license
        FROM news
        ORDER BY published_date DESC
        LIMIT 50
      `);
      res.json(result.rows);
    }
  } catch (error) {
    console.error('Get news error:', error && error.stack ? error.stack : error);
    // If table doesn't exist, return empty array instead of 500
    if (error.code === '42P01' || error.code === 'PGRST116' || error.message?.includes('does not exist')) {
      return res.json([]);
    }
    const fallbackNews = loadFallback('news.fallback.json');
    if (fallbackNews.length) {
      console.warn('Serving fallback news dataset due to upstream failure.');
      return res.json(fallbackNews);
    }
    // Expose detailed error only when explicitly enabled via environment variable
    if (process.env.DEBUG_API_ERRORS === 'true') {
      return res.status(500).json({ error: 'Server error', detail: error.message, stack: error.stack });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

// ============= SPECIES ENDPOINT =============

// Returns species list with observation counts. Will try to use a master `species` table
// if available; otherwise falls back to aggregating `species_observations`.
app.get('/api/species', async (req, res) => {
  try {
    if (supabaseAdmin) {
      // Try to get species with counts using Supabase
      const { data: speciesData, error: speciesError } = await supabaseAdmin
        .from('species')
        .select('id, scientific_name, dutch_name');
      if (!speciesError && speciesData) {
        // Get observation counts
        const { data: obsData, error: obsError } = await supabaseAdmin
          .from('species_observations')
          .select('species_name, count');
        if (!obsError && obsData) {
          // Aggregate counts
          const countMap = {};
          obsData.forEach(obs => {
            const name = obs.species_name;
            countMap[name] = (countMap[name] || 0) + obs.count;
          });
          // Map to result
          const result = speciesData.map(s => ({
            id: s.id,
            scientific_name: s.scientific_name,
            dutch_name: s.dutch_name,
            observation_count: countMap[s.scientific_name] || countMap[s.dutch_name] || 0
          })).sort((a, b) => b.observation_count - a.observation_count);
          return res.json(result);
        }
      }
      // Fallback to aggregating species_observations
      const { data: aggData, error: aggError } = await supabaseAdmin
        .from('species_observations')
        .select('species_name, count');
      if (aggError) throw aggError;
      // Aggregate
      const countMap = {};
      aggData.forEach(obs => {
        const name = obs.species_name;
        countMap[name] = (countMap[name] || 0) + obs.count;
      });
      const rows = Object.entries(countMap).map(([name, count]) => ({
        id: null,
        scientific_name: name,
        dutch_name: null,
        observation_count: count
      })).sort((a, b) => b.observation_count - a.observation_count);
      return res.json(rows);
    } else {
      // Fallback to pool
      // Try to read from a master `species` table and join aggregated counts.
      const result = await pool.query(`
        SELECT s.id, s.scientific_name, s.dutch_name, COALESCE(SUM(so.count),0) AS observation_count
        FROM species s
        LEFT JOIN species_observations so
          ON so.species_name = s.scientific_name OR so.species_name = s.dutch_name
        GROUP BY s.id, s.scientific_name, s.dutch_name
        ORDER BY observation_count DESC
      `);
      return res.json(result.rows);
    }
  } catch (err) {
    console.warn('species table query failed, falling back to aggregated observations:', err.message);
    try {
      if (supabaseAdmin) {
        const { data: aggData, error: aggError } = await supabaseAdmin
          .from('species_observations')
          .select('species_name, count');
        if (aggError) throw aggError;
        // Aggregate
        const countMap = {};
        aggData.forEach(obs => {
          const name = obs.species_name;
          countMap[name] = (countMap[name] || 0) + obs.count;
        });
        const rows = Object.entries(countMap).map(([name, count]) => ({
          id: null,
          scientific_name: name,
          dutch_name: null,
          observation_count: count
        })).sort((a, b) => b.observation_count - a.observation_count);
        return res.json(rows);
      } else {
        const agg = await pool.query(`
          SELECT species_name AS scientific_name, SUM(count) AS observation_count
          FROM species_observations
          GROUP BY species_name
          ORDER BY observation_count DESC
        `);
        // Map to a consistent shape expected by the frontend
        const rows = agg.rows.map(r => ({
          id: null,
          scientific_name: r.scientific_name,
          dutch_name: null,
          observation_count: parseInt(r.observation_count, 10)
        }));
        return res.json(rows);
      }
    } catch (err2) {
      console.error('Failed to aggregate species observations:', err2 && err2.stack ? err2.stack : err2);
      const fallbackSpecies = loadFallback('species.fallback.json');
      if (fallbackSpecies.length) {
        console.warn('Serving fallback species dataset due to upstream failure.');
        return res.json(fallbackSpecies);
      }
      if (process.env.DEBUG_API_ERRORS === 'true') {
        return res.status(500).json({ error: 'Server error', detail: err2.message, stack: err2.stack });
      }
      return res.status(500).json({ error: 'Server error' });
    }
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