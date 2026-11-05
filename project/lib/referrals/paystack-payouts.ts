export type TransferStatus = 'pending' | 'succeeded' | 'failed' | 'reversed' | 'reconciliation_required';
export type TransferOutcome = { status: TransferStatus; failureCode?: string };

const aliases: Record<string, string[]> = {
  mtn: ['mtn', 'mobile money - mtn', 'mtn mobile money'],
  telecel: ['telecel', 'vodafone', 'mobile money - vodafone', 'telecel cash'],
  airteltigo: ['airteltigo', 'airtel tigo', 'airtel', 'tigo', 'mobile money - airteltigo'],
};

export function findMobileMoneyBankCode(raw: unknown, provider: string): string | null {
  if (!Array.isArray(raw) || !aliases[provider]) return null;
  const candidates = raw.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'));
  const matches = candidates.filter((item) => {
    const name = String(item.name || '').trim().toLowerCase();
    const code = String(item.code || '').trim().toLowerCase();
    return aliases[provider].some((alias) => name === alias || code === alias);
  });
  if (matches.length !== 1 || typeof matches[0].code !== 'string' || !matches[0].code.trim()) return null;
  return matches[0].code;
}

export function transferOutcome(
  value: { reference?: unknown; amount?: unknown; currency?: unknown; status?: unknown; recipient?: unknown },
  expected: { reference: string; amountPesewas: number; recipient?: string },
): TransferOutcome {
  if (value.reference !== expected.reference || Number(value.amount) !== expected.amountPesewas || value.currency !== 'GHS'
    || (expected.recipient && value.recipient !== expected.recipient)) {
    return { status: 'reconciliation_required', failureCode: 'provider_details_mismatch' };
  }
  const status = String(value.status || '').toLowerCase();
  if (['success', 'successful'].includes(status)) return { status: 'succeeded' };
  if (status === 'failed') return { status: 'failed', failureCode: 'provider_failed' };
  if (status === 'reversed') return { status: 'reversed', failureCode: 'provider_reversed' };
  if (['pending', 'processing', 'otp', 'received', 'queued', ' in progress'].includes(status)) return { status: 'pending' };
  return { status: 'reconciliation_required', failureCode: 'unrecognized_provider_status' };
}
