# UniEco Intelligence

UniEco Intelligence is a private, super-admin-only operations workspace at `/admin/ai`.

It can:

- scan the server-side allowlist of official public university and UniEco pages;
- return reviewable update leads with source links;
- answer operational questions using aggregate system-health context;
- prepare a draft broadcast that remains in Broadcasts for human review.

It cannot publish, send, delete, refund, change roles, change authentication, or access private user content. A human super administrator must review and use the existing Broadcasts approval and delivery controls.

## Campus Updates feed

The public `/updates` page is a separately moderated campus-news feed. A small standard-library Python worker in `feed_worker/` reads the fixed official RSS/Atom sources in `feed_worker/sources.json` and submits bounded headlines, excerpts and same-publisher media URLs to the internal ingest API. Only a super administrator may approve or reject an item in the review panel at `/admin/ai`; approving publishes it to Campus Updates but does not send a push, email or broadcast.

Content is treated as untrusted data. The worker rejects unsafe redirects, non-HTTPS URLs, cross-domain links, entity declarations and oversized XML. The public page shows only approved fields, attributes each item, links to the institution's original page and does not autoplay video. Feed outages are skipped rather than replaced with invented content.

See [`feed_worker/README.md`](../feed_worker/README.md) for local tests and production setup. Production automation requires the migration `20261101170000_0174_moderated_campus_feed.sql`, a matching 32+ character `UNIECO_FEED_INGEST_TOKEN` in Railway and GitHub repository secrets, and the scheduled GitHub workflow. Keep `SUPABASE_SERVICE_ROLE_KEY` only in the server's secret store.

## Optional provider configuration

The feature works in safe fallback mode without an AI provider. For richer analysis, configure these server-only variables in the production service:

- `UNIECO_AI_API_KEY` — preferred secret name; `OPENAI_API_KEY` is accepted for compatibility.
- `UNIECO_AI_MODEL` — model name supported by the configured provider.
- `UNIECO_AI_BASE_URL` — optional OpenAI-compatible API base URL; defaults to `https://api.openai.com/v1`.
- `UNIECO_AI_TRUSTED_SOURCES` — optional JSON array of `{id,label,url,description}` objects. Only HTTPS URLs are accepted and the list is capped at 30 sources.

Never put any of these values in `NEXT_PUBLIC_*` variables. Rotate the key through the hosting provider if it is exposed.
