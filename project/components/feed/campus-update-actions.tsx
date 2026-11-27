'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Link2, Loader2, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth/auth-context';
import { FlyerPhotoPermission } from './flyer-photo-permission';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

type Props = { id: string; title: string; publisher?:boolean; preload?: boolean; compact?: boolean; shareOnly?: boolean };
const filename = 'unieco-campus-update.jpg';
const maxFileBytes = 3 * 1024 * 1024;

function supportsFileShare(file?: File) {
  try {
    return typeof navigator !== 'undefined' && typeof navigator.share === 'function' && typeof navigator.canShare === 'function'
      && (!file || navigator.canShare({ files: [file] }));
  } catch { return false; }
}

export function CampusUpdateActions({ id, title, publisher=false, preload = false, compact = false, shareOnly = false }: Props) {
  const {user}=useAuth();
  const editor=user?.role==='super_admin';
  const [revision,setRevision]=useState(0);
  const [photoKind,setPhotoKind]=useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [manualUrl, setManualUrl] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [prepared, setPrepared] = useState<{ id: string; file: File } | null>(null);
  const [preview, setPreview] = useState('');
  const requestRef = useRef<AbortController | null>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const flyerUrl = '/api/campus-feed/alert-card?'+(publisher?'publisher=':'id=') + encodeURIComponent(id) + '&format=jpeg'+(revision?'&v='+revision:'');
  const file = prepared?.id === id ? prepared.file : null;

  const prepare = useCallback(() => {
    if (file || requestRef.current) return;
    const task = new AbortController();
    requestRef.current = task;
    setStatus('loading');
    void (async () => {
      try {
        const response = await fetch(flyerUrl, { cache: 'no-store', signal: task.signal });
        if (!response.ok || response.headers.get('content-type')?.split(';')[0] !== 'image/jpeg'
          || Number(response.headers.get('content-length') || 0) > maxFileBytes) throw new Error();
        const blob = await response.blob();
        if (!blob.size || blob.size > maxFileBytes) throw new Error();
        if (!task.signal.aborted) {
          setPhotoKind(response.headers.get('X-UniEco-Photo-Type')||'');
          setPrepared({ id, file: new File([blob], filename, { type: 'image/jpeg' }) });
          setStatus('idle');
        }
      } catch {
        if (!task.signal.aborted) setStatus('error');
      } finally {
        if (requestRef.current === task) requestRef.current = null;
      }
    })();
  }, [file, flyerUrl, id]);

  useEffect(()=>{if(open && !file)prepare();},[open,file,prepare]);

  useEffect(() => () => { requestRef.current?.abort(); requestRef.current = null; }, [id]);
  useEffect(() => {
    const node = anchorRef.current;
    if (!preload || !node || !supportsFileShare() || file) return;
    // Only prefetch the active article or lead near the viewport, never the
    // whole headline list. A ready file lets iOS share inside the initial tap.
    if (typeof IntersectionObserver !== 'function') { prepare(); return; }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) { observer.disconnect(); prepare(); }
    }, { rootMargin: '220px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [file, preload, prepare]);

  useEffect(() => {
    if (!open || !file) { setPreview(''); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => { URL.revokeObjectURL(url); };
  }, [file, open]);

  const share = async () => {
    if (busy) return;
    if (!file || !supportsFileShare(file)) {
      setOpen(true);
      prepare();
      return;
    }
    setBusy(true);
    try {
      // Call before awaiting anything so the tap's user activation is intact.
      // Send a real JPEG, never substitute a link for the main Share action.
      await navigator.share({ files: [file], title });
      setOpen(false);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) setOpen(true);
    } finally { setBusy(false); }
  };

  const copyLink = async () => {
    const url = publisher ? id : new URL('/updates/' + encodeURIComponent(id), window.location.origin).href;
    try { await navigator.clipboard.writeText(url); toast.success('Story link copied.'); }
    catch { setManualUrl(url); }
  };

  return <div ref={anchorRef} className="min-w-0">
    <div className="flex flex-wrap gap-2" aria-label="Share or save this update">
      <Button type="button" variant={compact ? 'ghost' : 'outline'} className={compact ? 'h-11 px-2' : 'min-h-11'} disabled={busy} onClick={() => editor ? setOpen(true) : void share()}>
        <Share2 className="mr-2 h-4 w-4" aria-hidden="true" />Share
      </Button>
      {!shareOnly && <Button asChild variant={compact ? 'ghost' : 'outline'} className={compact ? 'h-11 px-2' : 'min-h-11'}>
        <a href={flyerUrl + '&download=1'} download={filename}><Download className="mr-2 h-4 w-4" aria-hidden="true" />Save flyer</a>
      </Button>}
    </div>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-[29rem]" onCloseAutoFocus={(event) => {
        const trigger = anchorRef.current?.querySelector('button');
        if (trigger) { event.preventDefault(); trigger.focus(); }
      }}>
        <DialogHeader className="pr-10">
          <DialogTitle>Share flyer</DialogTitle>
          <DialogDescription>{file && photoKind==='story'?'Source photo edition.':file?'Headline edition · no cleared source photo was available.':'Preparing the shareable image.'} Share or download the JPEG below.</DialogDescription>
        </DialogHeader>
        {preview && <figure className="flex justify-center overflow-hidden rounded-lg bg-muted p-1.5">
          {/* The preview is the exact local File being shared, not a second remote image. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt={'UniEco Ghana flyer: ' + title} className="max-h-[43dvh] w-auto max-w-full object-contain" />
        </figure>}
        {status === 'loading' && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 motion-safe:animate-spin" />Preparing your flyer…</p>}
        {status === 'error' && <p role="status" className="text-sm text-muted-foreground">The preview didn’t load. Try again or use the download link.</p>}
        <div className="flex flex-wrap gap-2">
          {file && supportsFileShare(file) && <Button type="button" className="h-11" disabled={busy} onClick={() => void share()}><Share2 className="mr-2 h-4 w-4" />Share JPEG</Button>}
          {status === 'error' && <Button type="button" className="h-11" onClick={prepare}>Try again</Button>}
          <Button asChild variant={file && supportsFileShare(file) ? 'outline' : 'default'} className="h-11">
            <a href={preview || flyerUrl + '&download=1'} download={filename}><Download className="mr-2 h-4 w-4" />Download JPEG</a>
          </Button>
          <Button type="button" variant="ghost" className="h-11" onClick={() => void copyLink()}><Link2 className="mr-2 h-4 w-4" />Copy story link</Button>
        </div>
        {manualUrl && <label className="grid min-w-0 gap-1 text-xs">Copy this story link<input readOnly className="w-full min-w-0 rounded border bg-background p-2" value={manualUrl} onFocus={(event) => event.currentTarget.select()} /></label>}
        {editor&&<FlyerPhotoPermission key={id} id={id} onSaved={()=>{requestRef.current?.abort();requestRef.current=null;setPrepared(null);setRevision(v=>v+1);}}/>}
      </DialogContent>
    </Dialog>
  </div>;
}
