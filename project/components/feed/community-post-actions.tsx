'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Bookmark, Flag, Heart, Link2, Loader2, MessageCircle, MoreHorizontal, Send, Trash2, UserRoundPlus, UserRoundCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth/auth-context';
import { copyTextToClipboard } from '@/lib/utils/copy-to-clipboard';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getPublicAvatarUrl } from '@/lib/storage/avatar-url';

export type CommunitySocialState = {
  like_count: number;
  comment_count: number;
  liked_by_me: boolean;
  bookmarked_by_me: boolean;
  following_author: boolean;
};

export type CommunityMutation = 'like' | 'bookmark' | 'follow' | 'comment';

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

function CommentLine({ comment, children }: { comment: CommunityComment; children?: ReactNode }) {
  const avatar = getPublicAvatarUrl(comment.author_avatar_url);
  return (
    <div className="flex items-start gap-2.5 text-sm">
      <Avatar className="h-8 w-8 shrink-0 border border-border">
        {avatar && <AvatarImage src={avatar} alt="" />}
        <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">{comment.author_name.charAt(0).toUpperCase()}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <Link href={`/community/member/${comment.author_id}`} className="break-words font-semibold hover:underline">{comment.author_name}</Link>
          <time className="text-xs text-muted-foreground" dateTime={comment.created_at}>{new Intl.DateTimeFormat('en-GH', { day: 'numeric', month: 'short' }).format(new Date(comment.created_at))}</time>
        </div>
        <p className="mt-0.5 whitespace-pre-wrap break-words leading-relaxed">{comment.body}</p>
        {children}
      </div>
    </div>
  );
}

