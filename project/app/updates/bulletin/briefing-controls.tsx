'use client';

import { Copy, Printer, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

export function BriefingControls() {
  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: 'UniEco Ghana campus briefing', url: window.location.href });
      else {
        await navigator.clipboard.writeText(window.location.href);
        toast.success('Briefing link copied.');
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      toast.error('Could not open sharing. You can copy the address from your browser.');
    }
  };
  return <>
    <Button variant="outline" type="button" onClick={() => void share()}><Share2 className="mr-2 h-4 w-4" />Share briefing</Button>
    <Button variant="outline" type="button" onClick={() => window.print()}><Printer className="mr-2 h-4 w-4" />Print</Button>
    <Button variant="ghost" type="button" onClick={() => void navigator.clipboard?.writeText(window.location.href).then(() => toast.success('Briefing link copied.'), () => toast.error('Copy the address from your browser.'))}><Copy className="mr-2 h-4 w-4" />Copy link</Button>
  </>;
}
