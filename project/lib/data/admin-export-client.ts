export type AdminCsvResource = 'payments' | 'invoices' | 'subscriptions';

export async function downloadAdminCsv(resource: AdminCsvResource, status: string): Promise<void> {
  const response = await fetch(`/api/admin/${resource}/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  if (!response.ok) {
    const result = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(result?.error || 'Unable to create export.');
  }
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = `unieco-${resource}.csv`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
