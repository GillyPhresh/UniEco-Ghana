'use client';

import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function RefreshButton() {
  return (
    <Button onClick={() => window.location.reload()}>
      <RefreshCw className="mr-2 h-4 w-4" /> Try again
    </Button>
  );
}
