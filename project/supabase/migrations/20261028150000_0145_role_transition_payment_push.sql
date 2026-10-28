-- Complete role-aware onboarding and send payment updates through email + push.
BEGIN;

CREATE OR REPLACE FUNCTION public.queue_role_transition_welcome()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW.role_id IN (3,4) AND OLD.role_id IS DISTINCT FROM NEW.role_id THEN
    PERFORM public.queue_user_communication(
      NEW.id,
      'vendor_welcome',
      'Welcome to UniEco Ghana for Vendors',
      'Your vendor account is ready. Add your shop details, location, products, and photos so students can find you.',
      'businesses',
      'https://www.uniecoghana.com/vendor-dashboard',
      'Store',
      'vendor_welcome',
      jsonb_build_object('role_id', NEW.role_id)
    );
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS queue_role_transition_welcome_after_profile ON public.profiles;
CREATE TRIGGER queue_role_transition_welcome_after_profile
AFTER UPDATE OF role_id ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.queue_role_transition_welcome();

CREATE OR REPLACE FUNCTION public.queue_payment_communication()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  recipient public.profiles%ROWTYPE;
  event_name text;
  template_name text;
  title_text text;
  body_text text;
  action_url text := 'https://www.uniecoghana.com/dashboard/payment-history';
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status OR NEW.user_id IS NULL THEN RETURN NEW; END IF;

  IF NEW.status IN ('success','paid') THEN
    event_name := 'payment_successful';
    template_name := 'payment_receipt';
    title_text := 'Payment received';
    body_text := format('Your payment of %s %s was received successfully.', to_char(NEW.amount,'FM999999990.00'), NEW.currency);
  ELSIF NEW.status IN ('failed','cancelled') THEN
    event_name := 'payment_failed';
    template_name := 'payment_failed';
    title_text := 'Payment update';
    body_text := format('Your payment of %s %s could not be completed.', to_char(NEW.amount,'FM999999990.00'), NEW.currency);
  ELSIF NEW.status IN ('refunded','partially_refunded') THEN
    event_name := 'payment_refunded';
    template_name := 'payment_refunded';
    title_text := 'Payment refunded';
    body_text := format('Your payment of %s %s has been marked as %s.', to_char(NEW.amount,'FM999999990.00'), NEW.currency, replace(NEW.status,'_',' '));
  ELSE
    RETURN NEW;
  END IF;

  SELECT * INTO recipient FROM public.profiles WHERE id = NEW.user_id AND is_active;
  IF NOT FOUND THEN RETURN NEW; END IF;

  PERFORM public.queue_user_communication(
    recipient.id,
    event_name,
    title_text,
    body_text,
    'payments',
    action_url,
    'CreditCard',
    template_name,
    jsonb_build_object(
      'payment_id', NEW.id,
      'payment_reference', NEW.payment_reference,
      'amount', NEW.amount,
      'currency', NEW.currency,
      'status', NEW.status
    )
  );
  RETURN NEW;
END $$;

-- The original trigger remains in place; this replacement changes its delivery
-- path without creating duplicate payment triggers.

COMMIT;
