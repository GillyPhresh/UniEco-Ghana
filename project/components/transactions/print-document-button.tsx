'use client';

import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function PrintDocumentButton() {
  return <Button type="button" onClick={() => window.print()} className="min-h-11 w-full sm:w-auto">
    <Printer className="mr-2 h-4 w-4" aria-hidden="true" /> Print or save as PDF
  </Button>;
}
