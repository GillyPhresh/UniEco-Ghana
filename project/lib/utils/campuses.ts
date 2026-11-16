export const campusGroups = [
  { id: 'all', label: 'All institutions' },
  { id: 'university', label: 'Universities' },
  { id: 'technical', label: 'Technical universities' },
  { id: 'education', label: 'Colleges of Education' },
  { id: 'health', label: 'Health training' },
  { id: 'other', label: 'Other institutions' },
] as const;

export type CampusGroup = typeof campusGroups[number]['id'];

export function campusGroup(type: string | null): Exclude<CampusGroup, 'all'> {
  if (type?.includes('College of Education')) return 'education';
  if (type?.includes('Health Training')) return 'health';
  if (type?.includes('Technical University')) return 'technical';
  if (type?.endsWith('University')) return 'university';
  return 'other';
}

export function campusSearchText(value: string) {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

export function secureSourceUrl(value?: string | null): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : undefined;
  } catch {
    return undefined;
  }
}
