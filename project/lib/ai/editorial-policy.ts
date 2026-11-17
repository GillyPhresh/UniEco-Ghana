import { officialPublisherUrl, publisherHost } from './public-source-url';
import type { ResearchSource } from './research-catalog';
import type { ResearchLead } from './research';

export const automatedReviewReason = 'Automatically published by UniEco Campus Research (policy v1): recent article confirmed on the institution’s own Ghana education domain.';
const day = 86_400_000;
const routineHeadline = /\b(?:awards?|honou?r\w*|achievements?|wins?|won|winning|champions?|competitions?|robotics|student projects?|showcas\w*|exhibit\w*|alumni|campus life|library|partnerships?|memorandum of understanding|research symposium|research team|sports?|quiz|debate|innovation\w*)\b/i;
const reviewOnly = /\b(?:admissions?|applications?|apply|scholarships?|grants?|fellowships?|internships?|deadline|fees?|payment|funds?|bank accounts?|donation|registration|exam(?:ination)?s?|timetables?|closure|cancell?ed|postponed|warning|emergency|outbreak|death|died|fatal|accident|injur\w*|assault|harass\w*|abuse|suicid\w*|health alerts?|fraud|scam|arrest\w*|court|police|lawsuit|alleg\w*|strike|suspens\w*|dismiss\w*|protest|demonstration against|leaked|disciplin\w*|password|login)\b/i;

export function canAutomaticallyPublish(source: ResearchSource, lead: ResearchLead, verifiedKeys: ReadonlySet<string>, now: number) {
  if (source.state !== 'ready' || !source.schoolSlug || source.registration?.source_kind !== 'campus'
    || !source.registration.enabled || source.registration.id !== lead.source_id || !verifiedKeys.has(lead.source_item_key)
    || !['news', 'campus_life', 'research'].includes(lead.category)) return false;
  const official = source.directoryHost;
  const link = officialPublisherUrl(lead.canonical_url);
  if (!official || !/^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.edu\.gh$/.test(official)
    || publisherHost(link?.hostname || '') !== official || source.registration.source_domain !== official
    || publisherHost(officialPublisherUrl(source.website)?.hostname || '') !== official
    || !link || link.pathname === '/') return false;
  const date = Date.parse(lead.published_at || '');
  const copy = [lead.title, lead.excerpt, decodeURIComponentSafe(link.pathname)].join(' ');
  return date <= now && date >= now - 30 * day && lead.excerpt.length >= 45 && routineHeadline.test(lead.title)
    && !reviewOnly.test(copy) && !/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|\+?\d(?:[ .()/-]*\d){8,}/i.test(copy);
}

function decodeURIComponentSafe(path: string) {
  try { return decodeURIComponent(path).replace(/[-_]/g, ' '); } catch { return path; }
}
