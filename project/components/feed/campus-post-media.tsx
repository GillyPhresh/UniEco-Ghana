'use client';

import { useEffect, useRef, useState, type PointerEvent } from 'react';
import Link from 'next/link';
import { ArrowDownToLine, FileText, Heart, ImageOff, Loader2, Pause, Play, Volume2, VolumeX } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/client';
import { feedAspectRatio, isFeedDoubleTap, type FeedTap } from '@/lib/community/feed-experience';
import { MAX_ATTACHMENT_BYTES, VIDEO_FILE_EXTENSION, VIDEO_PREPARATION_TIMEOUT_MS, readableSize, safeFileName, withRequestTimeout } from '@/lib/community/media-client';
import { useFeedMediaViewport } from '@/hooks/use-feed-media-viewport';

type FeedMedia = { id: string; author_name: string; media_type: 'image' | 'video' | 'file' | 'text'; media_url: string | null };
type CommunityFileInfo = { path: string; name: string; size: number };

async function getCommunityFileInfo(postId: string): Promise<CommunityFileInfo> {
  const read = () => supabase.rpc('get_campus_community_post_file_info', { p_post_id: postId });
  let response = await read();
  if (response.status === 401) {
    const { error: refreshError } = await supabase.auth.refreshSession();
    if (!refreshError) response = await read();
  }
  if (response.error) throw response.error;
  const rows = Array.isArray(response.data) ? response.data : response.data ? [response.data] : [];
  const result = rows[0] as { file_path?: string; file_name?: string; file_size?: number } | undefined;
  if (!result?.file_path || !result.file_name) throw new Error('Attachment details are unavailable.');
  return { path: result.file_path, name: safeFileName(result.file_name), size: Number(result.file_size) || 0 };
}

const mediaFrame = 'relative isolate flex max-h-[min(72dvh,43rem)] min-h-0 w-full items-center justify-center overflow-hidden bg-neutral-950';
const videoButton = 'flex h-11 w-11 touch-manipulation items-center justify-center rounded-full bg-black/65 text-white ring-1 ring-white/25 transition hover:bg-black/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white';
const retryDelays = [700, 1600, 3200];

export function CampusPostMedia({ post, viewerId, priority = false, onLike }: {
  post: FeedMedia;
  viewerId: string | null;
  priority?: boolean;
  onLike: () => boolean;
}) {
  const [file, setFile] = useState<CommunityFileInfo | null>(null);
  const [fileError, setFileError] = useState(false);
  const [fileAttempt, setFileAttempt] = useState(0);
  const completedLookup = useRef(-1);
  const [signedVideo, setSignedVideo] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const privateVideo = Boolean(file && file.size > 0 && file.size <= MAX_ATTACHMENT_BYTES && VIDEO_FILE_EXTENSION.test(file.name));
  const { ref, visibility, requestPlayback } = useFeedMediaViewport(post.media_type === 'video' || (post.media_type === 'file' && Boolean(viewerId)), post.media_type === 'video' || privateVideo);

  useEffect(() => {
    if (!viewerId || post.media_type !== 'file' || !visibility.near || completedLookup.current === fileAttempt) return;
    let cancelled = false;
    // Look up private metadata through the existing authorization RPC only.
    void getCommunityFileInfo(post.id).then(async (info) => {
      if (cancelled) return;
      setFile(info);
      if (info.size > 0 && info.size <= MAX_ATTACHMENT_BYTES && VIDEO_FILE_EXTENSION.test(info.name)) {
        const { data, error } = await supabase.storage.from('campus-community-files').createSignedUrl(info.path, 10 * 60);
        if (cancelled) return;
        if (error || !data?.signedUrl) throw error || new Error('Video link unavailable');
        setSignedVideo(data.signedUrl);
      }
      completedLookup.current = fileAttempt;
    }).catch(() => {
      if (!cancelled) {
        completedLookup.current = fileAttempt;
        setFileError(true);
      }
    });
    return () => { cancelled = true; };
  }, [viewerId, post.id, post.media_type, visibility.near, fileAttempt]);

  const refreshFile = () => {
    setFileError(false);
    setSignedVideo(null);
    setFileAttempt((current) => current + 1);
  };

  const downloadAttachment = async () => {
    if (!viewerId || downloading) return;
    setDownloading(true);
    try {
      const attachment = file ?? await getCommunityFileInfo(post.id);
      const { data, error } = await supabase.storage.from('campus-community-files').createSignedUrl(attachment.path, 60, { download: attachment.name });
      if (error || !data?.signedUrl) throw error || new Error('Attachment link unavailable');
      window.location.assign(data.signedUrl);
    } catch {
      toast.error('Couldn’t open the attachment. Try again.');
    } finally {
      setDownloading(false);
    }
  };

  if (post.media_type === 'text') return null;
  if (post.media_type === 'image') return <FeedPhoto post={post} priority={priority} onLike={onLike} />;
  if (post.media_type === 'video' || privateVideo) {
    return (
      <div ref={ref}>
        <FeedVideo post={post} source={privateVideo ? signedVideo : post.media_url} active={visibility.active} preload={visibility.preload}
          resolving={privateVideo && !signedVideo && !fileError} requestPlayback={requestPlayback} refreshSource={privateVideo ? refreshFile : undefined} />
      </div>
    );
  }
  return (
    <div ref={ref} className="mx-3 flex min-w-0 items-center gap-3 rounded-xl border border-border bg-muted/45 p-3 sm:mx-4">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><FileText className="h-5 w-5" aria-hidden="true" /></div>
      <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{file?.name || 'Attachment'}</p><p className="text-xs text-muted-foreground">{file ? readableSize(file.size) : fileError ? 'Unavailable' : 'Shared file'}</p></div>
      {viewerId ? <button type="button" onClick={() => void downloadAttachment()} disabled={downloading} aria-label="Download attachment" className="grid h-11 w-11 shrink-0 place-items-center rounded-full transition hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring">
        {downloading ? <Loader2 className="h-5 w-5 motion-safe:animate-spin" /> : <ArrowDownToLine className="h-5 w-5" />}
      </button> : <Link href={`/signin?next=${encodeURIComponent(`/?post=${post.id}`)}`} className="inline-flex min-h-11 shrink-0 items-center rounded-full px-2 text-xs font-semibold text-primary">Sign in</Link>}
    </div>
  );
}

