import { getCuratedCampusProfile, getLocalUniversityBranding } from '@/lib/data/university-branding';
import type { University } from '@/lib/types';
import { campusGroup, campusSearchText, secureSourceUrl, type CampusGroup } from '@/lib/utils/campuses';

const universityBrandingPath = '/storage/v1/object/public/university-branding/';

export type CampusPhoto = {
  src: string;
  alt: string;
  sourceUrl?: string;
};

export type DirectoryRecord = Pick<University,
  'id' | 'name' | 'official_name' | 'short_name' | 'abbreviation' | 'slug' | 'city' | 'region' |
  'logo_url' | 'hero_image_url' | 'landmark_image_url' | 'logo_alt_text' | 'hero_alt_text' | 'institution_type' |
  'ownership_type' | 'campus_launch_status'
> & { university_aliases: Array<{ alias: string }> };

type ProfileRecord = Omit<DirectoryRecord, 'university_aliases'> & Partial<Pick<University,
  'website_url' | 'description' | 'image_source' | 'accreditation_source_url'
>>;

function imagePath(value?: string | null) {
  if (value?.startsWith('/') && !value.startsWith('//') && !/[\\\s]/.test(value)) return value;
  return secureSourceUrl(value);
}

function isBrandingUpload(value?: string) {
  if (!value?.startsWith('https://')) return false;
  const url = new URL(value);
  return url.hostname.endsWith('.supabase.co') && url.pathname.startsWith(universityBrandingPath);
}

// An official page can use several sizes of the same upload. Keep one slide.
function photoKey(source: string) {
  return source.replace(/^https?:\/\/(?:www\.)?/i, '').split(/[?#]/, 1)[0]
    .replace(/(?:-scaled|-\d+x\d+)(?=\.[a-z]+$)/i, '').toLowerCase();
}

function isPromotionalArtwork(value: string) {
  // Reject explicit posters/wordmarks, not general event photos or graduation photos.
  const basename = value.split(/[?#]/, 1)[0].split('/').pop() || '';
  return /(?:^|[-_.])(?:logo|crest|favicon|emblem|flyer|poster|vacancy)(?:[-_.]|$)/i.test(basename);
}

export function presentCampus(university: ProfileRecord) {
  const local = getLocalUniversityBranding(university.slug);
  const profile = getCuratedCampusProfile(university.slug);
  const name = university.official_name?.trim() || university.name;
  const shortName = profile?.shortName || university.short_name?.trim() || name;
  const location = [university.city?.trim(), university.region?.trim()]
    .filter((part, index, parts) => part && parts.indexOf(part) === index).join(', ');
  const storedWebsite = secureSourceUrl(university.website_url);
  // Wiawso changed to wcoe.edu.gh; the old domain no longer resolves.
  const oldConfiguredWebsite = university.slug === 'wiawso-college-of-education' && storedWebsite && /^(?:www\.)?wce\.edu\.gh$/.test(new URL(storedWebsite).hostname);
  const website = (oldConfiguredWebsite ? undefined : storedWebsite) ?? secureSourceUrl(profile?.website) ?? secureSourceUrl(local.website);
  const databaseLogo = imagePath(university.logo_url);
  const localLogo = imagePath(local.logoUrl);
  const logo = (isBrandingUpload(databaseLogo) ? databaseLogo : localLogo) ?? databaseLogo;
  const fallbackLogo = logo === databaseLogo ? localLogo : databaseLogo;
  const photos: CampusPhoto[] = [];
  const seen = new Set<string>();
  const seenPaths = new Set<string>();
  const rejected = new Set((profile?.excludedPhotos ?? []).map(photoKey));
  const addPhoto = (value?: string | null, sourcePage?: string | null, original?: string | null, description?: string | null) => {
    const src = imagePath(value);
    if (!src || src === logo || src === fallbackLogo) return;
    const key = photoKey(original || src);
    if (seenPaths.has(src) || seen.has(key) || rejected.has(key) || rejected.has(photoKey(src)) || isPromotionalArtwork(original || src)) return;
    seenPaths.add(src);
    seen.add(key);
    photos.push({ src, alt: description || `${name} campus life`, sourceUrl: secureSourceUrl(sourcePage) });
  };

  const uploadedHero = imagePath(university.hero_image_url);
  if (isBrandingUpload(uploadedHero)) addPhoto(uploadedHero, university.image_source, null, university.hero_alt_text);
  const campusCover = local.campusGallery.find((photo) => photo.path === local.campusUrl);
  addPhoto(local.campusUrl, local.campusSourcePage, local.campusOriginalUrl, campusCover?.alt);
  for (const photo of local.campusGallery) addPhoto(photo.path, photo.sourcePage, photo.sourceUrl, photo.alt);
  addPhoto(university.landmark_image_url, university.image_source, null, university.hero_alt_text);
  addPhoto(university.hero_image_url, university.image_source, null, university.hero_alt_text);

  const institutionType = university.institution_type || 'Tertiary institution';
  const legacyDescription = university.description?.trim();
  const overview = legacyDescription && !/^GTEC-listed .* as checked on /i.test(legacyDescription)
    ? legacyDescription
    : profile?.overview || `${name} is a ${institutionType.toLowerCase()}${location ? ` in ${location}` : ' in Ghana'}.`;

  return {
    name, shortName, location, website, institutionType, overview,
    overviewSource: secureSourceUrl(profile?.about) ?? (profile?.overview ? website : undefined),
    news: secureSourceUrl(profile?.news),
    gallery: secureSourceUrl(profile?.gallery),
    regulator: secureSourceUrl(university.accreditation_source_url),
    logo,
    fallbackLogo,
    logoCredit: logo === localLogo ? secureSourceUrl(local.logoSourcePage) : undefined,
    logoAlt: logo === databaseLogo && university.logo_alt_text ? university.logo_alt_text : `Logo of ${name}`,
    photos: photos.slice(0, 8),
  };
}

export type DirectoryCampus = Pick<DirectoryRecord, 'id' | 'slug' | 'region' | 'campus_launch_status'> & {
  name: string;
  shortName: string;
  location: string;
  institutionType: string;
  group: Exclude<CampusGroup, 'all'>;
  search: string;
  logo?: string;
  fallbackLogo?: string;
  logoAlt: string;
  photos: CampusPhoto[];
};

export function presentDirectoryCampus(record: DirectoryRecord): DirectoryCampus {
  const campus = presentCampus(record);
  return {
    id: record.id,
    slug: record.slug,
    region: record.region,
    campus_launch_status: record.campus_launch_status,
    name: campus.name,
    shortName: campus.shortName,
    location: campus.location,
    institutionType: campus.institutionType,
    group: campusGroup(record.institution_type),
    search: campusSearchText([
      record.name, campus.name, campus.shortName, record.abbreviation, record.slug, campus.location, campus.institutionType,
      ...(record.university_aliases || []).map(({ alias }) => alias),
    ].filter(Boolean).join(' ')),
    logo: campus.logo,
    fallbackLogo: campus.fallbackLogo,
    logoAlt: campus.logoAlt,
    photos: campus.photos.slice(0, 4).map(({ src, alt }) => ({ src, alt })),
  };
}
