/*
# University Branding & Landmark Images

## Overview
Adds database columns for university-specific visual identity (hero/landmark image,
alt text, image credits) and creates a secure Supabase Storage bucket for
university branding assets. Seeds the UENR logo URL from the public assets folder.

## New Columns on `universities` (all nullable, no data loss)
1. `hero_image_url` (text) — URL of the university's landmark/hero image
2. `logo_alt_text` (text) — Accessible alt text for the logo image
3. `hero_alt_text` (text) — Accessible alt text for the hero/landmark image
4. `image_credit` (text) — Optional attribution/credit for the hero image
5. `image_source` (text) — Optional source URL or description for the hero image

These columns are public-facing branding content; the existing `public_select_enabled_universities`
SELECT policy (anon + authenticated, `is_enabled = true`) already exposes all columns,
and the existing `admin_update_universities` UPDATE policy (super_admin) already covers them.
No new RLS policies needed on the `universities` table itself.

## New Storage Bucket
- `university-branding` — public read, admin-only write/update/delete
  - Max file size: 5 MB
  - Allowed MIME types: image/jpeg, image/png, image/webp
  - RLS: public SELECT, super_admin-only INSERT/UPDATE/DELETE

## Data Seed
- Sets UENR's `logo_url` to the public asset path `/assets/universities/UENR/UENR_LOGO.png`
- Sets UENR's `logo_alt_text` to an accessible description

## Security
- Storage policies gate all writes on `auth.jwt() ->> 'role' = 'super_admin'`
- Public can read bucket objects (logos and hero images are public-facing branding)
- No private storage paths exposed for sensitive admin assets
*/

-- ============================================================================
-- 1. ADD COLUMNS TO universities
-- ============================================================================

ALTER TABLE universities
  ADD COLUMN IF NOT EXISTS hero_image_url text,
  ADD COLUMN IF NOT EXISTS logo_alt_text text,
  ADD COLUMN IF NOT EXISTS hero_alt_text text,
  ADD COLUMN IF NOT EXISTS image_credit text,
  ADD COLUMN IF NOT EXISTS image_source text;

-- ============================================================================
-- 2. CREATE university-branding STORAGE BUCKET
-- ============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'university-branding',
  'university-branding',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 3. STORAGE POLICIES (idempotent — drop first, then create)
-- ============================================================================

-- Public read: anyone can view university branding images
DROP POLICY IF EXISTS "public_read_university_branding" ON storage.objects;
CREATE POLICY "public_read_university_branding"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'university-branding');

-- Admin-only insert
DROP POLICY IF EXISTS "admin_upload_university_branding" ON storage.objects;
CREATE POLICY "admin_upload_university_branding"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'university-branding'
  AND auth.jwt() ->> 'role' = 'super_admin'
);

-- Admin-only update
DROP POLICY IF EXISTS "admin_update_university_branding" ON storage.objects;
CREATE POLICY "admin_update_university_branding"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'university-branding'
  AND auth.jwt() ->> 'role' = 'super_admin'
)
WITH CHECK (
  bucket_id = 'university-branding'
  AND auth.jwt() ->> 'role' = 'super_admin'
);

-- Admin-only delete
DROP POLICY IF EXISTS "admin_delete_university_branding" ON storage.objects;
CREATE POLICY "admin_delete_university_branding"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'university-branding'
  AND auth.jwt() ->> 'role' = 'super_admin'
);

-- ============================================================================
-- 4. SEED UENR LOGO
-- ============================================================================

UPDATE universities
SET
  logo_url = '/assets/universities/UENR/UENR_LOGO.png',
  logo_alt_text = 'University of Energy and Natural Resources official logo',
  updated_at = now()
WHERE slug = 'uenr'
  AND (logo_url IS NULL OR logo_url = '');
