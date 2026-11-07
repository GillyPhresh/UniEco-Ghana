-- Push endpoints are user-controlled delivery targets. Restrict direct
-- PostgREST writes as well as the application route to known browser vendors.
-- NOT VALID keeps legacy rows intact while enforcing the rule on new/changed
-- rows; the trusted sender rejects and deactivates any legacy invalid rows.
ALTER TABLE public.push_subscriptions
  ADD CONSTRAINT push_subscriptions_endpoint_provider_check
  CHECK (
    endpoint ~* '^https://(fcm[.]googleapis[.]com|updates[.]push[.]services[.]mozilla[.]com|web[.]push[.]apple[.]com|([a-z0-9-]+[.])*[a-z0-9-]+[.]notify[.]windows[.]com)(/|[?]|$)'
  ) NOT VALID;
