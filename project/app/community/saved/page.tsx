'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Bookmark, Loader2 } from 'lucide-react';
import { SiteHeader } from '@/components/layout/site-header';
import { Button } from '@/components/ui/button';
import { CommunityPostCard, publicMediaUrl, type CommunityPost } from '@/components/feed/campus-community-feed';
import { type CommunitySocialState, emptyCommunitySocialState } from '@/components/feed/community-post-actions';
import { useAuth } from '@/lib/auth/auth-context';
import { supabase } from '@/lib/supabase/client';

const PAGE_SIZE = 8;

export default function SavedCommunityPostsPage() {
  const { user, loading: authLoading } = useAuth();
  const userId = user?.id;
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [social, setSocial] = useState<Record<string, CommunitySocialState>>({});
  const [loading, setLoading] = useState(true);
  const [moreLoading, setMoreLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState(false);
  const cursorRef = useRef<{ created_at: string; id: string } | null>(null);
  const requestGenerationRef = useRef(0);

  const load = useCallback(async (append = false) => {
    if (!userId) return;
    const generation = requestGenerationRef.current;
    if (!append) cursorRef.current = null;
    const cursor = append ? cursorRef.current : null;
    setError(false);
    if (append) setMoreLoading(true); else setLoading(true);
    try {
      const { data, error: queryError } = await supabase.rpc('get_campus_community_saved_posts', {
        p_before_created_at: cursor?.created_at ?? null,
        p_before_id: cursor?.id ?? null,
        p_limit: PAGE_SIZE,
      });
      if (queryError) throw queryError;
      if (generation !== requestGenerationRef.current) return;
      const page = ((data || []) as Omit<CommunityPost, 'media_url'>[]).map((post) => ({ ...post, media_url: publicMediaUrl(post.media_path) }));
      setPosts((current) => append ? [...current, ...page] : page);
      if (page.length) cursorRef.current = { created_at: page[page.length - 1].created_at, id: page[page.length - 1].id };
      setHasMore(page.length === PAGE_SIZE);
      if (page.length) {
        const { data: states } = await supabase.rpc('get_campus_community_post_social_state', { p_post_ids: page.map((post) => post.id) });
        if (generation !== requestGenerationRef.current) return;
        if (states) setSocial((current) => ({ ...current, ...Object.fromEntries((states as (CommunitySocialState & { post_id: string })[]).map((row) => [row.post_id, {
          like_count: Number(row.like_count) || 0, comment_count: Number(row.comment_count) || 0,
          liked_by_me: Boolean(row.liked_by_me), bookmarked_by_me: Boolean(row.bookmarked_by_me), following_author: Boolean(row.following_author),
        }])) }));
      }
    } catch {
      if (generation === requestGenerationRef.current) setError(true);
    } finally {
      if (generation === requestGenerationRef.current) {
        setLoading(false);
        setMoreLoading(false);
      }
    }
  }, [userId]);

  useEffect(() => {
    if (authLoading) return;
    requestGenerationRef.current += 1;
    if (!userId) { setLoading(false); window.location.assign(`/signin?next=${encodeURIComponent('/community/saved')}`); return; }
    setPosts([]);
    setSocial({});
    cursorRef.current = null;
    void load(false);
  }, [authLoading, userId, load]);

  return <>
    <SiteHeader />
    <main id="main-content" className="min-h-[calc(100dvh-4rem)] bg-slate-50 px-3 pb-24 pt-5 sm:px-6 lg:pb-10">
      <div className="mx-auto max-w-2xl">
        <Link href="/" className="inline-flex min-h-10 items-center gap-2 rounded-full px-3 text-sm font-semibold text-slate-600 hover:bg-white hover:text-emerald-800"><ArrowLeft className="h-4 w-4" />Back to campus feed</Link>
        <header className="mb-5 mt-3 flex items-center gap-3 rounded-2xl border bg-white p-5 shadow-sm"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-800"><Bookmark className="h-5 w-5" /></div><div><h1 className="text-xl font-bold text-slate-900">Saved campus posts</h1><p className="mt-1 text-sm text-slate-600">Posts you saved for later.</p></div></header>
        {loading ? <div className="flex min-h-36 items-center justify-center rounded-2xl border bg-white text-sm text-slate-500"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading saved posts…</div>
          : error ? <div className="rounded-2xl border bg-white p-7 text-center"><p className="font-semibold text-slate-800">Saved posts could not be loaded.</p><p className="mt-1 text-sm text-slate-500">Your saved posts are safe. Please try again.</p><Button variant="outline" onClick={() => void load(false)} className="mt-4 min-h-11 rounded-full">Try again</Button></div>
            : posts.length === 0 ? <div className="rounded-2xl border bg-white px-6 py-12 text-center"><Bookmark className="mx-auto h-8 w-8 text-emerald-700" /><h2 className="mt-3 font-semibold text-slate-900">Nothing saved yet</h2><p className="mt-1 text-sm text-slate-500">Use Save on a campus post and it will be here.</p><Button asChild className="mt-4 min-h-11 rounded-full bg-emerald-700 hover:bg-emerald-800"><Link href="/">Browse campus posts</Link></Button></div>
              : <div className="space-y-4">{posts.map((post) => <CommunityPostCard key={post.id} post={post} socialState={social[post.id] ?? { ...emptyCommunitySocialState, bookmarked_by_me: true }} onSocialChange={(next) => { setSocial((current) => ({ ...current, [post.id]: next })); if (!next.bookmarked_by_me) setPosts((current) => current.filter((item) => item.id !== post.id)); }} />)}
                {hasMore && <Button type="button" variant="outline" disabled={moreLoading} onClick={() => void load(true)} className="min-h-11 w-full rounded-xl">{moreLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading…</> : 'Load more saved posts'}</Button>}
              </div>}
      </div>
    </main>
  </>;
}
