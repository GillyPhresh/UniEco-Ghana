# UniEco Intelligence

UniEco Intelligence is a private, super-admin-only operations workspace at `/admin/ai`.

It can:

- scan the server-side allowlist of official public university and UniEco pages;
- scan enabled university-directory HTTPS websites in bounded batches;
- optionally search the live public web for an individual admin-chat message when explicitly enabled in the UI;
- return reviewable update leads with source links;
- answer operational questions using aggregate system-health context;
- prepare a draft broadcast that remains in Broadcasts for human review.

It cannot publish, send, delete, refund, change roles, change authentication, or access private user content. A human super administrator must review and use the existing Broadcasts approval and delivery controls.

## Campus Updates feed

The public `/updates` page is a separately moderated campus-news feed. A small standard-library Python worker in `feed_worker/` uses its four checked-in sample feeds for local work without credentials. In production, it loads enabled official sources from the authenticated internal API and discovers only RSS/Atom feeds advertised by those HTTPS websites. The migration `20261107100000_0185_expand_campus_feed_school_sources.sql` adds configured enabled university websites to that source list. Institutions without a configured official website or advertised feed are skipped rather than guessed. The worker submits bounded headlines, excerpts and same-publisher media URLs for human review. Only a super administrator may approve or reject an item in the review panel at `/admin/ai`; approving publishes it to Campus Updates but does not send a push, email or broadcast.

Content is treated as untrusted data. The worker rejects unsafe redirects, non-HTTPS URLs, cross-domain links, entity declarations and oversized XML. The public page shows only approved fields, attributes each item, links to the institution's original page and does not autoplay video. Feed outages are skipped rather than replaced with invented content.

See [`feed_worker/README.md`](../feed_worker/README.md) for local tests and production setup. Production automation requires the migration `20261101170000_0174_moderated_campus_feed.sql`, a matching 32+ character `UNIECO_FEED_INGEST_TOKEN` in Railway and GitHub repository secrets, and the scheduled GitHub workflow. Keep `SUPABASE_SERVICE_ROLE_KEY` only in the server's secret store.

## Optional provider configuration

The feature works in safe fallback mode without an AI provider. For richer analysis, configure these server-only variables in the production service:

- `UNIECO_AI_API_KEY` — preferred secret name; `OPENAI_API_KEY` is accepted for compatibility.
- `UNIECO_AI_MODEL` — model name supported by the configured provider.
- `UNIECO_AI_BASE_URL` — optional OpenAI-compatible API base URL; defaults to `https://api.openai.com/v1`.
- `UNIECO_AI_TRUSTED_SOURCES` — optional JSON array of `{id,label,url,description}` objects. Only HTTPS URLs are accepted. These are combined with built-in sources and enabled university websites (up to 150 total).

Live worldwide search is available only with the official OpenAI API base URL and only when the super administrator checks “Search the live web for this chat”. It is an interactive answer feature, not an automatic public-content source. OpenAI bills its web-search tool separately from model tokens; check current [API pricing](https://openai.com/api/pricing/) before frequent use. Search citations are returned as links and results remain untrusted until reviewed. No student-facing post or broadcast is published automatically.

Never put any of these values in `NEXT_PUBLIC_*` variables. Rotate the key through the hosting provider if it is exposed.
