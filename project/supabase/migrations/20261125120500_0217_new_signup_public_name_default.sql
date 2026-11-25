-- Run after the new public-name notice is live on every signup entry point.
-- SET DEFAULT affects future inserts only. Do not backfill existing accounts.
ALTER TABLE public.profiles ALTER COLUMN show_registered_name SET DEFAULT true;
