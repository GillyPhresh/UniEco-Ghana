/**
 * Encode a CSV cell as text when spreadsheet software might interpret it as a
 * formula. Quoting alone is CSV escaping, not formula escaping.
 */
export function csvCell(value: unknown): string {
  const text = value == null ? '' : String(value);
  // Use normalization only for detection: preserve the original content in
  // the export. Check after leading whitespace and invisible format controls.
  const normalized = text.normalize('NFKC');
  const formulaLike = /^[\p{White_Space}\p{Cc}\p{Cf}]*[=+\-@]/u.test(normalized)
    || /^[\p{Zs}\p{Cf}]*[\t\r\n]/u.test(normalized);
  const safeText = formulaLike ? `'${text}` : text;
  return `"${safeText.replace(/"/g, '""')}"`;
}
