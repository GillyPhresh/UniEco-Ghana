-- Keep historical notification and queue destinations on the canonical host.
-- This only changes UniEco's legacy no-www hostname; paths and query strings
-- remain byte-for-byte unchanged.

UPDATE public.notifications
SET action_url = replace(action_url, 'https://uniecoghana.com', 'https://www.uniecoghana.com')
WHERE action_url LIKE 'https://uniecoghana.com%';

UPDATE public.notifications
SET link = replace(link, 'https://uniecoghana.com', 'https://www.uniecoghana.com')
WHERE link LIKE 'https://uniecoghana.com%';

UPDATE public.communication_events
SET metadata = jsonb_set(
  metadata,
  '{action_url}',
  to_jsonb(replace(metadata->>'action_url', 'https://uniecoghana.com', 'https://www.uniecoghana.com')),
  true
)
WHERE metadata->>'action_url' LIKE 'https://uniecoghana.com%';