export function CommunityPostActions({
  postId, authorId, authorName, caption, textOnly, initialState, renderHeader, renderMedia, onStateChange, onReport, onDelete,
}: {
  postId: string;
  authorId: string;
  authorName: string;
  caption: string;
  textOnly: boolean;
  initialState?: CommunitySocialState;
  renderHeader: (actions: ReactNode) => ReactNode;
  renderMedia: (likeFromPhoto: () => boolean) => ReactNode;
  onStateChange?: (state: CommunitySocialState, kind: CommunityMutation) => void;
  onReport?: () => void;
  onDelete?: () => void;
}) {
  const { user } = useAuth();
  const [state, setState] = useState(initialState ?? emptyCommunitySocialState);
  const stateRef = useRef(state);
  const mutation = useRef<'like' | 'bookmark' | 'follow' | null>(null);
  const latestServerState = useRef(initialState);
  const [busy, setBusy] = useState<'like' | 'bookmark' | 'follow' | null>(null);
  const [captionExpanded, setCaptionExpanded] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [comments, setComments] = useState<CommunityComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsError, setCommentsError] = useState(false);
  const [commentBody, setCommentBody] = useState('');
  const [replyTo, setReplyTo] = useState<CommunityComment | null>(null);
  const [sendingComment, setSendingComment] = useState(false);
  const pendingComment = useRef(false);
  const commentsOrigin = useRef<HTMLElement | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const sync = (next: CommunitySocialState) => {
    stateRef.current = next;
    setState(next);
  };

  useEffect(() => {
    latestServerState.current = initialState;
    const remote = initialState ?? emptyCommunitySocialState;
    const current = stateRef.current;
    sync({ ...remote,
      ...(mutation.current === 'like' ? { liked_by_me: current.liked_by_me, like_count: current.like_count } : {}),
      ...(mutation.current === 'bookmark' ? { bookmarked_by_me: current.bookmarked_by_me } : {}),
      ...(mutation.current === 'follow' ? { following_author: current.following_author } : {}),
    });
  }, [initialState]);

  const toggle = async (kind: 'like' | 'bookmark' | 'follow', force?: boolean) => {
    if (mutation.current || pendingComment.current || !requireMember(user)) return;
    const key = kind === 'like' ? 'liked_by_me' : kind === 'bookmark' ? 'bookmarked_by_me' : 'following_author';
    const previous = stateRef.current;
    const wasSet = previous[key];
    const nextValue = force ?? !wasSet;
    if (nextValue === wasSet) return;
    mutation.current = kind;
    const likeCount = (base: CommunitySocialState) => Math.max(0, base.like_count + (base.liked_by_me === nextValue ? 0 : nextValue ? 1 : -1));
    sync({ ...previous, [key]: nextValue, ...(kind === 'like' ? { like_count: likeCount(previous) } : {}) });
    setBusy(kind);
    try {
      const rpc = kind === 'like' ? 'set_campus_community_post_like'
        : kind === 'bookmark' ? 'set_campus_community_post_bookmark' : 'set_campus_community_follow';
      const args = kind === 'follow'
        ? { p_following_id: authorId, p_following: nextValue }
        : { p_post_id: postId, [kind === 'like' ? 'p_liked' : 'p_saved']: nextValue };
      const { error } = await supabase.rpc(rpc, args as never);
      if (error) throw error;
      const confirmed = { ...stateRef.current, [key]: nextValue,
        ...(kind === 'like' ? { like_count: likeCount(latestServerState.current ?? previous) } : {}) };
      latestServerState.current = confirmed;
      sync(confirmed);
      onStateChange?.(confirmed, kind);
    } catch {
      const rollback = latestServerState.current ?? previous;
      sync({ ...stateRef.current, [key]: rollback[key], ...(kind === 'like' ? { like_count: rollback.like_count } : {}) });
      const messages = {
        like: wasSet ? 'Your like could not be removed. Please try again.' : 'Your like could not be saved. Please try again.',
        bookmark: wasSet ? 'This post could not be removed from Saved. Please try again.' : 'This post could not be saved. Please try again.',
        follow: wasSet ? 'You could not unfollow this member. Please try again.' : 'You could not follow this member. Please try again.',
      };
      toast.error(messages[kind]);
    } finally {
      mutation.current = null;
      setBusy(null);
    }
  };

  const likeFromPhoto = () => {
    if (!user || !['student', 'student_vendor', 'external_vendor', 'university_admin'].includes(user.role)) return false;
    if (mutation.current && mutation.current !== 'like') return false;
    void toggle('like', true);
    return stateRef.current.liked_by_me;
  };

  const loadComments = async () => {
    setCommentsLoading(true);
    setCommentsError(false);
    try {
      const { data, error } = await supabase.rpc('get_campus_community_post_comments', { p_post_id: postId, p_limit: 80 });
      if (error) throw error;
      setComments((data || []) as CommunityComment[]);
    } catch {
      setCommentsError(true);
    } finally {
      setCommentsLoading(false);
    }
  };

  const openComments = () => {
    commentsOrigin.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setCommentsOpen(true);
    void loadComments();
  };

  const submitComment = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!requireMember(user) || pendingComment.current || mutation.current) return;
    const body = commentBody.trim();
    if (!body || body.length > 1000) { toast.error('Write a comment of up to 1,000 characters.'); return; }
    pendingComment.current = true;
    setSendingComment(true);
    try {
      const { error } = await supabase.rpc('create_campus_community_comment', {
        p_post_id: postId, p_body: body, p_parent_comment_id: replyTo?.id ?? null,
      });
      if (error) throw error;
      setCommentBody('');
      setReplyTo(null);
      const next = { ...stateRef.current, comment_count: stateRef.current.comment_count + 1 };
      sync(next);
      onStateChange?.(next, 'comment');
      await loadComments();
    } catch {
      toast.error('Your comment was not sent. Please check your connection and retry.');
    } finally {
      pendingComment.current = false;
      setSendingComment(false);
    }
  };

  const postHref = `/?post=${encodeURIComponent(postId)}`;
  const sharePost = async (copy = false) => {
    const shareData = { title: 'Campus feed · UniEco Ghana', url: new URL(postHref, window.location.origin).toString() };

    try {
      if (!copy && navigator.share) {
        await navigator.share(shareData);
        return;
      }
      await copyTextToClipboard(shareData.url);
      toast.success('Post link copied.');
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      try {
        await copyTextToClipboard(shareData.url);
        toast.success('Post link copied.');
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
        toast.error('Delete is temporarily unavailable. Please try again later.');
      } else {
        toast.error('Your post could not be deleted. Check your connection and try again.');
      }
    } finally {
      setDeleting(false);
    }
  };

  const topLevel = comments.filter((comment) => !comment.parent_comment_id);

  const postCaption = (caption || '').trim();
  const longCaption = !textOnly && postCaption.length > 158;
  const captionText = longCaption && !captionExpanded ? `${postCaption.slice(0, 153).trimEnd()}…` : postCaption;
  const iconAction = 'inline-flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center rounded-full text-foreground transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-65';
  const myPost = user?.id === authorId;

  const menu = (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild><button type="button" aria-label="More post options" className={iconAction}><MoreHorizontal className="h-5 w-5" /></button></DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="z-[60] min-w-44 rounded-xl p-1.5">
        <DropdownMenuItem asChild className="min-h-10 gap-2.5"><Link href={postHref}><ArrowUpRight className="h-4 w-4" />Open post</Link></DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void sharePost(true)} className="min-h-10 gap-2.5"><Link2 className="h-4 w-4" />Copy link</DropdownMenuItem>
        {user && !myPost && <DropdownMenuItem disabled={Boolean(busy)} onSelect={() => void toggle('follow')} className="min-h-10 gap-2.5">{state.following_author ? <UserRoundCheck className="h-4 w-4" /> : <UserRoundPlus className="h-4 w-4" />}{state.following_author ? 'Unfollow member' : 'Follow member'}</DropdownMenuItem>}
        {((myPost && onDelete) || onReport) && <DropdownMenuSeparator />}
        {myPost && onDelete ? <DropdownMenuItem onSelect={() => setDeleteOpen(true)} className="min-h-10 gap-2.5 text-destructive focus:text-destructive"><Trash2 className="h-4 w-4" />Delete post</DropdownMenuItem>
          : onReport && <DropdownMenuItem onSelect={onReport} className="min-h-10 gap-2.5"><Flag className="h-4 w-4" />Report post</DropdownMenuItem>}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <>
      {renderHeader(menu)}
      {textOnly && postCaption && <p className="whitespace-pre-wrap break-words px-4 pb-4 pt-1 text-[15px] leading-relaxed sm:px-5">{postCaption}</p>}
      {renderMedia(likeFromPhoto)}
      <div className="px-3 pb-3 sm:px-4 sm:pb-4">
        <div className="flex items-center gap-0.5 py-1" role="group" aria-label="Post actions">
          <button type="button" onClick={() => void toggle('like')} disabled={Boolean(busy)} aria-label={state.liked_by_me ? 'Unlike post' : 'Like post'} aria-pressed={state.liked_by_me} className={`${iconAction} ${state.liked_by_me ? '!text-rose-500' : ''}`}>
            <Heart className={`h-[23px] w-[23px] ${state.liked_by_me ? 'fill-current' : ''}`} strokeWidth={1.85} />
          </button>
          <button type="button" onClick={openComments} aria-label="View comments" className={iconAction}><MessageCircle className="h-[23px] w-[23px]" strokeWidth={1.85} /></button>
          <button type="button" onClick={() => void sharePost()} aria-label="Share post" className={iconAction}><Send className="h-[22px] w-[22px] -translate-x-px" strokeWidth={1.85} /></button>
          <button type="button" onClick={() => void toggle('bookmark')} disabled={Boolean(busy)} aria-label={state.bookmarked_by_me ? 'Remove from saved posts' : 'Save post'} aria-pressed={state.bookmarked_by_me} className={`${iconAction} ml-auto`}>
            <Bookmark className={`h-[22px] w-[22px] ${state.bookmarked_by_me ? 'fill-current' : ''}`} strokeWidth={1.85} />
          </button>
        </div>
        <div className="space-y-1 px-1 text-sm leading-relaxed">
          {state.like_count > 0 && <p aria-live="polite" className="font-semibold">{new Intl.NumberFormat('en-GH').format(state.like_count)} {state.like_count === 1 ? 'like' : 'likes'}</p>}
          {!textOnly && postCaption && <p className="whitespace-pre-wrap break-words">
            <Link href={`/community/member/${authorId}`} className="mr-1.5 font-semibold hover:underline">{authorName}</Link>{captionText}
            {longCaption && <> <button type="button" onClick={() => setCaptionExpanded(!captionExpanded)} aria-expanded={captionExpanded} className="inline-flex min-h-7 items-center rounded px-1 font-medium text-muted-foreground hover:text-foreground">{captionExpanded ? 'less' : 'more'}</button></>}
          </p>}
          {state.comment_count > 0 && <button type="button" onClick={openComments} className="inline-flex min-h-9 items-center text-sm text-muted-foreground hover:text-foreground">View {state.comment_count === 1 ? '1 comment' : `all ${state.comment_count} comments`}</button>}
        </div>
      </div>

      <Dialog open={commentsOpen} onOpenChange={(open) => { setCommentsOpen(open); if (!open) setReplyTo(null); }}>
        <DialogContent onOpenAutoFocus={(event) => { event.preventDefault(); if (event.currentTarget instanceof HTMLElement) event.currentTarget.focus(); }}
          onCloseAutoFocus={(event) => { if (commentsOrigin.current?.isConnected) { event.preventDefault(); commentsOrigin.current.focus(); } }}
          className="flex max-h-[min(82dvh,44rem)] flex-col gap-0 overflow-hidden p-0 max-sm:!bottom-0 max-sm:!left-0 max-sm:!top-auto max-sm:!w-full max-sm:!max-w-none max-sm:!translate-x-0 max-sm:!translate-y-0 max-sm:!rounded-b-none sm:max-w-lg">
          <DialogHeader className="shrink-0 border-b border-border px-5 pb-4 pt-5">
            <DialogTitle>Comments</DialogTitle><DialogDescription className="sr-only">Read or add a comment on this campus post.</DialogDescription>
          </DialogHeader>
          <div className="min-h-36 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5" aria-live="polite">
            {commentsLoading ? <p className="flex min-h-20 items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 motion-safe:animate-spin" />Loading comments…</p>
              : commentsError ? <div className="py-6 text-center text-sm text-muted-foreground"><p>Comments couldn’t load.</p><button type="button" onClick={() => void loadComments()} className="min-h-11 px-3 font-semibold text-primary">Try again</button></div>
              : topLevel.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">No comments yet.</p>
                : topLevel.map((comment) => <div key={comment.id}>
                  <CommentLine comment={comment}>{user && !comment.is_mine && <button type="button" onClick={() => setReplyTo(comment)} className="min-h-9 font-semibold text-muted-foreground hover:text-foreground">Reply</button>}</CommentLine>
                  {comments.filter((reply) => reply.parent_comment_id === comment.id).map((reply) => <div key={reply.id} className="ml-9 mt-2 border-l border-border pl-3"><CommentLine comment={reply} /></div>)}
                </div>)}
          </div>
          {user ? <form onSubmit={submitComment} className="shrink-0 border-t border-border px-4 pb-[max(.9rem,env(safe-area-inset-bottom))] pt-3 sm:px-5">
            {replyTo && <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground"><span className="truncate">Replying to {replyTo.author_name}</span><button type="button" onClick={() => setReplyTo(null)} className="min-h-9 shrink-0 font-semibold text-primary">Cancel reply</button></div>}
            <div className="flex items-end gap-2">
              <Textarea value={commentBody} onChange={(event) => setCommentBody(event.target.value.slice(0, 1000))} maxLength={1000} rows={2} placeholder={replyTo ? 'Write a reply…' : 'Add a comment…'} aria-label={replyTo ? 'Write a reply' : 'Write a comment'} className="min-h-11 resize-none rounded-xl bg-muted/40 text-base sm:text-sm" />
              <Button type="submit" disabled={sendingComment || !commentBody.trim() || Boolean(busy)} aria-label={replyTo ? 'Send reply' : 'Send comment'} className="h-11 w-11 shrink-0 rounded-full p-0">{sendingComment ? <Loader2 className="h-5 w-5 motion-safe:animate-spin" /> : <Send className="h-[18px] w-[18px]" />}</Button>
            </div>
          </form> : <div className="shrink-0 border-t border-border px-5 pb-[max(.9rem,env(safe-area-inset-bottom))] pt-2 text-center"><Link href={`/signin?next=${encodeURIComponent(postHref)}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-primary">Sign in to comment</Link></div>}
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
