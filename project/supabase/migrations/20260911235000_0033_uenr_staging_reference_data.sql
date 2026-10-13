-- Approved staging operational reference data: University of Energy and Natural Resources.
-- This intentionally contains no users, vendors, marketplace, financial, or messaging data.
BEGIN;

INSERT INTO public.universities (
  name,
  short_name,
  slug,
  is_enabled
)
VALUES (
  'University of Energy and Natural Resources',
  'UENR',
  'uenr',
  true
)
ON CONFLICT (slug) DO UPDATE
SET
  name = EXCLUDED.name,
  short_name = EXCLUDED.short_name,
  is_enabled = true,
  updated_at = now();

COMMIT;
