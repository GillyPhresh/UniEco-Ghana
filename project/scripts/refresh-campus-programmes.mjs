import { readFile, writeFile } from 'node:fs/promises';

// Read the official institution IDs already reconciled with UniEco. Do not
// guess IDs or take scraped programme names from search-result snippets.
const rosterFile = new URL('../supabase/migrations/20261111100000_0196_add_gtec_colleges_directory.sql', import.meta.url);
const outputFile = new URL('../data/campus-programmes.json', import.meta.url);
const sql = await readFile(rosterFile, 'utf8');
const schools = [...sql.matchAll(/^\s*\('.+?https:\/\/gtec\.edu\.gh\/programmes\/\?institutionId=(\d+)'.*', '([a-z0-9-]+)'\)[,]?[ \t]*$/gm)]
  .map(([, id, slug]) => ({ id, slug }));
if (schools.length !== 125 || new Set(schools.map(({ slug }) => slug)).size !== schools.length) {
  throw new Error('The reviewed GTEC roster did not parse into its 125 unique institutions.');
}

const args = new Set(process.argv.slice(2));
const dryRun = args.delete('--dry-run');
const missingOnly = args.delete('--missing');
if ([...args].some((slug) => !schools.some((school) => school.slug === slug))) throw new Error('Unknown institution slug.');

const utcToday = new Date().toISOString().slice(0, 10);
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const decode = (text) => text.replace(/<[^>]*>/g, ' ')
  .replace(/&#(\d+);/g, (_, char) => Number(char) > 31 && Number(char) < 0x110000 ? String.fromCodePoint(Number(char)) : '')
  .replace(/&(amp|nbsp|quot|apos|lt|gt);/g, (_, entity) => ({ amp: '&', nbsp: ' ', quot: '"', apos: "'", lt: '<', gt: '>' })[entity])
  .replace(/\s+/g, ' ').trim();
const isoDate = (text) => text.replace(/^(\d{2})-(\d{2})-(\d{4})$/, '$3-$2-$1');
const prior = await readFile(outputFile, 'utf8').then(JSON.parse, (error) => {
  if (error.code !== 'ENOENT') throw error;
  return {};
});
const selected = schools.filter(({ slug }) => (!args.size || args.has(slug)) && (!missingOnly || !Object.hasOwn(prior, slug)));

async function loadSchool({ id, slug }) {
  const source = new URL('https://gtec.edu.gh/programmes/');
  source.searchParams.set('institutionId', id);
  const response = await fetch(source, {
    signal: AbortSignal.timeout(18000), redirect: 'error',
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; UniEcoGhana programme source verification)', Accept: 'text/html' },
  });
  if (!response.ok || !response.headers.get('content-type')?.includes('text/html') || Number(response.headers.get('content-length')) > 800_000) {
    throw new Error(`unexpected HTTP ${response.status} response`);
  }
  const html = await response.text();
  if (html.length > 900_000 || !new RegExp(`name="institutionId"\\s+value="${id}"`, 'i').test(html)) {
    throw new Error('the page did not confirm the requested institution');
  }
  const tables = [...html.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)].map(([table]) =>
    [...table.matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi)].map(([row]) =>
      [...row.matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)].map(([, cell]) => decode(cell))));
  const rows = tables.find((table) => table[0]?.join('|') === '#|Title|Programme|Duration (Years)|Status|Start Date|End Date');
  if (!rows) throw new Error('programme table format changed');
  const programmes = new Map();
  for (const [, award, programme, , status, validFrom, validUntil] of rows.slice(1)) {
    if (!award || !programme || status !== 'Active') continue;
    const date = isoDate(validUntil || '');
    const starts = isoDate(validFrom || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(starts) || starts > utcToday || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date < utcToday || award.length > 40 || programme.length > 155 || /[<>]/.test(award + programme)) continue;
    const key = `${award} ${programme}`.toUpperCase();
    const item = { award, programme, validUntil: date };
    if (!programmes.has(key) || programmes.get(key).validUntil < date) programmes.set(key, item);
  }
  prior[slug] = { institutionId: id, checkedAt: utcToday, programmes: Array.from(programmes.values()).slice(0, 10) };
  return programmes.size;
}

let success = 0;
let failures = 0;
if (!selected.length) console.log('No programme records are missing for the selected schools.');
for (let offset = 0; offset < selected.length; offset += 5) {
  const batch = selected.slice(offset, offset + 5);
  await Promise.all(batch.map(async (school) => {
    try {
      const count = await loadSchool(school);
      success++;
      if (dryRun || !count) console.log(`${school.slug}: ${count} active programme entries`);
    } catch (error) {
      failures++;
      console.warn(`${school.slug}: ${error.cause?.code || error.message}`);
    }
  }));
  if (offset + 5 < selected.length) await delay(600);
}
if (success && !dryRun) {
  const sorted = Object.fromEntries(Object.entries(prior).sort(([left], [right]) => left.localeCompare(right)));
  await writeFile(outputFile, `${JSON.stringify(sorted, null, 2)}\n`);
}
console.log(`${success} verified, ${failures} could not be checked. ${dryRun ? 'Dry run only.' : 'Only checked records were refreshed.'}`);
if (failures) process.exitCode = 1;
