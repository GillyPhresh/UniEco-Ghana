'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/auth-context';
import { RouteGuard } from '@/lib/auth/route-guard';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/shared/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import {
  MessageSquare, Send, ArrowLeft, Search, Paperclip, MoreVertical,
  Flag, Ban, CheckCheck, X, Image as ImageIcon, FileText, Link2, Trash2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import {
  getConversations, getMessages, sendMessage, markMessagesRead,
  getOrCreateConversation, getConversationRecipient, searchConversations,
  uploadMessageAttachment, validateAttachment, deleteMessage,
  deleteMessageAttachment, searchMessageRecipients,
  blockUser, reportMessage, isUserBlocked,
  resolveMessageAttachmentUrl,
} from '@/lib/data/communication-client';
import type { ConversationWithDetails } from '@/lib/types/communication';
import type { MessageRecipient } from '@/lib/data/communication-client';
import type { MessageWithMeta, MessageType } from '@/lib/types/communication';
import { MESSAGE_REPORT_REASONS } from '@/lib/types/communication';
import { getPublicAvatarUrl } from '@/lib/storage/avatar-url';

function timeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return date.toLocaleDateString('en-GH', { month: 'short', day: 'numeric' });
}

function formatTime(dateString: string): string {
  return new Date(dateString).toLocaleTimeString('en-GH', { hour: 'numeric', minute: '2-digit' });
}

function ProtectedAttachment({ reference, messageType }: { reference: string; messageType: MessageType }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    resolveMessageAttachmentUrl(reference).then((resolved) => {
      if (active) setUrl(resolved);
    });
    return () => { active = false; };
  }, [reference]);

  if (!url) return <span className="mt-2 text-xs text-muted-foreground">Attachment unavailable or access has expired.</span>;
  if (messageType === 'image') {
    return <img src={url} alt="Attachment" className="mt-2 max-w-full rounded-lg" style={{ maxHeight: '240px' }} />;
  }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-2 rounded-lg bg-background/20 px-3 py-2 text-xs font-medium underline">
      <FileText className="h-4 w-4" />
      View document
    </a>
  );
}

export default function MessagesPage() {
  return (
    <RouteGuard requireAuth>
      <MessagesContent />
    </RouteGuard>
  );
}

