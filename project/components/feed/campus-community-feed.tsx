'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth/auth-context';
import { getPublicAvatarUrl } from '@/lib/storage/avatar-url';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  ArrowDownToLine, ArrowUpRight, Bookmark, Building2, CircleAlert, FileText,
  Flag, ImagePlus, Loader2, MapPin, Paperclip, Play, Plus, RefreshCw, Send,
  ShieldCheck,
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
  media_path: string | null;
  media_type: 'image' | 'video' | 'file' | 'text';
  created_at: string;
  media_url: string | null;
};

const PAGE_SIZE = 8;
const FEED_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;
const MAX_PREVIEW_MEDIA_BYTES = 25 * 1024 * 1024;
const PREVIEW_MEDIA = new Map([
  ['image/jpeg', 'jpg'], ['image/png', 'png'], ['image/webp', 'webp'],
  ['video/mp4', 'mp4'], ['video/webm', 'webm'],
]);
const VIDEO_FILE_EXTENSION = /\.(mp4|m4v|mov|webm|avi|mkv|3gp|mpeg|mpg)$/i;

function isVideoUploadCandidate(file: File) {
  return file.type.startsWith('video/') || VIDEO_FILE_EXTENSION.test(file.name);
}

function canDisplayInline(file: File) {
  return PREVIEW_MEDIA.has(file.type) && file.size <= MAX_PREVIEW_MEDIA_BYTES;
}

function canPlayVideoInline(file: File) {
  return ['video/mp4', 'video/webm'].includes(file.type) && canDisplayInline(file);
}

function canPlayPrivateVideoInline(file: { name: string; size: number }) {
  return file.size <= MAX_ATTACHMENT_BYTES && /\.(mp4|webm)$/i.test(file.name);
}

type NetworkInformationLike = {
  saveData?: boolean;
  effectiveType?: string;
  addEventListener?: (type: 'change', listener: () => void) => void;
  removeEventListener?: (type: 'change', listener: () => void) => void;
};

export function publicMediaUrl(path: string | null) {
  if (!path) return null;
  return supabase.storage.from('campus-community').getPublicUrl(path).data.publicUrl;
}

function readCachedFeed(cacheKey: string): CommunityPost[] | null {
  try {
    const raw = window.sessionStorage.getItem(cacheKey);
    if (!raw) return null;
    const cached = JSON.parse(raw) as { savedAt?: number; posts?: Omit<CommunityPost, 'media_url'>[] };
    if (!cached.savedAt || Date.now() - cached.savedAt > FEED_CACHE_TTL_MS || !Array.isArray(cached.posts)) {
      window.sessionStorage.removeItem(cacheKey);
      return null;
    }
    const posts = cached.posts.slice(0, PAGE_SIZE);
    if (posts.some((post) => !post || !/^[0-9a-f-]{36}$/i.test(post.id) || !/^[0-9a-f-]{36}$/i.test(post.author_id)
      || typeof post.author_name !== 'string' || typeof post.author_role !== 'string'
      || typeof post.caption !== 'string' || post.caption.length > 500
      || (post.media_path !== null && typeof post.media_path !== 'string')
      || (post.author_avatar_url !== null && typeof post.author_avatar_url !== 'string')
      || !['image', 'video', 'file', 'text'].includes(post.media_type)
      || typeof post.created_at !== 'string' || !Number.isFinite(Date.parse(post.created_at)))) return null;
    return posts.map((post) => ({ ...post, media_url: publicMediaUrl(post.media_path) }));
  } catch {
    return null;
  }
}

function writeCachedFeed(cacheKey: string, posts: CommunityPost[]) {
  try {
    const publicPosts = posts.slice(0, PAGE_SIZE).map(({ media_url: _mediaUrl, ...post }) => post);
    window.sessionStorage.setItem(cacheKey, JSON.stringify({ savedAt: Date.now(), posts: publicPosts }));
  } catch {
    // Storage can be disabled or full; never let an optional cache block the live feed.
  }
}

function safeFileName(name: string) {
  return name.split(/[\\/]/).pop()?.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 180) || 'campus-attachment';
}

function readableSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function friendlyRole(role: string) {
  if (role === 'student_vendor') return 'Student vendor';
  if (role === 'external_vendor') return 'Vendor';
  return role === 'student' ? 'Student' : 'Campus member';
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'U';
}

function formatFeedTimestamp(value: string) {
  const date = new Date(value);
  const today = new Date();
  const isToday = date.getFullYear() === today.getFullYear()
    && date.getMonth() === today.getMonth()
    && date.getDate() === today.getDate();
  return new Intl.DateTimeFormat('en-GH', isToday
    ? { hour: 'numeric', minute: '2-digit' }
    : { day: 'numeric', month: 'short' }).format(date);
}

