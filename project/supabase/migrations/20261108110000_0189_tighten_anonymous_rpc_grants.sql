-- Supabase's default PUBLIC function grants made authenticated-only routines
-- and trigger functions anonymously executable. Keep the explicit public
-- campus-feed/member/post read surface and invite-token lookup callable by
-- anon; require authentication for all other exposed routines in this set.
BEGIN;

-- Trigger functions are invoked by their existing table triggers. They are
-- not application RPCs and must not be callable by API roles directly.
REVOKE ALL ON FUNCTION
  public.issue_university_admin_appointment_letter(),
  public.qualify_university_admin_student_payment(),
  public.queue_business_announcement_communication(),
  public.queue_event_published_communication(),
  public.queue_order_status_communication(),
  public.queue_review_received_communication(),
  public.queue_role_transition_welcome(),
  public.queue_student_verification_communication(),
  public.queue_vendor_verification_communication(),
  public.set_student_registration_fee_snapshot()
FROM PUBLIC, anon, authenticated, service_role;

-- These authenticated workflows already verify the caller and/or their
-- application role in the function body. Preserve authenticated RPC access,
-- but remove inherited PUBLIC and anonymous execution.
REVOKE ALL ON FUNCTION
  public.acknowledge_university_admin_appointment(uuid),
  public.claim_university_admin_registration(text, uuid, text),
  public.create_campus_community_comment(uuid, text, uuid),
  public.create_campus_community_post(text, text, text),
  public.create_university_admin_assignment(uuid, uuid, text),
  public.get_campus_community_post_reports(text, integer),
  public.get_campus_community_saved_posts(timestamptz, uuid, integer),
  public.get_my_university_admin_applications(),
  public.get_my_university_admin_appointment(),
  public.get_university_admin_application_form(uuid),
  public.get_university_admin_leaderboard(uuid),
  public.issue_university_admin_token(uuid, timestamptz),
  public.list_university_admin_applications(text, uuid, integer),
  public.mark_university_admin_month_paid(date, text),
  public.qualify_university_admin_registration(uuid, text),
  public.report_campus_community_post(uuid, text, text),
  public.revoke_university_admin_assignment(uuid, text),
  public.revoke_university_admin_token(uuid),
  public.set_admin_university_launch_status(uuid, text),
  public.set_campus_community_follow(uuid, boolean),
  public.set_campus_community_post_bookmark(uuid, boolean),
  public.set_campus_community_post_like(uuid, boolean),
  public.set_university_admin_opening(uuid, text, text, text, timestamptz, timestamptz),
  public.submit_university_admin_application(uuid, text, text, text, text, text, text, text, text, boolean),
  public.withdraw_university_admin_application(uuid)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
  public.acknowledge_university_admin_appointment(uuid),
  public.claim_university_admin_registration(text, uuid, text),
  public.create_campus_community_comment(uuid, text, uuid),
  public.create_campus_community_post(text, text, text),
  public.create_university_admin_assignment(uuid, uuid, text),
  public.get_campus_community_post_reports(text, integer),
  public.get_campus_community_saved_posts(timestamptz, uuid, integer),
  public.get_my_university_admin_applications(),
  public.get_my_university_admin_appointment(),
  public.get_university_admin_application_form(uuid),
  public.get_university_admin_leaderboard(uuid),
  public.issue_university_admin_token(uuid, timestamptz),
  public.list_university_admin_applications(text, uuid, integer),
  public.mark_university_admin_month_paid(date, text),
  public.qualify_university_admin_registration(uuid, text),
  public.report_campus_community_post(uuid, text, text),
  public.revoke_university_admin_assignment(uuid, text),
  public.revoke_university_admin_token(uuid),
  public.set_admin_university_launch_status(uuid, text),
  public.set_campus_community_follow(uuid, boolean),
  public.set_campus_community_post_bookmark(uuid, boolean),
  public.set_campus_community_post_like(uuid, boolean),
  public.set_university_admin_opening(uuid, text, text, text, timestamptz, timestamptz),
  public.submit_university_admin_application(uuid, text, text, text, text, text, text, text, text, boolean),
  public.withdraw_university_admin_application(uuid)
TO authenticated;

COMMIT;
