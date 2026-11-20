export type FeedItem = {
  id: string;
  source_id: string;
  source_kind?: 'campus' | 'opportunities' | 'news';
  source_label: string;
  university_name: string;
  title: string;
  excerpt: string;
  canonical_url: string;
  published_at: string | null;
  media_url: string | null;
  media_type: 'image' | 'video' | null;
  category: string;
};

export const newsroomPageSize = 18;
export const newsroomEditionTag = 'campus-newsroom-public-edition';
// Keep item reads compatible with the narrow public-item view. Source kind is
// joined from the separately exposed public source directory in the UI/API.
export const newsroomFields = 'id,source_id,source_label,university_name,title,excerpt,canonical_url,published_at,media_url,media_type,category';

export function newsroomSearchTokens(input: string) {
  // Tokenize before constructing PostgREST filters; no operators, wildcards,
  // quotes, or path separators from the visitor enter the query syntax.
  return Array.from(new Set(input.slice(0, 120).normalize('NFKC').match(/[\p{L}\p{N}]{2,32}/gu) || [])).slice(0, 6);
}

const campusArt: Record<string, string> = {
  'academic-city': 'academic-city-campus',
  knust: 'knust-campus',
  'university-of-ghana': 'university-of-ghana-tower',
  'university-of-cape-coast': 'ucc-gate',
};

export function newsroomCampusArt(sourceId: string) {
  // First-party, already bundled campus file photos, never a hotlinked
  // publisher image or a claim that a photo shows the event itself.
  return Object.prototype.hasOwnProperty.call(campusArt, sourceId) ? '/assets/homepage/' + campusArt[sourceId] + '-1200.webp' : null;
}
