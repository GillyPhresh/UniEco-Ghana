-- Production bootstrap prerequisite. This must run before the canonical
-- baseline because that baseline uses gen_random_bytes() for trusted case IDs.
-- It contains no application data, users, credentials, or provider settings.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

COMMIT;
