# Author and Copyright Display for News Images

## What was done:

### 1. Backend Update (tandonia_backend.js)
✅ Updated the `/api/news` endpoint to include `image_url`, `author`, and `license` fields in the response.

### 2. Frontend (TandoniaApp.tsx)
✅ Already properly configured to display author and copyright information below each image.
✅ Uses multilingual translations for:
   - English: "Photo by {author}" and "License: {license}"
   - Dutch: "Foto door {author}" and "Licentie: {license}"
   - French: "Photo : {author}" and "Licence : {license}"

### 3. Database Schema (add_news_metadata.sql)
✅ Created SQL migration file to add the necessary columns to your `news` table.

## What you need to do:

### Step 1: Run the Database Migration
Execute the SQL file against your PostgreSQL database:

```bash
psql -U your_username -d your_database_name -f add_news_metadata.sql
```

Or if you're using a GUI tool like pgAdmin or DBeaver:
- Open the file `add_news_metadata.sql`
- Run it against your database

This will add three new columns to your `news` table:
- `image_url` (TEXT) - URL of the image
- `author` (VARCHAR(255)) - Author/photographer name
- `license` (VARCHAR(255)) - License/copyright information (e.g., "CC BY 4.0", "© 2025 Your Name")

### Step 2: Add Metadata to Your News Items
Update your existing news items with author and license information:

```sql
-- Example queries:
UPDATE news 
SET author = 'John Doe', 
    license = 'CC BY 4.0',
    image_url = 'https://example.com/image.jpg'
WHERE id = 1;

UPDATE news 
SET author = 'Jane Smith', 
    license = '© 2025 Jane Smith',
    image_url = 'https://example.com/another-image.jpg'
WHERE id = 2;
```

### Step 3: Deploy Backend Changes
Deploy the updated `tandonia_backend.js` to your server/hosting platform.

### Step 4: Deploy Frontend Changes
The frontend has already been built. Deploy the `frontend/dist` folder to your hosting platform.

## Result:
Once completed, every news item with an image will automatically display:
- The image (properly sized)
- Author information below the image (when provided)
- License/copyright information (when provided)
- Proper formatting with a separator (·) between author and license

## Example Display:
```
[Image of a slug]
Photo by John Doe · License: CC BY 4.0

News Title Here
News content goes here...
```

The information will be displayed in the appropriate language based on the user's selection.
