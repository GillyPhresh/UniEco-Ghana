# UniEco AI: editorial operations

Open **Management → UniEco AI** as a super administrator.

- **Research:** Scan one school, or the full roster in bounded, pausable batches.
  A result contains an original article, a short excerpt, its reported date, and
  any identified photo or video. Queue an individual result when appropriate.
- **Coverage:** Every enabled directory entry appears, including schools with no
  verified source, shared/ambiguous publishers, paused sources, and sources that
  could not be reached. Look up the school's official publisher independently;
  only put an official HTTPS URL into Management → Universities. No search-engine
  result is automatically treated as an institution's source.
- **Review:** Verify the institution, article, dates and relevance, then approve
  with an audit note or reject it. Draft flyer previews are authenticated and
  watermarked. A published story can be unpublished with a reason.
- **Flyers:** A published update has a shareable link and a portrait PNG. The
  public **Campus briefing** groups approved items by school or all campuses and
  by time range. Choose **All updates** to include undated approved articles.
  Every numbered page can be printed or downloaded separately.
- **Assistant:** Ask for cited approved updates, pending leads, school coverage or
  aggregate platform health. The assistant uses UniEco's recorded evidence and
  deterministic workflows; no external model or paid API is enabled.
- **Notifications:** A super admin can separately prepare a draft from a
  published update. That is not a send or approval.

## Research guardrails

The scanner uses the enabled campus directory, already registered publishers,
and the checked-in profile/branding source inventory. Each official news/notice
page, advertised RSS/Atom feed and article is limited to its verified publisher.
Verified pages can reveal their own article photos, direct videos or public
embedded videos. UniEco links to the publisher on approved releases. Private
photo previews use a bounded sanitized thumbnail; the app does not rehost an
external publisher's media or play it automatically.

Connections use HTTPS with explicit host validation, pinned public DNS addresses,
redirect checks, short timeouts, byte limits, and publisher crawl rules. HTML/XML
are parsed as data, never executed. No external page can choose a tool or write to
the app. A manual lead has a 30-minute proof bound to the signed-in super admin.
Queued records are deduplicated and frozen; the scanner cannot approve or alter
reviewed content. Public pages and flyer APIs read the approved-only view.
Do not add social feeds, arbitrary redirectors, or shared hosting domains to the
research inventory without a defined source and publication policy.

## Running and checking production

The existing Railway production start command runs a six-hour sweep, using an
ephemeral loopback credential. It uses the existing server-only Supabase key and
campus feed tables; no new migration, third-party account, or billing is required.
Staging and local deployments do not start the scheduler. Operators can stop
automatic sweeps by setting `UNIECO_DISABLE_CAMPUS_RESEARCH=true` through the usual
change-control process. Do not put private credentials in `NEXT_PUBLIC_*`.

The sweep attempts the full roster and national sources, queues at most two recent
dated leads per publisher per pass, and reports publisher failures and coverage
gaps without opening access or sending messages. An append-only audit marker
prevents overlapping deployments from claiming the same six-hour window. Look
for `campus_research.sweep_started`, `campus_research.sweep_completed`, and the
aggregate Railway log. A temporary timeout or connection loss retries only the
interrupted batch; it does not restart the entire directory. The verified lease is
anchored to the start of the sweep, even if the run crosses a six-hour boundary.
If a sweep does not finish, a single recovery claim is allowed after the first
lease is older than the worker's hard deadline. The original audit record stays
intact, and ingestion is idempotent.

The operator worker described in [feed_worker/README.md](../feed_worker/README.md)
is optional. It is not the production scheduler.
