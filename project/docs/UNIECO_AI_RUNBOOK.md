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
- **Flyers:** A published update has a 1080 × 1350 photo-led flyer. **Share**
  sends a JPEG file on compatible devices; **Download JPEG** and **Copy story
  link** are separate fallbacks. The legacy PNG URL still works. The
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
photo previews use a bounded sanitized thumbnail. Flyers do not copy images
from page metadata unless an exact image carries supported reuse terms.

Connections use HTTPS with explicit host validation, pinned public DNS addresses,
redirect checks, short timeouts, byte limits, and publisher crawl rules. HTML/XML
are parsed as data, never executed. No external page can choose a tool or write to
the app. A manual lead has a 30-minute proof bound to the signed-in super admin.
Queued records are deduplicated; a narrow scheduled policy may approve verified
routine stories on matching campus domains without overwriting rejected or
reviewed records. Public pages and flyer APIs read the approved-only view.
Do not add social feeds, arbitrary redirectors, or shared hosting domains to the
research inventory without a defined source and publication policy.

### Flyer photographs and portraits

- For a matching official `.edu.gh` article, the flyer can use a same-host
  Schema.org `ImageObject` declared in that article's `image` field. The exact
  image must carry its own CC0 or CC BY 4.0 license URL and creator credit.
  An ordinary photo in an article, Open Graph tag or search result does not
  establish permission to redistribute it.
- Up to two circles are shown only for a named, public-role `Person` explicitly
  identified in the article's `about` or `mentions` relationship, named in its
  title or excerpt, and accompanied by a credited, reusable portrait. The
  article byline is never used as a subject, and the app doesn't search by face
  or assume two people with a similar name are the same.
- If reuse or identity cannot be confirmed, the flyer uses a clearly marked
  context photo and leaves out the unverified portrait. Bundled fallback
  credits: [Maxx Sas — Balme Library](https://www.pexels.com/photo/university-of-ghana-balme-library-in-accra-36079525/)
  [Tanha Tamanna Syed — robotics workbench](https://www.pexels.com/photo/robotics-kit-components-on-a-workbench-35652403/),
  [Tima Miroshnichenko — laboratory equipment](https://www.pexels.com/photo/close-up-photo-of-laboratory-apparatuses-5428263/),
  and [mitbg000 — lecture room](https://www.pexels.com/photo/rows-of-desks-and-chairs-in-a-classroom-19199263/),
  used as cropped context under the [Pexels License](https://www.pexels.com/license/).
- Public renders use the same DNS-checked, robots-aware fetcher as research,
  cap image size and dimensions, strip metadata, and degrade to bundled photos
  if the publisher is unavailable. A released article must still exist in the
  public view on every request. A file already downloaded cannot be recalled.

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
