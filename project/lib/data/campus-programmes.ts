import snapshots from '@/data/campus-programmes.json';

type Programme = { award: string; programme: string; validUntil: string };
type ProgrammeSnapshot = { institutionId: string; checkedAt: string; programmes: Programme[] };
const academicRecords: Record<string, ProgrammeSnapshot> = snapshots;

export function campusProgrammeSnapshot(slug: string, regulatorUrl?: string, today = new Date().toISOString().slice(0, 10)) {
  if (!regulatorUrl || !Object.hasOwn(academicRecords, slug)) return undefined;
  const record = academicRecords[slug];
  const source = new URL(regulatorUrl);
  if (source.hostname !== 'gtec.edu.gh' || source.pathname !== '/programmes/' || source.searchParams.get('institutionId') !== record.institutionId) return undefined;
  const programmes = record.programmes.filter((item) => item.validUntil >= today);
  return programmes.length ? { checkedAt: record.checkedAt, programmes } : undefined;
}
