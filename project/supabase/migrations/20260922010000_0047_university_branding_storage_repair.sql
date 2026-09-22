BEGIN;

-- Staging repair: the directory data was present but the dedicated public
-- branding bucket was not.  Keep this bucket intentionally narrow: only an
-- authenticated platform admin or assigned university administrator may
-- manage files inside that university's slug folder.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'university-branding',
  'university-branding',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS university_branding_admin_write ON storage.objects;

CREATE POLICY university_branding_admin_write
ON storage.objects
FOR ALL
TO authenticated
USING (
  bucket_id = 'university-branding'
  AND EXISTS (
    SELECT 1
    FROM public.universities university
    WHERE university.slug = (storage.foldername(name))[1]
      AND public.can_manage_university(university.id)
  )
)
WITH CHECK (
  bucket_id = 'university-branding'
  AND EXISTS (
    SELECT 1
    FROM public.universities university
    WHERE university.slug = (storage.foldername(name))[1]
      AND public.can_manage_university(university.id)
  )
);

COMMIT;
