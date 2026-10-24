import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outputRoot = path.join(projectRoot, 'public', 'assets', 'universities');
const manifestPath = path.join(projectRoot, 'data', 'university-branding.json');

// These are official institutional homepages or official institutional portals.
// The script never uses search-result thumbnails, social-media copies, or third-party CDNs
// unless the university's own page embeds the image from that source.
const institutions = [
  ['aamusted', 'AAMUSTED', 'Akenten Appiah-Menka University of Skills Training and Entrepreneurial Development', 'https://usted.edu.gh/'],
  ['utas', 'UTAS', 'University of Technology and Applied Sciences', 'https://utas.edu.gh/'],
  ['gctu', 'GCTU', 'Ghana Communication Technology University', 'https://site.gctu.edu.gh/'],
  ['gimpa', 'GIMPA', 'Ghana Institute of Management and Public Administration', 'https://gimpa.edu.gh/'],
  ['knust', 'KNUST', 'Kwame Nkrumah University of Science and Technology', 'https://www.knust.edu.gh/'],
  ['sdd-ubids', 'SDD-UBIDS', 'Simon Diedong Dombo University of Business and Integrated Development Studies', 'https://ubids.edu.gh/'],
  ['uds', 'UDS', 'University for Development Studies', 'https://uds.edu.gh/'],
  ['ucc', 'UCC', 'University of Cape Coast', 'https://ucc.edu.gh/'],
  ['uew', 'UEW', 'University of Education, Winneba', 'https://uew.edu.gh/'],
  ['uenr', 'UENR', 'University of Energy and Natural Resources', 'https://uenr.edu.gh/'],
  ['uhas', 'UHAS', 'University of Health and Allied Sciences', 'https://www.uhas.edu.gh/'],
  ['uesd', 'UESD', 'University of Environment and Sustainable Development', 'https://www.uesd.edu.gh/'],
  ['ug', 'UG', 'University of Ghana', 'https://ug.edu.gh/'],
  ['unimac', 'UniMAC', 'University of Media, Arts and Communication', 'https://unimac.edu.gh/'],
  ['umat', 'UMaT', 'University of Mines and Technology', 'https://umat.edu.gh/'],
  ['upsa', 'UPSA', 'University of Professional Studies, Accra', 'https://upsa.edu.gh/'],
  ['atu', 'ATU', 'Accra Technical University', 'https://atu.edu.gh/'],
  ['btu', 'BTU', 'Bolgatanga Technical University', 'https://bolgatu.edu.gh/'],
  ['cctu', 'CCTU', 'Cape Coast Technical University', 'https://cctu.edu.gh/'],
  ['dhltu', 'DHLTU', 'Dr. Hilla Limann Technical University', 'https://www.dhltu.edu.gh/'],
  ['htu', 'HTU', 'Ho Technical University', 'https://htu.edu.gh/'],
  ['ktu', 'KTU', 'Koforidua Technical University', 'https://ktu.edu.gh/'],
  ['kstu', 'KsTU', 'Kumasi Technical University', 'https://kstu.edu.gh/'],
  ['stu', 'STU', 'Sunyani Technical University', 'https://stu.edu.gh/'],
  ['ttu', 'TTU', 'Takoradi Technical University', 'https://ttu.edu.gh/'],
  ['tatu', 'TaTU', 'Tamale Technical University', 'https://tatu.edu.gh/'],
  ['academic-city-university', 'Academic City', 'Academic City University', 'https://acity.edu.gh/'],
  ['accra-metropolitan-university', 'Accra Metropolitan', 'Accra Metropolitan University', 'https://web.accramet.edu.gh/'],
  ['african-university-of-communication-and-business', 'AUCB', 'African University of Communication and Business', 'https://aucb.edu.gh/'],
  ['akrofi-christaller-institute', 'Akrofi-Christaller Institute', 'Akrofi-Christaller Institute of Theology, Mission and Culture', 'https://www.aci.edu.gh/'],
  ['all-nations-university', 'ANU', 'All Nations University', 'https://anu.edu.gh/'],
  ['ashesi', 'Ashesi', 'Ashesi University', 'https://ashesi.edu.gh/'],
  ['catholic-university', 'CUG', 'Catholic University of Ghana', 'https://cug.edu.gh/'],
  ['central-university', 'CU', 'Central University', 'https://www.central.edu.gh/'],
  ['christian-service-university', 'CSU', 'Christian Service University', 'https://www.csuc.edu.gh/'],
  ['ensign-global-university', 'Ensign Global', 'Ensign Global University', 'https://ensign.edu.gh/'],
  ['entrance-university-of-health-sciences', 'Entrance University', 'Entrance University of Health Sciences', 'https://euhs.edu.gh/'],
  ['family-health-university', 'Family Health', 'Family Health University', 'https://fhu.edu.gh/'],
  ['garden-city-university', 'Garden City', 'Garden City University', 'https://www.gcu.edu.gh/'],
  ['heritage-christian-university', 'Heritage Christian', 'Heritage Christian University', 'https://hcu.edu.gh/'],
  ['kaaf-university', 'KAAF', 'KAAF University', 'https://www.kaafuni.edu.gh/'],
  ['knutsford-university', 'Knutsford', 'Knutsford University', 'https://knutsford.edu.gh/'],
  ['methodist-university', 'Methodist University', 'Methodist University', 'https://mug.edu.gh/'],
  ['nibs-university', 'NiBS', 'NiBS University', 'https://nibs.edu.gh/'],
  ['pentecost-university', 'Pentecost University', 'Pentecost University', 'https://pentvars.edu.gh/'],
  ['presbyterian-university', 'Presbyterian University', 'Presbyterian University', 'https://www.presbyuniversity.edu.gh/'],
  ['thrivus-university', 'Thrivus University', 'Thrivus University for Biomedical Science and Technology', 'https://thrivusinstitute.edu.gh/'],
  ['trinity-theological-seminary', 'Trinity Seminary', 'Trinity Theological Seminary', 'https://trinity.edu.gh/'],
  ['university-of-gold-coast', 'UGC', 'University of Gold Coast', 'https://ugc.edu.gh/'],
  ['valley-view-university', 'Valley View', 'Valley View University', 'https://www.vvu.edu.gh/'],
  ['senes-professional-college-accra', 'SENES Professional College', 'SENES Professional College, Accra', null],
  ['ghana-armed-forces-command-and-staff-college', 'GAFCSC', 'Ghana Armed Forces Command and Staff College', 'https://www.gafcscmil.edu.gh/'],
  ['regional-maritime-university', 'RMU', 'Regional Maritime University', 'https://rmu.edu.gh/'],
  ['national-defence-university', 'NDU', 'National Defence University, Ghana', 'https://ndu.edu.gh/'],
];

