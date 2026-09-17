-- A3.13.2: normalized private vendor verification documents and narrow access authorization.
BEGIN;

CREATE TABLE IF NOT EXISTS public.verification_request_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  verification_request_id uuid NOT NULL REFERENCES public.verification_requests(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  bucket_id text NOT NULL DEFAULT 'vendor-documents' CHECK (bucket_id = 'vendor-documents'),
  object_path text NOT NULL,
  document_type text NOT NULL DEFAULT 'verification_document',
  original_filename text,
  mime_type text,
  uploaded_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bucket_id, object_path)
);

ALTER TABLE public.verification_request_documents ENABLE ROW LEVEL SECURITY;

-- Existing JSON references are intentionally preserved. Backfill only opaque paths
-- that exactly match the request owner's vendor-documents folder; ambiguous values
-- are ignored rather than granting access based on a guessed relationship.
INSERT INTO public.verification_request_documents
  (verification_request_id, vendor_id, object_path, document_type, original_filename, uploaded_by)
SELECT vr.id, v.id,
       regexp_replace(d.value->>'url', '^.*?/storage/v1/object/public/vendor-documents/', ''),
       COALESCE(NULLIF(d.value->>'type',''), 'verification_document'),
       NULLIF(d.value->>'label',''), vr.user_id
FROM public.verification_requests vr
JOIN public.vendors v ON v.owner_id = vr.user_id
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(vr.documents, '[]'::jsonb)) d(value)
WHERE jsonb_typeof(d.value) = 'object'
  AND (d.value->>'url') ~ ('^https?://[^/]+/storage/v1/object/public/vendor-documents/' || vr.user_id::text || '/')
ON CONFLICT (bucket_id, object_path) DO NOTHING;

CREATE OR REPLACE FUNCTION public.submit_own_vendor_verification_request(p_request_type text, p_documents jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_request_id uuid; v_vendor_id uuid; v_document jsonb; v_path text; BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF p_request_type NOT IN ('student_id','vendor_business') OR jsonb_typeof(p_documents) <> 'array' OR jsonb_array_length(p_documents)=0 THEN RAISE EXCEPTION 'Invalid verification request' USING ERRCODE='22023'; END IF;
  SELECT id INTO v_vendor_id FROM public.vendors WHERE owner_id=auth.uid() LIMIT 1 FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Vendor access denied' USING ERRCODE='42501'; END IF;
  INSERT INTO public.verification_requests(user_id,request_type,documents,status) VALUES(auth.uid(),p_request_type,p_documents,'pending') RETURNING id INTO v_request_id;
  FOR v_document IN SELECT value FROM jsonb_array_elements(p_documents) LOOP
    v_path := v_document->>'url';
    IF v_path IS NULL OR v_path !~ ('^' || auth.uid()::text || '/[^/].*') OR NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id='vendor-documents' AND o.name=v_path) THEN RAISE EXCEPTION 'Invalid private verification document' USING ERRCODE='22023'; END IF;
    INSERT INTO public.verification_request_documents(verification_request_id,vendor_id,object_path,document_type,original_filename,mime_type,uploaded_by)
    VALUES(v_request_id,v_vendor_id,v_path,COALESCE(NULLIF(v_document->>'type',''),'verification_document'),NULLIF(v_document->>'label',''),NULLIF(v_document->>'mime_type',''),auth.uid());
  END LOOP;
  RETURN v_request_id;
END $$;

CREATE OR REPLACE FUNCTION public.authorize_verification_document_access(p_document_id uuid)
RETURNS TABLE(document_id uuid, bucket_id text, object_path text, owner_id uuid, expires_in_seconds integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_owner uuid; v_university uuid; BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  SELECT v.owner_id, v.university_id INTO v_owner, v_university
  FROM public.verification_request_documents d
  JOIN public.verification_requests r ON r.id=d.verification_request_id
  JOIN public.vendors v ON v.id=d.vendor_id AND v.owner_id=r.user_id
  WHERE d.id=p_document_id AND d.is_active
  FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Verification document not found' USING ERRCODE='P0002'; END IF;
  IF auth.uid() <> v_owner THEN
    -- A university administrator is always constrained to an active assigned
    -- university, even if that role is later granted a review permission.
    IF public.current_app_role()='university_admin' AND NOT public.can_manage_university(v_university) THEN
      RAISE EXCEPTION 'Verification document access denied' USING ERRCODE='42501';
    ELSIF NOT public.has_permission('can_review_verifications')
       AND NOT public.can_manage_university(v_university) THEN
      RAISE EXCEPTION 'Verification document access denied' USING ERRCODE='42501';
    END IF;
  END IF;
  RETURN QUERY SELECT d.id, d.bucket_id, d.object_path, v_owner, 300
  FROM public.verification_request_documents d WHERE d.id=p_document_id AND d.is_active;
END $$;

REVOKE ALL ON TABLE public.verification_request_documents FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.submit_own_vendor_verification_request(text,jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.authorize_verification_document_access(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.submit_own_vendor_verification_request(text,jsonb), public.authorize_verification_document_access(uuid) TO authenticated;
COMMIT;
