import Link from 'next/link';
import { FileText, Receipt } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { transactionDocumentHref } from '@/lib/transactions/documents';

export function OrderDocumentLinks({ orderId }: { orderId: string }) {
  return <div className="flex flex-wrap gap-2" aria-label="Order documents">
    <Button variant="outline" size="sm" className="min-h-11" asChild>
      <Link prefetch={false} href={transactionDocumentHref('order-invoice', orderId)}><FileText className="mr-1.5 h-4 w-4" aria-hidden="true" /> Invoice</Link>
    </Button>
    <Button variant="outline" size="sm" className="min-h-11" asChild>
      <Link prefetch={false} href={transactionDocumentHref('order-receipt', orderId)}><Receipt className="mr-1.5 h-4 w-4" aria-hidden="true" /> Receipt</Link>
    </Button>
  </div>;
}
