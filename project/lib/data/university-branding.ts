import manifest from '@/data/university-branding.json';

export type UniversityBrandingAsset = {
  path: string;
  sourcePage: string;
  sourceUrl: string;
  contentType: string;
  bytes: number;
  sha256: string;
  score?: number;
  selection?: string;
};

type UniversityBrandingRecord = {
  slug: string;
  shortName: string;
  name: string;
  sourceUrl: string | null;
  logo: UniversityBrandingAsset | null;
  campus: UniversityBrandingAsset | null;
  status: string;
};

const records = manifest as Record<string, UniversityBrandingRecord>;

// The database uses descriptive slugs, while the verified asset manifest keeps
// the institutions' familiar abbreviations. Keep this mapping in one place so
// local official assets still resolve after directory reconciliation.
const brandingSlugAliases: Record<string, string> = {
  'accra-technical-university': 'atu',
  'bolgatanga-technical-university': 'btu',
  'cape-coast-technical-university': 'cctu',
  'dr-hilla-limann-technical-university': 'dhltu',
  'ghana-communication-technology-university': 'gctu',
  'ho-technical-university': 'htu',
  'koforidua-technical-university': 'ktu',
  'kumasi-technical-university': 'kstu',
  'sunyani-technical-university': 'stu',
  'takoradi-technical-university': 'ttu',
  'tamale-technical-university': 'tatu',
  'university-for-development-studies': 'uds',
  'university-of-cape-coast': 'ucc',
  'university-of-education-winneba': 'uew',
  'university-of-energy-and-natural-resources': 'uenr',
  'university-of-environment-and-sustainable-development': 'uesd',
  'university-of-ghana': 'ug',
  'university-of-health-and-allied-sciences': 'uhas',
  'university-of-media-arts-and-communication': 'unimac',
  'university-of-mines-and-technology': 'umat',
  'university-of-professional-studies-accra': 'upsa',
  'university-of-technology-and-applied-sciences': 'utas',
};

/**
 * Local branding is a safe display fallback. Database-provided branding remains
 * authoritative, so university administrators can replace these files through
 * the existing protected branding workflow without changing frontend code.
 */
export function getLocalUniversityBranding(slug: string) {
  const record = records[brandingSlugAliases[slug] || slug];
  return {
    logoUrl: record?.logo?.path ?? null,
    logoSourcePage: record?.logo?.sourcePage ?? null,
    campusUrl: record?.campus?.path ?? null,
    campusSourcePage: record?.campus?.sourcePage ?? null,
    status: record?.status ?? null,
  };
}
