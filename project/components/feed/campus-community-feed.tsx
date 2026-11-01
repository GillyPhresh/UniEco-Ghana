'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth/auth-context';
import { getPublicAvatarUrl } from '@/lib/storage/avatar-url';
import { Button } from '@/components/ui/button';
import {
  ArrowUpRight, Building2, CircleAlert, Flag, ImagePlus, Loader2,
  MapPin, Pause, Play, Plus, RefreshCw, Send, ShieldCheck, Volume2, VolumeX,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';

type Scope = 'all' | 'university';
type CommunityPost = {
  id: string;
  author_id: string;
  author_name: string;
  author_avatar_url: string | null;
  author_role: string;
  university_name: string | null;
  university_slug: string | null;
  caption: string;
  media_path: string;
  media_type: 'image' | 'video';
  created_at: string;
  media_url: string;
};

const PAGE_SIZE = 8;
const MAX_MEDIA_BYTES = 25 * 1024 * 1024;
const ACCEPTED_MEDIA = new Map([
  ['image/jpeg', 'jpg'], ['image/png', 'png'], ['image/webp', 'webp'],
  ['video/mp4', 'mp4'], ['video/webm', 'webm'],
]);

function publicMediaUrl(path: string) {
  return supabase.storage.from('campus-community').getPublicUrl(path).data.publicUrl;
}

function friendlyRole(role: string) {
  if (role === 'student_vendor') return 'Student vendor';
  if (role === 'external_vendor') return 'Vendor';
  return role === 'student' ? 'Student' : 'Campus member';
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'U';
}

export function CampusCommunityFeed() {
  const { user } = useAuth();
  const [scope, setScope] = useState<Scope>('all');
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState(false);
  const [activePostId, setActivePostId] = useState<string | null>(null);
  const [postOpen, setPostOpen] = useState(false);
  const [reportPost, setReportPost] = useState<CommunityPost | null>(null);
  const [caption, setCaption] = useState('');
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [reportReason, setReportReason] = useState('spam');
  const [reportDetails, setReportDetails] = useState('');
  const [reporting, setReporting] = useState(false);
  const [soundOn, setSoundOn] = useState(false);
  const [playing, setPlaying] = useState(true);
  const viewportRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<{ created_at: string; id: string } | null>(null);
  const requestRef = useRef(0);
  const hasMoreRef = useRef(false);
  const loadingMoreRef = useRef(false);
  const videoRefs = useRef(new Map<string, HTMLVideoElement>());

  const canPost = Boolean(user && ['student', 'student_vendor', 'external_vendor'].includes(user.role));
  const hasUniversity = Boolean(user?.profile?.university_id);

  useEffect(() => {
    if (!mediaFile) { setPreviewUrl(null); return; }
    const objectUrl = URL.createObjectURL(mediaFile);
    setPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [mediaFile]);

  const loadPage = useCallback(async (append = false) => {
    if (append && (loadingMoreRef.current || !hasMoreRef.current)) return;
    const requestId = append ? requestRef.current : ++requestRef.current;
    if (append) { loadingMoreRef.current = true; setLoadingMore(true); setLoadMoreError(false); }
    else { setLoading(true); setLoadError(false); setLoadMoreError(false); cursorRef.current = null; }
    try {
      const cursor = append ? cursorRef.current : null;
      const { data, error } = await supabase.rpc('get_campus_community_feed', {
        p_scope: scope,
        p_before_created_at: cursor?.created_at ?? null,
        p_before_id: cursor?.id ?? null,
        p_limit: PAGE_SIZE,
      });
      if (error) throw error;
      if (requestId !== requestRef.current) return;
      const page = ((data || []) as Omit<CommunityPost, 'media_url'>[]).map((post) => ({
        ...post,
        media_url: publicMediaUrl(post.media_path),
      }));
      setPosts((current) => append ? [...current, ...page] : page);
      cursorRef.current = page.length ? { created_at: page[page.length - 1].created_at, id: page[page.length - 1].id } : (append ? cursorRef.current : null);
      hasMoreRef.current = page.length === PAGE_SIZE;
      setHasMore(page.length === PAGE_SIZE);
      setLoadError(false);
    } catch {
      if (requestId !== requestRef.current) return;
      if (append) setLoadMoreError(true);
      else { setLoadError(true); setPosts([]); }
    } finally {
      if (requestId === requestRef.current) {
        setLoading(false);
        loadingMoreRef.current = false;
        setLoadingMore(false);
      }
    }
  }, [scope]);

  useEffect(() => {
    setPosts([]);
    setHasMore(false);
    hasMoreRef.current = false;
    if (viewportRef.current) viewportRef.current.scrollTop = 0;
    void loadPage(false);
    return () => { requestRef.current += 1; };
  }, [loadPage, user?.id]);

  useEffect(() => {
    const root = viewportRef.current;
    if (!root) return;
    const observer = new IntersectionObserver((entries) => {
      const mostVisible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (mostVisible) setActivePostId((mostVisible.target as HTMLElement).dataset.postId || null);
    }, { root, threshold: [0.35, 0.6, 0.8] });
    root.querySelectorAll<HTMLElement>('[data-post-id]').forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [posts]);

  useEffect(() => {
    videoRefs.current.forEach((video, postId) => {
      if (postId === activePostId) {
        video.muted = !soundOn;
        if (playing) void video.play().catch(() => setPlaying(false));
        else video.pause();
      } else video.pause();
    });
  }, [activePostId, playing, soundOn]);

  const handleScroll = () => {
    const viewport = viewportRef.current;
    if (!viewport || loading || loadingMoreRef.current || !hasMoreRef.current) return;
    if (viewport.scrollTop + viewport.clientHeight >= viewport.scrollHeight - viewport.clientHeight * 1.5) {
      void loadPage(true);
    }
  };

  const resetPostForm = () => { setCaption(''); setMediaFile(null); setUploading(false); };
  const closePostDialog = (open: boolean) => { setPostOpen(open); if (!open && !uploading) resetPostForm(); };

  const submitPost = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user || !canPost) { toast.error('Sign in with a student or vendor account to post.'); return; }
    const trimmedCaption = caption.trim();
    if (!mediaFile || !ACCEPTED_MEDIA.has(mediaFile.type) || mediaFile.size > MAX_MEDIA_BYTES) {
      toast.error('Choose a JPG, PNG, WebP, MP4 or WebM file up to 25 MB.');
      return;
    }
    if (trimmedCaption.length > 500) { toast.error('Keep the caption under 500 characters.'); return; }
    const mediaType = mediaFile.type.startsWith('video/') ? 'video' : 'image';
    const extension = ACCEPTED_MEDIA.get(mediaFile.type)!;
    const path = `${user.id}/${crypto.randomUUID()}.${extension}`;
    setUploading(true);
    let uploaded = false;
    try {
      const { error: uploadError } = await supabase.storage.from('campus-community').upload(path, mediaFile, {
        contentType: mediaFile.type,
        cacheControl: '31536000',
        upsert: false,
      });
      if (uploadError) throw uploadError;
      uploaded = true;
      const { error: postError } = await supabase.rpc('create_campus_community_post', {
        p_caption: trimmedCaption,
        p_media_path: path,
        p_media_type: mediaType,
      });
      if (postError) throw postError;
      uploaded = false;
      toast.success('Your post is live on the campus feed.');
      setPostOpen(false);
      setCaption('');
      setMediaFile(null);
      await loadPage(false);
    } catch (error) {
      if (uploaded) await supabase.storage.from('campus-community').remove([path]).catch(() => undefined);
      const message = error instanceof Error ? error.message : '';
      if (message.includes('hourly posting limit')) toast.error('You have reached the posting limit. Please try again later.');
      else if (!uploaded && message.toLowerCase().includes('storage')) toast.error('Your media could not be uploaded. Check your connection and try again.');
      else toast.error('Your post could not be published. Your account and feed are safe; please retry.');
    } finally {
      setUploading(false);
    }
  };

  const submitReport = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user || !reportPost) return;
    if (reportDetails.trim().length > 500) { toast.error('Report details must be 500 characters or fewer.'); return; }
    setReporting(true);
    try {
      const { error } = await supabase.rpc('report_campus_community_post', {
        p_post_id: reportPost.id,
        p_reason: reportReason,
        p_details: reportDetails.trim(),
      });
      if (error) throw error;
      toast.success('Thanks. The UniEco safety team will review this post.');
      setReportPost(null);
      setReportDetails('');
    } catch {
      toast.error('We could not send that report. Please check your connection and try again.');
    } finally {
      setReporting(false);
    }
  };

  const handleReportClick = (post: CommunityPost) => {
    if (!user) {
      window.location.assign(`/signin?next=${encodeURIComponent('/')}`);
      return;
    }
    setReportPost(post);
    setReportReason('spam');
    setReportDetails('');
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#f7f8fa]">
      <div className="z-20 flex min-h-14 shrink-0 items-center justify-between gap-2 border-b border-border/70 bg-background/95 px-3 backdrop-blur sm:px-6">
        <div className="flex min-w-0 items-center gap-2" role="tablist" aria-label="Campus feed scope">
          <button type="button" role="tab" aria-selected={scope === 'all'} onClick={() => setScope('all')} className={`min-h-10 shrink-0 rounded-full px-4 text-sm font-semibold transition-colors ${scope === 'all' ? 'bg-[#079b68] text-white shadow-sm' : 'text-muted-foreground hover:bg-muted'}`}>Across Ghana</button>
          <button type="button" role="tab" aria-selected={scope === 'university'} disabled={!hasUniversity} onClick={() => setScope('university')} title={!hasUniversity ? 'Add your university to your profile first' : undefined} className={`min-h-10 shrink-0 rounded-full px-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${scope === 'university' ? 'bg-[#079b68] text-white shadow-sm' : 'text-muted-foreground hover:bg-muted'}`}>My university</button>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Link href="/universities" className="hidden min-h-10 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-muted-foreground transition hover:bg-muted hover:text-foreground md:inline-flex"><Building2 className="h-4 w-4" />Universities</Link>
          <Button onClick={() => user ? setPostOpen(true) : window.location.assign('/signin?next=%2F')} className="min-h-10 touch-manipulation rounded-full bg-[#079b68] px-3.5 text-sm hover:bg-[#07855b] sm:px-4">
            <Plus className="mr-1 h-4 w-4" /><span className="hidden sm:inline">Create post</span><span className="sm:hidden">Post</span>
          </Button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,30rem)_minmax(0,1fr)]">
        <aside className="hidden flex-col justify-between border-r border-border/60 p-6 lg:flex">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-emerald-800"><span className="h-2 w-2 rounded-full bg-emerald-500" />Campus community</span>
            <h1 className="mt-5 max-w-xs text-3xl font-bold leading-tight tracking-tight text-slate-900">What’s happening on campus?</h1>
            <p className="mt-3 max-w-xs text-sm leading-6 text-slate-600">Short videos, photos and everyday moments shared by students and vendors across Ghana.</p>
            <Link href="/universities" className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl border bg-white px-4 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-emerald-200 hover:text-emerald-800"><Building2 className="h-4 w-4 text-emerald-700" />Explore universities<ArrowUpRight className="h-4 w-4" /></Link>
          </div>
          <p className="max-w-xs text-xs leading-5 text-muted-foreground"><ShieldCheck className="mr-1 inline h-4 w-4 text-emerald-700" />Community posts are public. Share campus moments respectfully and avoid posting private details.</p>
        </aside>

        <section className="relative min-h-0 bg-black lg:border-x lg:border-border/70" aria-label={scope === 'all' ? 'Posts from campuses across Ghana' : 'Posts from your university'}>
          <div ref={viewportRef} onScroll={handleScroll} className="h-full min-h-0 snap-y snap-mandatory overflow-y-auto overscroll-contain scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-live="polite">
            {loading ? <div className="flex h-full items-center justify-center bg-slate-950 text-sm text-white/75"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading campus moments…</div>
              : loadError ? <div className="flex h-full flex-col items-center justify-center bg-slate-950 px-6 text-center text-white"><CircleAlert className="h-9 w-9 text-amber-300" /><h2 className="mt-4 text-lg font-semibold">The feed didn’t load</h2><p className="mt-2 max-w-sm text-sm leading-6 text-white/65">Your account is safe. Check your connection and try again.</p><Button variant="secondary" onClick={() => void loadPage(false)} className="mt-5 min-h-11 rounded-full"><RefreshCw className="mr-2 h-4 w-4" />Try again</Button></div>
                : posts.length === 0 ? <div className="flex h-full flex-col items-center justify-center bg-slate-950 px-6 text-center text-white"><div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-emerald-400/10 text-emerald-300"><ImagePlus className="h-8 w-8" /></div><h2 className="mt-5 text-xl font-bold">The campus feed starts with you</h2><p className="mt-2 max-w-sm text-sm leading-6 text-white/65">There are no community posts yet. Be the first to share a real campus moment—no demo posts, just your community.</p>{canPost ? <Button onClick={() => setPostOpen(true)} className="mt-5 min-h-11 rounded-full bg-emerald-600 px-5 hover:bg-emerald-500"><Plus className="mr-2 h-4 w-4" />Create the first post</Button> : <Button asChild className="mt-5 min-h-11 rounded-full bg-emerald-600 px-5 hover:bg-emerald-500"><Link href="/signup">Join UniEco Ghana</Link></Button>}<Link href="/universities" className="mt-4 inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-emerald-300 hover:text-white">Browse the university directory<ArrowUpRight className="h-4 w-4" /></Link></div>
                  : <>{posts.map((post) => <PostCard key={post.id} post={post} active={activePostId === post.id} videoRefs={videoRefs} soundOn={soundOn} playing={playing} onToggleSound={() => setSoundOn((value) => !value)} onTogglePlay={() => setPlaying((value) => !value)} onReport={() => handleReportClick(post)} />)}
                    {loadingMore && <div className="flex min-h-24 items-center justify-center bg-slate-950 text-sm text-white/65"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Finding more campus moments…</div>}
                    {loadMoreError && <div className="flex min-h-28 snap-start flex-col items-center justify-center bg-slate-950 px-6 text-center text-sm text-white/75" role="status"><p>Couldn’t load the next posts. Your feed is still here.</p><button type="button" onClick={() => void loadPage(true)} className="mt-2 min-h-10 px-3 font-semibold text-emerald-300 hover:text-white">Try loading again</button></div>}
                    {!hasMore && posts.length > 0 && <div className="flex min-h-28 snap-start flex-col items-center justify-center bg-slate-950 px-6 text-center text-sm text-white/65"><p>You’re all caught up.</p><button type="button" onClick={() => void loadPage(false)} className="mt-2 min-h-10 px-3 font-semibold text-emerald-300 hover:text-white">Refresh the feed</button></div>}
                  </>}
          </div>
        </section>

        <aside className="hidden flex-col gap-4 p-6 xl:flex">
          <div className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><MapPin className="h-5 w-5" /></div><h2 className="mt-4 font-bold text-slate-900">Your campus, your people</h2><p className="mt-2 text-sm leading-6 text-slate-600">Choose <span className="font-semibold">My university</span> to narrow the feed to your school. Your campus is taken from your UniEco profile.</p>{!hasUniversity && <Link href="/profile" className="mt-3 inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-emerald-800">Add your university<ArrowUpRight className="h-4 w-4" /></Link>}</div>
          <div className="rounded-2xl border bg-white p-5 shadow-sm"><div className="flex items-center gap-2 font-bold text-slate-900"><ShieldCheck className="h-5 w-5 text-emerald-700" />A safer campus feed</div><p className="mt-2 text-sm leading-6 text-slate-600">Every post is tied to an active UniEco account. Use the report control if something feels unsafe or inappropriate.</p></div>
          <Link href="/updates" className="flex min-h-12 items-center justify-between rounded-xl border bg-white px-4 text-sm font-semibold text-slate-800 transition hover:border-emerald-200 hover:text-emerald-800"><span>Official campus updates</span><ArrowUpRight className="h-4 w-4" /></Link>
        </aside>
      </div>

      <Dialog open={postOpen} onOpenChange={closePostDialog}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader><DialogTitle>Share a campus moment</DialogTitle><DialogDescription>Post a photo or short video for the UniEco Ghana community. Your post is public and linked to your account and campus.</DialogDescription></DialogHeader>
          <form onSubmit={submitPost} className="space-y-4">
            <label className="block text-sm font-semibold" htmlFor="community-media">Photo or video <span className="font-normal text-muted-foreground">(up to 25 MB)</span></label>
            <input id="community-media" type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" disabled={uploading} onChange={(event) => setMediaFile(event.target.files?.[0] || null)} className="block min-h-12 w-full cursor-pointer rounded-xl border border-input bg-background text-sm file:mr-3 file:h-12 file:border-0 file:bg-emerald-50 file:px-4 file:font-semibold file:text-emerald-800" />
            {previewUrl && mediaFile && (mediaFile.type.startsWith('video/') ? <video src={previewUrl} controls playsInline preload="metadata" className="max-h-72 w-full rounded-xl bg-black object-contain" /> : <img src={previewUrl} alt="Preview of your campus post" className="max-h-72 w-full rounded-xl bg-muted object-contain" />)}
            <label className="block text-sm font-semibold" htmlFor="community-caption">Caption <span className="font-normal text-muted-foreground">(optional, up to 500 characters)</span></label>
            <Textarea id="community-caption" value={caption} onChange={(event) => setCaption(event.target.value.slice(0, 500))} maxLength={500} rows={3} placeholder="What’s happening on campus?" disabled={uploading} />
            <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground"><span>Keep private information out of your post.</span><span>{caption.length}/500</span></div>
            <DialogFooter><Button type="submit" disabled={uploading || !mediaFile} className="min-h-11 w-full rounded-xl bg-[#079b68] hover:bg-[#07855b] sm:w-auto">{uploading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Publishing…</> : <><Send className="mr-2 h-4 w-4" />Publish post</>}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(reportPost)} onOpenChange={(open) => { if (!open && !reporting) setReportPost(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Report this post</DialogTitle><DialogDescription>Reports go to UniEco Ghana moderation. Please tell us what needs review.</DialogDescription></DialogHeader>
          <form onSubmit={submitReport} className="space-y-4">
            <label htmlFor="community-report-reason" className="block text-sm font-semibold">Reason</label>
            <select id="community-report-reason" value={reportReason} onChange={(event) => setReportReason(event.target.value)} className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm">
              <option value="spam">Spam or misleading promotion</option><option value="abuse">Harassment or abuse</option><option value="unsafe">Unsafe or harmful content</option><option value="misleading">Misleading information</option><option value="other">Something else</option>
            </select>
            <label htmlFor="community-report-details" className="block text-sm font-semibold">Details <span className="font-normal text-muted-foreground">(optional)</span></label>
            <Textarea id="community-report-details" value={reportDetails} onChange={(event) => setReportDetails(event.target.value.slice(0, 500))} maxLength={500} rows={3} placeholder="Add context to help our team review this." />
            <DialogFooter><Button type="submit" disabled={reporting} className="min-h-11 rounded-xl">{reporting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Sending…</> : <><Flag className="mr-2 h-4 w-4" />Send report</>}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PostCard({ post, active, videoRefs, soundOn, playing, onToggleSound, onTogglePlay, onReport }: {
  post: CommunityPost;
  active: boolean;
  videoRefs: React.MutableRefObject<Map<string, HTMLVideoElement>>;
  soundOn: boolean;
  playing: boolean;
  onToggleSound: () => void;
  onTogglePlay: () => void;
  onReport: () => void;
}) {
  const avatar = getPublicAvatarUrl(post.author_avatar_url);
  return (
    <article data-post-id={post.id} className="relative h-full min-h-full snap-start snap-always overflow-hidden bg-slate-950 text-white">
      {post.media_type === 'video' ? <video ref={(element) => { if (element) videoRefs.current.set(post.id, element); else videoRefs.current.delete(post.id); }} src={post.media_url} playsInline muted={!soundOn} loop preload={active ? 'metadata' : 'none'} onClick={onTogglePlay} onPlay={() => {}} className="absolute inset-0 h-full w-full cursor-pointer object-cover" aria-label={`Video shared by ${post.author_name}`} />
        : <div className="absolute inset-0 flex items-center justify-center bg-slate-950"><img src={post.media_url} alt="" aria-hidden="true" loading={active ? 'eager' : 'lazy'} className="absolute inset-0 h-full w-full scale-110 object-cover opacity-45 blur-2xl" /><img src={post.media_url} alt={`Campus photo shared by ${post.author_name}`} loading={active ? 'eager' : 'lazy'} className="relative z-[1] max-h-full max-w-full object-contain" /></div>}
      <div className="pointer-events-none absolute inset-0 z-[2] bg-gradient-to-b from-black/35 via-transparent to-black/85" />
      <div className="absolute right-3 top-3 z-[3] flex flex-col gap-2 sm:right-4 sm:top-4">
        {post.media_type === 'video' && <>
          <button type="button" onClick={onTogglePlay} aria-label={playing && active ? 'Pause video' : 'Play video'} className="flex h-11 w-11 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur transition hover:bg-black/65">{playing && active ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}</button>
          <button type="button" onClick={onToggleSound} aria-label={soundOn ? 'Mute video' : 'Turn video sound on'} className="flex h-11 w-11 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur transition hover:bg-black/65">{soundOn ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}</button>
        </>}
        <button type="button" onClick={onReport} aria-label="Report post" className="flex h-11 w-11 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur transition hover:bg-black/65"><Flag className="h-5 w-5" /></button>
      </div>
      <div className="absolute inset-x-0 bottom-0 z-[3] px-4 pb-5 pt-16 sm:px-6 sm:pb-7">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-white/80 bg-emerald-700 text-sm font-bold text-white shadow">{avatar ? <img src={avatar} alt="" loading="lazy" className="h-full w-full object-cover" /> : initials(post.author_name)}</div>
          <div className="min-w-0"><p className="truncate text-sm font-bold drop-shadow">{post.author_name}</p><p className="mt-0.5 flex items-center gap-1 truncate text-xs text-white/80"><span>{friendlyRole(post.author_role)}</span>{post.university_name && <><span aria-hidden="true">·</span><MapPin className="h-3 w-3 shrink-0" /><span className="truncate">{post.university_name}</span></>}</p></div>
          {post.university_slug && <Link href={`/university/${post.university_slug}`} aria-label={`View ${post.university_name}`} className="ml-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/35 bg-black/25 text-white backdrop-blur hover:bg-black/50"><ArrowUpRight className="h-4 w-4" /></Link>}
        </div>
        {post.caption && <p className="mt-3 max-w-2xl whitespace-pre-wrap break-words text-sm leading-6 text-white drop-shadow sm:text-base">{post.caption}</p>}
        <p className="mt-2 text-[11px] text-white/65">{new Intl.DateTimeFormat('en-GH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(post.created_at))}</p>
      </div>
    </article>
  );
}
