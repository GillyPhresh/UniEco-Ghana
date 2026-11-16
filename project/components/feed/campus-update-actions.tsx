'use client';

import { useEffect, useState } from 'react';
import { Download, Image as PhotoIcon, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

type Props = { id: string; title: string; excerpt: string; sourceLabel: string; universityName: string; imageShare?: boolean };

export function CampusUpdateActions({ id, title, excerpt, sourceLabel, universityName, imageShare = false }: Props) {
  const [busy, setBusy] = useState(false);
  const [manualUrl, setManualUrl] = useState('');
  const [fileShare, setFileShare] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const flyerUrl = '/api/campus-feed/alert-card?id=' + encodeURIComponent(id);
  useEffect(() => {
    if (imageShare && typeof navigator.share === 'function' && typeof navigator.canShare === 'function') setFileShare(true);
  }, [imageShare]);
  const share = async () => {
    if (busy) return;
    const pageUrl = new URL('/updates/' + encodeURIComponent(id), window.location.origin).href;
    const message = [title, excerpt, 'From ' + sourceLabel + ' · ' + universityName].filter(Boolean).join('\n');
    setBusy(true);
    try {
      // Start native sharing inside the tap. Waiting for a PNG fetch first can
      // lose iOS/browser user activation and silently fail to open the sheet.
      if (typeof navigator.share === 'function') {
        await navigator.share({ title, text: message, url: pageUrl });
      } else {
        await navigator.clipboard.writeText(pageUrl);
        toast.success('Update link copied.');
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      try { await navigator.clipboard.writeText(pageUrl); toast.success('Update link copied.'); }
      catch { setManualUrl(pageUrl); }
    } finally { setBusy(false); }
  };

  const shareImage = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (file) {
        if (navigator.canShare({ files: [file] })) await navigator.share({ files: [file], title });
        else toast.message('Use Save flyer, then attach the image in your social app.');
        return;
      }
      const response = await fetch(flyerUrl, { cache: 'no-store' });
      if (!response.ok || response.headers.get('content-type') !== 'image/png') throw new Error();
      const blob = await response.blob();
      if (!blob.size || blob.size > 3 * 1024 * 1024) throw new Error();
      const prepared = new File([blob], 'unieco-campus-update.png', { type: 'image/png' });
      if (!navigator.canShare({ files: [prepared] })) {
        setFileShare(false);
        toast.message('Use Save flyer, then attach the image in your social app.');
        return;
      }
      setFile(prepared);
      toast.success('Flyer ready. Tap Share image to open your share sheet.');
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) toast.error('Image sharing is unavailable. Use Save flyer.');
    } finally { setBusy(false); }
  };
  return <div className="min-w-0">
    <div className="flex flex-wrap gap-2" aria-label="Share or save this update">
      <Button type="button" variant="outline" className="min-h-11" disabled={busy} onClick={() => void share()}><Share2 className="mr-2 h-4 w-4" />Share</Button>
      <Button asChild variant="outline" className="min-h-11"><a href={flyerUrl + '&download=1'} download="unieco-campus-update.png"><Download className="mr-2 h-4 w-4" />Save flyer</a></Button>
      {fileShare && <Button type="button" variant="ghost" className="min-h-11" disabled={busy} onClick={() => void shareImage()}><PhotoIcon className="mr-2 h-4 w-4" />{file ? 'Share image' : 'Prepare image to share'}</Button>}
    </div>
    {manualUrl && <label className="mt-2 grid min-w-0 gap-1 text-xs">Copy this update link<input readOnly className="w-full min-w-0 rounded border bg-background p-2" value={manualUrl} onFocus={(event) => event.currentTarget.select()} /></label>}
  </div>;
}