function FeedPhoto({ post, priority, onLike }: { post: FeedMedia; priority: boolean; onLike: () => boolean }) {
  const [failed, setFailed] = useState(false);
  const [ratio, setRatio] = useState(1);
  const [burst, setBurst] = useState(0);
  const start = useRef<(FeedTap & { id: number }) | null>(null);
  const lastTap = useRef<FeedTap | null>(null);
  const lastBurst = useRef(-1_000);

  const like = () => {
    const now = performance.now();
    if (now - lastBurst.current < 350) return;
    lastBurst.current = now;
    if (onLike()) setBurst((current) => current + 1);
  };

  const pointerDown = (event: PointerEvent) => {
    if (event.pointerType !== 'touch' || !event.isPrimary) return;
    start.current = { x: event.clientX, y: event.clientY, at: performance.now(), id: event.pointerId };
  };

  const pointerUp = (event: PointerEvent) => {
    const origin = start.current;
    if (!origin || event.pointerType !== 'touch' || origin.id !== event.pointerId) return;
    start.current = null;
    const tap = { x: event.clientX, y: event.clientY, at: performance.now() };
    if (tap.at - origin.at > 300 || Math.hypot(tap.x - origin.x, tap.y - origin.y) > 12) { lastTap.current = null; return; }
    if (lastTap.current && isFeedDoubleTap(lastTap.current, tap)) { lastTap.current = null; like(); }
    else lastTap.current = tap;
  };

  if (failed || !post.media_url) return <div className="grid aspect-[4/3] place-items-center bg-muted text-sm text-muted-foreground"><span className="flex items-center gap-2"><ImageOff className="h-5 w-5" />Photo unavailable</span></div>;
  return (
    <div className={`${mediaFrame} touch-manipulation`} style={{ aspectRatio: ratio }} onDoubleClick={like} onPointerDown={pointerDown} onPointerUp={pointerUp}
      onPointerCancel={() => { start.current = null; lastTap.current = null; }}>
      <img src={post.media_url} alt={`Campus photo shared by ${post.author_name}`} loading={priority ? 'eager' : 'lazy'} fetchPriority={priority ? 'high' : 'auto'} decoding="async" draggable={false}
        onLoad={({ currentTarget }) => setRatio(feedAspectRatio(currentTarget.naturalWidth, currentTarget.naturalHeight))} onError={() => setFailed(true)} className="h-full w-full select-none object-contain" />
      {burst > 0 && <span key={burst} aria-hidden="true" className="campus-heart-burst pointer-events-none absolute drop-shadow-lg" onAnimationEnd={() => setBurst(0)}><Heart className="h-[4.5rem] w-[4.5rem] fill-white text-white" /></span>}
    </div>
  );
}

