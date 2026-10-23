export function normalizeGhanaPhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.startsWith('233')) return `0${digits.slice(3)}`;
  if (digits.length === 9 && digits.startsWith('2')) return `0${digits}`;
  return digits;
}

export function isValidGhanaPhone(value: string): boolean {
  return /^0\d{9}$/.test(normalizeGhanaPhone(value));
}