function MessagesContent() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const targetUserId = searchParams.get('to');
  const orderParam = searchParams.get('order');
  const { toast } = useToast();

  const [conversations, setConversations] = useState<ConversationWithDetails[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [activeOtherUser, setActiveOtherUser] = useState<{ id: string; full_name: string | null; avatar_url: string | null } | null>(null);
  const [activeConv, setActiveConv] = useState<ConversationWithDetails | null>(null);
  const [messages, setMessages] = useState<MessageWithMeta[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [mobileShowChat, setMobileShowChat] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [attachmentPreview, setAttachmentPreview] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [showBlock, setShowBlock] = useState(false);
  const [showNewMessage, setShowNewMessage] = useState(false);
  const [recipientQuery, setRecipientQuery] = useState('');
  const [recipientResults, setRecipientResults] = useState<MessageRecipient[]>([]);
  const [recipientSearching, setRecipientSearching] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportDescription, setReportDescription] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadConversations = useCallback(async () => {
    setLoading(true);
    const data = await getConversations();
    setConversations(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // Auto-create conversation from query params
  useEffect(() => {
    if (targetUserId && user) {
      (async () => {
        const convId = await getOrCreateConversation(targetUserId, orderParam ?? undefined);
        if (convId) {
          const all = await getConversations();
          setConversations(all);
          const conv = all.find((c) => c.id === convId);
          if (conv) {
            openConversation(conv);
          } else {
            setActiveConvId(convId);
            setLoadingMessages(true);
            const [otherUser, existingMessages] = await Promise.all([
              getConversationRecipient(convId),
              getMessages(convId),
            ]);
            setActiveOtherUser(otherUser);
            setMessages(existingMessages);
            setMobileShowChat(true);
            setLoadingMessages(false);
            await markMessagesRead(convId);
          }
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetUserId, user, orderParam]);

  // Realtime subscription for active conversation
  useEffect(() => {
    if (!activeConvId) return;

    const channel = supabase
      .channel(`messages:${activeConvId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${activeConvId}`,
        },
        async (payload) => {
          const newMsg = payload.new as MessageWithMeta;
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
          // Auto-mark as read if we're the recipient
          if (newMsg.recipient_id === user?.id) {
            await markMessagesRead(activeConvId);
          }
          setTimeout(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
          }, 50);
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${activeConvId}`,
        },
        (payload) => {
          const updated = payload.new as MessageWithMeta;
          setMessages((prev) => prev.map((m) => m.id === updated.id ? updated : m));
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeConvId, user?.id]);

  // Typing indicator via realtime presence
  useEffect(() => {
    if (!activeConvId || !user) return;
    const channel = supabase.channel(`typing:${activeConvId}`);

    channel
      .on('broadcast', { event: 'typing' }, (payload: { payload: { userId: string; isTyping: boolean } }) => {
        if (payload.payload.userId !== user.id) {
          setIsTyping(payload.payload.isTyping);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeConvId, user]);

  const sendTypingEvent = (typing: boolean) => {
    if (!activeConvId || !user) return;
    const channel = supabase.channel(`typing:${activeConvId}`);
    channel.send({
      type: 'broadcast',
      event: 'typing',
      payload: { userId: user.id, isTyping: typing },
    });
  };

  const handleMessageChange = (value: string) => {
    setNewMessage(value);
    sendTypingEvent(true);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => sendTypingEvent(false), 3000);
  };

  const openConversation = async (conv: ConversationWithDetails) => {
    setActiveConvId(conv.id);
    setActiveOtherUser(conv.other_participant);
    setActiveConv(conv);
    setMobileShowChat(true);
    setLoadingMessages(true);

    // Check if blocked
    if (conv.other_participant) {
      const isBlocked = await isUserBlocked(conv.other_participant.id);
      setBlocked(isBlocked);
    }

    const msgs = await getMessages(conv.id);
    setMessages(msgs);
    setLoadingMessages(false);
    await markMessagesRead(conv.id);
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const validation = validateAttachment(file);
    if (!validation.valid) {
      toast({ title: 'File rejected', description: validation.error, variant: 'destructive' });
      return;
    }
    setAttachment(file);
    // Permit choosing the same file again after it is removed or sent.
    e.currentTarget.value = '';
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (ev) => setAttachmentPreview(ev.target?.result as string);
      reader.readAsDataURL(file);
    } else {
      setAttachmentPreview(null);
    }
  };

  const handleSend = async () => {
    if (!activeConvId || !activeOtherUser || sending) return;
    if (!newMessage.trim() && !attachment) return;

    setSending(true);
    const msgText = newMessage.trim();
    setNewMessage('');
    sendTypingEvent(false);

    let attachmentUrl: string | undefined;
    let msgType: MessageType = 'text';

    if (attachment) {
      const uploadResult = await uploadMessageAttachment(activeConvId, attachment);
      if (uploadResult.url) {
        attachmentUrl = uploadResult.url;
        msgType = attachment.type.startsWith('image/') ? 'image' : 'document';
      } else {
        toast({ title: 'Upload failed', description: uploadResult.error, variant: 'destructive' });
        setSending(false);
        return;
      }
      setAttachment(null);
      setAttachmentPreview(null);
    }

    // Optimistic message
    if (user) {
      setMessages((prev) => [...prev, {
        id: 'temp-' + Date.now(),
        sender_id: user.id,
        recipient_id: activeOtherUser.id,
        body: msgText || null,
        is_read: false,
        created_at: new Date().toISOString(),
        conversation_id: activeConvId,
        is_archived_by_sender: false,
        is_archived_by_recipient: false,
        message_type: msgType,
        attachment_url: attachmentUrl ?? null,
        is_deleted: false,
        deleted_at: null,
        order_id: activeConv?.order_id ?? null,
      }]);
    }

    const result = await sendMessage(
      activeConvId,
      activeOtherUser.id,
      msgText || null,
      msgType,
      attachmentUrl,
      activeConv?.order_id ?? undefined,
    );

    if (result.error) {
      toast({ title: 'Failed to send', description: result.error, variant: 'destructive' });
      setMessages((prev) => prev.filter((m) => !m.id.startsWith('temp-')));
    }

    setSending(false);
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 50);
  };

  const handleDeleteMessage = async (msgId: string) => {
    if (msgId.startsWith('temp-')) return;
    setMessages((prev) => prev.map((m) => m.id === msgId ? { ...m, is_deleted: true } : m));
    await deleteMessage(msgId);
  };

  const handleDeleteAttachment = async (msg: MessageWithMeta) => {
    if (!msg.attachment_url) return;
    const result = await deleteMessageAttachment(msg.id, msg.attachment_url);
    if (result.error) {
      toast({ title: 'Attachment deletion failed', description: result.error, variant: 'destructive' });
      return;
    }
    setMessages((prev) => prev.map((item) => item.id === msg.id ? { ...item, attachment_url: null } : item));
  };

  const handleRecipientSearch = async (query: string) => {
    setRecipientQuery(query);
    if (query.trim().length < 2) {
      setRecipientResults([]);
      return;
    }
    setRecipientSearching(true);
    setRecipientResults(await searchMessageRecipients(query));
    setRecipientSearching(false);
  };

  const startStudentConversation = (recipient: MessageRecipient) => {
    setShowNewMessage(false);
    setRecipientQuery('');
    setRecipientResults([]);
    router.push(`/dashboard/messages?to=${recipient.id}`);
  };

  const handleBlock = async () => {
    if (!activeOtherUser) return;
    const result = await blockUser(activeOtherUser.id, 'Blocked from messaging');
    if (result.error) {
      toast({ title: 'Error', description: result.error, variant: 'destructive' });
    } else {
      toast({ title: 'User blocked', description: 'You will no longer receive messages from this user.' });
      setBlocked(true);
    }
    setShowBlock(false);
  };

  const handleReport = async () => {
    if (!activeOtherUser || !reportReason) return;
    const result = await reportMessage({
      reportedId: activeOtherUser.id,
      conversationId: activeConvId ?? undefined,
      reason: reportReason,
      description: reportDescription || undefined,
    });
    if (result.error) {
      toast({ title: 'Error', description: result.error, variant: 'destructive' });
    } else {
      toast({ title: 'Report submitted', description: 'Our moderation team will review this report.' });
    }
    setShowReport(false);
    setReportReason('');
    setReportDescription('');
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      await loadConversations();
      return;
    }
    const results = await searchConversations(searchQuery);
    setConversations(results);
  };

  const filteredConversations = searchQuery
    ? conversations.filter(
        (c) =>
          c.other_participant?.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          c.last_message?.body?.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : conversations;

  const renderAttachment = (msg: MessageWithMeta) => {
    if (!msg.attachment_url) return null;
    return <ProtectedAttachment reference={msg.attachment_url} messageType={msg.message_type} />;
  };

  return (
    <>
      <SiteHeader />
      <main className="container py-6 sm:py-8">
        <div className="mb-6">
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Messages
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Contact vendors directly and keep track of your conversations.
          </p>
        </div>

        <Card className="overflow-hidden">
          <div className="grid h-[calc(100dvh-10rem)] min-h-[32rem] max-h-[42rem] grid-cols-1 sm:grid-cols-[300px_minmax(0,1fr)]">
            {/* Conversation list */}
            <div className={`min-h-0 border-r border-border flex flex-col ${mobileShowChat ? 'hidden sm:flex' : 'flex'}`}>
              {/* Search */}
              <div className="border-b border-border p-3">
                <Button size="sm" className="mb-3 w-full" onClick={() => setShowNewMessage(true)}>
                  <MessageSquare className="mr-2 h-4 w-4" /> New message
                </Button>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search conversations..."
                    className="pl-9"
                  />
                </div>
              </div>

              {/* List */}
              <div className="flex-1 overflow-y-auto">
                {loading ? (
                  <div className="space-y-2 p-3">
                    {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
                  </div>
                ) : filteredConversations.length > 0 ? (
                  <div className="space-y-1 p-2">
                    {filteredConversations.map((conv) => (
                      <button
                        key={conv.id}
                        onClick={() => openConversation(conv)}
                        className={`flex w-full items-center gap-3 rounded-lg p-3 text-left transition-colors ${
                          activeConvId === conv.id ? 'bg-primary/10' : 'hover:bg-muted/50'
                        }`}
                      >
                        <Avatar className="h-10 w-10 shrink-0">
                          <AvatarImage src={getPublicAvatarUrl(conv.other_participant?.avatar_url)} alt="" className="object-cover" />
                          <AvatarFallback className="bg-primary/10 text-primary text-xs">
                            {conv.other_participant?.full_name?.split(' ').map((n) => n[0]).join('') || '?'}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <p className="truncate text-sm font-medium text-foreground">
                              {conv.other_participant?.full_name || 'Unknown'}
                            </p>
                            {conv.unread_count > 0 && (
                              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-bold text-primary-foreground">
                                {conv.unread_count}
                              </span>
                            )}
                          </div>
                          <p className="truncate text-xs text-muted-foreground">
                            {conv.last_message?.body || 'No messages yet'}
                          </p>
                          {conv.order_id && (
                            <p className="mt-0.5 text-xs font-medium text-primary">Order conversation</p>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="flex h-full items-center justify-center p-6 text-center">
                    <div>
                      <MessageSquare className="mx-auto h-10 w-10 text-muted-foreground/40" />
                      <p className="mt-3 text-sm text-muted-foreground">
                        {searchQuery ? 'No conversations found' : 'No conversations yet. Contact a vendor from their business page to start chatting.'}
                      </p>
                      {!searchQuery && (
                        <Button asChild variant="outline" size="sm" className="mt-3">
                          <Link href="/discover">Find businesses</Link>
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Chat area */}
            <div className={`min-h-0 min-w-0 flex flex-col ${mobileShowChat ? 'flex' : 'hidden sm:flex'}`}>
              {activeConvId && activeOtherUser ? (
                <>
                  {/* Chat header */}
                  <div className="flex items-center gap-3 border-b border-border p-3">
                    <button
                      onClick={() => setMobileShowChat(false)}
                      className="sm:hidden flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </button>
                    <Avatar className="h-9 w-9">
                      <AvatarImage src={getPublicAvatarUrl(activeOtherUser.avatar_url)} alt="" className="object-cover" />
                      <AvatarFallback className="bg-primary/10 text-primary text-xs">
                        {activeOtherUser.full_name?.split(' ').map((n) => n[0]).join('') || '?'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-foreground">{activeOtherUser.full_name}</p>
                      {isTyping && (
                        <p className="text-xs text-primary">typing...</p>
                      )}
                      {activeConv?.order_id && (
                        <Link href={`/orders/${activeConv.order_id}`} className="text-xs text-primary hover:underline">
                          View linked order
                        </Link>
                      )}
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted">
                          <MoreVertical className="h-4 w-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setShowReport(true)}>
                          <Flag className="mr-2 h-4 w-4" />
                          Report conversation
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setShowBlock(true)} className="text-destructive">
                          <Ban className="mr-2 h-4 w-4" />
                          {blocked ? 'Unblock user' : 'Block user'}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {/* Messages */}
                  <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-muted/10 p-4">
                    {loadingMessages ? (
                      <div className="space-y-3">
                        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-2/3 rounded-lg" />)}
                      </div>
                    ) : messages.length > 0 ? (
                      <div className="space-y-3">
                        {messages.map((msg) => {
                          const isMine = msg.sender_id === user?.id;
                          if (msg.is_deleted) {
                            return (
                              <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                                <div className="rounded-2xl bg-muted/50 px-4 py-2 text-xs italic text-muted-foreground">
                                  Message deleted
                                </div>
                              </div>
                            );
                          }
                          return (
                            <div
                              key={msg.id}
                              className={`group flex ${isMine ? 'justify-end' : 'justify-start'}`}
                            >
                              <div
                                className={`max-w-[85%] break-words rounded-2xl px-4 py-2 text-sm sm:max-w-[80%] ${
                                  isMine
                                    ? 'bg-primary text-primary-foreground'
                                    : 'bg-muted text-foreground'
                                }`}
                              >
                                {msg.message_type === 'link' && msg.body ? (
                                  <a
                                    href={msg.body}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="underline"
                                  >
                                    {msg.body}
                                  </a>
                                ) : msg.body ? (
                                  <p>{msg.body}</p>
                                ) : null}
                                {renderAttachment(msg)}
                                <div className={`mt-0.5 flex items-center gap-1 ${isMine ? 'text-primary-foreground/70' : 'text-muted-foreground/70'}`}>
                                  <span className="text-xs">{formatTime(msg.created_at)}</span>
                                  {isMine && msg.is_read && <CheckCheck className="h-3 w-3" />}
                                </div>
                                {isMine && !msg.id.startsWith('temp-') && (
                                  <div className="mt-1 hidden gap-2 group-hover:flex">
                                    {msg.attachment_url && (
                                      <button onClick={() => handleDeleteAttachment(msg)} className="text-xs text-destructive/70 hover:text-destructive">
                                        <Trash2 className="h-3 w-3 inline" /> Remove attachment
                                      </button>
                                    )}
                                    <button onClick={() => handleDeleteMessage(msg.id)} className="text-xs text-destructive/70 hover:text-destructive">
                                      <Trash2 className="h-3 w-3 inline" /> Delete message
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                        <div ref={messagesEndRef} />
                      </div>
                    ) : (
                      <div className="flex h-full items-center justify-center text-center">
                        <div>
                          <MessageSquare className="mx-auto h-10 w-10 text-muted-foreground/40" />
                          <p className="mt-2 text-sm text-muted-foreground">Start the conversation</p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Attachment preview */}
                  {attachmentPreview && (
                    <div className="border-t border-border bg-muted/20 px-3 py-2">
                      <div className="relative inline-block rounded-lg border border-border bg-background p-1">
                        <img src={attachmentPreview} alt="Selected image preview" className="h-20 max-w-[12rem] rounded-md object-cover" />
                        <button
                          type="button"
                          aria-label="Remove selected attachment"
                          onClick={() => { setAttachment(null); setAttachmentPreview(null); }}
                          className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-destructive text-destructive-foreground"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  )}
                  {attachment && !attachmentPreview && (
                    <div className="border-t border-border bg-muted/20 px-3 py-2">
                      <div className="inline-flex max-w-full items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <span className="truncate">{attachment.name}</span>
                        <button
                          type="button"
                          aria-label="Remove selected attachment"
                          onClick={() => setAttachment(null)}
                          className="ml-1 text-muted-foreground hover:text-destructive"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Input */}
                  <div className="border-t border-border bg-background p-3">
                    {blocked ? (
                      <div className="rounded-lg bg-muted p-3 text-center text-sm text-muted-foreground">
                        You have blocked this user. Unblock them from the menu above to send messages.
                      </div>
                    ) : (
                      <>
                        <form
                          onSubmit={(e) => { e.preventDefault(); handleSend(); }}
                          className="flex items-end gap-2"
                        >
                        <input
                          ref={fileInputRef}
                          type="file"
                          className="hidden"
                          onChange={handleFileSelect}
                          accept="image/*,.pdf,.doc,.docx,.txt"
                        />
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          aria-label="Attach a file"
                          title="Attach an image, PDF, Word document, or text file (maximum 10 MB)"
                          disabled={sending}
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Paperclip className="h-4 w-4" />
                        </button>
                        <Input
                          type="text"
                          value={newMessage}
                          onChange={(e) => handleMessageChange(e.target.value)}
                          placeholder="Type a message..."
                          className="flex-1"
                          disabled={sending}
                        />
                        <Button type="submit" size="icon" aria-label="Send message" title="Send message" disabled={(!newMessage.trim() && !attachment) || sending}>
                          <Send className="h-4 w-4" />
                        </Button>
                        </form>
                        <p className="mt-2 text-xs text-muted-foreground">Images, PDF, Word, or text files up to 10 MB.</p>
                      </>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex h-full items-center justify-center text-center">
                  <div>
                    <MessageSquare className="mx-auto h-12 w-12 text-muted-foreground/40" />
                    <p className="mt-3 text-sm text-muted-foreground">Select a conversation to view messages</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </Card>
      </main>

      {/* Report Dialog */}
      <Dialog open={showReport} onOpenChange={setShowReport}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Report conversation</DialogTitle>
            <DialogDescription>
              Help us keep UniEco Ghana safe. Report abusive or inappropriate behavior.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Reason</Label>
              <div className="mt-2 space-y-2">
                {MESSAGE_REPORT_REASONS.map((reason) => (
                  <button
                    key={reason}
                    onClick={() => setReportReason(reason)}
                    className={`flex w-full items-center gap-2 rounded-lg border p-3 text-left text-sm transition-colors ${
                      reportReason === reason ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
                    }`}
                  >
                    {reason}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label>Additional details (optional)</Label>
              <Textarea
                value={reportDescription}
                onChange={(e) => setReportDescription(e.target.value)}
                placeholder="Provide more context about the issue..."
                className="mt-1.5"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReport(false)}>Cancel</Button>
            <Button onClick={handleReport} disabled={!reportReason}>Submit report</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showNewMessage} onOpenChange={setShowNewMessage}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New student message</DialogTitle>
            <DialogDescription>Search students at your university by name. Email addresses are never shown.</DialogDescription>
          </DialogHeader>
          <Input value={recipientQuery} onChange={(event) => handleRecipientSearch(event.target.value)} placeholder="Enter at least two characters" autoFocus />
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {recipientSearching && <p className="p-2 text-sm text-muted-foreground">Searching…</p>}
            {!recipientSearching && recipientQuery.trim().length >= 2 && recipientResults.length === 0 && (
              <p className="p-2 text-sm text-muted-foreground">No eligible students found.</p>
            )}
            {recipientResults.map((recipient) => (
              <button key={recipient.id} onClick={() => startStudentConversation(recipient)} className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-muted">
                <Avatar className="h-9 w-9"><AvatarFallback>{recipient.full_name?.split(' ').map((part) => part[0]).join('') || '?'}</AvatarFallback></Avatar>
                <span className="text-sm font-medium">{recipient.full_name || 'Student'}</span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Block Dialog */}
      <Dialog open={showBlock} onOpenChange={setShowBlock}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Block {activeOtherUser?.full_name}?</DialogTitle>
            <DialogDescription>
              Blocked users cannot send you messages. You can unblock them at any time from your settings.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBlock(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleBlock}>Block user</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SiteFooter />
    </>
  );
}
