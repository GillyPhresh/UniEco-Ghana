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
  // CKT-UTAS was formally renamed UTAS in 2025/2026; both directory records
  // point to the same institution and therefore share the official assets.
  'ckt-utas': 'utas',
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

// Some official marks are published as horizontal lockups: the crest is on
// one side and the full institution name is beside it. Directory cards show
// the crest in a square, so crop those lockups visually without changing the
// source artwork. Square marks remain fully contained.
const wideLogoPositions: Record<string, 'left' | 'center' | 'right'> = {
  'lancaster-university-ghana': 'center',
};

// A few official sites publish only a small crest/favicon rather than a
// manifest-friendly logo file. Keep those verified local copies as a fallback
// until the institution supplies a higher-resolution brand upload.
const officialLogoOverrides: Record<string, string> = {
  'anglican-university-college-of-technology': '/assets/universities/anglican-university-college-of-technology/logo-official.jpg',
  'marshalls-university-college': '/assets/universities/marshalls-university-college/logo-official.png',
  'mountcrest-university-college': '/assets/universities/mountcrest-university-college/logo-official.png',
  'palm-university-college': '/assets/universities/palm-university-college/logo-official.png',
  'spiritan-university-college': '/assets/universities/spiritan-university-college/logo-official.jpg',
};

const officialCampusOverrides: Record<string, string> = {
  ait: '/assets/universities/ait/campus-official.jpg',
  'anglican-university-college-of-technology': '/assets/universities/anglican-university-college-of-technology/campus-official.jpg',
  'marshalls-university-college': '/assets/universities/marshalls-university-college/campus-official.jpg',
  'mountcrest-university-college': '/assets/universities/mountcrest-university-college/campus-official.png',
  'palm-university-college': '/assets/universities/palm-university-college/campus-official.jpg',
  'spiritan-university-college': '/assets/universities/spiritan-university-college/campus-official.jpg',
};

const officialSourcePages: Record<string, string> = {
  ait: 'https://ait.edu.gh/',
  'anglican-university-college-of-technology': 'https://angutech.edu.gh/',
  'marshalls-university-college': 'https://marshalls.edu.gh/test/',
  'mountcrest-university-college': 'https://mountcrestuniversity.edu.gh/',
  'palm-university-college': 'https://palm.edu.gh/',
  'spiritan-university-college': 'https://suc.edu.gh/',
};

/**
 * Local branding is a safe display fallback. Database-provided branding remains
 * authoritative, so university administrators can replace these files through
 * the existing protected branding workflow without changing frontend code.
 */
export function getLocalUniversityBranding(slug: string) {
  const record = records[brandingSlugAliases[slug] || slug];
  return {
    logoUrl: officialLogoOverrides[slug] || record?.logo?.path || null,
    logoSourcePage: officialSourcePages[slug] || (record?.logo?.sourcePage ?? null),
    campusUrl: officialCampusOverrides[slug] || record?.campus?.path || null,
    campusSourcePage: officialSourcePages[slug] || (record?.campus?.sourcePage ?? null),
    status: record?.status ?? null,
  };
}

export function getUniversityLogoObjectPosition(slug: string) {
  return wideLogoPositions[slug] || 'left';
}
