'use client';

import { useEffect, useState } from 'react';
import { Bookmark, Heart, Loader2, MessageCircle, Share2, UserRoundPlus, UserRoundCheck, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth/auth-context';
import { copyTextToClipboard } from '@/lib/utils/copy-to-clipboard';

export type CommunitySocialState = {
  like_count: number;
  comment_count: number;
  liked_by_me: boolean;
  bookmarked_by_me: boolean;
  following_author: boolean;
};

export const emptyCommunitySocialState: CommunitySocialState = {
  like_count: 0, comment_count: 0, liked_by_me: false, bookmarked_by_me: false, following_author: false,
};

type CommunityComment = {
  id: string;
  parent_comment_id: string | null;
  author_id: string;
  author_name: string;
  author_avatar_url: string | null;
  author_role: string;
  body: string;
  created_at: string;
  is_mine: boolean;
};

function requireMember(user: ReturnType<typeof useAuth>['user']) {
  if (!user) {
    window.location.assign(`/signin?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
    return false;
  }
  if (!['student', 'student_vendor', 'external_vendor', 'university_admin'].includes(user.role)) {
    toast.error('An active UniEco member account is needed to interact with campus posts.');
    return false;
  }
  return true;
}

export function CommunityPostActions({
  postId, authorId, initialState, onStateChange, onDelete,
}: {
  postId: string;
  authorId: string;
  initialState?: CommunitySocialState;
  onStateChange?: (state: CommunitySocialState) => void;
  onDelete?: () => void;
}) {
  const { user } = useAuth();
  const [state, setState] = useState(initialState ?? emptyCommunitySocialState);
  const [busy, setBusy] = useState<'like' | 'bookmark' | 'follow' | null>(null);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [comments, setComments] = useState<CommunityComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentBody, setCommentBody] = useState('');
  const [replyTo, setReplyTo] = useState<CommunityComment | null>(null);
  const [sendingComment, setSendingComment] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => { setState(initialState ?? emptyCommunitySocialState); }, [initialState]);

  const update = (next: CommunitySocialState) => {
    setState(next);
    onStateChange?.(next);
  };

  const toggle = async (kind: 'like' | 'bookmark' | 'follow') => {
    if (!requireMember(user) || busy) return;
    const key = kind === 'like' ? 'liked_by_me' : kind === 'bookmark' ? 'bookmarked_by_me' : 'following_author';
    const wasSet = state[key];
    const optimistic = { ...state, [key]: !wasSet, ...(kind === 'like' ? { like_count: Math.max(0, state.like_count + (wasSet ? -1 : 1)) } : {}) };
    update(optimistic);
    setBusy(kind);
    try {
      const rpc = kind === 'like' ? 'set_campus_community_post_like'
        : kind === 'bookmark' ? 'set_campus_community_post_bookmark' : 'set_campus_community_follow';
      const args = kind === 'follow'
        ? { p_following_id: authorId, p_following: !wasSet }
        : { p_post_id: postId, [kind === 'like' ? 'p_liked' : 'p_saved']: !wasSet };
      const { error } = await supabase.rpc(rpc, args as never);
      if (error) throw error;
      if (kind === 'bookmark') toast.success(!wasSet ? 'Post saved.' : 'Post removed from saved.');
    } catch {
      update(state);
      const messages = {
        like: wasSet ? 'Your like could not be removed. Please try again.' : 'Your like could not be saved. Please try again.',
        bookmark: wasSet ? 'This post could not be removed from Saved. Please try again.' : 'This post could not be saved. Please try again.',
        follow: wasSet ? 'You could not unfollow this member. Please try again.' : 'You could not follow this member. Please try again.',
      };
      toast.error(messages[kind]);
    } finally {
      setBusy(null);
    }
  };

  const loadComments = async () => {
    setCommentsLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_campus_community_post_comments', { p_post_id: postId, p_limit: 80 });
      if (error) throw error;
      setComments((data || []) as CommunityComment[]);
    } catch {
      toast.error('Comments could not be loaded. Please try again.');
    } finally {
      setCommentsLoading(false);
    }
  };

  const openComments = () => {
    setCommentsOpen(true);
    void loadComments();
  };

  const submitComment = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!requireMember(user) || sendingComment) return;
    const body = commentBody.trim();
    if (!body || body.length > 1000) { toast.error('Write a comment of up to 1,000 characters.'); return; }
    setSendingComment(true);
    try {
      const { error } = await supabase.rpc('create_campus_community_comment', {
        p_post_id: postId, p_body: body, p_parent_comment_id: replyTo?.id ?? null,
      });
      if (error) throw error;
      setCommentBody('');
      setReplyTo(null);
      update({ ...state, comment_count: state.comment_count + 1 });
      await loadComments();
    } catch {
      toast.error('Your comment was not sent. Please check your connection and retry.');
    } finally {
      setSendingComment(false);
    }
  };

  const sharePost = async () => {
    const url = new URL('/', window.location.origin);
    url.searchParams.set('post', postId);
    const shareData = { title: 'Campus community · UniEco Ghana', url: url.toString() };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
        return;
      }
      await copyTextToClipboard(shareData.url);
      toast.success('Post link copied. Share it with your campus community.');
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      try {
        await copyTextToClipboard(shareData.url);
        toast.success('Post link copied. Share it with your campus community.');
      } catch {
        toast.error('Could not share this post. Please copy the page link and try again.');
      }
    }
  };

  const deletePost = async () => {
    if (!user || user.id !== authorId || deleting) return;
    setDeleting(true);
    try {
      const { data, error } = await supabase.rpc('delete_my_campus_community_post_v2', { p_post_id: postId });
      if (error) throw error;
      const result = data as { deleted?: boolean; media_path?: string | null; attachment_path?: string | null } | null;
      if (result?.deleted !== true) {
        toast.error('This post is no longer available to delete. Refresh the feed and try again.');
        return;
      }
      setDeleteOpen(false);
      onDelete?.();
      const cleanup = await Promise.all([
        result.media_path ? supabase.storage.from('campus-community').remove([result.media_path]) : Promise.resolve({ error: null }),
        result.attachment_path ? supabase.storage.from('campus-community-files').remove([result.attachment_path]) : Promise.resolve({ error: null }),
      ]);
      const cleanupFailed = cleanup.some(({ error: cleanupError }) => Boolean(cleanupError));
      if (cleanupFailed) {
        toast.warning('Your post was removed. Its media could not be fully cleared right now; please contact support if it remains visible.');
      } else {
        toast.success('Your post and its media were deleted.');
      }
    } catch (error) {
      const code = (error as { code?: string } | null)?.code;
      if (code === 'PGRST202' || (error instanceof Error && error.message.toLowerCase().includes('delete_my_campus_community_post_v2'))) {
        toast.error('Post deletion needs a database update that has not reached production yet. Please try again after the update is applied.');
      } else {
        toast.error('Your post could not be deleted. Check your connection and try again.');
      }
    } finally {
      setDeleting(false);
    }
  };

  const topLevel = comments.filter((comment) => !comment.parent_comment_id);

  return (
    <>
      {(state.like_count > 0 || state.comment_count > 0) && <p className="px-4 pb-2 text-xs font-medium text-slate-500" aria-live="polite">
        {state.like_count > 0 && <span>{state.like_count} {state.like_count === 1 ? 'like' : 'likes'}</span>}
        {state.like_count > 0 && state.comment_count > 0 && <span aria-hidden="true"> · </span>}
        {state.comment_count > 0 && <span>{state.comment_count} {state.comment_count === 1 ? 'comment' : 'comments'}</span>}
      </p>}
      <div className="flex items-center gap-1 border-t border-slate-100 px-2 py-1.5 sm:px-3" role="group" aria-label="Post actions">
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <Button type="button" variant="ghost" onClick={() => void toggle('like')} disabled={busy === 'like'} aria-label={`${state.liked_by_me ? 'Unlike' : 'Like'} post${state.like_count ? `, ${state.like_count} likes` : ''}`} aria-pressed={state.liked_by_me} className={`min-h-11 min-w-0 flex-1 touch-manipulation gap-1 rounded-lg px-1 text-xs font-semibold sm:gap-2 sm:text-sm ${state.liked_by_me ? 'text-rose-600 hover:bg-rose-50 hover:text-rose-700' : 'text-slate-600 hover:bg-slate-100'}`}>
            {busy === 'like' ? <Loader2 className="h-5 w-5 shrink-0 animate-spin" /> : <Heart className={`h-5 w-5 shrink-0 ${state.liked_by_me ? 'fill-current' : ''}`} />}
            <span>Like</span>
          </Button>
          <Button type="button" variant="ghost" onClick={openComments} aria-label={`Comment on post${state.comment_count ? `, ${state.comment_count} comments` : ''}`} className="min-h-11 min-w-0 flex-1 touch-manipulation gap-1 rounded-lg px-1 text-xs font-semibold text-slate-600 hover:bg-slate-100 sm:gap-2 sm:text-sm">
            <MessageCircle className="h-5 w-5 shrink-0" /><span>Comment</span>
          </Button>
          <Button type="button" variant="ghost" onClick={() => void sharePost()} aria-label="Share post" className="min-h-11 min-w-0 flex-1 touch-manipulation gap-1 rounded-lg px-1 text-xs font-semibold text-slate-600 hover:bg-slate-100 sm:gap-2 sm:text-sm">
            <Share2 className="h-5 w-5 shrink-0" /><span>Share</span>
          </Button>
        </div>
        <Button type="button" variant="ghost" onClick={() => void toggle('bookmark')} disabled={busy === 'bookmark'} aria-label={state.bookmarked_by_me ? 'Remove post from saved' : 'Save post'} aria-pressed={state.bookmarked_by_me} title={state.bookmarked_by_me ? 'Remove from saved' : 'Save post'} className={`h-11 w-11 shrink-0 touch-manipulation rounded-full p-0 ${state.bookmarked_by_me ? 'text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800' : 'text-slate-600 hover:bg-slate-100'}`}>
          {busy === 'bookmark' ? <Loader2 className="h-5 w-5 animate-spin" /> : <Bookmark className={`h-5 w-5 ${state.bookmarked_by_me ? 'fill-current' : ''}`} />}
        </Button>
        {user?.id === authorId && <Button type="button" variant="ghost" onClick={() => setDeleteOpen(true)} aria-label="Delete your post" title="Delete post" className="h-11 w-11 shrink-0 touch-manipulation rounded-full p-0 text-slate-500 hover:bg-rose-50 hover:text-rose-700"><Trash2 className="h-5 w-5" /></Button>}
      </div>
      {user?.id !== authorId && <div className="border-t border-slate-100 px-4 py-2 sm:px-5">
        <button type="button" onClick={() => void toggle('follow')} disabled={busy === 'follow'} aria-pressed={state.following_author} className="inline-flex min-h-10 touch-manipulation items-center gap-2 rounded-full px-3 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-50 disabled:opacity-60">
          {busy === 'follow' ? <Loader2 className="h-4 w-4 animate-spin" /> : state.following_author ? <UserRoundCheck className="h-4 w-4" /> : <UserRoundPlus className="h-4 w-4" />}
          {state.following_author ? 'Following' : 'Follow member'}
        </button>
      </div>}

      <Dialog open={commentsOpen} onOpenChange={(open) => { setCommentsOpen(open); if (!open) setReplyTo(null); }}>
        <DialogContent className="flex max-h-[88dvh] flex-col gap-3 sm:max-w-xl">
          <DialogHeader><DialogTitle>Comments</DialogTitle><DialogDescription>Keep the conversation useful and respectful.</DialogDescription></DialogHeader>
          <div className="min-h-32 flex-1 space-y-3 overflow-y-auto rounded-xl bg-slate-50 p-3" aria-live="polite">
            {commentsLoading ? <p className="flex min-h-20 items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading comments…</p>
              : topLevel.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">No comments yet. Start the conversation.</p>
                : topLevel.map((comment) => <div key={comment.id} className="space-y-2">
                  <div className="rounded-xl bg-white p-3 shadow-sm">
                    <div className="flex items-baseline justify-between gap-2"><span className="truncate text-sm font-semibold">{comment.author_name}</span><time className="shrink-0 text-[11px] text-slate-500" dateTime={comment.created_at}>{new Intl.DateTimeFormat('en-GH', { dateStyle: 'medium' }).format(new Date(comment.created_at))}</time></div>
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-5 text-slate-700">{comment.body}</p>
                    {!comment.is_mine && <button type="button" onClick={() => setReplyTo(comment)} className="mt-2 min-h-9 text-xs font-semibold text-emerald-800">Reply</button>}
                  </div>
                  {comments.filter((reply) => reply.parent_comment_id === comment.id).map((reply) => <div key={reply.id} className="ml-5 rounded-xl border-l-2 border-emerald-200 bg-white p-3">
                    <p className="text-xs font-semibold">{reply.author_name}<span className="ml-2 font-normal text-slate-500">replied</span></p><p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-700">{reply.body}</p>
                  </div>)}
                </div>)}
          </div>
          <form onSubmit={submitComment} className="space-y-2">
            {replyTo && <div className="flex items-center justify-between text-xs text-muted-foreground"><span>Replying to {replyTo.author_name}</span><button type="button" onClick={() => setReplyTo(null)} className="min-h-8 px-2 font-semibold text-emerald-800">Cancel reply</button></div>}
            <Textarea value={commentBody} onChange={(event) => setCommentBody(event.target.value.slice(0, 1000))} maxLength={1000} rows={2} placeholder={replyTo ? 'Write a reply…' : 'Write a comment…'} aria-label={replyTo ? 'Write a reply' : 'Write a comment'} />
            <DialogFooter><Button type="submit" disabled={sendingComment || !commentBody.trim()} className="min-h-11 w-full rounded-xl bg-emerald-700 hover:bg-emerald-800 sm:w-auto">{sendingComment ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Sending…</> : 'Send comment'}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={(open) => { if (!deleting) setDeleteOpen(open); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete this post?</DialogTitle>
            <DialogDescription>This removes the post from the campus feed and permanently deletes its attached media or files. This cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleting} className="min-h-11">Keep post</Button>
            <Button type="button" variant="destructive" onClick={() => void deletePost()} disabled={deleting} className="min-h-11">
              {deleting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Deleting…</> : 'Delete post'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