const pageSuffixes = ['', 'about', 'campus', 'gallery'];
const blockedPathParts = ['favicon', 'icon', 'avatar', 'gravatar', 'sprite', 'captcha', 'pdf', 'brochure', 'admission', 'certificate', 'poster', 'flyer', 'wp-includes'];
const campusWords = ['campus', 'building', 'entrance', 'facility', 'facilities', 'grounds', 'library', 'hall', 'hostel', 'landmark', 'aerial', 'hero', 'slider', 'banner', 'gallery', 'photo'];
const logoWords = ['logo', 'crest', 'emblem', 'brand', 'seal'];

function assetFolderFor(slug) {
  // Preserve the existing tracked UENR asset directory name on case-sensitive hosts.
  return slug === 'uenr' ? 'UENR' : slug;
}

// Explicit official-page assets for institutions whose homepages expose weak metadata,
// and for replacing an automatically selected logo that was incorrectly reused as a campus image.
// Every URL below is hosted by the institution's own website.
const manualAssets = {
  'sdd-ubids': {
    logo: { url: 'https://ubids.edu.gh/wp-content/uploads/2026/01/ubids_logo_new.png', page: 'https://ubids.edu.gh/' },
    campus: { url: 'https://ubids.edu.gh/wp-content/uploads/2024/01/ubids_bsc_construction.jpg', page: 'https://ubids.edu.gh/' },
  },
  'african-university-of-communication-and-business': {
    logo: { url: 'https://aucb.edu.gh/wp-content/uploads/2026/06/aucb-logo-1000-x-1000-pixels.png', page: 'https://aucb.edu.gh/' },
    campus: { url: 'https://aucb.edu.gh/wp-content/uploads/2026/06/aucb-default-social-share-image.jpg', page: 'https://aucb.edu.gh/' },
  },
  gimpa: {
    logo: { url: 'https://gimpa.edu.gh/wp-content/uploads/2022/08/logo_GIMPS2.png', page: 'https://gimpa.edu.gh/' },
    campus: { url: 'https://gimpa.edu.gh/wp-content/uploads/2026/08/special-visits.png', page: 'https://gimpa.edu.gh/' },
  },
  uds: {
    // The official UDS homepage exposes its favicon as the only brand mark in its header.
    logo: { url: 'https://uds.edu.gh/favicon.ico', page: 'https://uds.edu.gh/' },
    campus: { url: 'https://uds.edu.gh/udsimgs/uds6785img8657.jpg', page: 'https://uds.edu.gh/' },
  },
  uew: {
    logo: { url: 'https://uew.edu.gh/themes/custom/pinaman/images/logos/uew-logo-w.png', page: 'https://uew.edu.gh/' },
    campus: { url: 'https://uew.edu.gh/sites/default/files/2023-12/uew_hall_img_link.jpg', page: 'https://uew.edu.gh/' },
  },
  'central-university': {
    logo: { url: 'https://central.edu.gh/static/img/Central-Uni-logo.png', page: 'https://central.edu.gh/' },
    campus: { url: 'https://webcms.central.edu.gh/wp-content/uploads/2026/01/Students-Centred-4.jpg', page: 'https://central.edu.gh/' },
  },
  dhltu: {
    logo: { url: 'https://www.dhltu.edu.gh/assets/brand/logo.png', page: 'https://www.dhltu.edu.gh/' },
    campus: { url: 'https://www.dhltu.edu.gh/assets/images/hero/admissions.jpeg', page: 'https://www.dhltu.edu.gh/' },
  },
  'entrance-university-of-health-sciences': {
    logo: { url: 'https://euhs.edu.gh/wp-content/uploads/2026/01/Web_Logo-01-scaled.png', page: 'https://euhs.edu.gh/' },
  },
  'family-health-university': {
    logo: { url: 'https://fhu.edu.gh/wp-content/uploads/2026/02/Add-a-little-bit-of-body-text-2.png', page: 'https://fhu.edu.gh/' },
    campus: { url: 'https://fhu.edu.gh/wp-content/uploads/2026/05/Untitled-design-45.jpg', page: 'https://fhu.edu.gh/' },
  },
  'christian-service-university': {
    logo: { url: 'https://www.csuc.edu.gh/wp-content/uploads/2023/03/csuc-logo.jpeg', page: 'https://www.csuc.edu.gh/' },
    campus: { url: 'https://www.csuc.edu.gh/wp-content/uploads/2023/09/IMG_0305-1024x683.jpg', page: 'https://www.csuc.edu.gh/' },
  },
  'ensign-global-university': {
    logo: { url: 'https://ensign.edu.gh/uploads/85be3d4af7274165ee6882f1244d52f9ccc016ac.png', page: 'https://ensign.edu.gh/' },
  },
  'garden-city-university': {
    logo: { url: 'https://www.gcu.edu.gh/assets/images/logo/gcu_logo_site_2.png', page: 'https://www.gcu.edu.gh/' },
    campus: { url: 'https://www.gcu.edu.gh/assets/images/bgs/front.JPG', page: 'https://www.gcu.edu.gh/' },
  },
  'thrivus-university': {
    logo: { url: 'https://thrivusinstitute.edu.gh/wp-content/uploads/2025/02/Asset-2@4x-300x74.fw_.png', page: 'https://thrivusinstitute.edu.gh/' },
    campus: { url: 'https://thrivusinstitute.edu.gh/wp-content/uploads/2021/11/WhatsApp-Image-2021-11-05-at-3.00.51-PM-1.jpeg', page: 'https://thrivusinstitute.edu.gh/' },
  },
  'university-of-gold-coast': {
    logo: { url: 'https://ugc.edu.gh/wp-content/uploads/2025/10/Asset-1-1-1.png', page: 'https://ugc.edu.gh/' },
    campus: { url: 'https://ugc.edu.gh/wp-content/uploads/2026/06/Sliders-01.jpg-scaled.jpeg', page: 'https://ugc.edu.gh/' },
  },
  'valley-view-university': {
    logo: { url: 'https://www.vvu.edu.gh/uploads/settings/img_1787164583_6a85f7a74e4a8.png', page: 'https://www.vvu.edu.gh/' },
    campus: { url: 'https://www.vvu.edu.gh/Education-Website-and-AdminPanel/images/slider/7fad7c8323436bba7220bf53e30f2a68.jpg', page: 'https://www.vvu.edu.gh/' },
  },
  kstu: {
    logo: { url: 'https://kstu.edu.gh/sites/default/files/kstu-new_0.png', page: 'https://kstu.edu.gh/' },
    campus: { url: 'https://kstu.edu.gh/sites/default/files/2026-10/Hostel.jpg', page: 'https://kstu.edu.gh/' },
  },
  atu: { campus: { url: 'https://atu.edu.gh/wp-content/uploads/2024/08/580A0873-1024x683.jpg', page: 'https://atu.edu.gh/' } },
  htu: { campus: { url: 'https://htu.edu.gh/wp-content/uploads/2022/06/MG_0153.jpg', page: 'https://htu.edu.gh/' } },
  ug: { campus: { url: 'https://ug.edu.gh/sites/default/files/2026-10/UBS%20Awards%20Winning%20Team.jpeg', page: 'https://ug.edu.gh/' } },
  'ghana-armed-forces-command-and-staff-college': { campus: { url: 'https://gafcscmil.edu.gh/uploads/noticeboard/7a04ca7e4920d64ea50226a9f2f2a23f.jpg', page: 'https://www.gafcscmil.edu.gh/' } },
  knust: { campus: { url: 'https://www.knust.edu.gh/themes/custom/adepts/images/aboutknustimg.jpg', page: 'https://www.knust.edu.gh/about' } },
  ucc: { campus: { url: 'https://ucc.edu.gh/img/graduate.png', page: 'https://ucc.edu.gh/' } },
  utas: { campus: { url: 'https://utas.edu.gh/wp-content/uploads/2026/06/UTAS-7th-Congregation-7-Large-1.webp', page: 'https://utas.edu.gh/' } },
  umat: { campus: { url: 'https://umat.edu.gh/images/Slideshow/2024/UMaT-cover.jpeg', page: 'https://umat.edu.gh/' } },
  stu: { campus: { url: 'https://stu.edu.gh/images/news/Newmont%20Ahafo%20North%20Supports%20STU.jpg', page: 'https://stu.edu.gh/' } },
  'catholic-university': { campus: { url: 'https://cug.edu.gh/uploads/slider/1767726763.png', page: 'https://cug.edu.gh/' } },
  ttu: { campus: { url: 'https://ttu.edu.gh/wp-content/uploads/2026/04/Slider2.png', page: 'https://ttu.edu.gh/' } },
  ashesi: { campus: { url: 'https://ashesi.edu.gh/wp-content/uploads/2026/10/Ashesi-MTN-MOU-e1791307361895-768x402.jpg', page: 'https://ashesi.edu.gh/' } },
  'knutsford-university': { campus: { url: 'https://knutsford.edu.gh/wp-content/uploads/2026/08/New-Knutsford-Campus-view.jpeg', page: 'https://knutsford.edu.gh/' } },
  'presbyterian-university': { logo: { url: 'https://www.presbyuniversity.edu.gh/site/wp-content/uploads/2022/09/University-Logo-New-02.jpg', page: 'https://www.presbyuniversity.edu.gh/site/' } },
  'akrofi-christaller-institute': { skipAutomatic: true },
};

