import manifest from '@/data/university-branding.json';
import profiles from '@/data/campus-profiles.json';

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
  campusGallery?: UniversityBrandingAsset[];
  status: string;
};

const records = manifest as Record<string, UniversityBrandingRecord>;

type CuratedAsset = { url: string; source: string; alt?: string };
type CampusProfileSource = {
  website?: string;
  shortName?: string;
  about?: string;
  overview?: string;
  news?: string;
  gallery?: string;
  cover?: string;
  coverCredit?: string;
  excludedPhotos?: string[];
  crest?: CuratedAsset;
  photos?: CuratedAsset[];
};
const profileSources: Record<string, CampusProfileSource> = profiles;

export function getCuratedCampusProfile(slug: string) {
  return Object.hasOwn(profileSources, slug) ? profileSources[slug] : undefined;
}

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
  'accra-college-of-education-accra': '/assets/universities/accra-college-of-education/logo.jpg',
  'akrokerri-college-of-education-akrokerri': '/assets/universities/akrokerri-college-of-education/logo.jpg',
  'presbyterian-college-of-education-akropong-akuapem': '/assets/universities/presbyterian-college-of-education-akropong-akuapem/logo.png',
  'anglican-university-college-of-technology': '/assets/universities/anglican-university-college-of-technology/logo-official.jpg',
  'marshalls-university-college': '/assets/universities/marshalls-university-college/logo-official.png',
  'mountcrest-university-college': '/assets/universities/mountcrest-university-college/logo-official.png',
  'palm-university-college': '/assets/universities/palm-university-college/logo-official.png',
  'spiritan-university-college': '/assets/universities/spiritan-university-college/logo-official.jpg',
};

const officialCampusOverrides: Record<string, string> = {
  'akrokerri-college-of-education-akrokerri': '/assets/universities/akrokerri-college-of-education/campus.jpg',
  'presbyterian-college-of-education-akropong-akuapem': '/assets/universities/presbyterian-college-of-education-akropong-akuapem/campus.jpg',
  ait: '/assets/universities/ait/campus-official.jpg',
  'anglican-university-college-of-technology': '/assets/universities/anglican-university-college-of-technology/campus-official.jpg',
  'marshalls-university-college': '/assets/universities/marshalls-university-college/campus-official.jpg',
  'mountcrest-university-college': '/assets/universities/mountcrest-university-college/campus-official.png',
  'palm-university-college': '/assets/universities/palm-university-college/campus-official.jpg',
  'spiritan-university-college': '/assets/universities/spiritan-university-college/campus-official.jpg',
};

const officialSourcePages: Record<string, string> = {
  'accra-college-of-education-accra': 'https://acce.edu.gh/',
  'akrokerri-college-of-education-akrokerri': 'https://www.arce.edu.gh/',
  'presbyterian-college-of-education-akropong-akuapem': 'https://pce.edu.gh/',
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
  const key = Object.hasOwn(brandingSlugAliases, slug) ? brandingSlugAliases[slug] : slug;
  const record = Object.hasOwn(records, key) ? records[key] : undefined;
  const profile = getCuratedCampusProfile(slug);
  const officialSource = Object.hasOwn(officialSourcePages, slug) ? officialSourcePages[slug] : undefined;
  const logoOverride = Object.hasOwn(officialLogoOverrides, slug) ? officialLogoOverrides[slug] : undefined;
  const campusOverride = Object.hasOwn(officialCampusOverrides, slug) ? officialCampusOverrides[slug] : undefined;
  const curatedGallery = (profile?.photos || []).map((photo, index) => ({
    path: `/assets/universities/${slug}/profile/photo-${index + 1}.webp`,
    sourcePage: photo.source,
    sourceUrl: photo.url,
    alt: photo.alt,
  }));
  return {
    website: profile?.website || officialSource || record?.sourceUrl || null,
    logoUrl: profile?.crest ? `/assets/universities/${slug}/profile/logo.webp` : logoOverride || record?.logo?.path || null,
    logoSourcePage: profile?.crest?.source || (logoOverride ? officialSource : record?.logo?.sourcePage) || null,
    campusUrl: profile?.cover || curatedGallery[0]?.path || campusOverride || record?.campus?.path || null,
    campusSourcePage: profile?.coverCredit || curatedGallery[0]?.sourcePage || (campusOverride ? officialSource : record?.campus?.sourcePage) || null,
    campusOriginalUrl: profile?.cover || campusOverride ? null : curatedGallery[0]?.sourceUrl || record?.campus?.sourceUrl || null,
    campusGallery: [
      ...curatedGallery,
      ...(record?.campusGallery || []).filter((asset) => Boolean(asset?.path)).map((asset) => ({ ...asset, alt: undefined })),
    ],
    status: profile?.crest || curatedGallery.length ? 'verified_assets_downloaded' : record?.status ?? null,
  };
}

export function getUniversityLogoObjectPosition(slug: string) {
  return Object.hasOwn(wideLogoPositions, slug) ? wideLogoPositions[slug] : undefined;
}
