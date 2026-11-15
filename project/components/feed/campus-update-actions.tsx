'use client';

import { useState } from 'react';
import { Download, Loader2, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

type Props = { id: string; title: string; excerpt: string; sourceLabel: string; universityName: string };

function getShareUrls(id: string) {
  const origin = typeof window === 'undefined' ? 'https://www.uniecoghana.com' : window.location.origin;
  const pageUrl = new URL(`/updates/${encodeURIComponent(id)}`, origin).toString();
  const imageUrl = new URL(`/api/campus-feed/alert-card?id=${encodeURIComponent(id)}`, origin).toString();
  return { pageUrl, imageUrl };
}

async function loadShareCard(url: string, id: string) {
  const response = await fetch(url, { cache: 'no-store', credentials: 'same-origin' });
  if (!response.ok) throw new Error('The share image is temporarily unavailable.');
  return new File([await response.blob()], `unieco-campus-update-${id.slice(0, 8)}.png`, { type: 'image/png' });
}

export function CampusUpdateActions({ id, title, excerpt, sourceLabel, universityName }: Props) {
  const [busy, setBusy] = useState<'share' | 'save' | null>(null);
  const message = `${title}\n${excerpt}\n${universityName} · Source: ${sourceLabel}`;

  const share = async () => {
    if (busy) return;
    setBusy('share');
    const { pageUrl, imageUrl } = getShareUrls(id);
    try {
      if (typeof navigator.share === 'function') {
        if (typeof File !== 'undefined' && typeof navigator.canShare === 'function') {
          try {
            const file = await loadShareCard(imageUrl, id);
            if (navigator.canShare({ files: [file] })) {
              await navigator.share({ files: [file], title, text: message, url: pageUrl });
              return;
            }
          } catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError') return;
            // Fall through to a link share if a browser cannot share image files.
          }
        }
        await navigator.share({ title, text: message, url: pageUrl });
        return;
      }
      await navigator.clipboard.writeText(`${message}\n${pageUrl}`);
      toast.success('Update link copied. Paste it into the social app you want to use.');
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      try {
        await navigator.clipboard.writeText(pageUrl);
        toast.success('Update link copied.');
      } catch {
        toast.error('Sharing is unavailable in this browser. Use Save image to download the flyer.');
      }
    } finally { setBusy(null); }
  };

  const save = async () => {
    if (busy) return;
    setBusy('save');
    const { imageUrl } = getShareUrls(id);
    try {
      const file = await loadShareCard(imageUrl, id);
      const objectUrl = URL.createObjectURL(file);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = file.name;
      anchor.rel = 'noopener';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
      toast.success('Flyer saved to your device downloads.');
    } catch {
      // A direct same-origin image page is the most compatible fallback for
      // mobile browsers that block Blob downloads; users can save it there.
      window.open(imageUrl, '_blank', 'noopener,noreferrer');
      toast.message('Opened the flyer. Use your browser’s Save or Download option.');
    } finally { setBusy(null); }
  };

  return <div className="flex flex-wrap gap-2" aria-label="Share or save this update">
    <Button type="button" variant="outline" className="min-h-11" onClick={() => void share()} disabled={busy !== null}>
      {busy === 'share' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Share2 className="mr-2 h-4 w-4" />}
      Share
    </Button>
    <Button type="button" variant="outline" className="min-h-11" onClick={() => void save()} disabled={busy !== null}>
      {busy === 'save' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
      Save flyer
    </Button>
  </div>;
}
