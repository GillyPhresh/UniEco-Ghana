-- UniEco Ghana production push/email queue scheduler.
-- Run this in the production Supabase SQL Editor after creating the two Vault
-- secrets documented in NOTIFICATION_PROVIDERS_SETUP.md.

do $$
begin
  if to_regnamespace('cron') is null
     or to_regnamespace('net') is null
     or to_regnamespace('vault') is null then
    raise exception 'Enable the pg_cron, pg_net, and vault extensions first';
  end if;
  if not exists (
    select 1 from vault.decrypted_secrets
    where name in ('unieco_project_url', 'unieco_internal_function_secret')
    group by 1 having count(*) = 2
  ) then
    raise exception 'Create both UniEco Vault secrets before scheduling the worker';
  end if;
end $$;

select cron.schedule(
  'unieco-dispatch-communication-queue-every-minute',
  '* * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret
            from vault.decrypted_secrets
            where name = 'unieco_project_url')
           || '/functions/v1/dispatch-communication-queue',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-unieco-internal-secret', (select decrypted_secret
                                   from vault.decrypted_secrets
                                   where name = 'unieco_internal_function_secret')
    ),
    body := jsonb_build_object('limit', 25),
    timeout_milliseconds := 8000
  ) as request_id;
  $$
);