type NetworkInformation = EventTarget & { saveData?: boolean; effectiveType?: string };
function useConserveMediaData() {
  const [conserve, setConserve] = useState(false);
  useEffect(() => {
    const connection = (navigator as Navigator & { connection?: NetworkInformation }).connection;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setConserve(Boolean(motion.matches || connection?.saveData || ['slow-2g', '2g'].includes(connection?.effectiveType ?? '')));
    update();
    connection?.addEventListener('change', update);
    motion.addEventListener?.('change', update);
    return () => { connection?.removeEventListener('change', update); motion.removeEventListener?.('change', update); };
  }, []);
  return conserve;
}

function FeedVideo({ post, source, active, preload, resolving, requestPlayback, refreshSource }: {
  post: FeedMedia;
  source: string | null;
  active: boolean;
  preload: boolean;
  resolving: boolean;
  requestPlayback: () => void;
  refreshSource?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [ratio, setRatio] = useState(1);
  const [muted, setMuted] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [showBuffering, setShowBuffering] = useState(false);
  const [failed, setFailed] = useState(false);
  const [manual, setManual] = useState(false);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [prepared, setPrepared] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const attemptedPreparation = useRef(false);
  const manualPause = useRef(false);
  const retryCount = useRef(0);
  const retryTimer = useRef<number | undefined>(undefined);
  const live = useRef(true);
  const conserve = useConserveMediaData();
  const policy = useRef({ active, conserve, manual });
  policy.current = { active, conserve, manual };
  const mediaUrl = prepared || source;
  const shouldAttach = loadedOnce || manual || (!conserve && (active || preload));
  const preloadMode = active && (!conserve || manual) ? 'auto' : preload && !conserve ? 'metadata' : 'none';

  useEffect(() => {
    live.current = true;
    return () => { live.current = false; window.clearTimeout(retryTimer.current); };
  }, []);

  useEffect(() => () => { if (prepared) URL.revokeObjectURL(prepared); }, [prepared]);
  useEffect(() => {
    if (!buffering || !active) { setShowBuffering(false); return; }
    const timer = window.setTimeout(() => setShowBuffering(true), 380);
    return () => window.clearTimeout(timer);
  }, [buffering, active]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (!active) { video.pause(); setBuffering(false); if (!video.muted) { video.muted = true; setMuted(true); } return; }
    if (!mediaUrl || failed || preparing || manualPause.current || (conserve && !manual)) return;
    video.muted = muted;
    if (video.error && video.getAttribute('src')) video.load();
    if (video.paused) void video.play().catch(() => { if (!video.error) setBuffering(false); });
  }, [active, conserve, failed, manual, mediaUrl, muted, preparing]);

  const prepareLegacy = () => {
    if (attemptedPreparation.current) return;
    attemptedPreparation.current = true;
    setPreparing(true);
    setBuffering(true);
    void withRequestTimeout(VIDEO_PREPARATION_TIMEOUT_MS, async (signal) => {
      const response = await fetch(`/api/community/video/prepare?postId=${encodeURIComponent(post.id)}`, { credentials: 'same-origin', cache: 'force-cache', signal });
      if (!response.ok) throw new Error('Video preparation failed');
      return response.blob();
    }).then((mp4) => {
      if (!mp4.size || mp4.type !== 'video/mp4' || mp4.size > MAX_ATTACHMENT_BYTES) throw new Error('Invalid video');
      if (live.current) { setPrepared(URL.createObjectURL(mp4)); setFailed(false); }
    }).catch(() => { if (live.current) { setFailed(true); setBuffering(false); } })
      .finally(() => { if (live.current) setPreparing(false); });
  };

  const handleVideoError = (video: HTMLVideoElement) => {
    const code = video.error?.code;
    setPlaying(false);
    if (!code || code === 1) { setBuffering(false); return; }
    if (!active && !manual) { setBuffering(false); return; }
    // Do not transcode a network error. Retry the original range-capable URL.
    if (code === 2 && !prepared && (active || manual) && retryCount.current < retryDelays.length) {
      const delay = retryDelays[retryCount.current++];
      window.clearTimeout(retryTimer.current);
      setBuffering(true);
      retryTimer.current = window.setTimeout(() => {
        if (videoRef.current !== video || !video.isConnected || !policy.current.active || manualPause.current) { setBuffering(false); return; }
        video.load();
        if (!policy.current.conserve || policy.current.manual) void video.play().catch(() => { if (!video.error) setBuffering(false); });
      }, delay);
      return;
    }
    if ((code === 3 || code === 4) && !prepared && !attemptedPreparation.current && (active || manual)) {
      prepareLegacy();
      return;
    }
    setBuffering(false);
    setFailed(true);
  };

  const startVideo = (video: HTMLVideoElement) => {
    requestPlayback();
    manualPause.current = false;
    setManual(true);
    if (mediaUrl && !video.getAttribute('src')) video.src = mediaUrl;
    video.muted = muted;
    void video.play().catch(() => { if (!video.error) setBuffering(false); });
  };

  const togglePlayback = () => {
    const video = videoRef.current;
    if (!video || !mediaUrl) return;
    if (!video.paused) { manualPause.current = true; video.pause(); setBuffering(false); }
    else startVideo(video);
  };

  const retry = () => {
    const video = videoRef.current;
    if (!video) return;
    window.clearTimeout(retryTimer.current);
    retryCount.current = 0;
    attemptedPreparation.current = false;
    setFailed(false);
    if (refreshSource && !prepared) { setManual(true); manualPause.current = false; requestPlayback(); refreshSource(); return; }
    if (prepared) { setManual(true); manualPause.current = false; requestPlayback(); setPrepared(null); return; }
    if (mediaUrl) { video.load(); startVideo(video); }
  };

  return (
    <div className={`${mediaFrame} group/video`} style={{ aspectRatio: ratio }}>
      <video ref={videoRef} src={shouldAttach ? mediaUrl ?? undefined : undefined} playsInline muted={muted} loop disablePictureInPicture preload={preloadMode}
        aria-label={`Video shared by ${post.author_name}`} className="campus-feed-video h-full w-full object-contain"
        onLoadedMetadata={({ currentTarget }) => { setRatio(feedAspectRatio(currentTarget.videoWidth, currentTarget.videoHeight)); setLoadedOnce(true); }}
        onLoadedData={() => { setFailed(false); setBuffering(false); }}
        onPlay={() => setPlaying(true)} onPlaying={() => { retryCount.current = 0; setPlaying(true); setBuffering(false); }}
        onPause={() => setPlaying(false)} onWaiting={() => setBuffering(true)} onError={({ currentTarget }) => handleVideoError(currentTarget)} />
      {mediaUrl && !failed && !preparing && <>
        <button type="button" aria-label={playing ? 'Pause video' : 'Play video'} onClick={togglePlayback}
          className={playing ? 'absolute bottom-3 left-3 rounded-full opacity-100 transition sm:opacity-0 sm:focus-within:opacity-100 sm:group-hover/video:opacity-100' : 'absolute inset-0 grid place-items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white'}>
          <span className={`${videoButton} ${playing ? '' : 'h-14 w-14'}`}>{playing ? <Pause className="h-5 w-5" /> : <Play className="ml-0.5 h-6 w-6 fill-current" />}</span>
        </button>
        <button type="button" onClick={() => { const video = videoRef.current; if (video) video.muted = !muted; setMuted(!muted); }}
          aria-label={muted ? 'Unmute video' : 'Mute video'} className={`absolute bottom-3 right-3 ${videoButton}`}>
          {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
        </button>
      </>}
      {(showBuffering || preparing || resolving) && !failed && <div role="status" className="pointer-events-none absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-black/70 px-3 py-1.5 text-xs text-white"><Loader2 aria-hidden="true" className="h-3.5 w-3.5 motion-safe:animate-spin" />Loading video</div>}
      {(failed || (!mediaUrl && !resolving)) && !preparing && <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-4 text-center text-sm text-white">
        <p>Video unavailable</p>
        {(mediaUrl || refreshSource) && <button type="button" onClick={retry} className="min-h-11 rounded-full bg-white px-4 font-semibold text-neutral-900 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950">Try again</button>}
      </div>}
    </div>
  );
}
