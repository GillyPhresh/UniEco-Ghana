/*
# Add opening_hours and unique slug constraints

## Modified Tables
### vendors
- Added opening_hours (jsonb) for weekly opening hours

### events, products, services
- Added unique constraints on slug columns for URL-based lookups
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'vendors' AND column_name = 'opening_hours') THEN
    ALTER TABLE vendors ADD COLUMN opening_hours jsonb DEFAULT '{}';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'events_slug_key') THEN
    ALTER TABLE events ADD CONSTRAINT events_slug_key UNIQUE (slug);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_slug_key') THEN
    ALTER TABLE products ADD CONSTRAINT products_slug_key UNIQUE (slug);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'services_slug_key') THEN
    ALTER TABLE services ADD CONSTRAINT services_slug_key UNIQUE (slug);
  END IF;
END $$;