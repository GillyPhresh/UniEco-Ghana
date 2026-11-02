'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth/auth-context';
import { getPublicAvatarUrl } from '@/lib/storage/avatar-url';
import { Button } from '@/components/ui/button';
import {
  ArrowUpRight, Bookmark, Building2, CircleAlert, Flag, ImagePlus, Loader2,
  MapPin, Plus, RefreshCw, Send, ShieldCheck,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { CommunityPostActions, emptyCommunitySocialState, type CommunitySocialState } from '@/components/feed/community-post-actions';

type Scope = 'all' | 'university';
export type CommunityPost = {
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

export function publicMediaUrl(path: string) {
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
  const [socialByPost, setSocialByPost] = useState<Record<string, CommunitySocialState>>({});
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
  const viewportRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<{ created_at: string; id: string } | null>(null);
  const requestRef = useRef(0);
  const hasMoreRef = useRef(false);
  const loadingMoreRef = useRef(false);
  const pendingPostFocusRef = useRef<string | null>(null);

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
      let requestedPostId: string | null = null;
      if (!append && typeof window !== 'undefined') {
        const candidate = new URLSearchParams(window.location.search).get('post');
        if (candidate && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate)) {
          requestedPostId = candidate;
          pendingPostFocusRef.current = candidate;
        }
      }
      const { data, error } = await supabase.rpc('get_campus_community_feed', {
        p_scope: scope,
        p_before_created_at: cursor?.created_at ?? null,
        p_before_id: cursor?.id ?? null,
        p_limit: PAGE_SIZE,
      });
      if (error) throw error;
      if (requestId !== requestRef.current) return;
      let rows = (data || []) as Omit<CommunityPost, 'media_url'>[];
      if (!append && requestedPostId && !rows.some((post) => post.id === requestedPostId)) {
        const { data: target } = await supabase.rpc('get_campus_community_post', { p_post_id: requestedPostId });
        const targetPost = (target || [])[0] as Omit<CommunityPost, 'media_url'> | undefined;
        if (targetPost) rows = [targetPost, ...rows];
      }
      const page = rows.map((post) => ({
        ...post,
        media_url: publicMediaUrl(post.media_path),
      }));
      setPosts((current) => append ? [...current, ...page] : page);
      if (!append) setSocialByPost({});
      if (page.length) {
        const { data: socialRows } = await supabase.rpc('get_campus_community_post_social_state', { p_post_ids: page.slice(0, 12).map((post) => post.id) });
        if (requestId === requestRef.current && socialRows) {
          setSocialByPost((current) => ({ ...current, ...Object.fromEntries((socialRows as (CommunitySocialState & { post_id: string })[]).map((item) => [item.post_id, {
            like_count: Number(item.like_count) || 0, comment_count: Number(item.comment_count) || 0,
            liked_by_me: Boolean(item.liked_by_me), bookmarked_by_me: Boolean(item.bookmarked_by_me), following_author: Boolean(item.following_author),
          }])) }));
        }
      }
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
    }, { root, threshold: [0.15, 0.3, 0.5] });
    root.querySelectorAll<HTMLElement>('[data-post-id]').forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [posts]);

  useEffect(() => {
    const postId = pendingPostFocusRef.current;
    if (!postId || !posts.some((post) => post.id === postId)) return;
    const frame = requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(`[data-post-id="${postId}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      pendingPostFocusRef.current = null;
    });
    return () => cancelAnimationFrame(frame);
  }, [posts]);

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
    <div className="flex h-full min-h-0 flex-col bg-[#f0f2f5]">
      <div className="z-20 flex min-h-14 shrink-0 items-center justify-between gap-2 border-b border-border/70 bg-background/95 px-3 backdrop-blur sm:px-6">
        <div className="flex min-w-0 items-center gap-2" role="tablist" aria-label="Campus feed scope">
          <button type="button" role="tab" aria-selected={scope === 'all'} onClick={() => setScope('all')} className={`min-h-10 shrink-0 rounded-full px-4 text-sm font-semibold transition-colors ${scope === 'all' ? 'bg-[#079b68] text-white shadow-sm' : 'text-muted-foreground hover:bg-muted'}`}>Across Ghana</button>
          <button type="button" role="tab" aria-selected={scope === 'university'} disabled={!hasUniversity} onClick={() => setScope('university')} title={!hasUniversity ? 'Add your university to your profile first' : undefined} className={`min-h-10 shrink-0 rounded-full px-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${scope === 'university' ? 'bg-[#079b68] text-white shadow-sm' : 'text-muted-foreground hover:bg-muted'}`}>My university</button>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button type="button" variant="ghost" onClick={() => void loadPage(false)} disabled={loading} aria-label="Refresh campus feed" className="min-h-10 rounded-full px-3 text-muted-foreground">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /><span className="sr-only">Refresh feed</span>
          </Button>
          <Link href="/universities" className="hidden min-h-10 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-muted-foreground transition hover:bg-muted hover:text-foreground md:inline-flex"><Building2 className="h-4 w-4" />Universities</Link>
          {user && <Link href="/community/saved" aria-label="Saved campus posts" className="flex min-h-10 items-center gap-1.5 rounded-full px-2.5 text-sm font-semibold text-muted-foreground transition hover:bg-muted hover:text-emerald-800 sm:px-3"><Bookmark className="h-4 w-4" /><span className="hidden sm:inline">Saved</span></Link>}
          <Button onClick={() => user ? setPostOpen(true) : window.location.assign('/signin?next=%2F')} className="min-h-10 touch-manipulation rounded-full bg-[#079b68] px-3.5 text-sm hover:bg-[#07855b] sm:px-4">
            <Plus className="mr-1 h-4 w-4" /><span className="hidden sm:inline">Create post</span><span className="sm:hidden">Post</span>
          </Button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,42rem)] xl:grid-cols-[minmax(15rem,1fr)_minmax(0,42rem)_minmax(15rem,1fr)]">
        <aside className="hidden flex-col justify-between border-r border-border/60 p-6 xl:flex">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-emerald-800"><span className="h-2 w-2 rounded-full bg-emerald-500" />Campus community</span>
            <h1 className="mt-5 max-w-xs text-3xl font-bold leading-tight tracking-tight text-slate-900">What’s happening on campus?</h1>
            <p className="mt-3 max-w-xs text-sm leading-6 text-slate-600">Short videos, photos and everyday moments shared by students and vendors across Ghana.</p>
            <Link href="/universities" className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl border bg-white px-4 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-emerald-200 hover:text-emerald-800"><Building2 className="h-4 w-4 text-emerald-700" />Explore universities<ArrowUpRight className="h-4 w-4" /></Link>
          </div>
          <p className="max-w-xs text-xs leading-5 text-muted-foreground"><ShieldCheck className="mr-1 inline h-4 w-4 text-emerald-700" />Community posts are public. Share campus moments respectfully and avoid posting private details.</p>
        </aside>

        <section className="relative min-h-0 bg-[#f0f2f5] lg:border-x lg:border-border/70" aria-label={scope === 'all' ? 'Posts from campuses across Ghana' : 'Posts from your university'}>
          <div ref={viewportRef} onScroll={handleScroll} className="h-full min-h-0 overflow-y-auto overscroll-contain scroll-smooth px-3 py-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:px-5 lg:px-6" aria-live="polite">
            <div className="mx-auto w-full max-w-2xl space-y-4">
              <div className="rounded-2xl border bg-white p-3 shadow-sm sm:p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-800">{user ? initials(user.profile?.full_name || user.email || 'You') : 'U'}</div>
                  <button type="button" onClick={() => user ? setPostOpen(true) : window.location.assign('/signin?next=%2F')} className="min-h-11 flex-1 rounded-full bg-[#f0f2f5] px-4 text-left text-sm text-slate-600 transition hover:bg-slate-200">Share a campus moment…</button>
                </div>
                <div className="mt-3 border-t pt-3">
                  <button type="button" onClick={() => user ? setPostOpen(true) : window.location.assign('/signin?next=%2F')} className="flex min-h-10 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold text-emerald-800 transition hover:bg-emerald-50"><ImagePlus className="h-5 w-5" />Photo or video</button>
                </div>
              </div>
              {loading ? <div className="flex min-h-64 items-center justify-center rounded-2xl border bg-white text-sm text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin text-emerald-700" />Loading campus moments…</div>
                : loadError ? <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border bg-white px-6 text-center"><CircleAlert className="h-9 w-9 text-amber-600" /><h2 className="mt-4 text-lg font-semibold">The feed didn’t load</h2><p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">Your account is safe. Check your connection and try again.</p><Button variant="outline" onClick={() => void loadPage(false)} className="mt-5 min-h-11 rounded-full"><RefreshCw className="mr-2 h-4 w-4" />Try again</Button></div>
                  : posts.length === 0 ? <div className="flex min-h-72 flex-col items-center justify-center rounded-2xl border bg-white px-6 py-10 text-center shadow-sm"><div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-700"><ImagePlus className="h-7 w-7" /></div><h2 className="mt-4 text-xl font-bold text-slate-900">Your campus community starts here</h2><p className="mt-2 max-w-sm text-sm leading-6 text-slate-600">There aren’t any posts in this feed yet. Share a genuine photo or video from campus—no sample posts or made-up activity.</p>{canPost ? <Button onClick={() => setPostOpen(true)} className="mt-5 min-h-11 rounded-full bg-emerald-700 px-5 hover:bg-emerald-800"><Plus className="mr-2 h-4 w-4" />Share the first moment</Button> : <Button asChild className="mt-5 min-h-11 rounded-full bg-emerald-700 px-5 hover:bg-emerald-800"><Link href="/signup">Join UniEco Ghana</Link></Button>}<Link href="/universities" className="mt-3 inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-emerald-800 hover:underline">Browse universities<ArrowUpRight className="h-4 w-4" /></Link></div>
                    : <>{posts.map((post) => <CommunityPostCard key={post.id} post={post} active={activePostId === post.id} socialState={socialByPost[post.id] ?? emptyCommunitySocialState} onSocialChange={(next) => setSocialByPost((current) => ({ ...current, [post.id]: next }))} onReport={() => handleReportClick(post)} />)}
                      {loadingMore && <div className="flex min-h-20 items-center justify-center rounded-2xl border bg-white text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading more posts…</div>}
                      {loadMoreError && <div className="rounded-2xl border bg-white p-5 text-center text-sm text-muted-foreground" role="status"><p>Couldn’t load the next posts. The posts already here are safe.</p><button type="button" onClick={() => void loadPage(true)} className="mt-2 min-h-10 px-3 font-semibold text-emerald-800 hover:underline">Try again</button></div>}
                      {!hasMore && posts.length > 0 && <div className="py-5 text-center text-sm text-muted-foreground"><p>You’re all caught up.</p><button type="button" onClick={() => void loadPage(false)} className="mt-2 min-h-10 px-3 font-semibold text-emerald-800 hover:underline">Refresh the feed</button></div>}
                    </>}
            </div>
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
            <p className="-mt-2 text-xs leading-5 text-muted-foreground">For the best playback on phones and computers, use an MP4 video encoded with H.264. Some phone video formats or codecs may not play in every browser.</p>
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

export function CommunityPostCard({ post, active = false, socialState = emptyCommunitySocialState, onSocialChange, onReport }: {
  post: CommunityPost;
  active?: boolean;
  socialState?: CommunitySocialState;
  onSocialChange?: (state: CommunitySocialState) => void;
  onReport?: () => void;
}) {
  const avatar = getPublicAvatarUrl(post.author_avatar_url);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoState, setVideoState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (active) {
      video.muted = true;
      void video.play().catch(() => {
        // Autoplay can be blocked by device policy even when the file is healthy.
        if (!video.error) setVideoState('ready');
      });
    } else {
      video.pause();
    }
  }, [active]);

  const retryVideo = () => {
    const video = videoRef.current;
    if (!video) return;
    setVideoState('loading');
    video.load();
    if (active) void video.play().catch(() => {
      if (!video.error) setVideoState('ready');
    });
  };

  return (
    <article data-post-id={post.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-sm">
      <header className="flex items-center gap-3 px-4 py-3 sm:px-5">
        <Link href={`/community/member/${post.author_id}`} aria-label={`View ${post.author_name}'s profile`} className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-emerald-100 text-sm font-bold text-emerald-800">
          {avatar ? <img src={avatar} alt="" loading="lazy" className="h-full w-full object-cover" /> : initials(post.author_name)}
        </Link>
        <div className="min-w-0 flex-1">
          <Link href={`/community/member/${post.author_id}`} className="block truncate text-sm font-bold text-slate-900 hover:underline">{post.author_name}</Link>
          <p className="mt-0.5 flex min-w-0 items-center gap-1 truncate text-xs text-slate-500">
            <span>{friendlyRole(post.author_role)}</span>
            {post.university_name && <><span aria-hidden="true">·</span><MapPin className="h-3 w-3 shrink-0" /><span className="truncate">{post.university_name}</span></>}
            <span aria-hidden="true">·</span>
            <time dateTime={post.created_at}>{new Intl.DateTimeFormat('en-GH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(post.created_at))}</time>
          </p>
        </div>
        {post.university_slug && <Link href={`/university/${post.university_slug}`} aria-label={`View ${post.university_name}`} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-emerald-800"><ArrowUpRight className="h-5 w-5" /></Link>}
        {onReport && <button type="button" onClick={onReport} aria-label="Report post" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-rose-700"><Flag className="h-5 w-5" /></button>}
      </header>

      {post.caption && <p className="whitespace-pre-wrap break-words px-4 pb-3 text-sm leading-6 text-slate-800 sm:px-5">{post.caption}</p>}

      {post.media_type === 'video' ? (
        <div className="relative flex min-h-48 items-center justify-center bg-slate-950">
          <video
            ref={videoRef}
            src={post.media_url}
            playsInline
            muted
            loop
            controls
            preload={active ? 'metadata' : 'none'}
            onLoadedData={() => setVideoState('ready')}
            onPlaying={() => setVideoState('ready')}
            onWaiting={() => setVideoState('loading')}
            onError={() => setVideoState('error')}
            aria-label={`Video shared by ${post.author_name}`}
            className="block max-h-[min(68dvh,44rem)] w-full object-contain"
          />
          {videoState === 'loading' && <div className="pointer-events-none absolute inset-x-0 top-3 mx-auto flex w-fit items-center gap-2 rounded-full bg-black/70 px-3 py-2 text-xs font-medium text-white" role="status"><Loader2 className="h-4 w-4 animate-spin" />Loading video…</div>}
          {videoState === 'error' && <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/95 px-5 text-center text-white">
            <CircleAlert className="h-8 w-8 text-amber-300" />
            <p className="mt-3 font-semibold">This video didn’t play</p>
            <p className="mt-1 max-w-sm text-xs leading-5 text-white/75">The file may use a format or codec this browser can’t decode. MP4 with H.264 is the most widely supported option.</p>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              <Button type="button" variant="secondary" onClick={retryVideo} className="min-h-10 rounded-full">Try again</Button>
              <Button asChild type="button" variant="outline" className="min-h-10 rounded-full border-white/40 bg-transparent text-white hover:bg-white/10 hover:text-white"><a href={post.media_url} target="_blank" rel="noreferrer">Open original</a></Button>
            </div>
          </div>}
        </div>
      ) : imageFailed ? (
        <div className="flex min-h-52 items-center justify-center bg-slate-100 px-5 text-center text-sm text-slate-600"><CircleAlert className="mr-2 h-5 w-5 text-slate-400" />This photo is unavailable right now.</div>
      ) : (
        <div className="flex max-h-[68dvh] items-center justify-center bg-slate-950">
          <img src={post.media_url} alt={`Campus photo shared by ${post.author_name}`} loading={active ? 'eager' : 'lazy'} onError={() => setImageFailed(true)} className="max-h-[68dvh] w-full object-contain" />
        </div>
      )}

      {post.university_name && <div className="flex items-center gap-1.5 border-t px-4 py-2.5 text-xs font-medium text-slate-500 sm:px-5"><MapPin className="h-3.5 w-3.5 text-emerald-700" /><span className="truncate">Shared with the {post.university_name} community</span></div>}
      <CommunityPostActions postId={post.id} authorId={post.author_id} initialState={socialState} onStateChange={onSocialChange} />
    </article>
  );
}
