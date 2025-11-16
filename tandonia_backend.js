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
// Optional Supabase admin client (used when SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided)
let supabaseAdmin = null;
if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
  try {
    const { createClient } = require('@supabase/supabase-js');
    supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    console.log('Supabase admin client initialized');
  } catch (err) {
    console.warn('Could not initialize supabase admin client:', err.message);
  }
}

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
    return allowed.indexOf(origin) !== -1 ? callback(null, true) : callback(new Error('Not allowed by CORS'));
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
    const result = await pool.query(`
      SELECT id, title, content, published_date, image_url, author, license
      FROM news
      ORDER BY published_date DESC
      LIMIT 50
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Get news error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============= SPECIES ENDPOINT =============

// Returns species list with observation counts. Will try to use a master `species` table
// if available; otherwise falls back to aggregating `species_observations`.
app.get('/api/species', async (req, res) => {
  try {
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
  } catch (err) {
    // If the `species` table doesn't exist or the query fails, fall back to aggregating
    // species_observations. This supports installations where only observations are stored.
    console.warn('species table query failed, falling back to aggregated observations:', err.message);
    try {
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
    } catch (err2) {
      console.error('Failed to aggregate species observations:', err2);
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
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}