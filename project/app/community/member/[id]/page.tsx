'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ArrowUpRight, Loader2, MapPin, UserRoundCheck, UserRoundPlus } from 'lucide-react';
import { toast } from 'sonner';
import { SiteHeader } from '@/components/layout/site-header';
import { Button } from '@/components/ui/button';
import { CommunityPostCard, publicMediaUrl, type CommunityPost } from '@/components/feed/campus-community-feed';
import { type CommunitySocialState, emptyCommunitySocialState } from '@/components/feed/community-post-actions';
import { useAuth } from '@/lib/auth/auth-context';
import { supabase } from '@/lib/supabase/client';

type MemberProfile = {
  id: string; display_name: string; avatar_url: string | null; bio: string | null;
  role: string; university_name: string | null; university_slug: string | null;
  verified_student: boolean; verified_vendor: boolean; post_count: number;
  follower_count: number; following_count: number; is_following: boolean;
};

const PAGE_SIZE = 8;

export default function CommunityMemberPage() {
  const params = useParams<{ id: string }>();
  const memberId = Array.isArray(params.id) ? params.id[0] : params.id;
  const { user } = useAuth();
  const [profile, setProfile] = useState<MemberProfile | null>(null);
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [social, setSocial] = useState<Record<string, CommunitySocialState>>({});
  const [loading, setLoading] = useState(true);
  const [moreLoading, setMoreLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [failed, setFailed] = useState(false);
  const [following, setFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const cursorRef = useRef<{ created_at: string; id: string } | null>(null);
  const requestGenerationRef = useRef(0);

  const loadPosts = useCallback(async (append = false) => {
    const generation = requestGenerationRef.current;
    const cursor = append ? cursorRef.current : null;
    if (append) setMoreLoading(true); else setLoading(true);
    setFailed(false);
    try {
      const { data, error } = await supabase.rpc('get_campus_community_member_posts', {
        p_user_id: memberId,
        p_before_created_at: cursor?.created_at ?? null,
        p_before_id: cursor?.id ?? null,
        p_limit: PAGE_SIZE,
      });
      if (error) throw error;
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
      if (generation !== requestGenerationRef.current) return;
      setFailed(true);
      if (!append) { setProfile(null); setPosts([]); }
    } finally {
      if (generation === requestGenerationRef.current) {
        setLoading(false);
        setMoreLoading(false);
      }
    }
  }, [memberId]);

  const loadProfile = useCallback(async () => {
    const generation = requestGenerationRef.current;
    try {
      const { data, error } = await supabase.rpc('get_campus_community_member_profile', { p_user_id: memberId });
      if (error) throw error;
      if (generation !== requestGenerationRef.current) return;
      const found = ((data || []) as MemberProfile[])[0] ?? null;
      setProfile(found);
      setFollowing(Boolean(found?.is_following));
    } catch {
      if (generation !== requestGenerationRef.current) return;
      setProfile(null);
      setFailed(true);
    }
  }, [memberId]);

  useEffect(() => {
    requestGenerationRef.current += 1;
    setPosts([]);
    setSocial({});
    setProfile(null);
    setFailed(false);
    setFollowing(false);
    setFollowBusy(false);
    cursorRef.current = null;
    void loadProfile();
    void loadPosts(false);
  }, [loadProfile, loadPosts]);

  const toggleFollow = async () => {
    if (!user) { window.location.assign(`/signin?next=${encodeURIComponent(`/community/member/${memberId}`)}`); return; }
    if (!['student', 'student_vendor', 'external_vendor'].includes(user.role)) { toast.error('An active student or vendor account is needed to follow members.'); return; }
    if (!profile || user.id === profile.id || followBusy) return;
    const requestGeneration = requestGenerationRef.current;
    const previousFollowing = following;
    const previousProfile = profile;
    const next = !following;
    setFollowing(next);
    setFollowBusy(true);
    setProfile((current) => current ? { ...current, is_following: next, follower_count: Math.max(0, current.follower_count + (next ? 1 : -1)) } : current);
    setSocial((current) => Object.fromEntries(Object.entries(current).map(([postId, state]) => [postId, { ...state, following_author: next }])));
    try {
      const { error } = await supabase.rpc('set_campus_community_follow', { p_following_id: memberId, p_following: next });
      if (error) throw error;
    } catch {
      if (requestGeneration === requestGenerationRef.current) {
        setFollowing(previousFollowing);
        setProfile(previousProfile);
        setSocial((current) => Object.fromEntries(Object.entries(current).map(([postId, state]) => [postId, { ...state, following_author: previousFollowing }])));
      }
      toast.error('Could not update this follow. Please try again.');
    } finally {
      if (requestGeneration === requestGenerationRef.current) setFollowBusy(false);
    }
  };

  return <>
    <SiteHeader />
    <main id="main-content" className="min-h-[calc(100dvh-4rem)] bg-slate-50 px-3 pb-24 pt-5 sm:px-6 lg:pb-10">
      <div className="mx-auto max-w-2xl">
        <Link href="/" className="inline-flex min-h-10 items-center gap-2 rounded-full px-3 text-sm font-semibold text-slate-600 hover:bg-white hover:text-emerald-800"><ArrowLeft className="h-4 w-4" />Back to campus feed</Link>
        {profile && <section className="mt-3 rounded-2xl border bg-white p-5 shadow-sm sm:p-7">
          <div className="flex items-start gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-emerald-100 text-xl font-bold text-emerald-800">{profile.avatar_url ? <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" /> : profile.display_name.slice(0, 1).toUpperCase()}</div>
            <div className="min-w-0 flex-1"><h1 className="truncate text-xl font-bold text-slate-900">{profile.display_name}</h1><p className="mt-1 text-sm text-slate-600">{profile.role.replaceAll('_', ' ')}</p>{profile.university_name && <p className="mt-2 flex items-center gap-1 text-sm text-slate-600"><MapPin className="h-4 w-4 shrink-0 text-emerald-700" />{profile.university_name}</p>}</div>
          </div>
          {profile.bio && <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-700">{profile.bio}</p>}
          {(profile.verified_student || profile.verified_vendor) && <p className="mt-3 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800"><UserRoundCheck className="h-3.5 w-3.5" />UniEco verified {profile.verified_vendor ? 'vendor' : 'student'}</p>}
          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-600"><span><b className="text-slate-900">{profile.post_count}</b> posts</span><span><b className="text-slate-900">{profile.follower_count}</b> followers</span><span><b className="text-slate-900">{profile.following_count}</b> following</span></div>
          {user?.id !== profile.id && <Button type="button" onClick={() => void toggleFollow()} disabled={followBusy} className={`mt-4 min-h-11 rounded-full px-5 ${following ? 'bg-slate-100 text-slate-800 hover:bg-slate-200' : 'bg-emerald-700 hover:bg-emerald-800'}`}>{followBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : following ? <><UserRoundCheck className="mr-2 h-4 w-4" />Following</> : <><UserRoundPlus className="mr-2 h-4 w-4" />Follow</>}</Button>}
          {profile.university_slug && <Link href={`/university/${profile.university_slug}`} className="ml-2 inline-flex min-h-11 items-center gap-1 rounded-full px-3 text-sm font-semibold text-emerald-800 hover:bg-emerald-50">Campus page<ArrowUpRight className="h-4 w-4" /></Link>}
        </section>}
        <h2 className="mb-3 mt-6 text-lg font-bold text-slate-900">Campus posts</h2>
        {loading ? <div className="flex min-h-36 items-center justify-center rounded-2xl border bg-white text-sm text-slate-500"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading profile…</div>
          : failed && !profile ? <div className="rounded-2xl border bg-white p-7 text-center"><p className="font-semibold text-slate-800">This member profile is unavailable.</p><p className="mt-1 text-sm text-slate-500">The account may be inactive or temporarily inaccessible.</p><Button variant="outline" onClick={() => { void loadProfile(); void loadPosts(false); }} className="mt-4 min-h-11 rounded-full">Try again</Button></div>
            : posts.length === 0 ? <div className="rounded-2xl border bg-white p-8 text-center text-sm text-slate-500">No public campus posts yet.</div>
              : <div className="space-y-4">{posts.map((post) => <CommunityPostCard key={post.id} post={post} socialState={social[post.id] ?? emptyCommunitySocialState} onSocialChange={(next) => setSocial((current) => ({ ...current, [post.id]: next }))} />)}
                {hasMore && <Button type="button" variant="outline" disabled={moreLoading} onClick={() => void loadPosts(true)} className="min-h-11 w-full rounded-xl">{moreLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading…</> : 'Load more posts'}</Button>}
              </div>}
      </div>
    </main>
  </>;
}
