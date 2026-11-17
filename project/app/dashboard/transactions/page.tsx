import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, FileText, ChevronRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { withNext } from '@/lib/auth/redirects';
import { Button } from '@/components/ui/button';
import { documentDate, documentMoney, transactionDocumentHref, type TransactionDocumentKind } from '@/lib/transactions/documents';

export const metadata = { title: 'Receipts & invoices | UniEco Ghana', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const sections = [
  { value: 'purchases', label: 'Purchases', kind: 'order-invoice' },
  { value: 'sales', label: 'Sales', kind: 'order-invoice' },
  { value: 'receipts', label: 'Receipts', kind: 'receipt' },
  { value: 'invoices', label: 'Platform invoices', kind: 'invoice' },
] as const satisfies readonly { value: string; label: string; kind: TransactionDocumentKind }[];
const PAGE_SIZE = 25;

type DocumentIndexRow = { id: string; label: string; amount: number | null; currency: string; document_date: string };

export default async function TransactionsPage({ searchParams }: { searchParams: Promise<{ show?: string; page?: string }> }) {
  const input = await searchParams;
  const section = sections.find(({ value }) => input.show === value) ?? sections[0];
  const current = Math.max(1, Math.min(401, /^\d{1,3}$/.test(input.page ?? '') ? Number(input.page) : 1));
  const href = (page: number) => `/dashboard/transactions?show=${section.value}&page=${page}`;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(withNext('/signin', href(current)));
  const { data, error } = await supabase.rpc('get_transaction_document_index', {
    p_section: section.value, p_offset: (current - 1) * PAGE_SIZE,
  });
  const rows = (data ?? []) as DocumentIndexRow[];

  return <main className="mx-auto max-w-4xl space-y-5 px-4 py-5 sm:px-8 sm:py-10">
    <Link href="/dashboard" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary">
      <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Dashboard
    </Link>
    <header>
      <p className="text-xs font-semibold uppercase tracking-wider text-primary">Transaction documents</p>
      <h1 className="mt-1 text-3xl font-bold tracking-tight">Receipts &amp; invoices</h1>
      <p className="mt-2 text-sm text-muted-foreground">Find your order invoices and verified payment receipts. Open a document to print or save it.</p>
    </header>
    <nav aria-label="Document categories" className="flex flex-wrap gap-2">
      {sections.map(item => <Button key={item.value} asChild variant={item === section ? 'default' : 'outline'} className="min-h-11" size="sm">
        <Link prefetch={false} href={`/dashboard/transactions?show=${item.value}`} aria-current={item === section ? 'page' : undefined}>{item.label}</Link>
      </Button>)}
    </nav>
    {error ? <div role="alert" className="rounded-xl border p-5 text-sm">Couldn’t load your documents. <a href={href(current)} className="font-semibold text-primary underline">Try again</a></div>
      : rows.length === 0 ? <div className="rounded-xl border p-6 text-sm text-muted-foreground">No documents in {section.label.toLowerCase()} yet.</div>
        : <ul className="overflow-hidden rounded-xl border bg-card" aria-label={`${section.label} documents`}>
          {rows.slice(0, PAGE_SIZE).map(row => <li key={row.id} className="border-b last:border-b-0">
            <Link prefetch={false} href={transactionDocumentHref(section.kind, row.id)} className="flex min-h-16 items-center gap-3 p-3 hover:bg-muted focus-visible:outline-primary sm:px-5">
              <FileText className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
              <div className="min-w-0 flex-1"><p className="break-words text-sm font-semibold">{row.label}</p><p className="text-xs text-muted-foreground">{documentDate(row.document_date)}</p></div>
              <span className="shrink-0 text-xs font-semibold tabular-nums sm:text-sm">{documentMoney(row.amount, row.currency)}</span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </Link>
          </li>)}
        </ul>}
    {!error && (current > 1 || rows.length > PAGE_SIZE) && <nav aria-label="Document pages" className="flex items-center justify-between gap-3">
      {current > 1 ? <Button variant="outline" asChild><Link prefetch={false} href={href(current - 1)}>Previous</Link></Button> : <span />}
      <span className="text-sm text-muted-foreground">Page {current}</span>
      {rows.length > PAGE_SIZE && current < 401 ? <Button variant="outline" asChild><Link prefetch={false} href={href(current + 1)}>Next</Link></Button> : <span />}
    </nav>}
  </main>;
}