const reviewNotes = {
  gimpa: 'Official homepage and assets currently fail certificate validation in the downloader; no insecure copy was imported.',
  'akrofi-christaller-institute': 'Official domain currently serves a suspended-page response; no third-party logo copy was imported.',
  'entrance-university-of-health-sciences': 'Official site publishes a logo but no campus photograph was exposed in its public page assets.',
  'senes-professional-college-accra': 'No official website was published in the directory source, so no asset was fabricated.',
};

function absoluteUrl(raw, pageUrl) {
  if (!raw || raw.startsWith('data:') || raw.startsWith('blob:')) return null;
  try { return new URL(raw, pageUrl).href; } catch { return null; }
}

function cleanUrl(url) {
  if (!url) return null;
  const decoded = url.replaceAll('&amp;', '&').trim();
  return decoded.startsWith('//') ? `https:${decoded}` : decoded;
}

function imageCandidates(html, pageUrl) {
  const results = [];
  const metaRe = /<meta\b[^>]*(?:property|name)=["'](?:og:image|twitter:image)["'][^>]*content=["']([^"']+)["'][^>]*>/gi;
  for (const match of html.matchAll(metaRe)) results.push({ url: absoluteUrl(cleanUrl(match[1]), pageUrl), alt: '', kind: 'metadata' });
  const imgRe = /<img\b([^>]*?)>/gi;
  for (const match of html.matchAll(imgRe)) {
    const attrs = match[1];
    const attr = (name) => {
      const found = attrs.match(new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, 'i'));
      return found?.[1] || '';
    };
    const src = attr('src') || attr('data-src') || attr('data-lazy-src');
    const srcset = attr('srcset') || attr('data-srcset');
    const firstSrcset = srcset.split(',').map((v) => v.trim().split(/\s+/)[0]).find(Boolean);
    results.push({ url: absoluteUrl(cleanUrl(src || firstSrcset), pageUrl), alt: attr('alt'), kind: 'img' });
  }
  return results.filter((item) => item.url && /^https?:\/\//i.test(item.url));
}

function candidateScore(candidate, role) {
  const haystack = `${candidate.url} ${candidate.alt}`.toLowerCase();
  if (blockedPathParts.some((word) => haystack.includes(word))) return -1000;
  const logoScore = logoWords.reduce((score, word) => score + (haystack.includes(word) ? 30 : 0), 0);
  const campusScore = campusWords.reduce((score, word) => score + (haystack.includes(word) ? 12 : 0), 0);
  const metadataBonus = candidate.kind === 'metadata' ? 6 : 0;
  return role === 'logo' ? logoScore + metadataBonus : campusScore + metadataBonus;
}

function extensionFor(contentType, sourceUrl) {
  const type = (contentType || '').split(';')[0].toLowerCase();
  if (type === 'image/svg+xml') return '.svg';
  if (type === 'image/png') return '.png';
  if (type === 'image/webp') return '.webp';
  if (type === 'image/gif') return '.gif';
  if (type === 'image/avif') return '.avif';
  if (type === 'image/jpeg' || type === 'image/jpg') return '.jpg';
  const ext = path.extname(new URL(sourceUrl).pathname).toLowerCase();
  return ['.svg', '.png', '.webp', '.gif', '.avif', '.jpg', '.jpeg', '.ico'].includes(ext) ? (ext === '.jpeg' ? '.jpg' : ext) : '.jpg';
}

async function fetchText(url) {
  const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(5000), headers: { 'user-agent': 'UniEco Ghana university asset verifier/1.0' } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return { html: await response.text(), finalUrl: response.url };
}

async function downloadImage(url) {
  const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(20000), headers: { 'user-agent': 'UniEco Ghana university asset verifier/1.0' } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.toLowerCase().startsWith('image/')) throw new Error(`Not an image (${contentType || 'unknown content type'})`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 1024) throw new Error('Image is unexpectedly small');
  return { bytes, contentType, finalUrl: response.url };
}

async function main() {
  await mkdir(path.dirname(manifestPath), { recursive: true });
  const previous = existsSync(manifestPath) ? JSON.parse(await readFile(manifestPath, 'utf8')) : {};
  const manifest = { ...previous };

  async function processInstitution([slug, shortName, name, sourceUrl]) {
    const record = { slug, shortName, name, sourceUrl, logo: null, campus: null, status: sourceUrl ? 'pending' : 'no_official_site_published', reviewNote: reviewNotes[slug] || null, checkedAt: new Date().toISOString() };
    if (!sourceUrl) return record;

    const pages = (await Promise.all(pageSuffixes.map(async (suffix) => {
      const page = new URL(suffix, sourceUrl).href;
      try {
        const response = await fetchText(page);
        return { pageUrl: response.finalUrl, ...response };
      } catch { return null; }
    }))).filter(Boolean);
    const candidates = pages.flatMap((page) => imageCandidates(page.html, page.pageUrl).map((candidate) => ({ ...candidate, pageUrl: page.pageUrl })));
    const unique = [...new Map(candidates.map((candidate) => [candidate.url, candidate])).values()];

    for (const role of ['logo', 'campus']) {
      if (manualAssets[slug]?.skipAutomatic) break;
      const ranked = unique
        .map((candidate) => ({ candidate, score: candidateScore(candidate, role) }))
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score);
      let saved = false;
      for (const { candidate, score } of ranked.slice(0, 8)) {
        try {
          const downloaded = await downloadImage(candidate.url);
          const ext = extensionFor(downloaded.contentType, downloaded.finalUrl);
          const sha256 = createHash('sha256').update(downloaded.bytes).digest('hex');
          if (role === 'campus' && record.logo?.sha256 === sha256) continue;
          const assetFolder = assetFolderFor(slug);
          const assetDir = path.join(outputRoot, assetFolder);
          await mkdir(assetDir, { recursive: true });
          const localName = `${role}${ext}`;
          const localPath = path.join(assetDir, localName);
          await writeFile(localPath, downloaded.bytes);
          record[role] = {
            path: `/assets/universities/${assetFolder}/${localName}`,
            sourcePage: candidate.pageUrl,
            sourceUrl: downloaded.finalUrl,
            contentType: downloaded.contentType,
            bytes: downloaded.bytes.length,
            sha256,
            score,
          };
          saved = true;
          break;
        } catch { /* Try the next official candidate. */ }
      }
      if (!saved) {
        const prior = previous[slug]?.[role];
        record[role] = prior
          ? { ...prior, path: prior.path.replace('/assets/universities/uenr/', '/assets/universities/UENR/') }
          : null;
      }
    }

    const explicit = manualAssets[slug] || {};
    for (const role of ['logo', 'campus']) {
      const spec = explicit[role];
      if (!spec) continue;
      try {
        const downloaded = await downloadImage(spec.url);
        const sha256 = createHash('sha256').update(downloaded.bytes).digest('hex');
        if (role === 'campus' && record.logo?.sha256 === sha256) throw new Error('Explicit campus image matches the logo');
        const ext = extensionFor(downloaded.contentType, downloaded.finalUrl);
        const assetFolder = assetFolderFor(slug);
        const assetDir = path.join(outputRoot, assetFolder);
        await mkdir(assetDir, { recursive: true });
        const localName = `${role}${ext}`;
        await writeFile(path.join(assetDir, localName), downloaded.bytes);
        record[role] = {
          path: `/assets/universities/${assetFolder}/${localName}`,
          sourcePage: spec.page,
          sourceUrl: downloaded.finalUrl,
          contentType: downloaded.contentType,
          bytes: downloaded.bytes.length,
          sha256,
          score: 100,
          selection: 'explicit_official_source',
        };
      } catch (error) {
        console.warn(`${shortName}: explicit ${role} asset unavailable (${error instanceof Error ? error.message : String(error)})`);
      }
    }
    if (explicit.skipAutomatic) {
      record.logo = manualAssets[slug]?.logo ? record.logo : null;
      record.campus = manualAssets[slug]?.campus ? record.campus : null;
    }
    record.status = record.logo && record.campus ? 'verified_assets_downloaded' : record.logo ? 'logo_only' : 'no_verified_assets';
    return record;
  }

  let nextIndex = 0;
  async function worker() {
    while (true) {
      const index = nextIndex++;
      if (index >= institutions.length) return;
      const tuple = institutions[index];
      try {
        const record = await processInstitution(tuple);
        manifest[record.slug] = record;
        await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
        console.log(`${record.shortName}: ${record.status}`);
      } catch (error) {
        const [slug, shortName, name, sourceUrl] = tuple;
        const record = { slug, shortName, name, sourceUrl, logo: previous[slug]?.logo || null, campus: previous[slug]?.campus || null, status: 'ingestion_error', reviewNote: reviewNotes[slug] || null, checkedAt: new Date().toISOString(), error: error instanceof Error ? error.message : String(error) };
        manifest[slug] = record;
        await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
        console.log(`${shortName}: ingestion_error`);
      }
    }
  }

  await Promise.all(Array.from({ length: 6 }, () => worker()));

  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  const counts = Object.values(manifest).reduce((acc, item) => { acc[item.status] = (acc[item.status] || 0) + 1; return acc; }, {});
  console.log(JSON.stringify({ institutions: institutions.length, counts }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