export function CampusCommunityFeed() {
  const { user } = useAuth();
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [socialByPost, setSocialByPost] = useState<Record<string, CommunitySocialState>>({});
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [showingCachedPosts, setShowingCachedPosts] = useState(false);
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
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const touchStartYRef = useRef<number | null>(null);
  const pullDistanceRef = useRef(0);
  const cursorRef = useRef<{ created_at: string; id: string } | null>(null);
  const requestRef = useRef(0);
  const hasMoreRef = useRef(false);
  const loadingMoreRef = useRef(false);
  const pendingPostFocusRef = useRef<string | null>(null);

  const canPost = Boolean(user && ['student', 'student_vendor', 'external_vendor', 'university_admin'].includes(user.role));
  const hasUniversity = Boolean(user?.profile?.university_id);
  const scope: Scope = hasUniversity ? 'university' : 'all';
  const feedCacheKey = `unieco:community-feed:v1:${user?.id ?? 'guest'}:${scope}:${user?.profile?.university_id ?? 'none'}`;

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
        if (requestId !== requestRef.current) return;
        const targetPost = (target || [])[0] as Omit<CommunityPost, 'media_url'> | undefined;
        if (targetPost) rows = [targetPost, ...rows];
      }
      const page = rows.map((post) => ({ ...post, media_url: publicMediaUrl(post.media_path) }));
      setPosts((current) => append ? [...current, ...page] : page);
      if (!append) {
        setSocialByPost({});
        setShowingCachedPosts(false);
        writeCachedFeed(feedCacheKey, page);
      }
      if (page.length) {
        // Social counts are secondary: don't hold the actual feed hostage to this request on slow networks.
        void Promise.resolve(supabase.rpc('get_campus_community_post_social_state', { p_post_ids: page.slice(0, 12).map((post) => post.id) }))
          .then(({ data: socialRows, error: socialError }) => {
            if (socialError || requestId !== requestRef.current || !socialRows) return;
            setSocialByPost((current) => ({ ...current, ...Object.fromEntries((socialRows as (CommunitySocialState & { post_id: string })[]).map((item) => [item.post_id, {
              like_count: Number(item.like_count) || 0, comment_count: Number(item.comment_count) || 0,
              liked_by_me: Boolean(item.liked_by_me), bookmarked_by_me: Boolean(item.bookmarked_by_me), following_author: Boolean(item.following_author),
            }])) }));
          })
          .catch(() => undefined);
      }
      cursorRef.current = page.length ? { created_at: page[page.length - 1].created_at, id: page[page.length - 1].id } : (append ? cursorRef.current : null);
      hasMoreRef.current = page.length === PAGE_SIZE;
      setHasMore(page.length === PAGE_SIZE);
      setLoadError(false);
    } catch {
      if (requestId !== requestRef.current) return;
      if (append) setLoadMoreError(true);
      else {
        setLoadError(true);
        const cached = readCachedFeed(feedCacheKey);
        cursorRef.current = cached?.length ? { created_at: cached[cached.length - 1].created_at, id: cached[cached.length - 1].id } : null;
      }
    } finally {
      if (requestId === requestRef.current) {
        setLoading(false);
        loadingMoreRef.current = false;
        setLoadingMore(false);
      }
    }
  }, [feedCacheKey, scope]);

  useEffect(() => {
    const cached = readCachedFeed(feedCacheKey);
    setPosts(cached || []);
    setShowingCachedPosts(Boolean(cached?.length));
    const hasCachedPage = Boolean(cached?.length === PAGE_SIZE);
    setHasMore(hasCachedPage);
    hasMoreRef.current = hasCachedPage;
    cursorRef.current = cached?.length ? { created_at: cached[cached.length - 1].created_at, id: cached[cached.length - 1].id } : null;
    setLoading(!cached?.length);
    setLoadError(false);
    if (viewportRef.current) viewportRef.current.scrollTop = 0;
    void loadPage(false);
    return () => { requestRef.current += 1; };
  }, [feedCacheKey, loadPage]);

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

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    if (viewportRef.current?.scrollTop === 0) touchStartYRef.current = event.touches[0]?.clientY ?? null;
    else touchStartYRef.current = null;
  };

  const handleTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    const startY = touchStartYRef.current;
    if (startY === null || viewportRef.current?.scrollTop !== 0 || refreshing) return;
    const distance = event.touches[0].clientY - startY;
    const nextDistance = Math.max(0, Math.min(88, distance * 0.48));
    pullDistanceRef.current = nextDistance;
    setPullDistance(nextDistance);
  };

  const handleTouchEnd = () => {
    touchStartYRef.current = null;
    if (pullDistanceRef.current >= 54 && !loading) {
      setRefreshing(true);
      void loadPage(false).finally(() => setRefreshing(false));
    }
    pullDistanceRef.current = 0;
    setPullDistance(0);
  };

  const handleTouchCancel = () => {
    touchStartYRef.current = null;
    pullDistanceRef.current = 0;
    setPullDistance(0);
  };

  const resetPostForm = () => { setCaption(''); setMediaFile(null); setUploading(false); };
  const closePostDialog = (open: boolean) => { setPostOpen(open); if (!open && !uploading) resetPostForm(); };

  const submitPost = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user || !canPost) { toast.error('Sign in with an eligible UniEco account to post.'); return; }
    const trimmedCaption = caption.trim();
    if (!mediaFile && !trimmedCaption) {
      toast.error('Add a caption or attach a file before publishing.');
      return;
    }
    if (mediaFile && mediaFile.size > MAX_ATTACHMENT_BYTES) { toast.error('Attachments can be up to 50 MB.'); return; }
    const safePreviewExtension = mediaFile ? PREVIEW_MEDIA.get(mediaFile.type) : undefined;
    const previewable = Boolean(mediaFile && safePreviewExtension && canDisplayInline(mediaFile));
    if (trimmedCaption.length > 500) { toast.error('Keep the caption under 500 characters.'); return; }
    const mediaType = previewable ? (mediaFile!.type.startsWith('video/') ? 'video' : 'image') : mediaFile ? 'file' : 'text';
    const publicPath = previewable ? `${user.id}/${crypto.randomUUID()}.${safePreviewExtension}` : null;
    const attachmentPath = mediaFile && !previewable ? `${user.id}/${crypto.randomUUID()}` : null;
    const attachmentName = mediaFile && !previewable ? safeFileName(mediaFile.name) : null;
    setUploading(true);
    let uploadedBucket: 'campus-community' | 'campus-community-files' | null = null;
    const uploadPath = publicPath || attachmentPath;
    const uploadBucket = publicPath ? 'campus-community' : attachmentPath ? 'campus-community-files' : null;
    try {
      if (mediaFile && uploadPath && uploadBucket) {
        const { error: uploadError } = await supabase.storage.from(uploadBucket).upload(uploadPath, mediaFile, {
          contentType: mediaFile.type || 'application/octet-stream',
          cacheControl: publicPath ? '31536000' : '0',
          upsert: false,
        });
        if (uploadError) throw uploadError;
        uploadedBucket = uploadBucket;
      }
      const { error: postError } = await supabase.rpc('create_campus_community_post_with_attachment', {
        p_caption: trimmedCaption,
        p_media_path: publicPath,
        p_media_type: previewable ? mediaType : null,
        p_attachment_path: attachmentPath,
        p_attachment_name: attachmentName,
        p_attachment_size: mediaFile && attachmentPath ? mediaFile.size : null,
      });
      if (postError) throw postError;
      uploadedBucket = null;
      toast.success('Your post is live on the campus feed.');
      setPostOpen(false);
      setCaption('');
      setMediaFile(null);
      await loadPage(false);
    } catch (error) {
      if (uploadedBucket && uploadPath) await supabase.storage.from(uploadedBucket).remove([uploadPath]).catch(() => undefined);
      const message = error instanceof Error ? error.message : '';
      if (message.includes('hourly posting limit')) toast.error('You have reached the posting limit. Please try again later.');
      else if (message.toLowerCase().includes('storage')) toast.error('Your file could not be uploaded. Check your connection and try again.');
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

  const selectedVideo = mediaFile ? isVideoUploadCandidate(mediaFile) : false;
  const selectedVideoCanPlayInline = Boolean(mediaFile && isVideoUploadCandidate(mediaFile) && canPlayVideoInline(mediaFile));

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="sticky top-0 z-20 flex min-h-12 shrink-0 items-center justify-between gap-2 border-b border-border/70 bg-background/95 px-3 py-1.5 backdrop-blur sm:min-h-14 sm:px-6 sm:py-0">
        <h2 className="truncate text-sm font-bold text-foreground sm:text-base xl:hidden">Campus feed</h2>
        <div className="flex min-w-0 items-center justify-between gap-2 sm:shrink-0 sm:justify-end sm:gap-1.5">
          <div className="flex min-w-0 items-center gap-0.5 sm:gap-1.5">
          <Link href="/universities" className="hidden min-h-10 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-muted-foreground transition hover:bg-muted hover:text-foreground md:inline-flex"><Building2 className="h-4 w-4" />Universities</Link>
          {user && <Link href="/community/saved" aria-label="Saved campus posts" className="inline-flex min-h-10 min-w-10 touch-manipulation items-center justify-center gap-1.5 rounded-full px-2.5 text-sm font-semibold text-muted-foreground transition hover:bg-muted hover:text-emerald-800 sm:px-3"><Bookmark className="h-4 w-4" /><span className="hidden sm:inline">Saved</span></Link>}
          </div>
          <Button onClick={() => user ? setPostOpen(true) : window.location.assign('/signin?next=%2F')} className="min-h-10 touch-manipulation rounded-full bg-[#079b68] px-4 text-sm hover:bg-[#07855b]">
            <Plus className="mr-1 h-4 w-4" /><span className="hidden sm:inline">Create post</span><span className="sm:hidden">Post</span>
          </Button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,42rem)] xl:grid-cols-[minmax(15rem,1fr)_minmax(0,42rem)_minmax(15rem,1fr)]">
        <aside className="hidden flex-col justify-between border-r border-border/60 p-6 xl:flex">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-emerald-800"><span className="h-2 w-2 rounded-full bg-emerald-500" />Campus community</span>
            <h2 className="mt-5 max-w-xs text-3xl font-bold leading-tight tracking-tight text-slate-900">What’s happening on campus?</h2>
            <p className="mt-3 max-w-xs text-sm leading-6 text-slate-600">Short videos, photos and everyday moments shared by students and vendors across Ghana.</p>
            <Link href="/universities" className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl border bg-white px-4 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-emerald-200 hover:text-emerald-800"><Building2 className="h-4 w-4 text-emerald-700" />Explore universities<ArrowUpRight className="h-4 w-4" /></Link>
          </div>
          <p className="max-w-xs text-xs leading-5 text-muted-foreground"><ShieldCheck className="mr-1 inline h-4 w-4 text-emerald-700" />Community posts are public. Share campus moments respectfully and avoid posting private details.</p>
        </aside>

        <section className="relative min-h-0 bg-muted/40 lg:border-x lg:border-border/70" aria-label={hasUniversity ? 'Campus posts from your university' : 'Campus posts from Ghana'}>
          <div ref={viewportRef} onScroll={handleScroll} onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd} onTouchCancel={handleTouchCancel} className="h-full min-h-0 overflow-y-auto overscroll-contain px-0 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:px-5 sm:py-4 lg:px-6" aria-live="polite">
            {(pullDistance > 0 || refreshing) && <div className="flex items-center justify-center overflow-hidden text-muted-foreground" style={{ height: refreshing ? 44 : pullDistance }} aria-live="polite"><RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /><span className="sr-only">{refreshing ? 'Refreshing campus feed' : 'Pull down to refresh campus feed'}</span></div>}
            <div className="mx-auto w-full max-w-2xl space-y-2.5 sm:space-y-4">
              <div className="border-y bg-card p-3 shadow-sm sm:rounded-2xl sm:border sm:p-4">
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10 border border-emerald-100">
                    {user?.profile?.avatar_url && <AvatarImage src={getPublicAvatarUrl(user.profile.avatar_url)} alt="" />}
                    <AvatarFallback className="bg-emerald-100 text-sm font-bold text-emerald-800">{user ? initials(user.profile?.full_name || user.email || 'You') : 'U'}</AvatarFallback>
                  </Avatar>
                  <button type="button" onClick={() => user ? setPostOpen(true) : window.location.assign('/signin?next=%2F')} className="min-h-11 flex-1 rounded-full bg-muted px-4 text-left text-sm text-muted-foreground transition hover:bg-muted/80">Share a campus moment…</button>
                </div>
                <div className="mt-3 flex items-center border-t pt-2">
                  <button type="button" onClick={() => user ? setPostOpen(true) : window.location.assign('/signin?next=%2F')} className="flex min-h-11 flex-1 touch-manipulation items-center justify-center gap-2 rounded-lg text-sm font-semibold text-muted-foreground transition hover:bg-primary/5 hover:text-primary"><ImagePlus className="h-5 w-5 text-primary" />Photo or video</button>
                </div>
              </div>
              {loading && posts.length === 0 ? <div className="flex min-h-64 items-center justify-center rounded-2xl border bg-white text-sm text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin text-emerald-700" />Loading campus moments…</div>
                : loadError && posts.length === 0 ? <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border bg-white px-6 text-center"><CircleAlert className="h-9 w-9 text-amber-600" /><h2 className="mt-4 text-lg font-semibold">The feed didn’t load</h2><p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">Your account is safe. Check your connection and try again.</p><Button variant="outline" onClick={() => void loadPage(false)} className="mt-5 min-h-11 rounded-full"><RefreshCw className="mr-2 h-4 w-4" />Try again</Button></div>
                  : posts.length === 0 ? <div className="flex min-h-72 flex-col items-center justify-center rounded-2xl border bg-white px-6 py-10 text-center shadow-sm"><div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-700"><ImagePlus className="h-7 w-7" /></div><h2 className="mt-4 text-xl font-bold text-slate-900">Your campus community starts here</h2><p className="mt-2 max-w-sm text-sm leading-6 text-slate-600">There aren’t any posts in this feed yet. Share a genuine photo or video from campus—no sample posts or made-up activity.</p>{canPost ? <Button onClick={() => setPostOpen(true)} className="mt-5 min-h-11 rounded-full bg-emerald-700 px-5 hover:bg-emerald-800"><Plus className="mr-2 h-4 w-4" />Share the first moment</Button> : <Button asChild className="mt-5 min-h-11 rounded-full bg-emerald-700 px-5 hover:bg-emerald-800"><Link href="/signup">Join UniEco Ghana</Link></Button>}<Link href="/universities" className="mt-3 inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-emerald-800 hover:underline">Browse universities<ArrowUpRight className="h-4 w-4" /></Link></div>
                    : <>{(showingCachedPosts || loadError) && <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950" role="status"><span>{loadError ? 'Connection unavailable. Showing recent posts saved on this device.' : 'Showing recent posts while we refresh the feed.'}</span>{loadError && <button type="button" onClick={() => void loadPage(false)} className="min-h-9 shrink-0 px-2 font-semibold underline underline-offset-2">Retry</button>}</div>}{posts.map((post) => <CommunityPostCard key={post.id} post={post} active={activePostId === post.id} socialState={socialByPost[post.id] ?? emptyCommunitySocialState} onSocialChange={(next) => setSocialByPost((current) => ({ ...current, [post.id]: next }))} onReport={() => handleReportClick(post)} onDelete={() => { const remaining = posts.filter((item) => item.id !== post.id); setPosts(remaining); setSocialByPost((current) => { const next = { ...current }; delete next[post.id]; return next; }); writeCachedFeed(feedCacheKey, remaining); if (activePostId === post.id) { setActivePostId(null); setPostOpen(false); } }} />)}
                      {loadingMore && <div className="flex min-h-20 items-center justify-center rounded-2xl border bg-white text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading more posts…</div>}
                      {loadMoreError && <div className="rounded-2xl border bg-white p-5 text-center text-sm text-muted-foreground" role="status"><p>Couldn’t load the next posts. The posts already here are safe.</p><button type="button" onClick={() => void loadPage(true)} className="mt-2 min-h-10 px-3 font-semibold text-emerald-800 hover:underline">Try again</button></div>}
                      {!hasMore && posts.length > 0 && <div className="py-5 text-center text-sm text-muted-foreground">You’re all caught up.</div>}
                    </>}
            </div>
          </div>
        </section>

        <aside className="hidden flex-col gap-4 p-6 xl:flex">
          <div className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><MapPin className="h-5 w-5" /></div><h2 className="mt-4 font-bold text-slate-900">Your campus, your people</h2><p className="mt-2 text-sm leading-6 text-slate-600">{hasUniversity ? 'Your feed is automatically focused on your university. Change your campus anytime in your profile.' : 'Add your university to your profile and your feed will focus on the people and moments from your campus.'}</p>{!hasUniversity && <Link href="/profile" className="mt-3 inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-emerald-800">Add your university<ArrowUpRight className="h-4 w-4" /></Link>}</div>
          <div className="rounded-2xl border bg-white p-5 shadow-sm"><div className="flex items-center gap-2 font-bold text-slate-900"><ShieldCheck className="h-5 w-5 text-emerald-700" />A safer campus feed</div><p className="mt-2 text-sm leading-6 text-slate-600">Every post is tied to an active UniEco account. Use the report control if something feels unsafe or inappropriate.</p></div>
          <Link href="/updates" className="flex min-h-12 items-center justify-between rounded-xl border bg-white px-4 text-sm font-semibold text-slate-800 transition hover:border-emerald-200 hover:text-emerald-800"><span>Official campus updates</span><ArrowUpRight className="h-4 w-4" /></Link>
        </aside>
      </div>

      <Dialog open={postOpen} onOpenChange={closePostDialog}>
        <DialogContent className="max-h-[min(90dvh,48rem)] w-[calc(100vw-1rem)] overflow-y-auto rounded-2xl p-4 sm:max-w-xl sm:p-6">
          <DialogHeader><DialogTitle>Share a campus moment</DialogTitle><DialogDescription>Post a photo or short video for the UniEco Ghana community. Your post is public and linked to your account and campus.</DialogDescription></DialogHeader>
          <form onSubmit={submitPost} className="space-y-4">
            <label className="block text-sm font-semibold" htmlFor="community-media">Add a file <span className="font-normal text-muted-foreground">(any format, up to 50 MB; photos up to 25 MB; MP4/WebM videos up to 50 MB can play on demand)</span></label>
            <input id="community-media" type="file" disabled={uploading} onChange={(event) => setMediaFile(event.target.files?.[0] || null)} className="block min-h-12 w-full cursor-pointer rounded-xl border border-input bg-background text-sm file:mr-3 file:h-12 file:border-0 file:bg-emerald-50 file:px-4 file:font-semibold file:text-emerald-800" />
            {mediaFile && <p className="-mt-2 flex items-center gap-2 break-all text-xs text-muted-foreground"><Paperclip className="h-4 w-4 shrink-0" />{safeFileName(mediaFile.name)} · {readableSize(mediaFile.size)}</p>}
            {mediaFile && <p role="status" className={`rounded-xl border px-3 py-2 text-xs leading-5 ${selectedVideoCanPlayInline || (selectedVideo && canPlayPrivateVideoInline({ name: mediaFile.name, size: mediaFile.size })) ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-amber-200 bg-amber-50 text-amber-950'}`}>
              {selectedVideoCanPlayInline
                ? 'This video will play inline in the feed.'
                : selectedVideo
                  ? canPlayPrivateVideoInline({ name: mediaFile.name, size: mediaFile.size })
                    ? 'This MP4 or WebM will play in the feed from a short-lived private link. Playback starts only when a viewer taps play.'
                    : mediaFile.size > MAX_PREVIEW_MEDIA_BYTES
                      ? 'This video is over the 25 MB public inline-play limit and is not an MP4 or WebM eligible for private playback, so it will appear as a download.'
                      : 'This video format is not enabled for inline playback, so it will appear as a download. For in-feed playback, export as MP4 (H.264 video with AAC audio) or WebM at 25 MB or less.'
                  : !PREVIEW_MEDIA.has(mediaFile.type) || mediaFile.size > MAX_PREVIEW_MEDIA_BYTES
                    ? 'This attachment will appear as a download. JPG, PNG, WebP, MP4, and WebM files up to 25 MB can display inline.'
                    : 'This photo will display inline in the feed.'}
            </p>}
            {previewUrl && mediaFile && PREVIEW_MEDIA.has(mediaFile.type) && mediaFile.size <= MAX_PREVIEW_MEDIA_BYTES && (mediaFile.type.startsWith('video/') ? <video src={previewUrl} controls playsInline preload="metadata" className="max-h-72 w-full rounded-xl bg-black object-contain" /> : <img src={previewUrl} alt="Preview of your campus post" className="max-h-72 w-full rounded-xl bg-muted object-contain" />)}
            <label className="block text-sm font-semibold" htmlFor="community-caption">Caption <span className="font-normal text-muted-foreground">(optional, up to 500 characters)</span></label>
            <Textarea id="community-caption" value={caption} onChange={(event) => setCaption(event.target.value.slice(0, 500))} maxLength={500} rows={3} placeholder="What’s happening on campus?" disabled={uploading} />
            <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground"><span>Keep private information out of your post.</span><span>{caption.length}/500</span></div>
            <DialogFooter><Button type="submit" disabled={uploading || (!mediaFile && !caption.trim())} className="min-h-11 w-full rounded-xl bg-[#079b68] hover:bg-[#07855b] sm:w-auto">{uploading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Publishing…</> : <><Send className="mr-2 h-4 w-4" />Publish post</>}</Button></DialogFooter>
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

export function CommunityPostCard({ post, active = false, socialState = emptyCommunitySocialState, onSocialChange, onReport, onDelete }: {
  post: CommunityPost;
  active?: boolean;
  socialState?: CommunitySocialState;
  onSocialChange?: (state: CommunitySocialState) => void;
  onReport?: () => void;
  onDelete?: () => void;
}) {
  const avatar = getPublicAvatarUrl(post.author_avatar_url);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoState, setVideoState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [videoFailure, setVideoFailure] = useState<'network' | 'decode' | 'unsupported' | 'unknown' | null>(null);
  const [reducedData, setReducedData] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [fileInfo, setFileInfo] = useState<{ path: string; name: string; size: number } | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError] = useState(false);
  const [fileChecking, setFileChecking] = useState(false);
  const [privateVideoUrl, setPrivateVideoUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!active || post.media_type !== 'file' || fileInfo) return;
    let cancelled = false;
    setFileChecking(true);
    void (async () => {
      try {
        const { data, error } = await supabase.rpc('get_campus_community_post_file_info', { p_post_id: post.id });
        const result = (data || [])[0] as { file_path: string; file_name: string; file_size: number } | undefined;
        if (!cancelled && !error && result?.file_path) {
          setFileInfo({ path: result.file_path, name: safeFileName(result.file_name), size: Number(result.file_size) || 0 });
        }
        if (!cancelled && error) setFileError(true);
      } catch {
        if (!cancelled) setFileError(true);
      } finally {
        if (!cancelled) setFileChecking(false);
      }
    })();
    return () => { cancelled = true; };
  }, [active, post.id, post.media_type, fileInfo]);

  useEffect(() => {
    const connection = (navigator as Navigator & { connection?: NetworkInformationLike }).connection;
    const update = () => setReducedData(Boolean(connection?.saveData || ['slow-2g', '2g', '3g'].includes(connection?.effectiveType || '')));
    update();
    connection?.addEventListener?.('change', update);
    return () => connection?.removeEventListener?.('change', update);
  }, []);

  const downloadAttachment = async () => {
    if (fileLoading) return;
    setFileLoading(true);
    setFileError(false);
    try {
      let attachment = fileInfo;
      if (!attachment) {
        const { data, error } = await supabase.rpc('get_campus_community_post_file_info', { p_post_id: post.id });
        const result = (data || [])[0] as { file_path: string; file_name: string; file_size: number } | undefined;
        if (error || !result?.file_path) throw error || new Error('Attachment unavailable');
        attachment = { path: result.file_path, name: safeFileName(result.file_name), size: Number(result.file_size) || 0 };
        setFileInfo(attachment);
      }
      const { data, error } = await supabase.storage.from('campus-community-files').createSignedUrl(attachment.path, 60, { download: attachment.name });
      if (error || !data?.signedUrl) throw error || new Error('Attachment link unavailable');
      window.location.assign(data.signedUrl);
    } catch {
      setFileError(true);
      toast.error('This attachment is not available right now. Please try again.');
    } finally {
      setFileLoading(false);
    }
  };

  const playPrivateVideo = async () => {
    if (!fileInfo || !canPlayPrivateVideoInline(fileInfo) || fileLoading) return;
    setFileLoading(true);
    setFileError(false);
    try {
      const { data, error } = await supabase.storage.from('campus-community-files').createSignedUrl(fileInfo.path, 10 * 60);
      if (error || !data?.signedUrl) throw error || new Error('Video link unavailable');
      setPrivateVideoUrl(data.signedUrl);
    } catch {
      setFileError(true);
      toast.error('This video is not available for playback right now. You can still download the original.');
    } finally {
      setFileLoading(false);
    }
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (active && !reducedData) {
      video.muted = true;
      void video.play().catch(() => {
        // Autoplay can be blocked by device policy even when the file is healthy.
        if (!video.error) setVideoState('ready');
      });
    } else {
      video.pause();
    }
  }, [active, reducedData]);

  const retryVideo = () => {
    const video = videoRef.current;
    if (!video) return;
    setVideoState('loading');
    setVideoFailure(null);
    video.load();
    if (active && !reducedData) void video.play().catch(() => {
      if (!video.error) setVideoState('ready');
    });
  };

  return (
    <article data-post-id={post.id} className="overflow-hidden border-y border-slate-200 bg-white text-slate-900 shadow-sm sm:rounded-2xl sm:border">
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
            <time dateTime={post.created_at} title={new Intl.DateTimeFormat('en-GH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(post.created_at))}>{formatFeedTimestamp(post.created_at)}</time>
          </p>
        </div>
        {post.university_slug && <Link href={`/university/${post.university_slug}`} aria-label={`View ${post.university_name}`} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-emerald-800"><ArrowUpRight className="h-5 w-5" /></Link>}
        {onReport && <button type="button" onClick={onReport} aria-label="Report post" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-rose-700"><Flag className="h-5 w-5" /></button>}
      </header>

      {post.caption && <p className="whitespace-pre-wrap break-words px-4 pb-3 text-sm leading-6 text-slate-800 sm:px-5">{post.caption}</p>}

      {post.media_type === 'text' ? (
        <div className="border-t bg-slate-50 px-4 py-5 text-sm text-slate-500 sm:px-5">Text post</div>
      ) : post.media_type === 'file' ? (
        <div className="border-t bg-slate-50 p-4 sm:p-5">
          {privateVideoUrl ? (
            <div className="overflow-hidden rounded-2xl border bg-black">
              <video src={privateVideoUrl} controls playsInline preload="metadata" aria-label={`Private video shared by ${post.author_name}`} className="max-h-[min(68dvh,44rem)] w-full object-contain" onError={() => { setPrivateVideoUrl(null); setFileError(true); }} />
              <p className="bg-white px-3 py-2 text-xs text-slate-600">Private video link expires automatically. Playback is user-controlled.</p>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border bg-white p-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-800">{fileInfo && canPlayPrivateVideoInline(fileInfo) ? <Play className="h-5 w-5" /> : <FileText className="h-5 w-5" />}</div>
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{fileInfo?.name || (fileError ? 'Attachment unavailable' : 'Campus attachment')}</p><p className="text-xs text-slate-500">{fileInfo ? readableSize(fileInfo.size) : fileError ? 'Tap to retry, or ask the author to share it again.' : fileChecking ? 'Checking secure attachment…' : 'Secure attachment · private by default'}</p></div>
              {fileInfo && canPlayPrivateVideoInline(fileInfo) && <Button type="button" variant="outline" onClick={() => void playPrivateVideo()} disabled={fileLoading} className="min-h-11 touch-manipulation rounded-full"><Play className="mr-2 h-4 w-4" />{fileLoading ? 'Preparing…' : 'Play video'}</Button>}
              <Button type="button" variant="ghost" onClick={() => void downloadAttachment()} disabled={fileLoading} aria-label={fileLoading ? 'Preparing attachment download' : 'Download campus attachment'} title="Download attachment" className="min-h-11 min-w-11 shrink-0 touch-manipulation rounded-full px-3 text-slate-700 hover:bg-slate-100 hover:text-emerald-800 sm:min-w-0 sm:px-4">{fileLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowDownToLine className="h-4 w-4" />}<span className="sr-only sm:not-sr-only sm:ml-2">Download</span></Button>
            </div>
          )}
        </div>
      ) : post.media_type === 'video' ? (
        <div className="relative flex min-h-48 items-center justify-center bg-slate-950">
          <video
            ref={videoRef}
            src={post.media_url || undefined}
            playsInline
            muted
            loop
            controls
            preload={active && !reducedData ? 'metadata' : 'none'}
            onLoadedMetadata={() => setVideoState('loading')}
            onLoadedData={() => setVideoState('ready')}
            onPlaying={() => setVideoState('ready')}
            onWaiting={() => setVideoState('loading')}
            onError={(event) => {
              const code = event.currentTarget.error?.code;
              setVideoFailure(code === 2 ? 'network' : code === 3 ? 'decode' : code === 4 ? 'unsupported' : 'unknown');
              setVideoState('error');
            }}
            aria-label={`Video shared by ${post.author_name}`}
            className="block max-h-[min(68dvh,44rem)] w-full object-contain"
          />
          {active && reducedData && videoState === 'loading' && <div className="pointer-events-none absolute inset-x-3 top-3 mx-auto w-fit rounded-full bg-black/70 px-3 py-2 text-xs font-medium text-white" role="status">Data saver is on · tap play to load this video</div>}
          {active && !reducedData && videoState === 'loading' && <div className="pointer-events-none absolute inset-x-3 top-3 mx-auto flex w-fit items-center gap-2 rounded-full bg-black/70 px-3 py-2 text-xs font-medium text-white" role="status"><Loader2 className="h-4 w-4 animate-spin" />Loading video…</div>}
          {videoState === 'error' && <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/95 px-5 text-center text-white">
            <CircleAlert className="h-8 w-8 text-amber-300" />
            <p className="mt-3 font-semibold">We couldn’t play this video</p>
            <p className="mt-1 max-w-sm text-xs leading-5 text-white/75">{videoFailure === 'network'
              ? 'The video stream was interrupted by the connection. Try again when the signal is steadier; the rest of the feed remains available.'
              : videoFailure === 'decode' || videoFailure === 'unsupported'
                ? 'This phone cannot decode this video’s format. The person who posted it will need to re-export and upload an MP4 using H.264 video and AAC audio. UniEco cannot convert a video that is already uploaded.'
                : 'The video could not be opened. Try again, or open the original file. If it still fails on this phone, ask the person who posted it to upload an MP4 using H.264 video and AAC audio.'}</p>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              <Button type="button" variant="secondary" onClick={retryVideo} className="min-h-10 rounded-full">Try again</Button>
              {post.media_url && <Button asChild type="button" variant="outline" className="min-h-10 rounded-full border-white/40 bg-transparent text-white hover:bg-white/10 hover:text-white"><a href={post.media_url} target="_blank" rel="noreferrer">Open original</a></Button>}
            </div>
          </div>}
        </div>
      ) : imageFailed ? (
        <div className="flex min-h-52 items-center justify-center bg-slate-100 px-5 text-center text-sm text-slate-600"><CircleAlert className="mr-2 h-5 w-5 text-slate-400" />This photo is unavailable right now.</div>
      ) : (
        <div className="flex max-h-[68dvh] items-center justify-center bg-slate-950">
          {post.media_url && <img src={post.media_url} alt={`Campus photo shared by ${post.author_name}`} loading={active ? 'eager' : 'lazy'} onError={() => setImageFailed(true)} className="max-h-[68dvh] w-full object-contain" />}
        </div>
      )}

      {post.university_name && <div className="flex items-center gap-1.5 border-t px-4 py-2.5 text-xs font-medium text-slate-500 sm:px-5"><MapPin className="h-3.5 w-3.5 text-emerald-700" /><span className="truncate">Shared with the {post.university_name} community</span></div>}
      <CommunityPostActions postId={post.id} authorId={post.author_id} initialState={socialState} onStateChange={onSocialChange} onDelete={onDelete} />
    </article>
  );
}
