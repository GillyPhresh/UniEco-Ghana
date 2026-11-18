# UniEco Intelligence

- **UniEco AI → Intelligence** uses `GET /api/admin/intelligence?days=7` (or
  `30`). The route and the private RPCs verify super-admin authority. Responses
  are private and not cached. It reports bounded search summaries, current
  communication state, approved content counts and evidence-based next steps.
- **Campus Updates → Find updates for your interests** uses
  `GET /api/intelligence/recommendations?topic=opportunities`. An optional
  `source` is a public publisher ID. It only reads recent, approved public
  articles. It returns at most six articles and, when possible, spreads the
  picks across publishers among the newest 36 matches. It does not read user
  history, identity, ad targeting or private engagement.

The Intelligence tab links to the existing official-publisher research
workflow. It cannot submit URLs, start a scan, publish a story, send a
message, alter a payment or fix a security incident on its own.

Migration **0211** adds the protected campus-friction and security counts.
Before it is applied those sections report unavailable; the existing
platform search, communication and editorial counts keep working. There
are no changes to analytics collection or paid credentials. Small campus
cohorts and small no-result subgroups are withheld separately; repeated
searches count at most once per member per campus per complete UTC day.
Security counts cover recorded events, not a vulnerability scan, and zero
does not mean there were no incidents.

Both API routes bound query scope, results, time and concurrent work per
process. Use gateway limits if operating across multiple replicas.
