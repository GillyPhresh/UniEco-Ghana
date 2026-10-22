/**
 * Safari versions without crypto.randomUUID still need a collision-resistant
 * request key for payment and order mutations.
 */
export function createIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  const random = Math.random().toString(36).slice(2);
  return `unieco-${Date.now().toString(36)}-${random}`;
}
