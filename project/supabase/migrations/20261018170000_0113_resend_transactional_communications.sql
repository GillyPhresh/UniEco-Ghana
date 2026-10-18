-- Production communication automation: registration, payments, invoices, and
-- approved broadcasts flow through the trusted queue and Resend dispatcher.
BEGIN;

CREATE OR REPLACE FUNCTION public.queue_registration_welcome()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  INSERT INTO public.notifications(user_id,type,title,body,action_url,category,metadata,icon)
  VALUES(
    NEW.id,'registration_welcome','Welcome to UniEco Ghana',
    'Your account is ready. Complete registration to unlock the UniEco Ghana platform.',
    'https://uniecoghana.com/onboarding','general',jsonb_build_object('source','profile_created'),'Sparkles'
  );
  PERFORM public.enqueue_trusted_communication_event(
    'registration_welcome',NEW.id,NEW.email,NULL,
    'Welcome to UniEco Ghana',ARRAY['email']::text[],
    jsonb_build_object('template','registration_welcome','name',COALESCE(NEW.full_name,'there'),'action_url','https://uniecoghana.com/onboarding')
  );
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS queue_registration_welcome_after_profile ON public.profiles;
CREATE TRIGGER queue_registration_welcome_after_profile
AFTER INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.queue_registration_welcome();

CREATE OR REPLACE FUNCTION public.queue_payment_communication()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  recipient public.profiles%ROWTYPE;
  event_name text;
  template_name text;
  title_text text;
  body_text text;
  action_url text := 'https://uniecoghana.com/dashboard/payment-history';
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status OR NEW.user_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.status IN ('success','paid') THEN
    event_name := 'payment_successful'; template_name := 'payment_receipt';
    title_text := 'Payment received';
    body_text := format('Your payment of %s %s was received successfully.', to_char(NEW.amount,'FM999999990.00'), NEW.currency);
  ELSIF NEW.status IN ('failed','cancelled') THEN
    event_name := 'payment_failed'; template_name := 'payment_failed';
    title_text := 'Payment update';
    body_text := format('Your payment of %s %s could not be completed.', to_char(NEW.amount,'FM999999990.00'), NEW.currency);
  ELSIF NEW.status IN ('refunded','partially_refunded') THEN
    event_name := 'payment_refunded'; template_name := 'payment_refunded';
    title_text := 'Payment refunded';
    body_text := format('Your payment of %s %s has been marked as %s.', to_char(NEW.amount,'FM999999990.00'), NEW.currency, replace(NEW.status,'_',' '));
  ELSE RETURN NEW;
  END IF;
  SELECT * INTO recipient FROM public.profiles WHERE id=NEW.user_id;
  IF NOT FOUND THEN RETURN NEW; END IF;
  INSERT INTO public.notifications(user_id,type,title,body,action_url,category,metadata,icon)
  VALUES(recipient.id,event_name,title_text,body_text,action_url,'payments',
    jsonb_build_object('payment_id',NEW.id,'payment_reference',NEW.payment_reference,'amount',NEW.amount,'currency',NEW.currency,'status',NEW.status),'CreditCard');
  PERFORM public.enqueue_trusted_communication_event(
    event_name,recipient.id,recipient.email,NULL,title_text,ARRAY['email']::text[],
    jsonb_build_object('template',template_name,'name',COALESCE(recipient.full_name,'there'),'amount',NEW.amount,'currency',NEW.currency,'payment_reference',NEW.payment_reference,'status',NEW.status,'action_url',action_url)
  );
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS queue_payment_communication_after_status ON public.payments;
CREATE TRIGGER queue_payment_communication_after_status
AFTER UPDATE OF status ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.queue_payment_communication();

