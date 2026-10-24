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

/**
 * Local branding is a safe display fallback. Database-provided branding remains
 * authoritative, so university administrators can replace these files through
 * the existing protected branding workflow without changing frontend code.
 */
export function getLocalUniversityBranding(slug: string) {
  const record = records[slug];
  return {
    logoUrl: record?.logo?.path ?? null,
    logoSourcePage: record?.logo?.sourcePage ?? null,
    campusUrl: record?.campus?.path ?? null,
    campusSourcePage: record?.campus?.sourcePage ?? null,
    status: record?.status ?? null,
  };
}
