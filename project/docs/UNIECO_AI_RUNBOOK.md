# UniEco Intelligence

UniEco Intelligence is a private, super-admin-only operations workspace at `/admin/ai`.

It can:

- scan the server-side allowlist of official public university and UniEco pages;
- return reviewable update leads with source links;
- answer operational questions using aggregate system-health context;
- prepare a draft broadcast that remains in Broadcasts for human review.

It cannot publish, send, delete, refund, change roles, change authentication, or access private user content. A human super administrator must review and use the existing Broadcasts approval and delivery controls.

## Optional provider configuration

The feature works in safe fallback mode without an AI provider. For richer analysis, configure these server-only variables in the production service:

- `UNIECO_AI_API_KEY` — preferred secret name; `OPENAI_API_KEY` is accepted for compatibility.
- `UNIECO_AI_MODEL` — model name supported by the configured provider.
- `UNIECO_AI_BASE_URL` — optional OpenAI-compatible API base URL; defaults to `https://api.openai.com/v1`.
- `UNIECO_AI_TRUSTED_SOURCES` — optional JSON array of `{id,label,url,description}` objects. Only HTTPS URLs are accepted and the list is capped at 30 sources.

Never put any of these values in `NEXT_PUBLIC_*` variables. Rotate the key through the hosting provider if it is exposed.
