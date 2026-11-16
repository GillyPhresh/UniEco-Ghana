# Campus directory and profile maintenance

The public directory lists every enabled institution. The separately audited UniEco
rollout status is not a claim of GTEC accreditation. A school profile can be public
even when its rollout status is planned. Do not activate disabled, suspended or
onboarding records through a bulk change.

## Review branding and school sources

Use **Management → Universities → Needs branding** to find missing logos or photos.
The management view and public profiles use the same media selection rules.
Prefer school-owned sites and explicit institution or partner sources. Do not use
student portraits, flyers, partner logos, stock photos or unverified social media
reposts as campus branding. Get school approval where the rights to reuse media
are unclear. Never claim a placeholder is an official logo.

Add source pages and specific approved assets to `data/campus-profiles.json`. Each
new logo or photo has an HTTPS media URL, a source page and (for photos) an accurate
alt description. The sync script validates the publisher hostname and image
format and makes web-sized local assets so students do not depend on third-party
images loading. To add media for one school:

```sh
node scripts/sync-campus-profile-media.mjs school-slug
node scripts/sync-campus-profile-media.mjs --check
```

The app prefers a school administrator’s protected branding upload over static
fallbacks. Curated profiles do not grant admin rights or enable auto-publishing.

## Check GTEC records

`scripts/refresh-campus-programmes.mjs` reads the regulator’s public programme pages
for the reviewed IDs in migration 0196. Pass one or more school slugs for a small
refresh, or add `--dry-run` to check without saving. A failed fetch never replaces
a previously checked snapshot. The profile links to the original record and does
not infer current accreditation from a UniEco launch label or an empty programme table.

The six records held back by migration 0201 have GTEC notices or potential
name collisions that need individual review. Keep their profiles visible and
resolve the source conflicts before changing their rollout status. Apply 0201
to production only after explicit approval and after validating the target project,
the planned-row count, and the excluded slugs. It writes one audit row per
changed institution, without changing accreditation, access, or verification fields.
