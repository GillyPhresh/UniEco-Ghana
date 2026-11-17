import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { testModules } from './helpers/load-typescript.mjs';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');
const { documentMoney, documentDate, isDocumentId, isTransactionDocumentKind, transactionDocumentHref, receiptPaymentStatuses } =
  testModules()('lib/transactions/documents.ts');

test('document URLs accept only supported document kinds and UUIDs', () => {
  const id = '848a0000-0000-4000-8000-000000000071';
  assert.equal(isDocumentId(id), true);
  assert.equal(isDocumentId('../invoice'), false);
  assert.equal(isTransactionDocumentKind('order-receipt'), true);
  assert.equal(isTransactionDocumentKind('sales'), false);
  assert.equal(transactionDocumentHref('order-invoice', id), '/dashboard/transactions/order-invoice/' + id);
});

test('document formatting respects recorded currency and refuses to turn unavailable amounts into zero', () => {
  assert.match(documentMoney(23.50, 'GHS'), /^GHS\s+23\.50$/);
  assert.match(documentMoney(23.50, 'USD'), /^USD\s+23\.50$/);
  assert.equal(documentMoney(null, 'GHS'), '—');
  assert.equal(documentMoney(1, 'XYZZ'), '—');
  assert.equal(documentDate('invalid'), '—');
  assert.equal(receiptPaymentStatuses.has('cash_on_delivery'), false);
  assert.equal(receiptPaymentStatuses.has('partially_refunded'), true);
});

test('verified documents are served only through authenticated, uncached routes; no raw HTML printing', async () => {
  const [detail, hub, print, middleware, worker, legacyPayment, legacyOrder] = await Promise.all([
    read('app/dashboard/transactions/[kind]/[id]/page.tsx'),
    read('app/dashboard/transactions/page.tsx'),
    read('components/transactions/print-document-button.tsx'),
    read('lib/supabase/middleware.ts'),
    read('public/sw.js'),
    read('lib/data/payment-client.ts'),
    read('app/orders/[id]/page.tsx'),
  ]);
  for (const screen of [detail, hub]) {
    assert.match(screen, /dynamic = 'force-dynamic'/);
    assert.match(screen, /supabase\.auth\.getUser\(\)/);
    assert.match(screen, /if \(!user\) redirect/);
    assert.doesNotMatch(screen, /dangerouslySetInnerHTML|document\.write/);
  }
  assert.match(detail, /not a GRA tax invoice/);
  assert.match(detail, /Original payment/);
  assert.match(print, /window\.print\(\)/);
  assert.match(middleware, /'\/dashboard'[\s\S]*?'Cache-Control', 'private, no-store/);
  assert.match(worker, /const NEVER_CACHE_PATTERNS = \[[\s\S]*?'\/dashboard'/);
  assert.doesNotMatch(legacyPayment, /document\.write|generateInvoicePrintable/);
  assert.doesNotMatch(legacyOrder, /window\.open|generateReceiptHtml/);
});

test('document migration grants no anonymous access, creates no payment records and matches protected sources', async () => {
  const sql = await read('supabase/migrations/20261118100000_0207_private_transaction_documents.sql');
  assert.match(sql, /o\.buyer_id = viewer OR EXISTS/);
  assert.match(sql, /v\.id=o\.vendor_id AND v\.owner_id=viewer/);
  assert.match(sql, /p\.paid_at IS NOT NULL AND p\.provider_environment IS DISTINCT FROM 'test'/);
  assert.match(sql, /r\.amount=p\.amount AND p\.amount=sale\.total_amount/);
  assert.match(sql, /r\.currency=sale\.currency AND p\.currency=sale\.currency/);
  assert.match(sql, /IF p_kind='order-receipt' AND proof\.id IS NULL THEN RETURN NULL/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.get_transaction_document\(text,uuid\) TO authenticated/);
  assert.doesNotMatch(sql, /\b(?:INSERT INTO|UPDATE public|DELETE FROM|GRANT SELECT)\b/i);
});
