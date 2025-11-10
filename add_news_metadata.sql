-- Add author, license, and image_url columns to news table
-- This migration is safe to run multiple times (it will skip if columns already exist)

-- Add image_url column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'news' AND column_name = 'image_url'
    ) THEN
        ALTER TABLE news ADD COLUMN image_url TEXT;
    END IF;
END $$;

-- Add author column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'news' AND column_name = 'author'
    ) THEN
        ALTER TABLE news ADD COLUMN author VARCHAR(255);
    END IF;
END $$;

-- Add license column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'news' AND column_name = 'license'
    ) THEN
        ALTER TABLE news ADD COLUMN license VARCHAR(255);
    END IF;
END $$;

-- Example: Update existing news items with sample author and license information
-- Uncomment and modify these lines if you want to add metadata to existing items
-- UPDATE news SET author = 'Your Name', license = 'CC BY 4.0' WHERE id = 1;
-- UPDATE news SET author = 'Photographer Name', license = 'CC BY-SA 4.0' WHERE id = 2;