CREATE OR REPLACE FUNCTION public.queue_invoice_communication()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE recipient public.profiles%ROWTYPE; event_name text; template_name text; title_text text; body_text text;
BEGIN
  IF TG_OP='UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  IF NEW.status IN ('paid','success') THEN
    event_name := 'invoice_paid'; template_name := 'invoice_paid'; title_text := 'Invoice paid';
    body_text := format('Invoice %s has been paid.', NEW.invoice_number);
  ELSE
    event_name := 'invoice_issued'; template_name := 'invoice_issued'; title_text := 'New invoice from UniEco Ghana';
    body_text := format('Invoice %s is ready for your records.', NEW.invoice_number);
  END IF;
  IF NEW.user_id IS NOT NULL THEN SELECT * INTO recipient FROM public.profiles WHERE id=NEW.user_id; END IF;
  IF recipient.id IS NULL AND NEW.billing_email IS NULL THEN RETURN NEW; END IF;
  IF recipient.id IS NOT NULL THEN
    INSERT INTO public.notifications(user_id,type,title,body,action_url,category,metadata,icon)
    VALUES(recipient.id,event_name,title_text,body_text,'https://uniecoghana.com/vendor-dashboard/invoices','payments',jsonb_build_object('invoice_id',NEW.id,'invoice_number',NEW.invoice_number,'amount',COALESCE(NEW.total_amount,NEW.amount),'currency',NEW.currency),'FileText');
  END IF;
  PERFORM public.enqueue_trusted_communication_event(
    event_name,recipient.id,COALESCE(recipient.email,NEW.billing_email),NULL,title_text,ARRAY['email']::text[],
    jsonb_build_object('template',template_name,'name',COALESCE(recipient.full_name,NEW.billing_name,'there'),'invoice_number',NEW.invoice_number,'amount',COALESCE(NEW.total_amount,NEW.amount),'currency',NEW.currency,'status',NEW.status,'action_url','https://uniecoghana.com/vendor-dashboard/invoices')
  );
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS queue_invoice_communication_after_change ON public.invoices;
CREATE TRIGGER queue_invoice_communication_after_change
AFTER INSERT OR UPDATE OF status ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.queue_invoice_communication();

CREATE OR REPLACE FUNCTION public.begin_admin_broadcast_delivery(p_broadcast_id uuid, p_reason text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  broadcast_row public.admin_broadcasts%ROWTYPE;
  target public.profiles%ROWTYPE;
  audience_filter text;
  target_ok boolean;
  queued_count integer := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN RAISE EXCEPTION 'Super administrator access required' USING ERRCODE='42501'; END IF;
  IF length(trim(coalesce(p_reason,''))) NOT BETWEEN 10 AND 1000 THEN RAISE EXCEPTION 'A reason between 10 and 1000 characters is required' USING ERRCODE='22023'; END IF;
  SELECT * INTO broadcast_row FROM public.admin_broadcasts WHERE id=p_broadcast_id AND status='approved' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Only an approved broadcast may begin delivery' USING ERRCODE='22023'; END IF;
  UPDATE public.admin_broadcasts SET status='sending',updated_at=now() WHERE id=p_broadcast_id;
  FOR target IN SELECT p.* FROM public.profiles p WHERE p.is_active AND p.role_id <> 1 LOOP
    audience_filter := broadcast_row.target_audience;
    target_ok := audience_filter='all'
      OR (audience_filter='students' AND target.role_id=2)
      OR (audience_filter='vendors' AND target.role_id IN (3,4))
      OR (audience_filter='specific_university' AND target.university_id=(broadcast_row.target_filters->>'university_id')::uuid)
      OR (audience_filter='specific_category' AND EXISTS (SELECT 1 FROM public.vendors v WHERE v.owner_id=target.id AND lower(v.business_type)=lower(broadcast_row.target_filters->>'category')))
      OR (audience_filter='selected_users' AND target.id IN (SELECT value::uuid FROM jsonb_array_elements_text(COALESCE(broadcast_row.target_filters->'user_ids','[]'::jsonb))));
    IF target_ok THEN
      INSERT INTO public.notifications(user_id,type,title,body,action_url,category,metadata,icon)
      VALUES(target.id,'broadcast',broadcast_row.title,broadcast_row.body,'https://uniecoghana.com','announcements',jsonb_build_object('broadcast_id',p_broadcast_id),'Megaphone');
      PERFORM public.enqueue_trusted_communication_event(
        'broadcast',target.id,target.email,NULL,broadcast_row.title,broadcast_row.channels,
        jsonb_build_object('template','admin_broadcast','name',COALESCE(target.full_name,'there'),'body',broadcast_row.body,'broadcast_type',broadcast_row.broadcast_type,'broadcast_id',p_broadcast_id,'action_url','https://uniecoghana.com')
      );
      queued_count := queued_count + 1;
    END IF;
  END LOOP;
  UPDATE public.admin_broadcasts SET sent_count=queued_count,updated_at=now() WHERE id=p_broadcast_id;
  PERFORM public.record_trusted_admin_action('broadcast.delivery_queued','communications','admin_broadcast',p_broadcast_id,jsonb_build_object('reason',trim(p_reason),'recipient_count',queued_count));
  RETURN true;
END $$;

REVOKE ALL ON FUNCTION public.queue_registration_welcome() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.queue_payment_communication() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.queue_invoice_communication() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.begin_admin_broadcast_delivery(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.begin_admin_broadcast_delivery(uuid,text) TO authenticated;

COMMIT;
