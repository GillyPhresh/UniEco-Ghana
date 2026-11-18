'use client';

import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { Check, Loader2, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  cropFrame, DEFAULT_CROP, MAX_PHOTO_ZOOM, MAX_SOURCE_PIXELS, movePhotoCrop,
  renderProfilePhoto, type PhotoSize, type Point,
} from '@/lib/profile/photo-crop';

const CENTER = { x: 0.5, y: 0.5 };
const midpoint = (a: Point, b: Point) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const directions: Record<string, Point> = {
  ArrowLeft: { x: -0.04, y: 0 }, ArrowRight: { x: 0.04, y: 0 },
  ArrowUp: { x: 0, y: -0.04 }, ArrowDown: { x: 0, y: 0.04 },
};

type Props = {
  file: File;
  onClose: () => void;
  onSave: (image: Blob) => Promise<void>;
  onRestoreFocus: () => void;
};

export function ProfilePhotoCrop({ file, onClose, onSave, onRestoreFocus }: Props) {
  const [url, setUrl] = useState('');
  const [photo, setPhoto] = useState<PhotoSize | null>(null);
  const [crop, setCrop] = useState(DEFAULT_CROP);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const image = useRef<HTMLImageElement>(null);
  const pointers = useRef(new Map<number, Point>());

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  const frame = photo && cropFrame(photo, crop);
  const pointAt = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height };
  };

  const begin = (event: PointerEvent<HTMLDivElement>) => {
    if (!photo || busy.current || event.button !== 0 || pointers.current.size >= 2) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, pointAt(event));
  };

  const move = (event: PointerEvent<HTMLDivElement>) => {
    const from = pointers.current.get(event.pointerId);
    if (!from || !photo || busy.current) return;
    const to = pointAt(event);
    const other = Array.from(pointers.current).find(([id]) => id !== event.pointerId)?.[1];
    pointers.current.set(event.pointerId, to);
    if (other) {
      const scale = distance(to, other) / Math.max(0.02, distance(from, other));
      setCrop((value) => movePhotoCrop(photo, value, midpoint(from, other), midpoint(to, other), Math.max(0.05, scale)));
    } else {
      setCrop((value) => movePhotoCrop(photo, value, from, to));
    }
  };

  const end = (event: PointerEvent<HTMLDivElement>) => { pointers.current.delete(event.pointerId); };
  const zoomTo = (zoom: number) => {
    if (photo) setCrop((value) => movePhotoCrop(photo, value, CENTER, CENTER, zoom / value.zoom));
  };

  const confirm = async () => {
    if (!image.current || !photo || busy.current) return;
    busy.current = true;
    setSaving(true);
    setError(null);
    try {
      await onSave(await renderProfilePhoto(image.current, crop));
      onClose();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Could not save your photo. Try again.');
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !busy.current) onClose(); }}>
      <DialogContent className="max-w-[26rem] rounded-2xl" showCloseButton={false}
        onCloseAutoFocus={(event) => { event.preventDefault(); onRestoreFocus(); }}>
        <DialogHeader>
          <DialogTitle>Adjust profile photo</DialogTitle>
          <DialogDescription>Drag or pinch to fit your photo inside the circle. Only the crop is uploaded.</DialogDescription>
        </DialogHeader>

        <div
          className="relative mx-auto aspect-square w-full max-w-[min(100%,46svh)] cursor-grab touch-none select-none overflow-hidden rounded-xl bg-white outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
          role="group" aria-label="Photo crop preview. Use the arrow keys to move the photo."
          tabIndex={photo ? 0 : -1}
          onPointerDown={begin} onPointerMove={move} onPointerUp={end}
          onPointerCancel={end} onLostPointerCapture={end}
          onKeyDown={(event) => {
            const delta = directions[event.key];
            if (!delta || !photo || busy.current) return;
            event.preventDefault();
            setCrop((value) => movePhotoCrop(photo, value, CENTER, { x: CENTER.x + delta.x, y: CENTER.y + delta.y }));
          }}
        >
          {url && (
            // The local image element is also the canvas source, so both use the browser's photo orientation.
            // eslint-disable-next-line @next/next/no-img-element
            <img ref={image} src={url} alt="" draggable={false}
              className="pointer-events-none absolute max-w-none [image-orientation:from-image]"
              style={photo && frame ? {
                width: `${100 * photo.width / frame.side}%`, height: `${100 * photo.height / frame.side}%`,
                left: `${-100 * frame.left / frame.side}%`, top: `${-100 * frame.top / frame.side}%`,
              } : { visibility: 'hidden' }}
              onLoad={(event) => {
                const { naturalWidth: width, naturalHeight: height } = event.currentTarget;
                if (!width || !height || width * height > MAX_SOURCE_PIXELS) {
                  setError('That photo is too large to edit. Choose a smaller copy.');
                  return;
                }
                setPhoto({ width, height });
              }}
              onError={() => setError('This photo format couldn’t open. Try a JPEG, PNG or WebP copy.')}
            />
          )}
          {photo ? <div aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-full border-2 border-white/90 shadow-[0_0_0_200px_rgba(0,0,0,0.66)]" />
            : <div className="absolute inset-0 grid place-items-center bg-muted text-muted-foreground">
                {error ? 'No preview' : <Loader2 className="size-5 animate-spin" aria-label="Opening photo" />}
              </div>}
        </div>

        <div className="flex items-center gap-3">
          <ZoomOut aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          <input className="h-11 min-w-0 flex-1 accent-primary" type="range" min={1} max={MAX_PHOTO_ZOOM} step={0.01}
            value={crop.zoom} aria-label="Zoom photo" aria-valuetext={`${Math.round(crop.zoom * 100)} percent`}
            disabled={!photo || saving} onChange={(event) => zoomTo(event.currentTarget.valueAsNumber)} />
          <ZoomIn aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          <Button variant="ghost" size="icon" type="button" className="size-11 shrink-0"
            disabled={!photo || saving} onClick={() => setCrop(DEFAULT_CROP)} aria-label="Reset photo crop">
            <RotateCcw className="size-4" />
          </Button>
        </div>

        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" className="min-h-11" disabled={saving} onClick={onClose}>Cancel</Button>
          <Button type="button" className="min-h-11" disabled={!photo || saving} onClick={() => void confirm()}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            {saving ? 'Saving…' : 'Save photo'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
