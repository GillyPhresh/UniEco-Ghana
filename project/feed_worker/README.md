# Campus feed worker

This dependency-free Python worker fetches RSS/Atom content from allowlisted official university websites. Without credentials, it uses the four checked-in sample feeds. In production, it obtains enabled sources from UniEco's token-protected API, then follows only RSS/Atom links advertised on each source's HTTPS website and within that school's source domain. It submits a bounded batch of short headlines/excerpts and source-hosted media URLs to UniEco for **human review**. It never approves items, sends notifications, or downloads/rehosts articles or media.

## Test locally without publishing

From the `project` directory:

```powershell
python -m unittest discover -s feed_worker -p "test_*.py" -v
python feed_worker/ingest.py --dry-run
```

The dry run contacts the official university feeds but makes no changes to UniEco. A failed/unavailable source is skipped and reported; no arbitrary URL can be passed to the worker. Local runs without a token use only `sources.json`.

## Production setup (after code is deployed)

1. Apply `supabase/migrations/20261101170000_0174_moderated_campus_feed.sql` and `supabase/migrations/20261107100000_0185_expand_campus_feed_school_sources.sql` to the intended Supabase environment.
2. Generate a unique random secret of at least 32 characters. Set the same value as `UNIECO_FEED_INGEST_TOKEN` in Railway's production service variables and the GitHub Actions `production` environment secret. The workflow targets that environment. Do not put the service-role key in GitHub Actions.
3. After the migration and app deployment, use the workflow **UniEco campus feed ingest** → **Run workflow** on `deploy-main` for the first controlled import. The workflow then runs every six hours.
4. Review each item under Management → UniEco AI → Campus feed review. Only approving an item makes it visible under `/updates`; no automated push, email, or broadcast is sent. Coverage depends on a configured official website advertising an RSS/Atom feed; the worker does not guess URLs.

The internal endpoint rejects bodies over 160 KiB and batches over 80 entries, uses a constant-time bearer-token comparison, and loads source IDs from the service-managed allowlist. The database independently checks each item against the configured source hostname and prevents ingestion from changing reviewed records.
