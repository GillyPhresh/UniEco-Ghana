/** Keep user search input literal and bounded before inserting it into PostgREST filter syntax. */
export function normalizeSearchTerm(value: string, maxLength = 100): string {
  return value
    .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
    .trim();
}
