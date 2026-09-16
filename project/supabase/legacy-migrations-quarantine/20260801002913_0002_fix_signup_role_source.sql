/*
# Fix: read signup role from user metadata

## Why
The Supabase client SDK's signUp() cannot set app_metadata (that is server-only).
It can only set user_metadata via the `data` option. The original handle_new_user
trigger read the role from raw_app_meta_data, which is never populated on client
signups. This migration updates the trigger to read from raw_user_meta_data
instead, so the role selected at signup is honored.

## Changes
- handle_new_user() now reads role from NEW.raw_user_meta_data ->> 'role'.
- Falls back to 'student' (role_id 2) when no role is provided.
*/

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role_id, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      (SELECT id FROM public.user_roles WHERE name = NEW.raw_user_meta_data ->> 'role'),
      2
    ),
    NEW.raw_user_meta_data ->> 'full_name',
    NEW.raw_user_meta_data ->> 'avatar_url'
  );
  RETURN NEW;
END;
$$;