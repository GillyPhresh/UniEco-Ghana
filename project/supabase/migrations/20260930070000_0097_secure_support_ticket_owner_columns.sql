BEGIN;

-- Ticket owners can see their own customer-facing fields, but must not be able
-- to read internal_notes or set operational fields through PostgREST inserts.
-- Staff workflows continue through the existing security-definer read/action RPCs.
REVOKE SELECT, INSERT ON public.support_tickets FROM PUBLIC, anon, authenticated;

GRANT SELECT (
  id,
  ticket_number,
  user_id,
  subject,
  description,
  category,
  status,
  priority,
  created_at,
  updated_at
) ON public.support_tickets TO authenticated;

GRANT INSERT (
  user_id,
  subject,
  description,
  category
) ON public.support_tickets TO authenticated;

DROP POLICY IF EXISTS support_tickets_owner_read ON public.support_tickets;
CREATE POLICY support_tickets_owner_read ON public.support_tickets FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_super_admin() OR public.has_permission('can_manage_support'));

CREATE OR REPLACE FUNCTION public.create_support_ticket(
  p_subject text,
  p_description text,
  p_category text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_ticket_id uuid := gen_random_uuid();
  v_ticket public.support_tickets%ROWTYPE;
  v_subject text := btrim(COALESCE(p_subject, ''));
  v_description text := btrim(COALESCE(p_description, ''));
  v_category text := lower(btrim(COALESCE(p_category, '')));
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF length(v_subject) NOT BETWEEN 5 AND 200
    OR length(v_description) NOT BETWEEN 10 AND 5000
    OR v_category !~ '^[a-z0-9_-]{1,50}$' THEN
    RAISE EXCEPTION 'Invalid support ticket details' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.support_tickets (
    id, ticket_number, user_id, subject, description, category
  ) VALUES (
    v_ticket_id,
    'SUP-' || upper(replace(v_ticket_id::text, '-', '')),
    v_user_id,
    v_subject,
    v_description,
    v_category
  ) RETURNING * INTO v_ticket;

  RETURN jsonb_build_object(
    'id', v_ticket.id,
    'ticket_number', v_ticket.ticket_number,
    'subject', v_ticket.subject,
    'status', v_ticket.status,
    'priority', v_ticket.priority,
    'created_at', v_ticket.created_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_support_ticket(text, text, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_support_ticket(text, text, text) TO authenticated;

COMMIT;
