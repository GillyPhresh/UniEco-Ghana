-- Keep broadcast status and recipient counters aligned with the trusted
-- communication queue. Queueing remains super-admin-only; no delivery is
-- initiated by this migration.
BEGIN;

CREATE OR REPLACE FUNCTION public.reconcile_admin_broadcast_delivery(p_broadcast_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  event_count integer;
  delivered_count integer;
  failed_count integer;
  incomplete_count integer;
BEGIN
  IF p_broadcast_id IS NULL THEN
    RETURN;
  END IF;

  SELECT
    count(*)::integer,
    count(*) FILTER (WHERE event.status = 'delivered')::integer,
    count(*) FILTER (
      WHERE event.status = 'failed'
        AND (event.attempt_count >= 3 OR event.next_attempt_at IS NULL)
    )::integer,
    count(*) FILTER (
      WHERE event.status NOT IN ('delivered', 'failed')
         OR (event.status = 'failed' AND event.attempt_count < 3 AND event.next_attempt_at IS NOT NULL)
    )::integer
  INTO event_count, delivered_count, failed_count, incomplete_count
  FROM public.communication_events AS event
  WHERE event.metadata ->> 'broadcast_id' = p_broadcast_id::text;

  IF incomplete_count > 0 THEN
    RETURN;
  END IF;

  UPDATE public.admin_broadcasts AS broadcast
  SET status = 'sent',
      sent_at = COALESCE(broadcast.sent_at, now()),
      sent_count = delivered_count,
      failed_count = failed_count,
      updated_at = now()
  WHERE broadcast.id = p_broadcast_id
    AND broadcast.status = 'sending';
END;
$function$;

REVOKE ALL ON FUNCTION public.reconcile_admin_broadcast_delivery(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.reconcile_admin_broadcast_after_queue_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  broadcast_id_text text;
BEGIN
  IF TG_TABLE_NAME = 'admin_broadcasts' THEN
    broadcast_id_text := NEW.id::text;
  ELSE
    broadcast_id_text := NEW.metadata ->> 'broadcast_id';
  END IF;

  IF broadcast_id_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    PERFORM public.reconcile_admin_broadcast_delivery(broadcast_id_text::uuid);
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.reconcile_admin_broadcast_after_queue_change()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS reconcile_admin_broadcast_after_queue_count ON public.admin_broadcasts;
CREATE CONSTRAINT TRIGGER reconcile_admin_broadcast_after_queue_count
  AFTER UPDATE OF sent_count ON public.admin_broadcasts
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION public.reconcile_admin_broadcast_after_queue_change();

DROP TRIGGER IF EXISTS reconcile_admin_broadcast_after_event_status ON public.communication_events;
CREATE CONSTRAINT TRIGGER reconcile_admin_broadcast_after_event_status
  AFTER UPDATE OF status ON public.communication_events
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION public.reconcile_admin_broadcast_after_queue_change();

-- Reconcile already queued broadcasts whose communication events completed
-- before this finalizer existed. The deferred trigger sees the complete batch.
UPDATE public.admin_broadcasts
SET sent_count = sent_count
WHERE status = 'sending';

COMMIT;
