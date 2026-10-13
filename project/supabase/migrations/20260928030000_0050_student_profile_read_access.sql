BEGIN;

-- Student onboarding must be able to discover an existing profile before it
-- decides whether to update or create it. Verification reviewers need the
-- same narrowly-scoped read access to populate the administration queue.
DROP POLICY IF EXISTS students_read_own_or_review ON public.student_profiles;
CREATE POLICY students_read_own_or_review ON public.student_profiles
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_permission('can_review_verifications')
  );

COMMIT;
