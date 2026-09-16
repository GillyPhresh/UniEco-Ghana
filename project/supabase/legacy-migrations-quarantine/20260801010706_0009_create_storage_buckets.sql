/*
# Create storage buckets for IAM file uploads

Three buckets for the identity system:
- avatars: public bucket for user profile photos
- student-documents: private bucket for student ID uploads (verification)
- vendor-documents: private bucket for vendor business documents (verification)

All buckets allow authenticated users to upload to their own folder path.
*/

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('avatars', 'avatars', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
  ('student-documents', 'student-documents', false, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  ('vendor-documents', 'vendor-documents', false, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
ON CONFLICT (id) DO NOTHING;

-- Avatars: public read, authenticated write to own folder
DROP POLICY IF EXISTS "public_read_avatars" ON storage.objects;
CREATE POLICY "public_read_avatars"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "auth_upload_avatars" ON storage.objects;
CREATE POLICY "auth_upload_avatars"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "auth_update_avatars" ON storage.objects;
CREATE POLICY "auth_update_avatars"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text)
WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "auth_delete_avatars" ON storage.objects;
CREATE POLICY "auth_delete_avatars"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Student documents: owner read/write, staff read
DROP POLICY IF EXISTS "owner_read_student_docs" ON storage.objects;
CREATE POLICY "owner_read_student_docs"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'student-documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "staff_read_student_docs" ON storage.objects;
CREATE POLICY "staff_read_student_docs"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'student-documents'
  AND auth.jwt() ->> 'role' IN ('moderator', 'super_admin')
);

DROP POLICY IF EXISTS "owner_upload_student_docs" ON storage.objects;
CREATE POLICY "owner_upload_student_docs"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'student-documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "owner_delete_student_docs" ON storage.objects;
CREATE POLICY "owner_delete_student_docs"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'student-documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Vendor documents: owner read/write, staff read
DROP POLICY IF EXISTS "owner_read_vendor_docs" ON storage.objects;
CREATE POLICY "owner_read_vendor_docs"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'vendor-documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "staff_read_vendor_docs" ON storage.objects;
CREATE POLICY "staff_read_vendor_docs"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'vendor-documents'
  AND auth.jwt() ->> 'role' IN ('moderator', 'super_admin')
);

DROP POLICY IF EXISTS "owner_upload_vendor_docs" ON storage.objects;
CREATE POLICY "owner_upload_vendor_docs"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'vendor-documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "owner_delete_vendor_docs" ON storage.objects;
CREATE POLICY "owner_delete_vendor_docs"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'vendor-documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
);