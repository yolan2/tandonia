# Pill Clams Database Setup Guide

## Overview
The pill clams identification tool now queries data from a Supabase database table instead of using hardcoded data. This makes it easier to manage and update species data.

## Database Setup

### Step 1: Run the SQL Migration

Execute the SQL file `create_pill_clams_table.sql` in your Supabase SQL editor:

1. Open your Supabase project dashboard
2. Navigate to the **SQL Editor**
3. Copy the contents of `create_pill_clams_table.sql`
4. Paste and execute the SQL

This will:
- Create a `pill_clams` table with all necessary columns
- Insert 20 species with their characteristics
- Create an index for faster queries
- Set up Row Level Security (RLS) to allow public read access

### Step 2: Verify the Data

After running the migration, verify the data was inserted correctly:

```sql
SELECT COUNT(*) FROM pill_clams;
-- Should return 20

SELECT species, image_url FROM pill_clams LIMIT 5;
-- Should show the first 5 species with their image URLs
```

## Database Schema

The `pill_clams` table includes the following columns:

- `id` (SERIAL PRIMARY KEY) - Auto-incrementing unique identifier
- `species` (VARCHAR) - Species name (e.g., "euglesa casertanum")
- `image_url` (TEXT) - URL to species image
- `glossy` (INTEGER) - Shell glossiness (0, 1, or NULL)
- `shape` (TEXT) - Shell shape description
- `striation_regular` (INTEGER) - Shell striation regularity (0, 1, or NULL)
- `posterior_point` (INTEGER) - Posterior point presence (0, 1, or NULL)
- `callus_present` (NUMERIC) - Callus presence (0.0, 1.0)
- `c4_shape` (TEXT) - C4 shape description
- `c2_shape` (TEXT) - C2 shape description
- `plica` (TEXT) - Plica presence ("present" or "not present")
- `ligament_long` (INTEGER) - Ligament length (0, 1, or NULL)
- `umbo_taal` (TEXT) - Umbo visibility
- `ligamentpit_shape` (TEXT) - Ligament pit shape
- `umbo_prominent` (INTEGER) - Umbo prominence (0, 1, or NULL)
- `umbo_width` (INTEGER) - Umbo width measurement
- `ligament_pit_width` (INTEGER) - Ligament pit width measurement
- `laterals_developed` (TEXT) - Lateral development
- `striation_strength` (TEXT) - Striation strength description
- `size_mm` (NUMERIC) - Size in millimeters
- `created_at` (TIMESTAMP) - Record creation timestamp
- `updated_at` (TIMESTAMP) - Record update timestamp

## How It Works

### Frontend Integration

The identification page (`PillClamsIdentificationPage` component) now:

1. **Loads species data on mount** using the Supabase client
2. **Displays a loading state** while fetching data
3. **Handles errors gracefully** if Supabase is unavailable
4. **Transforms the data** to match the expected format (converts `image_url` to `image`)
5. **Filters species** based on user answers using the same logic as before

### Data Flow

```
User visits Pill Clams ID page
    ↓
Component mounts and triggers useEffect
    ↓
Fetches data from Supabase: SELECT * FROM pill_clams
    ↓
Transforms data (image_url → image)
    ↓
Displays questions and examples
    ↓
User answers questions
    ↓
Filters species based on characteristics
    ↓
Shows matching species with images
```

## Managing Species Data

### Adding a New Species

```sql
INSERT INTO pill_clams (
  species, image_url, glossy, shape, striation_regular, posterior_point,
  callus_present, c4_shape, c2_shape, plica, ligament_long, umbo_taal,
  ligamentpit_shape, umbo_prominent, umbo_width, ligament_pit_width,
  laterals_developed, striation_strength, size_mm
) VALUES (
  'new species name',
  'https://example.com/image.jpg',
  1, -- or 0, or NULL
  'shell shape description',
  1, -- or 0, or NULL
  0, -- or 1, or NULL
  0.0, -- or 1.0
  'c4 shape',
  'c2 shape',
  'present', -- or 'not present'
  1, -- or 0, or NULL
  'prominent', -- or 'non prominent', etc.
  'shape description',
  0, -- or 1, or NULL
  2, -- width measurement
  4, -- width measurement
  '1', -- or '0', 'm', NULL
  'strength description',
  350.0 -- size in mm
);
```

### Updating a Species

```sql
UPDATE pill_clams
SET image_url = 'https://new-image-url.com/photo.jpg',
    glossy = 1,
    updated_at = NOW()
WHERE species = 'euglesa casertanum';
```

### Deleting a Species

```sql
DELETE FROM pill_clams
WHERE species = 'species to delete';
```

## Security

The table has Row Level Security (RLS) enabled with a policy that allows:
- **Public read access** - Anyone can query the species data
- **No public write access** - Only authenticated admin users can modify data

To modify the RLS policy or add admin write access, adjust the policies in Supabase dashboard under **Authentication > Policies**.

## Troubleshooting

### "Failed to load species data" Error

If users see this error:

1. **Check Supabase connection**: Verify `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set correctly
2. **Check RLS policies**: Ensure the public read policy is active
3. **Verify table exists**: Run `SELECT * FROM pill_clams LIMIT 1` in Supabase SQL editor
4. **Check network**: Ensure the frontend can reach Supabase (no CORS issues)

### No Species Showing Up

1. **Check data**: Run `SELECT COUNT(*) FROM pill_clams` to verify data exists
2. **Check browser console**: Look for JavaScript errors or failed network requests
3. **Verify image URLs**: Some species may not display if their `image_url` is NULL or invalid

### Questions Not Working

1. **Check column names**: Ensure the question `key` values match the database column names exactly
2. **Verify data types**: Ensure integer columns have integers (not strings) for 0/1 values

## Benefits of Database-Driven Approach

✅ **Easy Updates**: Change species data without rebuilding the frontend
✅ **Centralized Management**: One source of truth for all species data
✅ **Scalability**: Add thousands of species without increasing bundle size
✅ **Data Integrity**: Database constraints ensure consistent data
✅ **Future Features**: Can add API endpoints, admin panels, user contributions, etc.
✅ **Versioning**: Track changes with `created_at` and `updated_at` timestamps

## Next Steps

Consider adding:
- Admin panel for managing species data
- User-contributed species observations
- Multi-language support for species descriptions
- Advanced search and filtering
- Species comparison tool
- Download/export functionality
