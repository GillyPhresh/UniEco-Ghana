-- Repair the application phone validation without rewriting an applied
-- migration, and keep a temporary notification-queue outage from rejecting
-- an otherwise valid application.

BEGIN;

ALTER TABLE public.university_admin_applications
  DROP CONSTRAINT IF EXISTS university_admin_applications_phone_check;

ALTER TABLE public.university_admin_applications
  ADD CONSTRAINT university_admin_applications_phone_check
  CHECK (
    phone ~ '^[+]?[0-9 ()-]{7,20}$'
    AND length(regexp_replace(phone, '[^0-9]', '', 'g')) BETWEEN 7 AND 15
  ) NOT VALID;

CREATE OR REPLACE FUNCTION public.notify_super_admin_of_university_admin_application()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $func$
DECLARE
  applicant_name text;
  university_name text;
  admin_row record;
BEGIN
  -- Notifications are useful, but the application itself must remain durable
  -- if email/push queue infrastructure is temporarily unavailable.
  BEGIN
    SELECT COALESCE(NULLIF(trim(profile.full_name),''),'A student')
      INTO applicant_name
    FROM public.profiles profile WHERE profile.id=NEW.applicant_user_id;
    SELECT university.name INTO university_name
    FROM public.universities university WHERE university.id=NEW.university_id;

    FOR admin_row IN
      SELECT profile.id, profile.email
      FROM public.profiles profile
      JOIN public.user_roles role ON role.id=profile.role_id
      WHERE role.name='super_admin' AND profile.is_active AND profile.status='active'
    LOOP
      PERFORM public.enqueue_trusted_communication_event(
        'university_admin_application_received',
        admin_row.id,
        admin_row.email,
        NULL,
        'University Administrator application received — ' || NEW.application_reference,
        ARRAY['email','push']::text[],
        jsonb_build_object(
          'template','university_admin_application_received',
          'name',applicant_name,
          'application_reference',NEW.application_reference,
          'university_name',university_name,
          'body',applicant_name || ' submitted a University Administrator application for ' || COALESCE(university_name,'a university') || '. Review it in the management system.',
          'action_url','https://www.uniecoghana.com/admin/university-administrators?status=pending'
        )
      );
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'University administrator application notification was not queued for reference %', NEW.application_reference;
  END;

  RETURN NEW;
END $func$;

REVOKE ALL ON FUNCTION public.notify_super_admin_of_university_admin_application() FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
