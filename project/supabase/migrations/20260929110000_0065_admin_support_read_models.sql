-- Support content is restricted operational data. These read models are
-- super-admin-only and do not expose arbitrary attachment/storage paths.
BEGIN;

CREATE INDEX IF NOT EXISTS support_tickets_status_created_idx
  ON public.support_tickets (status, created_at DESC);

CREATE OR REPLACE FUNCTION public.get_admin_support_tickets(
  p_status text DEFAULT NULL,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid, ticket_number text, user_id uuid, user_full_name text, user_email text,
  subject text, category text, status text, priority text, assigned_to uuid,
  assignee_full_name text, created_at timestamptz, updated_at timestamptz, total_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_status text := NULLIF(btrim(p_status), ''); v_limit integer := COALESCE(p_limit, 20); v_offset integer := COALESCE(p_offset, 0);
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN RAISE EXCEPTION 'Super administrator access required' USING ERRCODE='42501'; END IF;
  IF v_status IS NOT NULL AND v_status NOT IN ('open','in_progress','resolved','closed') THEN RAISE EXCEPTION 'Invalid support status filter' USING ERRCODE='22023'; END IF;
  IF v_limit NOT BETWEEN 1 AND 100 OR v_offset < 0 OR v_offset > 10000 THEN RAISE EXCEPTION 'Invalid pagination' USING ERRCODE='22023'; END IF;
  RETURN QUERY
  SELECT t.id,t.ticket_number,t.user_id,requester.full_name,requester.email,t.subject,t.category,t.status,t.priority,t.assigned_to,assignee.full_name,t.created_at,t.updated_at,count(*) OVER()
  FROM public.support_tickets t
  JOIN public.profiles requester ON requester.id=t.user_id
  LEFT JOIN public.profiles assignee ON assignee.id=t.assigned_to
  WHERE v_status IS NULL OR t.status=v_status
  ORDER BY t.created_at DESC LIMIT v_limit OFFSET v_offset;
END; $$;

CREATE OR REPLACE FUNCTION public.get_admin_support_ticket_detail(p_ticket_id uuid)
RETURNS TABLE(
  id uuid, ticket_number text, user_id uuid, user_full_name text, user_email text,
  subject text, description text, category text, status text, priority text,
  assigned_to uuid, assignee_full_name text, created_at timestamptz, updated_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN RAISE EXCEPTION 'Super administrator access required' USING ERRCODE='42501'; END IF;
  RETURN QUERY
  SELECT t.id,t.ticket_number,t.user_id,requester.full_name,requester.email,t.subject,t.description,t.category,t.status,t.priority,t.assigned_to,assignee.full_name,t.created_at,t.updated_at
  FROM public.support_tickets t
  JOIN public.profiles requester ON requester.id=t.user_id
  LEFT JOIN public.profiles assignee ON assignee.id=t.assigned_to
  WHERE t.id=p_ticket_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Support ticket not found' USING ERRCODE='P0002'; END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.get_admin_support_ticket_replies(p_ticket_id uuid)
RETURNS TABLE(id uuid, author_id uuid, author_full_name text, author_email text, body text, is_internal boolean, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN RAISE EXCEPTION 'Super administrator access required' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.support_tickets WHERE id=p_ticket_id) THEN RAISE EXCEPTION 'Support ticket not found' USING ERRCODE='P0002'; END IF;
  RETURN QUERY
  SELECT reply.id,reply.author_id,author.full_name,author.email,reply.body,reply.is_internal,reply.created_at
  FROM public.ticket_replies reply JOIN public.profiles author ON author.id=reply.author_id
  WHERE reply.ticket_id=p_ticket_id ORDER BY reply.created_at ASC;
END; $$;

REVOKE ALL ON FUNCTION public.get_admin_support_tickets(text,integer,integer) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.get_admin_support_ticket_detail(uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.get_admin_support_ticket_replies(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_support_tickets(text,integer,integer),public.get_admin_support_ticket_detail(uuid),public.get_admin_support_ticket_replies(uuid) TO authenticated;

COMMIT;
