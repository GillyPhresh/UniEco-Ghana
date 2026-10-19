-- Normal student and vendor registration must always use Paystack. The former
-- sponsored completion RPCs are disabled so an invite token cannot bypass the
-- registration payment gate.
BEGIN;

REVOKE ALL ON FUNCTION public.complete_student_registration_with_invite(text,uuid,text,text,text,text,text,text,integer,integer,text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.redeem_vendor_registration_invite(text,uuid)
  FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
