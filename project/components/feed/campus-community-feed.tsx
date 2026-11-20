'use client';

import { Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Upload } from 'tus-js-client';
import { supabase } from '@/lib/supabase/client';
import { getSupabaseConfig } from '@/lib/supabase/config';
import { useAuth } from '@/lib/auth/auth-context';
import { useInstallPrompt } from '@/hooks/use-install-prompt';
import { getPublicAvatarUrl } from '@/lib/storage/avatar-url';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { SiteHeader } from '@/components/layout/site-header';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuRadioGroup, DropdownMenuRadioItem,
  DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import {
  ArrowUpRight, Bookmark, Building2, CalendarDays, CheckCircle2, ChevronDown, CircleAlert, Download, Film, FileText,
  Flag, Home, ImagePlus, Loader2, MapPin, Newspaper, Play, Plus, RefreshCw, Search, ShoppingBag, SquarePlus, UsersRound, X, type LucideIcon,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { CommunityPostActions, emptyCommunitySocialState, type CommunityMutation, type CommunitySocialState } from '@/components/feed/community-post-actions';
import { CampusPostMedia } from '@/components/feed/campus-post-media';
import { appendCampusFeed, getCampusMoments, pageCampusFeed, type FeedScope } from '@/lib/community/feed-experience';
import { MAX_ATTACHMENT_BYTES, VIDEO_PREPARATION_TIMEOUT_MS, VIDEO_FILE_EXTENSION, readableSize, safeFileName, withRequestTimeout } from '@/lib/community/media-client';

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
const FEED_CACHE_TTL_MS = 15 * 60 * 1000;
const followingSocialState = { ...emptyCommunitySocialState, following_author: true };
const MAX_PREVIEW_MEDIA_BYTES = 25 * 1024 * 1024;
// Stay below the Storage bucket's 25 MiB hard limit so every published video
// uses the same public, range-capable feed-media path as photos.
const MAX_PUBLIC_VIDEO_BYTES = 24 * 1024 * 1024;
const RESUMABLE_UPLOAD_CHUNK_BYTES = 6 * 1024 * 1024;
const PREVIEW_MEDIA = new Map([
  ['image/jpeg', 'jpg'], ['image/png', 'png'], ['image/webp', 'webp'],
  ['video/mp4', 'mp4'], ['video/webm', 'webm'],
]);

function isVideoUploadCandidate(file: File) {
  return file.type.startsWith('video/') || VIDEO_FILE_EXTENSION.test(file.name);
}

function canDisplayInline(file: File) {
  return PREVIEW_MEDIA.has(file.type) && file.size <= MAX_PREVIEW_MEDIA_BYTES;
}


async function uploadCommunityMediaResumably(
  file: File,
  path: string,
  bucket: 'campus-community' | 'campus-community-files',
  onProgress: (percentage: number) => void,
  allowSignedUploadFallback = false,
) {
  const { data: sessionResult, error: sessionError } = await supabase.auth.getSession();
  const session = sessionResult.session;
  if (sessionError || !session?.access_token) throw new Error('Your sign-in expired. Sign in again and retry the post.');

  const { data: signedUpload, error: signingError } = await supabase.storage
    .from(bucket)
    .createSignedUploadUrl(path, { upsert: false });
  if (signingError || !signedUpload?.token) {
    throw signingError || new Error('UniEco could not securely prepare the video upload.');
  }

  const { url } = getSupabaseConfig();
  const projectRef = new URL(url).hostname.split('.')[0];
  if (!/^[a-z0-9-]+$/i.test(projectRef)) throw new Error('The secure upload service is not configured correctly.');

  try {
    await new Promise<void>((resolve, reject) => {
      const upload = new Upload(file, {
        endpoint: `https://${projectRef}.storage.supabase.co/storage/v1/upload/resumable`,
        headers: {
          authorization: `Bearer ${session.access_token}`,
          apikey: getSupabaseConfig().anonKey,
          'x-signature': signedUpload.token,
          'x-upsert': 'false',
        },
        metadata: {
          bucketName: bucket,
          objectName: path,
          contentType: file.type || 'application/octet-stream',
          cacheControl: '0',
        },
        chunkSize: RESUMABLE_UPLOAD_CHUNK_BYTES,
        retryDelays: [0, 3_000, 5_000, 10_000, 20_000],
        uploadDataDuringCreation: true,
        storeFingerprintForResuming: false,
        removeFingerprintOnSuccess: true,
        onError: reject,
        onProgress(bytesUploaded, bytesTotal) {
          onProgress(Math.min(100, Math.floor((bytesUploaded / Math.max(1, bytesTotal)) * 100)));
        },
        onSuccess: () => resolve(),
      });
      upload.start();
    });
  } catch (resumableError) {
    if (!allowSignedUploadFallback) throw resumableError;

    // Some mobile browsers or carrier networks interrupt TUS creation/PATCH
    // requests even though a normal authenticated Storage upload works. If
    // TUS finalized the object but its response was lost, don't upload it a
    // second time; otherwise retry once using Supabase's supported signed
    // upload SDK method for this already-normalized, <=24 MiB MP4.
    const storage = supabase.storage.from(bucket);
    const { data: exists, error: existsError } = await storage.exists(path);
    if (!existsError && exists) return;

    const { data: fallbackToken, error: fallbackTokenError } = await storage.createSignedUploadUrl(path, { upsert: false });
    if (fallbackTokenError || !fallbackToken?.token) {
      throw fallbackTokenError || resumableError;
    }
    const { error: fallbackError } = await storage.uploadToSignedUrl(path, fallbackToken.token, file, {
      contentType: 'video/mp4',
      cacheControl: '0',
      upsert: false,
    });
    if (fallbackError) throw fallbackError;
    onProgress(100);
  }
}


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

function FeedPostLocation({ onChange }: { onChange: (id: string | null) => void }) {
  const requested = useSearchParams().get('post');
  useEffect(() => {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    onChange(requested && uuid.test(requested) ? requested.toLowerCase() : null);
  }, [onChange, requested]);
  return null;
}

function FeedRailLink({ href, icon: Icon, current = false, children }: { href: string; icon: LucideIcon; current?: boolean; children: ReactNode }) {
  return (
    <Link href={href} aria-current={current ? 'page' : undefined} className={`flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring ${current ? 'font-bold' : 'font-medium'}`}>
      <Icon className="h-[22px] w-[22px] shrink-0" strokeWidth={1.8} fill={current ? 'currentColor' : 'none'} aria-hidden="true" />{children}
    </Link>
  );
}

function FeedSkeleton() {
  return <div role="status" className="overflow-hidden bg-card sm:rounded-2xl sm:border">
    <span className="sr-only">Loading campus feed…</span>
    <div className="motion-safe:animate-pulse" aria-hidden="true">
      <div className="flex h-16 items-center gap-3 px-4"><span className="h-9 w-9 rounded-full bg-muted" /><span className="h-3 w-28 rounded-full bg-muted" /></div>
      <div className="aspect-[4/3] max-h-[58dvh] bg-muted" />
      <div className="flex gap-4 px-4 py-4"><span className="h-4 w-4 rounded-full bg-muted" /><span className="h-4 w-4 rounded-full bg-muted" /><span className="ml-auto h-4 w-4 rounded bg-muted" /></div>
    </div>
  </div>;
}

export function CampusCommunityFeed() {
  const { installed, installBusy, installApp } = useInstallPrompt();
  const { user, loading: authLoading, registrationAccess } = useAuth();
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
  const [previewFailed, setPreviewFailed] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadStage, setUploadStage] = useState('');
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [reportReason, setReportReason] = useState('spam');
  const [reportDetails, setReportDetails] = useState('');
  const [reporting, setReporting] = useState(false);
  const [selectedScope, setSelectedScope] = useState<FeedScope | null>(null);
  const [linkedPostId, setLinkedPostId] = useState<string | null>(null);
  const [linkedPostMissing, setLinkedPostMissing] = useState(false);
  const [dataKey, setDataKey] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const timelineRef = useRef<HTMLElement>(null);
  const nextPageRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<{ created_at: string; id: string } | null>(null);
  const requestRef = useRef(0);
  const socialRevision = useRef(0);
  const socialChanges = useRef<Record<string, Partial<Record<CommunityMutation, number>>>>({});
  const hasMoreRef = useRef(false);
  const loadingMoreRef = useRef(false);
  const loadingFirstRef = useRef(false);
  const focusedLinkRef = useRef<string | null>(null);
  const uploadLock = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const composerOrigin = useRef<HTMLElement | null>(null);
  const touchOrigin = useRef<{ x: number; y: number } | null>(null);
  const pullReadyRef = useRef(false);

  const canPost = registrationAccess?.can_publish === true;
  const showPostEntry = !authLoading && (!user || canPost);
  const canFollow = Boolean(user && registrationAccess?.allowed && ['student', 'student_vendor', 'external_vendor', 'university_admin'].includes(user.role));
  const universityId = user?.profile?.university_id;
  const hasUniversity = Boolean(universityId);
  const allowedScope = (selectedScope === 'university' && !hasUniversity) || (selectedScope === 'following' && !canFollow) ? null : selectedScope;
  const scope = linkedPostId ? 'all' : allowedScope ?? (hasUniversity ? 'university' : 'all');
  const feedCacheKey = `unieco:community-feed:v2:${user?.id ?? 'guest'}:${scope}:${universityId ?? 'none'}`;
  const viewKey = `${feedCacheKey}:${linkedPostId ?? ''}`;
  const mountedKey = useRef(viewKey);
  mountedKey.current = viewKey;
  const currentView = dataKey === viewKey;
  const visiblePosts = currentView ? posts : [];
  const moments = getCampusMoments(visiblePosts.slice(0, PAGE_SIZE));
  const leadPhoto = visiblePosts[0]?.media_type === 'image' ? visiblePosts[0].id : null;
  const loadingView = loading || !currentView;

  useEffect(() => {
    if (!mediaFile || !canDisplayInline(mediaFile) && !isVideoUploadCandidate(mediaFile)) { setPreviewUrl(null); return; }
    const objectUrl = URL.createObjectURL(mediaFile);
    setPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [mediaFile]);

  const openComposer = useCallback(() => {
    if (authLoading) return;
    if (canPost) {
      composerOrigin.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setPostOpen(true);
    } else if (user) toast.info(registrationAccess?.buyer_restricted ? 'Campus posts are available to sellers.' : 'Your account cannot publish campus posts.');
    else window.location.assign('/signin?next=%2F%3FcreatePost%3D1');
  }, [authLoading, canPost, registrationAccess?.buyer_restricted, user]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!authLoading && params.has('createPost')) {
      if (params.get('createPost') === '1') openComposer();
      params.delete('createPost');
      const query = params.toString();
      window.history.replaceState(window.history.state, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
    }
  }, [authLoading, openComposer]);

  const loadPage = useCallback(async (append = false) => {
    if (append && (loadingMoreRef.current || loadingFirstRef.current || !hasMoreRef.current || !cursorRef.current)) return;
    const requestId = append ? requestRef.current : ++requestRef.current;
    const isCurrent = () => requestId === requestRef.current && mountedKey.current === viewKey;
    if (append) {
      loadingMoreRef.current = true;
      setLoadingMore(true);
    } else {
      loadingFirstRef.current = true;
      loadingMoreRef.current = false;
      setLoadingMore(false);
      setLoading(true);
      setLoadError(false);
      cursorRef.current = null;
    }
    setLoadMoreError(false);
    try {
      const cursor = append ? cursorRef.current : null;
      const args = { p_before_created_at: cursor?.created_at ?? null, p_before_id: cursor?.id ?? null, p_limit: PAGE_SIZE };
      const { data, error } = scope === 'following'
        ? await supabase.rpc('get_campus_community_following_feed', args)
        : await supabase.rpc('get_campus_community_feed', { ...args, p_scope: scope });
      if (error) throw error;
      if (!isCurrent()) return;
      const rows = (data ?? []) as Omit<CommunityPost, 'media_url'>[];
      let linkedPost: Omit<CommunityPost, 'media_url'> | undefined;
      if (!append && linkedPostId && !rows.some((post) => post.id === linkedPostId)) {
        const { data: target, error: targetError } = await supabase.rpc('get_campus_community_post', { p_post_id: linkedPostId });
        if (!isCurrent()) return;
        if (targetError) throw targetError;
        linkedPost = (target ?? [])[0] as typeof linkedPost;
      }
      if (!append) setLinkedPostMissing(Boolean(linkedPostId && !linkedPost && !rows.some((post) => post.id === linkedPostId)));
      const result = pageCampusFeed(rows, PAGE_SIZE, linkedPost);
      const withMedia = (post: Omit<CommunityPost, 'media_url'>) => ({ ...post, media_url: publicMediaUrl(post.media_path) });
      const page = result.entries.map(withMedia);
      setPosts((current) => append ? appendCampusFeed(current, page) : page);
      setDataKey(viewKey);
      if (!append) {
        setShowingCachedPosts(false);
        // Store only public timeline rows, not a linked out-of-scope post or a member’s Follow graph.
        if (scope !== 'following') writeCachedFeed(feedCacheKey, rows.map(withMedia));
      }
      if (page.length) {
        // Social counts are secondary: don't hold the actual feed hostage to this request on slow networks.
        const revision = socialRevision.current;
        void Promise.resolve(supabase.rpc('get_campus_community_post_social_state', { p_post_ids: page.map((post) => post.id) }))
          .then(({ data: socialRows, error: socialError }) => {
            if (socialError || !isCurrent() || !socialRows) return;
            const incoming = Object.fromEntries((socialRows as (CommunitySocialState & { post_id: string })[]).map((item) => [item.post_id, {
              like_count: Number(item.like_count) || 0, comment_count: Number(item.comment_count) || 0,
              liked_by_me: Boolean(item.liked_by_me), bookmarked_by_me: Boolean(item.bookmarked_by_me), following_author: Boolean(item.following_author),
            }]));
            setSocialByPost((current) => {
              const next = { ...current };
              for (const [id, item] of Object.entries(incoming)) {
                const change = socialChanges.current[id];
                const previous = next[id];
                next[id] = !change || !previous ? item : {
                  ...(item),
                  ...((change.like ?? 0) > revision ? { like_count: previous.like_count, liked_by_me: previous.liked_by_me } : {}),
                  ...((change.comment ?? 0) > revision ? { comment_count: previous.comment_count } : {}),
                  ...((change.bookmark ?? 0) > revision ? { bookmarked_by_me: previous.bookmarked_by_me } : {}),
                  ...((change.follow ?? 0) > revision ? { following_author: previous.following_author } : {}),
                };
              }
              return next;
            });
          })
          .catch(() => undefined);
      }
      cursorRef.current = result.cursor;
      hasMoreRef.current = result.hasMore;
      setHasMore(result.hasMore);
      setLoadError(false);
    } catch {
      if (!isCurrent()) return;
      if (append) setLoadMoreError(true);
      else setLoadError(true);
    } finally {
      if (isCurrent()) {
        loadingFirstRef.current = false;
        loadingMoreRef.current = false;
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [feedCacheKey, linkedPostId, scope, viewKey]);

  useEffect(() => {
    const cached = scope === 'following' ? null : readCachedFeed(feedCacheKey);
    setPosts(cached ?? []);
    setDataKey(viewKey);
    setSocialByPost({});
    socialChanges.current = {};
    setShowingCachedPosts(Boolean(cached?.length));
    setHasMore(false);
    hasMoreRef.current = false;
    setLinkedPostMissing(false);
    focusedLinkRef.current = null;
    void loadPage(false);
    return () => { requestRef.current += 1; };
  }, [feedCacheKey, loadPage, scope, viewKey]);

  useEffect(() => {
    const target = nextPageRef.current;
    if (!target || !hasMore || loadingView || loadError || loadMoreError || !('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) void loadPage(true);
    }, { rootMargin: '0px 0px 480px 0px' });
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, loadingView, loadError, loadMoreError, loadPage, posts.length]);

  const focusPost = useCallback((postId: string) => {
    const card = document.getElementById(`campus-post-${postId}`);
    if (!card) return;
    card.focus({ preventScroll: true });
    card.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  }, []);

  useEffect(() => {
    if (!currentView || !linkedPostId || focusedLinkRef.current === linkedPostId || !posts.some((post) => post.id === linkedPostId)) return;
    const frame = requestAnimationFrame(() => {
      focusPost(linkedPostId);
      focusedLinkRef.current = linkedPostId;
    });
    return () => cancelAnimationFrame(frame);
  }, [currentView, focusPost, linkedPostId, posts]);

  const changeScope = (next: FeedScope) => {
    if (next === scope && !linkedPostId) return;
    if (linkedPostId) {
      const url = new URL(window.location.href);
      url.searchParams.delete('post');
      window.history.replaceState(window.history.state, '', url);
      setLinkedPostId(null);
    }
    setSelectedScope(next);
    timelineRef.current?.scrollIntoView({ block: 'start' });
  };

  const refresh = () => {
    if (loadingFirstRef.current) return;
    setRefreshing(true);
    void loadPage(false).finally(() => setRefreshing(false));
  };

  const handleTouchStart = (event: React.TouchEvent) => {
    pullReadyRef.current = false;
    const point = event.touches[0];
    touchOrigin.current = window.scrollY <= 0 && event.touches.length === 1 ? { x: point.clientX, y: point.clientY } : null;
  };

  const handleTouchMove = (event: React.TouchEvent) => {
    const start = touchOrigin.current;
    const point = event.touches[0];
    if (!start || !point) return;
    pullReadyRef.current = window.scrollY <= 0 && event.touches.length === 1 && Math.abs(point.clientX - start.x) < 24 && point.clientY - start.y > 110;
  };

  const handleTouchEnd = () => {
    if (pullReadyRef.current && window.scrollY <= 0) refresh();
    touchOrigin.current = null;
    pullReadyRef.current = false;
  };

  const handleTouchCancel = () => { touchOrigin.current = null; pullReadyRef.current = false; };

  const resetPostForm = () => { setCaption(''); setMediaFile(null); setPreviewFailed(false); setUploadStage(''); setUploadProgress(null); };
  const closePostDialog = (open: boolean) => {
    if (uploadLock.current) return;
    setPostOpen(open);
    if (!open) resetPostForm();
  };

  const submitPost = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (uploadLock.current) return;
    if (!user || !canPost) { toast.error('Sign in with an eligible UniEco account to post.'); return; }
    const trimmedCaption = caption.trim();
    if (!mediaFile && !trimmedCaption) {
      toast.error('Add a caption or attach a file before publishing.');
      return;
    }
    if (mediaFile && mediaFile.size > MAX_ATTACHMENT_BYTES) { toast.error('Attachments can be up to 50 MB.'); return; }
    const isVideo = Boolean(mediaFile && isVideoUploadCandidate(mediaFile));
    const safePreviewExtension = mediaFile && !isVideo ? PREVIEW_MEDIA.get(mediaFile.type) : undefined;
    const previewable = Boolean(mediaFile && safePreviewExtension && canDisplayInline(mediaFile));
    if (trimmedCaption.length > 500) { toast.error('Keep the caption under 500 characters.'); return; }
    let mediaType: 'image' | 'video' | 'file' | 'text' = previewable ? 'image' : mediaFile ? 'file' : 'text';
    let publicPath = previewable ? `${user.id}/${crypto.randomUUID()}.${safePreviewExtension}` : null;
    let attachmentPath: string | null = null;
    let attachmentName: string | null = null;
    uploadLock.current = true;
    setUploading(true);
    setUploadStage(isVideo ? 'Preparing video…' : 'Uploading…');
    setUploadProgress(null);
    let uploadedBucket: 'campus-community' | 'campus-community-files' | null = null;
    let uploadPath: string | null = publicPath;
    let uploadBucket: 'campus-community' | 'campus-community-files' | null = publicPath ? 'campus-community' : null;
    let publicVideoUpload = false;
    let publishAttempted = false;
    let publishRejected = false;
    try {
      let fileToUpload = mediaFile;
      if (mediaFile && isVideo) {
        const mp4 = await withRequestTimeout(VIDEO_PREPARATION_TIMEOUT_MS, async (signal) => {
          const response = await fetch('/api/community/video/prepare', {
            // Send the file bytes directly. iOS Safari can fail to parse large
            // multipart video bodies through Request.formData(), even when the
            // selected QuickTime file itself is valid.
            method: 'POST',
            body: mediaFile,
            headers: {
              'Content-Type': 'application/octet-stream',
              'X-UniEco-Video-Name': encodeURIComponent(mediaFile.name),
            },
            credentials: 'same-origin', signal,
          });
          if (!response.ok) {
            const result = await response.json().catch(() => null) as { error?: string } | null;
            throw new Error(`VIDEO_PREPARE:${result?.error || 'UniEco could not prepare this video for playback.'}`);
          }
          return response.blob();
        });
        if (!mp4.size || mp4.size > MAX_ATTACHMENT_BYTES || mp4.type !== 'video/mp4') {
          throw new Error('VIDEO_PREPARE:This video could not be safely prepared. Try a shorter video.');
        }
        const baseName = safeFileName(mediaFile.name).replace(/\.[^.]*$/, '') || 'campus-video';
        fileToUpload = new File([mp4], `unieco-${baseName}.mp4`, { type: 'video/mp4' });
        if (mp4.size > MAX_PUBLIC_VIDEO_BYTES) {
          throw new Error('VIDEO_PREPARE:This video is too long to publish reliably. Please choose a shorter clip and try again.');
        }
        // A video post must use the same public, range-capable feed-media path
        // as photos. Never silently turn a video into a private attachment:
        // that makes a published post look broken to visitors and other users.
        mediaType = 'video';
        publicPath = `${user.id}/${crypto.randomUUID()}.mp4`;
        uploadPath = publicPath;
        uploadBucket = 'campus-community';
        publicVideoUpload = true;
      } else if (mediaFile && !previewable) {
        attachmentName = safeFileName(mediaFile.name);
      }
      if (fileToUpload && !previewable && !publicVideoUpload) {
        attachmentPath = `${user.id}/${crypto.randomUUID()}`;
        uploadPath = attachmentPath;
        uploadBucket = 'campus-community-files';
      }
      if (fileToUpload && uploadPath && uploadBucket) {
        if (uploadBucket === 'campus-community-files' || publicVideoUpload) {
          setUploadStage(isVideo ? 'Uploading video…' : 'Uploading attachment…');
          setUploadProgress(0);
          try {
            await uploadCommunityMediaResumably(fileToUpload, uploadPath, uploadBucket, setUploadProgress, publicVideoUpload);
          } catch {
            throw new Error('RESUMABLE_UPLOAD:Video upload was interrupted. Check your connection and retry; your post has not been published.');
          }
        } else {
          setUploadStage('Uploading photo…');
          const { error: uploadError } = await supabase.storage.from(uploadBucket).upload(uploadPath, fileToUpload, {
            contentType: fileToUpload.type || 'application/octet-stream',
            cacheControl: '31536000',
            upsert: false,
          });
          if (uploadError) throw uploadError;
        }
        uploadedBucket = uploadBucket;
      }
      setUploadStage('Publishing…');
      setUploadProgress(null);
      publishAttempted = true;
      const { error: postError, status } = await supabase.rpc('create_campus_community_post_with_attachment', {
        p_caption: trimmedCaption,
        p_media_path: publicPath,
        p_media_type: publicPath ? mediaType : null,
        p_attachment_path: attachmentPath,
        p_attachment_name: attachmentName,
        p_attachment_size: fileToUpload && attachmentPath ? fileToUpload.size : null,
      });
      if (postError) {
        publishRejected = status >= 400 && status < 500 && status !== 408;
        throw new Error(postError.message);
      }
      uploadedBucket = null;
      toast.success('Post shared.');
      setPostOpen(false);
      resetPostForm();
      if (scope === 'following' || linkedPostId) changeScope('all');
      else void loadPage(false);
    } catch (error) {
      // If the response was lost after a database commit, deleting the uploaded
      // media would leave a published post without its photo or video.
      if (uploadedBucket && uploadPath && (!publishAttempted || publishRejected)) {
        await supabase.storage.from(uploadedBucket).remove([uploadPath]).catch(() => undefined);
      }
      const message = error instanceof Error ? error.message : '';
      if (publishAttempted && !publishRejected) toast.error('Couldn’t confirm whether the post was shared. Check the feed before trying again.');
      else if (message.includes('hourly posting limit')) toast.error('You have reached the posting limit. Please try again later.');
      else if (message.startsWith('VIDEO_PREPARE:')) toast.error(message.slice('VIDEO_PREPARE:'.length));
      else if (message.startsWith('RESUMABLE_UPLOAD:')) toast.error(message.slice('RESUMABLE_UPLOAD:'.length));
      else if (error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name)) toast.error('Video timed out. Try a shorter clip.');
      else if (message.toLowerCase().includes('storage')) toast.error('Your file could not be uploaded. Check your connection and try again.');
      else toast.error('Couldn’t share this post. Try again.');
    } finally {
      uploadLock.current = false;
      setUploading(false);
      setUploadStage('');
      setUploadProgress(null);
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
  const scopes: { id: FeedScope; label: string }[] = [{ id: 'all', label: 'Across Ghana' }];
  if (hasUniversity) scopes.push({ id: 'university', label: 'My campus' });
  if (canFollow) scopes.push({ id: 'following', label: 'Following' });

  return (
    <div data-campus-feed="social" className="campus-feed-surface min-h-[80dvh] bg-background [--site-header-height:calc(3.5rem+1px)]">
      <SiteHeader feedNavigation={
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" aria-label={`Choose a feed, currently ${scopes.find(item => item.id === scope)?.label ?? 'Across Ghana'}`}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-foreground focus-visible:ring-2 focus-visible:ring-ring">
              <span className="font-display text-[1.65rem] font-bold leading-none tracking-[-.075em]">UniEco</span>
              <ChevronDown className="h-4 w-4 shrink-0" strokeWidth={1.85} aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="campus-feed-surface z-[60] min-w-48 rounded-xl border-border bg-popover p-1.5">
            <DropdownMenuRadioGroup value={scope} onValueChange={value => changeScope(value as FeedScope)} aria-label="Choose a feed">
              {scopes.map(item => <DropdownMenuRadioItem key={item.id} value={item.id} className="min-h-11">{item.label}</DropdownMenuRadioItem>)}
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={refresh} disabled={refreshing || loadingView} className="min-h-11 gap-2"><RefreshCw className="h-4 w-4" aria-hidden="true" /> Refresh feed</DropdownMenuItem>
            {user && <DropdownMenuItem asChild className="min-h-11 gap-2"><Link href="/community/saved"><Bookmark className="h-4 w-4" aria-hidden="true" /> Saved posts</Link></DropdownMenuItem>}
            {!installed && <DropdownMenuItem disabled={installBusy} onSelect={() => void installApp()} className="min-h-11 gap-2"><Download className="h-4 w-4" aria-hidden="true" /> Install UniEco app</DropdownMenuItem>}
          </DropdownMenuContent>
        </DropdownMenu>
      } />
      <main id="main-content" onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd} onTouchCancel={handleTouchCancel}>
      <Suspense fallback={null}><FeedPostLocation onChange={setLinkedPostId} /></Suspense>
      <div className="mx-auto grid w-full max-w-[77rem] sm:px-6 lg:grid-cols-[minmax(9rem,13rem)_minmax(0,36rem)] lg:justify-center lg:gap-10 xl:grid-cols-[minmax(10rem,13rem)_minmax(0,36rem)_minmax(13rem,16rem)]">
        <aside className="hidden lg:block" aria-label="Explore UniEco">
          <div className="sticky top-14 border-r border-border/70 py-5 pr-4">
            <nav className="space-y-1" aria-label="Campus navigation">
              <FeedRailLink href="/" icon={Home} current>Home</FeedRailLink>
              <FeedRailLink href="/search" icon={Search}>Search</FeedRailLink>
              {showPostEntry && <button type="button" onClick={openComposer} className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-semibold hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"><SquarePlus className="h-[22px] w-[22px]" strokeWidth={1.8} aria-hidden="true" /> Create</button>}
              <FeedRailLink href="/marketplace" icon={ShoppingBag}>Marketplace</FeedRailLink>
              <FeedRailLink href="/campus-mate" icon={MapPin}>Campus Mate</FeedRailLink>
              <FeedRailLink href="/universities" icon={Building2}>Universities</FeedRailLink>
              <FeedRailLink href="/updates" icon={Newspaper}>Updates</FeedRailLink>
              <FeedRailLink href="/events" icon={CalendarDays}>Events</FeedRailLink>
              {user && <FeedRailLink href="/community/saved" icon={Bookmark}>Saved posts</FeedRailLink>}
            </nav>
          </div>
        </aside>

        <section ref={timelineRef} className="mx-auto w-full min-w-0 max-w-[36rem] scroll-mt-[var(--site-header-height)]" aria-labelledby="campus-community-heading">
          <h1 id="campus-community-heading" className="sr-only">Campus feed</h1>
          <section aria-label="Campus moments" className="border-b border-border/70">
            <div className="flex snap-x gap-2 overflow-x-auto px-3 pb-3 pt-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:gap-3 sm:px-2">
              {showPostEntry && <button type="button" onClick={openComposer} aria-label="Create a campus post"
                className="group flex w-[4.75rem] shrink-0 snap-start flex-col items-center gap-1.5 rounded-lg text-center text-[11px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
                <span className="relative block h-16 w-16 rounded-full p-0.5">
                  <Avatar className="h-full w-full border border-border">
                    {user?.profile?.avatar_url && <AvatarImage src={getPublicAvatarUrl(user.profile.avatar_url)} alt="" />}
                    <AvatarFallback className="bg-muted text-sm font-bold text-foreground">{user ? initials(user.profile?.public_nickname || 'You') : <ImagePlus className="h-5 w-5" />}</AvatarFallback>
                  </Avatar>
                  <span className="absolute bottom-0 right-0 grid h-5 w-5 place-items-center rounded-full bg-foreground text-background ring-2 ring-background"><Plus className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" /></span>
                </span>
                <span className="w-full truncate">Your moment</span>
              </button>}
              {moments.map(post => <button key={post.id} type="button" onClick={() => focusPost(post.id)}
                aria-label={`View ${post.author_name}’s ${post.media_type === 'image' ? 'photo' : 'video'} in the feed`}
                className="group flex w-[4.75rem] shrink-0 snap-start flex-col items-center gap-1.5 rounded-lg text-center text-[11px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
                <span className="relative block h-16 w-16 rounded-full bg-[conic-gradient(from_205deg,#e2a139,#e65e59,#b6378e,#e2a139)] p-[2px]">
                  <span className="relative block h-full w-full overflow-hidden rounded-full border-2 border-background bg-muted">
                    {post.media_url && post.media_type === 'image' ? <img src={post.media_url} alt="" loading="lazy" className="h-full w-full object-cover" />
                      : <Avatar className="h-full w-full"><AvatarImage src={getPublicAvatarUrl(post.author_avatar_url)} alt="" loading="lazy" /><AvatarFallback className="bg-muted text-sm font-bold">{initials(post.author_name)}</AvatarFallback></Avatar>}
                    {post.media_type === 'video' && <span className="absolute inset-0 grid place-items-center bg-black/15 text-white"><Play className="h-4 w-4 fill-current drop-shadow" aria-hidden="true" /></span>}
                  </span>
                </span>
                <span className="w-full truncate px-0.5">{post.author_name.split(/\s+/)[0]}</span>
              </button>)}
              {!showPostEntry && !moments.length && loadingView && [0,1,2,3].map(index => <span key={index} aria-hidden="true" className="h-16 w-16 shrink-0 rounded-full bg-muted motion-safe:animate-pulse" />)}
              {!moments.length && !loadingView && <p className="my-auto px-2 text-xs text-muted-foreground">Campus moments will appear here.</p>}
            </div>
          </section>

          <div className="space-y-2 sm:space-y-4">
            {(showingCachedPosts || loadError) && visiblePosts.length > 0 && <div className="flex items-center justify-between gap-2 bg-muted/70 px-4 py-2 text-xs text-muted-foreground sm:rounded-xl" role="status">
              <span>{loadError ? 'Couldn’t refresh. Showing recent posts.' : 'Refreshing recent posts…'}</span>
              {loadError && <button type="button" onClick={refresh} className="min-h-11 shrink-0 px-2 font-semibold text-primary">Retry</button>}
            </div>}
            {linkedPostMissing && <p className="bg-muted/70 px-4 py-3 text-sm text-muted-foreground sm:rounded-xl" role="status">That post is no longer available.</p>}
            {loadingView && !visiblePosts.length ? <FeedSkeleton />
              : loadError && !visiblePosts.length ? <div className="flex min-h-52 flex-col items-center justify-center gap-2 bg-card px-5 text-center sm:rounded-2xl sm:border">
                <CircleAlert className="h-7 w-7 text-muted-foreground" /><h2 className="font-semibold">Couldn’t load the feed</h2>
                <Button variant="outline" onClick={refresh} className="mt-2 min-h-11 rounded-full">Try again</Button>
              </div>
              : !visiblePosts.length ? <div className="flex min-h-56 flex-col items-center justify-center gap-2 bg-card px-5 text-center sm:rounded-2xl sm:border">
                <span className="grid h-12 w-12 place-items-center rounded-full bg-primary/10 text-primary">{scope === 'following' ? <UsersRound className="h-6 w-6" /> : <ImagePlus className="h-6 w-6" />}</span>
                <h2 className="mt-1 text-lg font-bold">{scope === 'following' ? 'Nothing from your follows yet' : 'No posts here yet'}</h2>
                <p className="max-w-xs text-sm leading-6 text-muted-foreground">{scope === 'following' ? 'Find people in Across Ghana and follow the ones you’d like to see here.' : showPostEntry ? 'Share a moment, or see what’s happening across Ghana.' : 'Check back for new campus posts.'}</p>
                {scope !== 'all' ? <Button type="button" variant="outline" className="mt-2 min-h-11 rounded-full" onClick={() => changeScope('all')}>Browse Across Ghana</Button>
                  : showPostEntry && <Button type="button" onClick={openComposer} className="mt-2 min-h-11 rounded-full">Create a post</Button>}
              </div>
              : visiblePosts.map((post) => <CommunityPostCard key={post.id} post={post} priority={leadPhoto === post.id}
                socialState={socialByPost[post.id] ?? (scope === 'following' && post.id !== linkedPostId ? followingSocialState : emptyCommunitySocialState)}
                onSocialChange={(next, kind) => {
                  if (mountedKey.current !== viewKey) return;
                  const revision = ++socialRevision.current;
                  socialChanges.current[post.id] = { ...socialChanges.current[post.id], [kind]: revision };
                  if (kind === 'follow') for (const entry of posts) {
                    if (entry.author_id === post.author_id) socialChanges.current[entry.id] = { ...socialChanges.current[entry.id], follow: revision };
                  }
                  setSocialByPost((current) => {
                    const updated = { ...current, [post.id]: next };
                    if (kind === 'follow') for (const entry of posts) {
                      if (entry.author_id === post.author_id && entry.id !== post.id) updated[entry.id] = { ...emptyCommunitySocialState, ...updated[entry.id], following_author: next.following_author };
                    }
                    return updated;
                  });
                  if (kind === 'follow' && scope === 'following' && !next.following_author) setPosts((current) => current.filter((item) => item.author_id !== post.author_id));
                }}
                onReport={() => handleReportClick(post)}
                onDelete={() => {
                  const remaining = posts.filter((item) => item.id !== post.id);
                  setPosts(remaining);
                  setSocialByPost((current) => { const next = { ...current }; delete next[post.id]; return next; });
                  if (scope !== 'following' && !linkedPostId) writeCachedFeed(feedCacheKey, remaining.slice(0, PAGE_SIZE));
                  if (linkedPostId === post.id) setLinkedPostMissing(true);
                }} />)}
            {hasMore && !loadError && <div ref={nextPageRef} className="py-5 text-center text-sm text-muted-foreground">
              {loadingMore ? <p role="status" className="flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 motion-safe:animate-spin" />Loading more…</p>
                : <Button type="button" variant="outline" onClick={() => void loadPage(true)} className="min-h-11 rounded-full">{loadMoreError ? 'Retry loading more' : 'Load more posts'}</Button>}
            </div>}
            {!hasMore && !loadError && visiblePosts.length > 0 && <div className="flex items-center justify-center gap-2 px-4 py-6 text-xs font-medium text-muted-foreground"><CheckCircle2 className="h-4 w-4 text-primary" />You’re all caught up.</div>}
          </div>
        </section>

        <aside className="hidden xl:block" aria-label="More from UniEco">
          <div className="sticky top-24 space-y-4">
            <div className="rounded-2xl border border-border bg-card px-4 py-5">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary"><MapPin className="h-5 w-5" /></span>
              <h2 className="mt-3 text-base font-bold">Your campus, your people</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{hasUniversity ? 'See what members at your school are sharing.' : 'Choose your school in your profile to see a feed just for your campus.'}</p>
              {hasUniversity ? <button type="button" onClick={() => changeScope('university')} className="mt-1 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-primary hover:underline">View My campus <ArrowUpRight className="h-4 w-4" /></button>
                : <Link href={user ? '/profile' : '/signup'} className="mt-1 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-primary hover:underline">{user ? 'Choose your school' : 'Join UniEco'} <ArrowUpRight className="h-4 w-4" /></Link>}
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 px-2 text-xs leading-6 text-muted-foreground">
              <Link href="/privacy-policy" className="hover:text-foreground hover:underline">Privacy</Link><Link href="/terms-of-service" className="hover:text-foreground hover:underline">Terms</Link>
              <span className="w-full">UniEco Ghana</span>
            </div>
          </div>
        </aside>
      </div>

      </main>
      <Dialog open={postOpen && canPost} onOpenChange={closePostDialog}>
        <DialogContent onCloseAutoFocus={(event) => { if (composerOrigin.current?.isConnected) { event.preventDefault(); composerOrigin.current.focus(); } }}
          onOpenAutoFocus={(event) => { event.preventDefault(); if (event.currentTarget instanceof HTMLElement) event.currentTarget.focus(); }}
          showCloseButton={false} data-campus-feed-composer
          className="campus-feed-surface max-h-[min(92dvh,48rem)] w-[calc(100vw-1rem)] gap-0 overflow-y-auto rounded-2xl p-0 max-sm:!bottom-0 max-sm:!left-0 max-sm:!top-auto max-sm:!w-full max-sm:!max-w-none max-sm:!translate-x-0 max-sm:!translate-y-0 max-sm:!rounded-b-none sm:max-w-lg sm:p-0">
          <div className="sticky top-0 z-10 grid min-h-14 grid-cols-[1fr_auto_1fr] items-center border-b border-border bg-background px-3">
            <button type="button" disabled={uploading} aria-label="Close new post" onClick={() => closePostDialog(false)} className="grid h-11 w-11 place-items-center rounded-md focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-45"><X className="h-6 w-6" /></button>
            <DialogTitle className="text-base">New post</DialogTitle>
            <button type="submit" form="campus-post-form" disabled={uploading || (!mediaFile && !caption.trim())} className="min-h-11 rounded-md px-2 text-sm font-bold text-primary justify-self-end focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-45">{uploading ? 'Posting…' : 'Share'}</button>
          </div>
          <DialogDescription className="sr-only">Share a campus moment.</DialogDescription>
          <form id="campus-post-form" onSubmit={submitPost} className="space-y-4 px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]" aria-busy={uploading}>
            <div>
              <input ref={fileInputRef} id="community-media" type="file" accept="image/*,video/*,.mov,.m4v,.qt,.ogv,.ogg,.avi,.mkv,.3gp,.3g2,.mpeg,.mpg,.mts,.m2ts,.ts,.vob,.wmv,.asf,.flv,.f4v,.mxf,.rm,.rmvb,.amv"
                disabled={uploading} onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (!file) return;
                  if (!file.size || file.size > MAX_ATTACHMENT_BYTES) { toast.error('Choose a photo or video up to 50 MB.'); return; }
                  setPreviewFailed(false);
                  setMediaFile(file);
                }} className="peer sr-only" />
              {!mediaFile ? <label htmlFor="community-media" className="flex min-h-36 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg bg-muted px-3 py-5 text-center transition hover:opacity-80 peer-focus-visible:ring-2 peer-focus-visible:ring-ring">
                <span className="mb-1 grid h-10 w-10 place-items-center"><ImagePlus className="h-7 w-7" /></span>
                <span className="text-sm font-semibold">Add a photo or video</span><span className="text-xs text-muted-foreground">Up to 50 MB</span>
              </label> : <div className="overflow-hidden rounded-2xl border border-border peer-focus-visible:ring-2 peer-focus-visible:ring-ring">
                {previewUrl && !previewFailed && (selectedVideo ? <div className="campus-video-frame mx-auto max-w-[min(100%,32svh)] bg-neutral-950">
                  <video key={previewUrl} src={previewUrl} controls playsInline muted preload="metadata" aria-label="Preview of your video in the feed" onError={() => setPreviewFailed(true)} />
                </div>
                  : mediaFile.type.startsWith('image/') && <img src={previewUrl} alt="Preview of your photo" onError={() => setPreviewFailed(true)} className="block max-h-[34dvh] w-full bg-muted object-contain" />)}
                <div className="flex min-w-0 items-center gap-2 bg-muted/40 p-2 pl-3">
                  {selectedVideo ? <Film className="h-[18px] w-[18px] shrink-0 text-primary" /> : <FileText className="h-[18px] w-[18px] shrink-0 text-primary" />}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold" title={mediaFile.name}>{mediaFile.name}</p><p className="text-xs text-muted-foreground">{readableSize(mediaFile.size)}</p>
                  </div>
                  {!uploading && <><label htmlFor="community-media" className="inline-flex min-h-11 cursor-pointer items-center px-1.5 text-xs font-semibold text-primary hover:underline">Change</label>
                    <button type="button" aria-label="Remove selected file" onClick={() => { if (fileInputRef.current) fileInputRef.current.value = ''; setMediaFile(null); setPreviewFailed(false); }} className="grid h-11 w-11 shrink-0 place-items-center rounded-full hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"><X className="h-4 w-4" /></button></>}
                </div>
                {!selectedVideo && !canDisplayInline(mediaFile) && <p className="px-3 py-2 text-xs text-muted-foreground">This file will be shared as an attachment.</p>}
              </div>}
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-semibold" htmlFor="community-caption">Caption</label>
              <Textarea id="community-caption" value={caption} onChange={(event) => setCaption(event.target.value.slice(0, 500))} maxLength={500} rows={3} placeholder="Write a caption…" disabled={uploading} className="resize-none rounded-xl text-base sm:text-sm" />
              <p className="flex justify-between text-xs text-muted-foreground"><span>Public post</span><span>{caption.length}/500</span></p>
            </div>
            {uploading && <div className="space-y-1.5" role="status" aria-live="polite">
              <div className="flex justify-between text-xs font-medium text-muted-foreground"><span>{uploadStage || 'Posting…'}</span>{uploadProgress !== null && <span>{uploadProgress}%</span>}</div>
              {uploadProgress !== null && <progress max={100} value={uploadProgress} aria-label="Upload progress" className="block h-2 w-full overflow-hidden rounded-full accent-primary" />}
            </div>}
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(reportPost)} onOpenChange={(open) => { if (!open && !reporting) setReportPost(null); }}>
        <DialogContent className="campus-feed-surface sm:max-w-lg">
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

export function CommunityPostCard({ post, priority = false, socialState = emptyCommunitySocialState, onSocialChange, onReport, onDelete }: {
  post: CommunityPost;
  priority?: boolean;
  socialState?: CommunitySocialState;
  onSocialChange?: (state: CommunitySocialState, kind: CommunityMutation) => void;
  onReport?: () => void;
  onDelete?: () => void;
}) {
  const { user } = useAuth();
  const avatar = getPublicAvatarUrl(post.author_avatar_url);
  const memberHref = `/community/member/${post.author_id}`;

  return (
    <article id={`campus-post-${post.id}`} data-post-id={post.id} tabIndex={-1} aria-label={`Post by ${post.author_name}`}
      className="campus-feed-surface scroll-mt-[var(--site-header-height,4rem)] overflow-hidden border-b border-border/75 bg-background focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
      <CommunityPostActions postId={post.id} authorId={post.author_id} authorName={post.author_name} caption={post.caption} textOnly={post.media_type === 'text'}
        initialState={socialState} onStateChange={onSocialChange} onReport={onReport} onDelete={onDelete}
        postDate={<time className="block text-[11px] text-muted-foreground" dateTime={post.created_at} title={new Intl.DateTimeFormat('en-GH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(post.created_at))}>{formatFeedTimestamp(post.created_at)}</time>}
        renderHeader={(menu) => (
          <header className="flex min-h-14 items-center gap-2.5 px-3 py-1">
            <Link href={memberHref} aria-label={`View ${post.author_name}’s profile`} className="shrink-0 rounded-full focus-visible:ring-2 focus-visible:ring-ring">
              <Avatar className="h-8 w-8 border border-border">
                {avatar && <AvatarImage src={avatar} alt="" />}
                <AvatarFallback className="bg-primary/10 text-sm font-bold text-primary">{initials(post.author_name)}</AvatarFallback>
              </Avatar>
            </Link>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-baseline gap-1.5">
                <Link href={memberHref} className="truncate text-sm font-bold hover:underline">{post.author_name}</Link>
              </div>
              {post.university_name && post.university_slug ? <Link href={`/university/${post.university_slug}`} className="block truncate text-xs text-muted-foreground hover:text-foreground hover:underline">{post.university_name}</Link>
                : <p className="truncate text-xs text-muted-foreground">{post.university_name || friendlyRole(post.author_role)}</p>}
            </div>
            {menu}
          </header>
        )}
        renderMedia={(onLike) => <CampusPostMedia key={`${post.id}:${user?.id ?? 'guest'}`} post={post} viewerId={user?.id ?? null} priority={priority} onLike={onLike} />}
      />
    </article>
  );
}
