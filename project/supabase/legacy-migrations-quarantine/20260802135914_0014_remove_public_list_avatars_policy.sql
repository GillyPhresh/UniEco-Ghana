/*
# Remove broad SELECT policy on avatars bucket

## Security Change
The `public_read_avatars` policy allowed anon and authenticated users to
SELECT (list) all objects in the `avatars` bucket. Since `avatars` is a
public bucket, individual object URLs are accessible directly through the
public URL endpoint without any RLS policy — the broad SELECT was only
enabling file enumeration, which exposes more data than intended.

## What is removed
- `public_read_avatars` SELECT policy on `storage.objects`

## What is kept
- `auth_upload_avatars` — INSERT, authenticated, owner-scoped via auth.uid()
- `auth_update_avatars` — UPDATE, authenticated, owner-scoped via auth.uid()
- `auth_delete_avatars` — DELETE, authenticated, owner-scoped via auth.uid()

## Impact
- Public avatar URLs (e.g. /storage/v1/object/public/avatars/...) continue
  to work without any policy — public buckets serve objects by URL.
- Listing all files in the bucket via the Storage API is no longer possible
  for anon or authenticated users, preventing enumeration of every user's
  avatar.
*/

DROP POLICY IF EXISTS "public_read_avatars" ON storage.objects;