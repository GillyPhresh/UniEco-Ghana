import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { withNext } from '@/lib/auth/redirects';
import { businessEmail } from '@/lib/constants/business-email';
import {
  documentDate, documentMoney, documentStatus, isDocumentId, isTransactionDocumentKind,
  transactionDocumentHref, type TransactionDocument,
} from '@/lib/transactions/documents';
import { PrintDocumentButton } from '@/components/transactions/print-document-button';

export const metadata = { title: 'Transaction document | UniEco Ghana', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function TransactionDocumentPage({ params }: { params: Promise<{ kind: string; id: string }> }) {
  const { kind, id } = await params;
  if (!isTransactionDocumentKind(kind) || !isDocumentId(id)) notFound();
  const path = transactionDocumentHref(kind, id);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(withNext('/signin', path));

  const { data, error } = await supabase.rpc('get_transaction_document', { p_kind: kind, p_id: id });
  const doc = data as TransactionDocument | null;
  const receipt = kind.endsWith('receipt');
  if (error || !doc) {
    return <main className="mx-auto max-w-xl p-5 sm:p-10">
      <h1 className="text-2xl font-bold">{error ? 'Couldn’t load the document' : receipt ? 'Receipt unavailable' : 'Invoice unavailable'}</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{error
        ? 'Try opening the document again in a moment.'
        : receipt ? 'A receipt is available only after payment is confirmed and only to an authorised account.'
          : 'This invoice doesn’t exist or isn’t available to this account.'}</p>
      <div className="mt-5 flex flex-wrap gap-4 text-sm font-semibold text-primary">
        {error && <a href={path} className="underline">Try again</a>}
        {kind === 'order-receipt' && <Link prefetch={false} href={transactionDocumentHref('order-invoice', id)} className="underline">View order invoice</Link>}
        <Link href="/dashboard/transactions" className="underline">Back to documents</Link>
      </div>
    </main>;
  }

  const title = receipt ? 'Payment receipt' : kind === 'order-invoice' ? 'Order invoice' : 'Invoice';
  const back = `/dashboard/transactions?show=${doc.viewerSide === 'seller' ? 'sales'
    : receipt ? 'receipts' : kind === 'invoice' ? 'invoices' : 'purchases'}`;
  const money = (value: number | null) => documentMoney(value, doc.currency);
  const refunded = doc.status === 'refunded' || doc.status === 'partially_refunded';
  const pairedPath = doc.orderId ? (receipt ? transactionDocumentHref('order-invoice', doc.orderId)
    : doc.receiptAvailable ? transactionDocumentHref('order-receipt', doc.orderId) : null)
    : kind === 'invoice' && doc.paymentId ? transactionDocumentHref('receipt', doc.paymentId) : null;

  return <main data-transaction-document className="mx-auto max-w-3xl p-3 sm:p-8 print:max-w-none print:p-0">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
      <Link href={back} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back</Link>
      <PrintDocumentButton />
    </div>
    <article className="rounded-2xl border bg-card p-4 text-card-foreground shadow-sm sm:p-8 print:rounded-none print:border-0 print:bg-white print:p-5 print:text-black print:shadow-none">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-emerald-600 pb-5">
        <div className="flex items-center gap-3">
          <Image src="/unieco-official-logo.png" alt="" width={48} height={48} className="object-contain" />
          <div><p className="font-bold">UniEco Ghana</p><p className="text-xs text-muted-foreground print:text-neutral-600">Transaction record</p></div>
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
          <p className="mt-1 break-all font-mono text-xs">{doc.number}</p>
        </div>
      </header>

      <dl className="grid grid-cols-2 gap-4 border-b py-5 text-sm sm:grid-cols-3">
        <Detail label={doc.orderId ? 'Seller' : 'Issued by'}>{doc.issuer}</Detail>
        <Detail label="Billed to">{doc.billedTo}</Detail>
        <Detail label="Status">{documentStatus[doc.status] ?? 'Payment not confirmed'}</Detail>
        <Detail label={kind === 'order-invoice' ? 'Order placed' : 'Issued'}>{documentDate(doc.issuedAt)}</Detail>
        {doc.orderNumber && <Detail label="Order reference">{doc.orderNumber}</Detail>}
        {doc.dueAt && <Detail label="Due date">{documentDate(doc.dueAt)}</Detail>}
        {doc.paidAt && <Detail label="Payment recorded">{documentDate(doc.paidAt)}</Detail>}
        {doc.paymentReference && <Detail label="Payment reference">{doc.paymentReference}</Detail>}
        {doc.paymentMethod && <Detail label="Provider"><span className="capitalize">{doc.paymentMethod}</span></Detail>}
        {doc.purpose && <Detail label="Purpose"><span className="capitalize">{doc.purpose.replaceAll('_', ' ')}</span></Detail>}
      </dl>

      {doc.items.length > 0 ? <table className="mt-4 w-full table-fixed border-collapse text-xs sm:text-sm">
        <thead><tr className="border-b text-left">
          <th scope="col" className="w-[38%] py-2 pr-1">Item</th><th scope="col" className="w-[10%] py-2 text-right">Qty</th>
          <th scope="col" className="w-[26%] py-2 text-right">Unit price</th><th scope="col" className="w-[26%] py-2 text-right">Total</th>
        </tr></thead>
        <tbody>{doc.items.map((item, index) => <tr key={index} className="break-inside-avoid border-b">
          <td className="py-2 pr-1 break-words">{item.label}</td><td className="py-2 text-right">{item.quantity}</td>
          <td className="break-words py-2 pl-1 text-right tabular-nums">{money(item.unitPrice)}</td>
          <td className="break-words py-2 pl-1 text-right tabular-nums">{money(item.total)}</td>
        </tr>)}</tbody>
      </table> : doc.orderId && <p className="mt-4 text-sm text-muted-foreground print:text-neutral-600">Itemised amounts are unavailable; the recorded order total is shown below.</p>}

      <dl className="ml-auto mt-5 max-w-xs space-y-2 text-sm tabular-nums">
        {typeof doc.subtotal === 'number' && <Total label="Subtotal">{money(doc.subtotal)}</Total>}
        {!!doc.discount && <Total label="Discount">{money(-doc.discount)}</Total>}
        {!!doc.delivery && <Total label="Delivery">{money(doc.delivery)}</Total>}
        {!!doc.tax && <Total label="Recorded tax">{money(doc.tax)}</Total>}
        <Total label={receipt ? refunded ? 'Original payment' : 'Amount paid' : 'Invoice total'} prominent>{money(doc.total)}</Total>
      </dl>

      <footer className="mt-7 border-t pt-4 text-xs leading-relaxed text-muted-foreground print:text-neutral-600">
        <p>{refunded ? 'This record shows the original transaction and its current refund status, not the remaining balance.' : receipt
          ? 'This receipt records a confirmed payment.' : 'This invoice is not proof of payment. Use the receipt when available.'} This is not a GRA tax invoice.</p>
        <p className="mt-1">Questions? <a className="underline" href={`mailto:${businessEmail.support}`}>{businessEmail.support}</a></p>
      </footer>
    </article>
    {pairedPath && <Link prefetch={false} href={pairedPath} className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-primary underline print:hidden">
      {receipt ? 'View order invoice' : 'View payment receipt'}
    </Link>}
  </main>;
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="min-w-0"><dt className="text-xs text-muted-foreground print:text-neutral-600">{label}</dt><dd className="mt-1 break-words font-medium">{children}</dd></div>;
}

function Total({ label, children, prominent }: { label: string; children: React.ReactNode; prominent?: boolean }) {
  return <div className={`flex justify-between gap-3 ${prominent ? 'border-t pt-2 text-base font-bold' : ''}`}><dt>{label}</dt><dd className="shrink-0">{children}</dd></div>;
}
