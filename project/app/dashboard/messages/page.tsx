'use client';

import { Suspense, useEffect, useState, useCallback, useRef } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/auth-context';
import { RouteGuard } from '@/lib/auth/route-guard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  Archive, ArchiveRestore, ArrowUpRight, Camera, Check, ChevronLeft, Ellipsis, House, MessageCircle, MessageSquare,
  Newspaper, Plus, Send, Search, Paperclip, MoreVertical, Star, UserRound,
  Flag, Ban, CheckCheck, X, Image as ImageIcon, FileText, Trash2, Mic, MapPin, Store, Square,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import {
  getConversations, getMessages, sendMessage, markMessagesRead,
  getOrCreateConversation, getConversationRecipient,
  uploadMessageAttachment, validateAttachment, deleteMessage,
  deleteMessageAttachment, searchMessageContacts,
  blockUser, unblockUser, reportMessage, isUserBlocked,
  resolveMessageAttachmentUrl,
} from '@/lib/data/communication-client';
import type { ConversationWithDetails } from '@/lib/types/communication';
import type { MessageRecipient } from '@/lib/data/communication-client';
import type { MessageWithMeta, MessageType } from '@/lib/types/communication';
import { MESSAGE_REPORT_REASONS } from '@/lib/types/communication';
import { getPublicAvatarUrl } from '@/lib/storage/avatar-url';

function inboxTime(dateString: string): string {
  const date = formatMessageDate(dateString);
  return date === 'Today' ? formatTime(dateString) : date;
}

function formatTime(dateString: string): string {
  return new Date(dateString).toLocaleTimeString('en-GH', { hour: 'numeric', minute: '2-digit', hour12: true }).toUpperCase();
}

function formatMessageDate(dateString: string): string {
  const date = new Date(dateString);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString('en-GH', { weekday: 'short', month: 'short', day: 'numeric' });
}

function conversationPreview(conv: ConversationWithDetails): string {
  const message = conv.last_message;
  if (!message) return 'Start a conversation';
  switch (message.message_type) {
    case 'location': return 'Location';
    case 'product': return 'Catalogue';
    case 'audio': return 'Voice message';
    case 'image': return message.body || 'Photo';
    case 'document': return message.body || 'Document';
    default: return message.body || 'Attachment';
  }
}

const previewIcons = { location: MapPin, product: Store, audio: Mic, image: Camera, document: FileText };
type ChatFilter = 'all' | 'unread' | 'favourites' | 'archived';
type ChatFlags = { favourites: string[]; archived: string[] };
const emptyChatFlags: ChatFlags = { favourites: [], archived: [] };
const chatIcon = 'grid h-11 w-11 shrink-0 place-items-center rounded-full transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40';

function initials(name: string | null | undefined): string {
  return name?.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || '?';
}

function safeMessageLink(body: string) {
  try {
    const url = new URL(body);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch { return null; }
}

function ProtectedAttachment({ reference, messageType }: { reference: string; messageType: MessageType }) {
  const [resolved, setResolved] = useState<{ reference: string; url: string | null } | null>(null);

  useEffect(() => {
    let active = true;
    resolveMessageAttachmentUrl(reference).then((url) => {
      if (active) setResolved({ reference, url });
    }).catch(() => { if (active) setResolved({ reference, url: null }); });
    return () => { active = false; };
  }, [reference]);

  if (resolved?.reference !== reference) return <span role="status" className="text-xs opacity-75">Loading attachment…</span>;
  const { url } = resolved;
  if (!url) return <span className="text-xs opacity-75">Attachment unavailable.</span>;
  if (messageType === 'image') {
    return <img src={url} alt="Attachment" className="mt-2 max-w-full rounded-lg" style={{ maxHeight: '240px' }} />;
  }
  if (messageType === 'audio') {
    return <audio controls preload="metadata" src={url} className="my-1 h-10 w-52 max-w-full" aria-label="Voice message" />;
  }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-2 rounded-lg bg-background/20 px-3 py-2 text-xs font-medium underline">
      <FileText className="h-4 w-4" />
      View document
    </a>
  );
}

function SharedMessageCard({ body, type }: { body: string; type: 'location' | 'product' }) {
  try {
    const data = JSON.parse(body) as { title?: unknown; url?: unknown; latitude?: unknown; longitude?: unknown };
    let url: URL;
    let title: string;
    if (type === 'location') {
      if (typeof data.latitude !== 'number' || !Number.isFinite(data.latitude) || Math.abs(data.latitude) > 90
        || typeof data.longitude !== 'number' || !Number.isFinite(data.longitude) || Math.abs(data.longitude) > 180) throw new Error('Invalid coordinates');
      url = new URL('https://www.google.com/maps/search/');
      url.searchParams.set('api', '1');
      url.searchParams.set('query', data.latitude + ',' + data.longitude);
      title = 'Shared location';
    } else {
      url = new URL(typeof data.url === 'string' ? data.url : '');
      if (url.origin !== window.location.origin || !(url.pathname === '/marketplace' || /^\/business\/[a-z0-9][a-z0-9_-]*\/?$/i.test(url.pathname))) throw new Error('Invalid catalogue');
      url = new URL(url.pathname, url.origin);
      title = url.pathname === '/marketplace' ? 'UniEco Ghana Marketplace' : 'UniEco business catalogue';
    }
    const Icon = type === 'location' ? MapPin : Store;
    return <a href={url.toString()} target="_blank" rel="noopener noreferrer" className="chat-share-card flex min-w-0 items-center gap-2.5 rounded-lg p-2.5 text-foreground focus-visible:ring-2 focus-visible:ring-ring">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-primary/10 text-primary"><Icon className="h-5 w-5" /></span>
      <span className="min-w-0"><span className="block text-sm font-semibold">{title}</span><span className="block text-xs text-muted-foreground">{type === 'location' ? 'Open in Maps' : 'Browse catalogue'}</span></span>
      <ArrowUpRight aria-hidden="true" className="ml-auto h-4 w-4 shrink-0 opacity-70" />
    </a>;
  } catch {
    return <p className="text-sm">{type === 'location' ? 'Location shared' : 'Marketplace shared'}</p>;
  }
}

export default function MessagesPage() {
  return (
    <RouteGuard requireAuth>
      <Suspense fallback={<main className="container py-8">Loading messages…</main>}>
        <MessagesContent />
      </Suspense>
    </RouteGuard>
  );
}

function MessagesContent() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const targetUserId = searchParams.get('to');
  const orderParam = searchParams.get('order');
  const conversationParam = searchParams.get('conversation');
  const { toast } = useToast();

  const [conversations, setConversations] = useState<ConversationWithDetails[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [activeOtherUser, setActiveOtherUser] = useState<{ id: string; full_name: string | null; avatar_url: string | null } | null>(null);
  const [activeConv, setActiveConv] = useState<ConversationWithDetails | null>(null);
  const [messages, setMessages] = useState<MessageWithMeta[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [inboxRealtimeConnected, setInboxRealtimeConnected] = useState(false);
  const [activeRealtimeConnected, setActiveRealtimeConnected] = useState(false);
  const [mobileShowChat, setMobileShowChat] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [chatFilter, setChatFilter] = useState<ChatFilter>('all');
  const [chatFlags, setChatFlags] = useState<{ owner: string; flags: ChatFlags } | null>(null);
  const chatFlagsKey = user?.id ? `unieco:chat-flags:v1:${user.id}` : null;
  const flags = chatFlagsKey && chatFlags?.owner === chatFlagsKey ? chatFlags.flags : emptyChatFlags;
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
  const [recording, setRecording] = useState(false);
  const [requestingMicrophone, setRequestingMicrophone] = useState(false);
  const [voiceBlob, setVoiceBlob] = useState<Blob | null>(null);
  const [sharingLocation, setSharingLocation] = useState(false);
  const [locationDraft, setLocationDraft] = useState<{ conversationId: string; latitude: number; longitude: number } | null>(null);
  const [showCatalogShare, setShowCatalogShare] = useState(false);
  const [catalogShareUrl, setCatalogShareUrl] = useState('');
  const chatAppRef = useRef<HTMLElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const composerGeneration = useRef(0);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingChannelRef = useRef<RealtimeChannel | null>(null);
  const conversationRequestRef = useRef(0);
  const recipientSearchRequestRef = useRef(0);
  const conversationsRef = useRef<ConversationWithDetails[]>([]);
  const activeConversationIdRef = useRef<string | null>(activeConvId);
  const openedNotificationRef = useRef<string | null>(null);

  useEffect(() => {
    if (!chatFlagsKey) return;
    let saved: ChatFlags = emptyChatFlags;
    try {
      const value = JSON.parse(localStorage.getItem(chatFlagsKey) || '{}') as Partial<ChatFlags> | null;
      const ids = (input: unknown) => Array.isArray(input) ? input.filter((id): id is string => typeof id === 'string').slice(0, 1000) : [];
      saved = { favourites: ids(value?.favourites), archived: ids(value?.archived) };
    } catch { /* preferences may be unavailable in private browsing */ }
    setChatFlags({ owner: chatFlagsKey, flags: saved });
  }, [chatFlagsKey]);

  useEffect(() => {
    if (!chatFlagsKey || chatFlags?.owner !== chatFlagsKey) return;
    try { localStorage.setItem(chatFlagsKey, JSON.stringify(chatFlags.flags)); } catch { /* in-memory preference still works */ }
  }, [chatFlags, chatFlagsKey]);

  const toggleChatFlag = (kind: keyof ChatFlags, id: string) => {
    if (!chatFlagsKey) return;
    setChatFlags((current) => {
      const owned = current?.owner === chatFlagsKey ? current.flags : emptyChatFlags;
      const next = owned[kind].includes(id) ? owned[kind].filter((entry) => entry !== id) : [...owned[kind], id];
      return { owner: chatFlagsKey, flags: { ...owned, [kind]: next } };
    });
  };

  useEffect(() => {
    const viewport = window.visualViewport;
    const app = chatAppRef.current;
    if (!viewport || !app) return;
    const fit = () => {
      if (Math.abs(viewport.scale - 1) > 0.01) return;
      app.style.setProperty('--chat-viewport-height', `${Math.round(viewport.height)}px`);
      app.style.setProperty('--chat-viewport-top', `${Math.round(viewport.offsetTop)}px`);
    };
    fit();
    viewport.addEventListener('resize', fit);
    viewport.addEventListener('scroll', fit);
    return () => {
      viewport.removeEventListener('resize', fit);
      viewport.removeEventListener('scroll', fit);
    };
  }, []);

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  useEffect(() => {
    activeConversationIdRef.current = activeConvId;
  }, [activeConvId]);

  const loadConversations = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const data = await getConversations();
      setConversations(data);
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  const discardRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    mediaRecorderRef.current = null;
    if (recorder) {
      recorder.onstop = recorder.ondataavailable = recorder.onerror = null;
      if (recorder.state !== 'inactive') recorder.stop();
    }
    mediaStreamRef.current?.getTracks().forEach(track => track.stop());
    mediaStreamRef.current = null;
  }, []);

  const resetRichComposer = useCallback(() => {
    composerGeneration.current++;
    discardRecording();
    setRecording(false);
    setRequestingMicrophone(false);
    setVoiceBlob(null);
    setSharingLocation(false);
    setLocationDraft(null);
    setShowCatalogShare(false);
  }, [discardRecording]);

  useEffect(() => () => {
    composerGeneration.current++;
    discardRecording();
  }, [discardRecording]);

  const refreshMessages = useCallback(async (conversationId: string) => {
    const latest = await getMessages(conversationId);
    if (activeConversationIdRef.current === conversationId) setMessages(latest);
  }, []);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // Keep the inbox preview and unread badges live without repeatedly
  // reloading every conversation while someone is reading a chat.
  useEffect(() => {
    if (!user?.id) return;
    let active = true;
    const channel = supabase
      .channel(`inbox:${user.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'messages',
      }, (payload) => {
        const message = payload.new as MessageWithMeta;
        if (message.sender_id !== user.id && message.recipient_id !== user.id) return;

        const alreadyInInbox = conversationsRef.current.some((conversation) => conversation.id === message.conversation_id);
        setConversations((current) => {
          const updated = current.map((conversation) => {
            if (conversation.id !== message.conversation_id) return conversation;
            return {
              ...conversation,
              updated_at: message.created_at,
              last_message: {
                body: message.body,
                created_at: message.created_at,
                sender_id: message.sender_id,
                message_type: message.message_type,
              },
              unread_count: message.recipient_id === user.id && message.conversation_id !== activeConversationIdRef.current
                ? conversation.unread_count + 1
                : conversation.unread_count,
            };
          });
          return updated.sort((a, b) =>
            new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
          );
        });
        if (!alreadyInInbox) void loadConversations(false);
      })
      .subscribe((status) => {
        if (active) setInboxRealtimeConnected(status === 'SUBSCRIBED');
      });

    return () => {
      active = false;
      setInboxRealtimeConnected(false);
      void supabase.removeChannel(channel);
    };
  }, [loadConversations, user?.id]);

  // Auto-create conversation from query params
  useEffect(() => {
    if (targetUserId && user) {
      (async () => {
        const result = await getOrCreateConversation(targetUserId, orderParam ?? undefined);
        if (result.error) {
          toast({ title: 'Could not open conversation', description: result.error, variant: 'destructive' });
          return;
        }
        const convId = result.id;
        if (convId) {
          const all = await getConversations();
          setConversations(all);
          const conv = all.find((c) => c.id === convId);
          if (conv) {
            openConversation(conv);
          } else {
            resetRichComposer();
            activeConversationIdRef.current = convId;
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
  }, [targetUserId, user, orderParam, toast]);

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
            const pendingIndex = prev.findIndex((message) =>
              message.id.startsWith('temp-')
              && message.sender_id === newMsg.sender_id
              && message.body === newMsg.body
              && message.attachment_url === newMsg.attachment_url,
            );
            if (pendingIndex >= 0) {
              const reconciled = [...prev];
              reconciled[pendingIndex] = newMsg;
              return reconciled;
            }
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
      .subscribe((status) => setActiveRealtimeConnected(status === 'SUBSCRIBED'));

    return () => {
      setActiveRealtimeConnected(false);
      void supabase.removeChannel(channel);
    };
  }, [activeConvId, user?.id]);

  // Realtime is the fast path. Poll only as a quiet fallback when realtime is
  // unavailable; the previous five-second full-inbox polling caused excess
  // database traffic and made the chat feel slower, not faster.
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      if (!active || document.visibilityState === 'hidden') return;
      const pending: Promise<unknown>[] = [];
      if (!inboxRealtimeConnected) pending.push(loadConversations(false));
      if (activeConvId && !activeRealtimeConnected) pending.push(refreshMessages(activeConvId));
      await Promise.all(pending);
    };
    const onReturn = () => { void refresh(); };
    const interval = window.setInterval(refresh, 30000);
    window.addEventListener('focus', onReturn);
    document.addEventListener('visibilitychange', onReturn);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener('focus', onReturn);
      document.removeEventListener('visibilitychange', onReturn);
    };
  }, [activeConvId, activeRealtimeConnected, inboxRealtimeConnected, loadConversations, refreshMessages]);

  // Typing indicator via realtime presence
  useEffect(() => {
    if (!activeConvId || !user) return;
    const channel = supabase.channel(`typing:${activeConvId}`);
    typingChannelRef.current = channel;

    channel
      .on('broadcast', { event: 'typing' }, (payload: { payload: { userId: string; isTyping: boolean } }) => {
        if (payload.payload.userId !== user.id) {
          setIsTyping(payload.payload.isTyping);
        }
      })
      .subscribe();

    return () => {
      if (typingChannelRef.current === channel) typingChannelRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [activeConvId, user]);

  const sendTypingEvent = (typing: boolean) => {
    if (!activeConvId || !user) return;
    typingChannelRef.current?.send({
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

  const openConversation = useCallback(async (conv: ConversationWithDetails) => {
    const requestId = ++conversationRequestRef.current;
    if (activeConversationIdRef.current !== conv.id) {
      setIsTyping(false);
      resetRichComposer();
      setAttachment(null);
      setAttachmentPreview(null);
      setNewMessage('');
    }
    activeConversationIdRef.current = conv.id;
    setActiveConvId(conv.id);
    setActiveOtherUser(conv.other_participant);
    setActiveConv(conv);
    setMobileShowChat(true);
    setLoadingMessages(true);

    const [isBlocked, msgs] = await Promise.all([
      conv.other_participant ? isUserBlocked(conv.other_participant.id) : Promise.resolve(false),
      getMessages(conv.id),
    ]);
    if (requestId !== conversationRequestRef.current) return;
    setBlocked(isBlocked);
    setMessages(msgs);
    setLoadingMessages(false);
    await markMessagesRead(conv.id);
    setConversations((current) => current.map((item) => item.id === conv.id ? { ...item, unread_count: 0 } : item));
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  }, [resetRichComposer]);

  const backToChats = () => {
    sendTypingEvent(false);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    conversationRequestRef.current++;
    activeConversationIdRef.current = null;
    setActiveConvId(null);
    setActiveOtherUser(null);
    setActiveConv(null);
    setIsTyping(false);
    setMessages([]);
    setNewMessage('');
    setAttachment(null);
    setAttachmentPreview(null);
    resetRichComposer();
    setMobileShowChat(false);
  };

  // Open notification links only when the conversation appears in the
  // signed-in user's membership-scoped inbox. A URL ID never grants access.
  useEffect(() => {
    if (!conversationParam) { openedNotificationRef.current = null; return; }
    if (loading || openedNotificationRef.current === conversationParam) return;
    openedNotificationRef.current = conversationParam;
    const conversation = conversations.find((item) => item.id === conversationParam);
    if (conversation) {
      void openConversation(conversation);
      router.replace('/dashboard/messages', { scroll: false });
      return;
    }
    toast({ title: 'Message unavailable', description: 'This conversation is unavailable or you no longer have access to it.' });
    router.replace('/dashboard/messages');
  }, [conversationParam, conversations, loading, openConversation, router, toast]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const validation = validateAttachment(file);
    if (!validation.valid) {
      toast({ title: 'File rejected', description: validation.error, variant: 'destructive' });
      return;
    }
    setVoiceBlob(null);
    setAttachment(file);
    // Permit choosing the same file again after it is removed or sent.
    e.currentTarget.value = '';
    if (file.type.startsWith('image/')) {
      const generation = composerGeneration.current;
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (generation === composerGeneration.current) setAttachmentPreview(ev.target?.result as string);
      };
      reader.readAsDataURL(file);
    } else {
      setAttachmentPreview(null);
    }
  };

  const handleVoiceNote = async () => {
    if (recording) { mediaRecorderRef.current?.stop(); return; }
    if (!activeConvId || requestingMicrophone || blocked || loadingMessages) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      toast({ title: 'Voice recording unavailable', description: 'Use a supported browser and allow microphone access.', variant: 'destructive' });
      return;
    }
    let stream: MediaStream | undefined;
    const generation = composerGeneration.current;
    setRequestingMicrophone(true);
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream = mediaStream;
      if (generation !== composerGeneration.current) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      const preferred = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'].find(type => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(mediaStream, preferred ? { mimeType: preferred } : undefined);
      const chunks: Blob[] = [];
      let bytes = 0;
      recorder.ondataavailable = event => {
        if (event.data.size) { chunks.push(event.data); bytes += event.data.size; }
        if (bytes > 10 * 1024 * 1024 && recorder.state === 'recording') recorder.stop();
      };
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: recorder.mimeType || chunks[0]?.type || 'audio/webm' });
        mediaStream.getTracks().forEach(track => track.stop());
        if (generation !== composerGeneration.current || mediaRecorderRef.current !== recorder) return;
        mediaRecorderRef.current = null;
        mediaStreamRef.current = null;
        setRecording(false);
        if (blob.size > 10 * 1024 * 1024) {
          toast({ title: 'Voice note too large', description: 'Keep voice notes under 10 MB.', variant: 'destructive' });
          return;
        }
        if (blob.size) setVoiceBlob(blob);
      };
      recorder.onerror = () => {
        discardRecording();
        setRecording(false);
        toast({ title: 'Could not record voice note', description: 'Please try again.', variant: 'destructive' });
      };
      mediaRecorderRef.current = recorder;
      mediaStreamRef.current = mediaStream;
      recorder.start(1000);
      setAttachment(null);
      setAttachmentPreview(null);
      setVoiceBlob(null);
      setRecording(true);
    } catch {
      stream?.getTracks().forEach(track => track.stop());
      if (generation === composerGeneration.current) {
        discardRecording();
        toast({ title: 'Could not start recording', description: 'Check microphone permissions and try again.', variant: 'destructive' });
      }
    } finally {
      if (generation === composerGeneration.current) setRequestingMicrophone(false);
    }
  };

  const sendCurrentLocation = () => {
    if (!activeConvId || !activeOtherUser || sending || blocked || loadingMessages) return;
    if (!navigator.geolocation) {
      toast({ title: 'Location is unavailable in this browser', variant: 'destructive' });
      return;
    }
    const generation = composerGeneration.current;
    setSharingLocation(true);
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      if (generation !== composerGeneration.current || activeConversationIdRef.current !== activeConvId) return;
      setSharingLocation(false);
      setLocationDraft({ conversationId: activeConvId, latitude: coords.latitude, longitude: coords.longitude });
    }, () => {
      if (generation !== composerGeneration.current) return;
      setSharingLocation(false);
      toast({ title: 'Location unavailable', description: 'Allow location access, then try again.', variant: 'destructive' });
    }, { enableHighAccuracy: false, timeout: 12000, maximumAge: 30000 });
  };

  const confirmLocationShare = async () => {
    if (!locationDraft || locationDraft.conversationId !== activeConvId || !activeOtherUser || sending || blocked) return;
    const map = new URL('https://www.google.com/maps/search/');
    map.searchParams.set('api', '1');
    map.searchParams.set('query', locationDraft.latitude + ',' + locationDraft.longitude);
    const payload = JSON.stringify({ title: 'Shared location', latitude: locationDraft.latitude, longitude: locationDraft.longitude, url: map.toString() });
    setSending(true);
    const result = await sendMessage(activeConvId, activeOtherUser.id, payload, 'location', undefined, activeConv?.order_id ?? undefined);
    setSending(false);
    if (result.error) toast({ title: 'Could not share location', description: result.error, variant: 'destructive' });
    else {
      setLocationDraft(null);
      if (result.messageId) await refreshMessages(activeConvId);
    }
  };

  const shareCatalog = async () => {
    if (!activeConvId || !activeOtherUser || sending || blocked) return;
    let shared: URL;
    try { shared = new URL(catalogShareUrl.trim()); } catch {
      toast({ title: 'Add a catalogue or shop link', description: 'Paste a UniEco shop or marketplace link first.', variant: 'destructive' });
      return;
    }
    if (shared.origin !== window.location.origin || !(shared.pathname === '/marketplace' || /^\/business\/[a-z0-9][a-z0-9_-]*\/?$/i.test(shared.pathname))) {
      toast({ title: 'Link not supported', description: 'Choose a UniEco Marketplace or business catalogue link.', variant: 'destructive' });
      return;
    }
    setSending(true);
    const result = await sendMessage(activeConvId, activeOtherUser.id,
      JSON.stringify({ title: shared.pathname === '/marketplace' ? 'UniEco Ghana Marketplace' : 'UniEco business catalogue', url: new URL(shared.pathname, shared.origin).toString() }),
      'product', undefined, activeConv?.order_id ?? undefined);
    setSending(false);
    if (result.error) toast({ title: 'Could not share catalogue', description: result.error, variant: 'destructive' });
    else {
      setShowCatalogShare(false);
      setCatalogShareUrl('');
      if (result.messageId) await refreshMessages(activeConvId);
    }
  };

  const handleSend = async () => {
    if (!activeConvId || !activeOtherUser || sending || blocked || loadingMessages || recording || requestingMicrophone) return;
    if (!newMessage.trim() && !attachment && !voiceBlob) return;

    setSending(true);
    const msgText = newMessage.trim();
    const tempId = `temp-${Date.now()}`;
    setNewMessage('');
    sendTypingEvent(false);

    let attachmentUrl: string | undefined;
    let msgType: MessageType = 'text';

    const voiceMime = voiceBlob?.type.split(';')[0] ?? '';
    const outgoingFile = attachment ?? (voiceBlob ? new File([voiceBlob], 'voice-note.' + (voiceMime.includes('ogg') ? 'ogg' : voiceMime.includes('mp4') ? 'mp4' : 'webm'), { type: voiceMime }) : null);
    if (outgoingFile) {
      const uploadResult = await uploadMessageAttachment(activeConvId, outgoingFile);
      if (uploadResult.url) {
        attachmentUrl = uploadResult.url;
        msgType = outgoingFile.type.startsWith('image/') ? 'image' : outgoingFile.type.startsWith('audio/') ? 'audio' : 'document';
      } else {
        toast({ title: 'Upload failed', description: uploadResult.error, variant: 'destructive' });
        if (activeConversationIdRef.current === activeConvId) setNewMessage(msgText);
        setSending(false);
        return;
      }
    }

    // Keep the composer responsive while the secure RPC persists the message.
    if (user && activeConversationIdRef.current === activeConvId) {
      setMessages((prev) => [...prev, {
        id: tempId,
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
      setMessages((prev) => prev.filter((message) => message.id !== tempId));
      if (activeConversationIdRef.current === activeConvId) setNewMessage((current) => current || msgText);
    } else {
      // The RPC acknowledgement is enough to reconcile the optimistic bubble;
      // avoid a second message fetch and a full inbox reload after every send.
      if (result.messageId) {
        setMessages((prev) => prev.map((message) => message.id === tempId
          ? { ...message, id: result.messageId! }
          : message));
      }
      if (activeConversationIdRef.current === activeConvId) {
        setAttachment(null);
        setAttachmentPreview(null);
        setVoiceBlob(null);
      }
      const preview = msgText || (msgType === 'image' ? 'Photo' : msgType === 'audio' ? 'Voice note' : 'Attachment');
      const sentAt = new Date().toISOString();
      setConversations((current) => current
        .map((conversation) => conversation.id === activeConvId ? {
          ...conversation,
          updated_at: sentAt,
          last_message: { body: preview, created_at: sentAt, sender_id: user?.id || '', message_type: msgType },
        } : conversation)
        .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()));
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

  useEffect(() => {
    const query = recipientQuery.trim();
    const requestId = ++recipientSearchRequestRef.current;
    if (query.length < 2) {
      setRecipientResults([]);
      setRecipientSearching(false);
      return;
    }

    const timer = window.setTimeout(async () => {
      setRecipientSearching(true);
      const results = await searchMessageContacts(query);
      if (requestId !== recipientSearchRequestRef.current) return;
      setRecipientResults(results);
      setRecipientSearching(false);
    }, 250);

    return () => window.clearTimeout(timer);
  }, [recipientQuery]);

  const startConversation = (recipient: MessageRecipient) => {
    setShowNewMessage(false);
    setRecipientQuery('');
    setRecipientResults([]);
    router.push(`/dashboard/messages?to=${recipient.id}`);
  };

  const handleBlockToggle = async () => {
    if (!activeOtherUser) return;
    const result = blocked
      ? await unblockUser(activeOtherUser.id)
      : await blockUser(activeOtherUser.id, 'Blocked from messaging');
    if (result.error) {
      toast({ title: 'Error', description: result.error, variant: 'destructive' });
    } else {
      setBlocked(!blocked);
      toast({
        title: blocked ? 'User unblocked' : 'User blocked',
        description: blocked ? 'You can message this person again.' : 'You will no longer receive messages from this user.',
      });
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

  const visibleInbox = conversations.filter(conv => !flags.archived.includes(conv.id));
  const unreadChats = visibleInbox.filter(conv => conv.unread_count > 0).length;
  const archivedChats = conversations.length - visibleInbox.length;
  const term = searchQuery.trim().toLowerCase();
  const filteredConversations = (chatFilter === 'archived' ? conversations.filter(conv => flags.archived.includes(conv.id)) : visibleInbox)
    .filter(conv => chatFilter !== 'unread' || conv.unread_count > 0)
    .filter(conv => chatFilter !== 'favourites' || flags.favourites.includes(conv.id))
    .filter(conv => !term || conv.other_participant?.full_name?.toLowerCase().includes(term) || conversationPreview(conv).toLowerCase().includes(term));
  const hasDraft = Boolean(newMessage.trim() || attachment || voiceBlob);

  const renderAttachment = (msg: MessageWithMeta) => {
    if (!msg.attachment_url) return null;
    return <ProtectedAttachment reference={msg.attachment_url} messageType={msg.message_type} />;
  };

  return (
    <>
      <main id="main-content" ref={chatAppRef} data-chat-app data-chat-view={mobileShowChat ? 'conversation' : 'inbox'} className="chat-app bg-background text-foreground">
          <div className="mx-auto grid h-full min-h-0 max-w-[100rem] grid-cols-1 lg:grid-cols-[minmax(20rem,25rem)_minmax(0,1fr)]">
            <section className={`min-h-0 min-w-0 flex-col bg-background lg:border-r lg:border-border ${mobileShowChat ? 'hidden lg:flex' : 'flex'}`} aria-label="Conversations">
              <header className="shrink-0 px-4 pb-2 pt-2 sm:px-5">
                <div className="flex items-center justify-between">
                  {chatFilter === 'archived' ? <button type="button" aria-label="Back to all chats" className={chatIcon} onClick={() => setChatFilter('all')}><ChevronLeft className="h-6 w-6" /></button>
                    : <DropdownMenu>
                      <DropdownMenuTrigger asChild><button type="button" aria-label="Chats menu" className={`${chatIcon} bg-muted`}><Ellipsis className="h-6 w-6" /></button></DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        <DropdownMenuItem onSelect={() => setChatFilter('archived')}><Archive className="mr-2 h-4 w-4" />Archived chats</DropdownMenuItem>
                        <DropdownMenuItem asChild><Link href="/"><House className="mr-2 h-4 w-4" />UniEco Home</Link></DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>}
                  <button type="button" aria-label="New chat" onClick={() => setShowNewMessage(true)} className={`${chatIcon} bg-foreground text-background hover:bg-foreground/80`}><Plus className="h-6 w-6" /></button>
                </div>
                <h1 className="mb-3 mt-4 text-[2.2rem] font-bold leading-none tracking-tight">{chatFilter === 'archived' ? 'Archived' : 'Chats'}</h1>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <Input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search"
                    aria-label="Search conversations"
                    className="h-10 rounded-xl border-0 bg-muted pl-9 text-base shadow-none"
                  />
                </div>
                {chatFilter !== 'archived' && <div className="mt-2 flex gap-2 overflow-x-auto [scrollbar-width:none]" aria-label="Filter chats">
                  {([{ key: 'all', label: 'All' }, { key: 'unread', label: unreadChats ? `Unread ${unreadChats}` : 'Unread' }, { key: 'favourites', label: 'Favourites' }] as const).map(item => (
                    <button key={item.key} type="button" onClick={() => setChatFilter(item.key)} aria-pressed={chatFilter === item.key}
                      className="group flex min-h-[44px] shrink-0 items-center rounded-full text-sm font-semibold focus-visible:ring-2 focus-visible:ring-ring">
                      <span className={`flex h-8 items-center rounded-full border border-border px-3.5 ${chatFilter === item.key ? 'chat-filter-selected' : 'bg-muted/35 text-muted-foreground group-hover:bg-muted'}`}>{item.label}</span>
                    </button>
                  ))}
                </div>}
              </header>

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                {chatFilter === 'all' && !term && !loading && <button type="button" onClick={() => setChatFilter('archived')} className="flex min-h-[3.25rem] w-full items-center gap-3.5 px-5 text-left text-sm font-semibold text-muted-foreground hover:bg-muted">
                  <span className="grid w-12 shrink-0 place-items-center"><Archive className="h-5 w-5" /></span><span className="flex-1">Archived</span>{archivedChats > 0 && <span>{archivedChats}</span>}
                </button>}
                {loading ? (
                  <div className="space-y-2 p-3">
                    {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-[4.5rem] rounded-xl" />)}
                  </div>
                ) : filteredConversations.length > 0 ? (
                  <div>
                    {filteredConversations.map((conv) => {
                      const otherName = conv.other_participant?.full_name || 'UniEco contact';
                      const lastMessage = conv.last_message;
                      const PreviewIcon = lastMessage ? previewIcons[lastMessage.message_type as keyof typeof previewIcons] : undefined;
                      return (
                        <button
                          key={conv.id}
                          onClick={() => openConversation(conv)}
                          aria-current={activeConvId === conv.id ? 'true' : undefined}
                          className={`flex min-h-[4.75rem] w-full items-center gap-3 pl-4 pr-3 text-left transition-colors hover:bg-muted/55 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:pl-5 sm:pr-5 ${activeConvId === conv.id ? 'lg:bg-muted' : ''}`}
                        >
                          <Avatar className="h-[3.25rem] w-[3.25rem] shrink-0">
                            <AvatarImage src={getPublicAvatarUrl(conv.other_participant?.avatar_url)} alt="" className="object-cover" />
                            <AvatarFallback className="bg-primary/10 text-sm font-semibold text-primary">{initials(otherName)}</AvatarFallback>
                          </Avatar>
                          <span className="flex min-h-[4.75rem] min-w-0 flex-1 flex-col justify-center border-b border-border/75 py-2.5">
                            <span className="flex items-center justify-between gap-2">
                              <span className={`truncate text-[1.02rem] ${conv.unread_count > 0 ? 'font-bold' : 'font-semibold'}`}>{otherName}</span>
                              {lastMessage && <time dateTime={lastMessage.created_at} className={`shrink-0 text-xs ${conv.unread_count > 0 ? 'font-semibold text-primary' : 'text-muted-foreground'}`}>{inboxTime(lastMessage.created_at)}</time>}
                            </span>
                            <span className="mt-0.5 flex items-center gap-1 text-muted-foreground">
                              {lastMessage?.sender_id === user?.id && <Check className="h-4 w-4 shrink-0" aria-label="Sent by you" />}
                              {PreviewIcon && <PreviewIcon aria-hidden="true" className="h-4 w-4 shrink-0" />}
                              <span className="truncate text-sm">{conversationPreview(conv)}</span>
                              {flags.favourites.includes(conv.id) && <Star aria-label="Favourite" className="ml-auto h-3.5 w-3.5 shrink-0 text-primary" />}
                              {conv.unread_count > 0 && <span className="ml-auto flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground">{conv.unread_count}</span>}
                            </span>
                            {conv.order_id && <span className="mt-1 block text-[11px] font-medium text-primary">Order conversation</span>}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex min-h-48 items-center justify-center px-6 py-5 text-center">
                    <div className="max-w-xs">
                      <p className="text-sm font-semibold">{term ? 'No matching chats' : chatFilter === 'unread' ? 'You’re all caught up' : chatFilter === 'favourites' ? 'No favourite chats yet' : chatFilter === 'archived' ? 'No archived chats' : 'No chats yet'}</p>
                      {chatFilter === 'favourites' && !term && <p className="mt-1 text-sm text-muted-foreground">Add a favourite from a conversation’s menu.</p>}
                      {chatFilter === 'all' && !term && <button type="button" onClick={() => setShowNewMessage(true)} className="mt-1 min-h-11 px-3 text-sm font-semibold text-primary">Start a chat</button>}
                    </div>
                  </div>
                )}
              </div>
              <nav aria-label="Chat navigation" className="chat-inbox-dock shrink-0 bg-background px-3 pt-1.5">
                <div className="mx-auto grid max-w-md grid-cols-4 items-center gap-1 rounded-full border border-border bg-muted/50 p-1">
                  <Link href="/" className="chat-dock-item"><House className="h-[22px] w-[22px]" />Home</Link>
                  <Link href="/updates" className="chat-dock-item"><Newspaper className="h-[22px] w-[22px]" />Updates</Link>
                  <button type="button" aria-current="page" onClick={() => { setChatFilter('all'); setSearchQuery(''); }} className="chat-dock-item chat-filter-selected rounded-full"><MessageCircle className="h-[22px] w-[22px]" />Chats</button>
                  <Link href="/dashboard" className="chat-dock-item"><UserRound className="h-[22px] w-[22px]" />Account</Link>
                </div>
              </nav>
            </section>

            {/* WhatsApp-style chat panel */}
            <section className={`chat-thread min-h-0 min-w-0 flex-col ${mobileShowChat ? 'flex' : 'hidden lg:flex'}`} aria-label="Open conversation">
              {activeConvId && activeOtherUser ? (
                <>
                  <header className="chat-header z-10 flex min-h-14 shrink-0 items-center gap-2 border-b border-border/70 px-2 sm:px-4">
                    <button type="button" onClick={backToChats} aria-label="Back to conversations" className={`${chatIcon} lg:hidden`}>
                      <ChevronLeft className="h-7 w-7" />
                    </button>
                    <Avatar className="h-10 w-10 shrink-0">
                      <AvatarImage src={getPublicAvatarUrl(activeOtherUser.avatar_url)} alt="" className="object-cover" />
                      <AvatarFallback className="bg-primary/10 text-sm font-semibold text-primary">{initials(activeOtherUser.full_name)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <h2 className="truncate text-base font-semibold">{activeOtherUser.full_name || 'UniEco contact'}</h2>
                      {isTyping && <p className="truncate text-xs text-primary" role="status">typing…</p>}
                      {!isTyping && activeConv?.order_id && <p className="truncate text-xs text-muted-foreground">Order chat</p>}
                    </div>
                    {activeConv?.order_id && <Link href={`/orders/${activeConv.order_id}`} className="hidden rounded-full border border-border px-3 py-1.5 text-xs font-medium text-primary hover:bg-muted sm:inline-flex">View order</Link>}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button type="button" aria-label="Conversation options" className={chatIcon}><MoreVertical className="h-5 w-5" /></button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {activeConv?.order_id && <DropdownMenuItem asChild><Link href={`/orders/${activeConv.order_id}`}><FileText className="mr-2 h-4 w-4" />View order</Link></DropdownMenuItem>}
                        <DropdownMenuItem onSelect={() => toggleChatFlag('favourites', activeConvId)}><Star className="mr-2 h-4 w-4" />{flags.favourites.includes(activeConvId) ? 'Remove from favourites' : 'Add to favourites'}</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => { toggleChatFlag('archived', activeConvId); if (!flags.archived.includes(activeConvId)) { backToChats(); setChatFilter('all'); } }}><ArchiveRestore className="mr-2 h-4 w-4" />{flags.archived.includes(activeConvId) ? 'Unarchive chat' : 'Archive chat'}</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setShowReport(true)}><Flag className="mr-2 h-4 w-4" />Report conversation</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setShowBlock(true)} className="text-destructive"><Ban className="mr-2 h-4 w-4" />{blocked ? 'Unblock user' : 'Block user'}</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </header>

                  <div data-chat-history className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2.5 py-3 sm:px-6">
                    {loadingMessages ? (
                      <div className="space-y-3"><Skeleton className="h-12 w-3/4 rounded-2xl" /><Skeleton className="ml-auto h-16 w-2/3 rounded-2xl" /><Skeleton className="h-10 w-1/2 rounded-2xl" /></div>
                    ) : messages.length > 0 ? (
                      <div className="mx-auto max-w-3xl space-y-1">
                        {messages.map((msg, index) => {
                          const isMine = msg.sender_id === user?.id;
                          const previousMessage = messages[index - 1];
                          const showDate = !previousMessage || formatMessageDate(previousMessage.created_at) !== formatMessageDate(msg.created_at);
                          const grouped = !showDate && previousMessage?.sender_id === msg.sender_id && !previousMessage.is_deleted;
                          const externalLink = msg.message_type === 'link' && msg.body ? safeMessageLink(msg.body) : null;
                          if (msg.is_deleted) {
                            return <div key={msg.id}>{showDate && <div className="my-3 text-center"><span className="rounded-full bg-background/80 px-3 py-1 text-[11px] font-medium text-muted-foreground shadow-sm">{formatMessageDate(msg.created_at)}</span></div>}<div className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}><div className="rounded-2xl bg-muted px-4 py-2 text-xs italic text-muted-foreground">Message deleted</div></div></div>;
                          }
                          return (
                            <div key={msg.id}>
                              {showDate && <div className="my-3 text-center"><span className="rounded-full bg-background/80 px-3 py-1 text-[11px] font-medium text-muted-foreground shadow-sm">{formatMessageDate(msg.created_at)}</span></div>}
                              <div className={`flex ${isMine ? 'justify-end' : 'justify-start'} ${grouped ? '' : 'mt-2'}`}>
                                <div data-chat-bubble={isMine ? 'outgoing' : 'incoming'} data-group-start={!grouped || undefined} className="chat-bubble relative min-w-0 max-w-[88%] break-words rounded-xl px-2.5 py-1.5 text-[0.94rem] leading-[1.3] sm:max-w-[75%]">
                                  {msg.message_type === 'location' && msg.body ? <SharedMessageCard body={msg.body} type="location" />
                                    : msg.message_type === 'product' && msg.body ? <SharedMessageCard body={msg.body} type="product" />
                                      : externalLink ? <a href={externalLink} target="_blank" rel="noopener noreferrer" className="underline [overflow-wrap:anywhere]">{msg.body}</a>
                                        : msg.body ? <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{msg.body}</p> : null}
                                  {renderAttachment(msg)}
                                  <div className="mt-0.5 flex items-center justify-end gap-1.5 text-muted-foreground">
                                    <time dateTime={msg.created_at} className="text-[10px] tabular-nums">{formatTime(msg.created_at)}</time>
                                    {isMine && (msg.is_read ? <CheckCheck className="chat-read h-4 w-4" aria-label="Read" /> : <Check className="h-3.5 w-3.5" aria-label={msg.id.startsWith('temp-') ? 'Sending' : 'Sent'} />)}
                                    {isMine && !msg.id.startsWith('temp-') && <DropdownMenu>
                                      <DropdownMenuTrigger asChild><button type="button" aria-label="Message options" className="grid h-8 w-8 -my-1 -mr-1 place-items-center rounded-full hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"><Ellipsis className="h-4 w-4" /></button></DropdownMenuTrigger>
                                      <DropdownMenuContent align="end">
                                        <DropdownMenuItem onSelect={() => void handleDeleteMessage(msg.id)} className="text-destructive"><Trash2 className="mr-2 h-4 w-4" />Delete message</DropdownMenuItem>
                                        {msg.attachment_url && <DropdownMenuItem onSelect={() => void handleDeleteAttachment(msg)} className="text-destructive"><Trash2 className="mr-2 h-4 w-4" />Remove attachment</DropdownMenuItem>}
                                      </DropdownMenuContent>
                                    </DropdownMenu>}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                        <div ref={messagesEndRef} />
                      </div>
                    ) : (
                      <div className="flex h-full items-center justify-center text-center"><div><span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary"><MessageSquare className="h-7 w-7" /></span><p className="mt-3 text-sm font-semibold text-foreground">Start the conversation</p><p className="mt-1 text-xs text-muted-foreground">Say hello and keep everything in one place.</p></div></div>
                    )}
                  </div>

                  {attachmentPreview && <div className="shrink-0 border-t border-border bg-background px-3 py-2"><div className="relative inline-block rounded-xl border border-border bg-muted p-1"><img src={attachmentPreview} alt="Selected image preview" className="h-20 max-w-[12rem] rounded-lg object-cover" /><button type="button" aria-label="Remove selected attachment" onClick={() => { setAttachment(null); setAttachmentPreview(null); }} className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-destructive text-destructive-foreground"><X className="h-3 w-3" /></button></div></div>}
                  {attachment && !attachmentPreview && <div className="shrink-0 border-t border-border bg-background px-3 py-2"><div className="inline-flex max-w-full items-center gap-2 rounded-xl border border-border bg-muted px-3 py-2 text-sm"><FileText className="h-4 w-4 shrink-0 text-muted-foreground" /><span className="truncate">{attachment.name}</span><button type="button" aria-label="Remove selected attachment" onClick={() => setAttachment(null)} className="ml-1 text-muted-foreground hover:text-destructive"><X className="h-3.5 w-3.5" /></button></div></div>}
                  {voiceBlob && <div className="shrink-0 border-t border-border bg-background px-3 py-2"><div className="inline-flex items-center gap-2 rounded-xl border border-border bg-muted px-3 py-2 text-sm"><Mic className="h-4 w-4 text-primary" /><span>Voice note ready · {Math.max(1, Math.round(voiceBlob.size / 1024))} KB</span><button type="button" aria-label="Remove voice note" onClick={() => setVoiceBlob(null)} className="text-muted-foreground"><X className="h-3.5 w-3.5" /></button></div></div>}

                  <div data-chat-composer className="chat-composer chat-header shrink-0 border-t border-border/75 px-2 pt-1.5 sm:px-4">
                    {blocked ? <div className="rounded-xl bg-muted p-3 text-center text-sm text-muted-foreground">Unblock this contact to send messages.</div> : <form onSubmit={(e) => { e.preventDefault(); void handleSend(); }} className="mx-auto flex max-w-3xl items-end gap-1.5">
                      <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileSelect} accept="image/*,.pdf,.doc,.docx,.txt" />
                      <input ref={cameraInputRef} type="file" className="hidden" onChange={handleFileSelect} accept="image/*" capture="environment" />
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><button type="button" aria-label="Add to message" className={chatIcon} disabled={sending || recording || requestingMicrophone || loadingMessages}><Plus className="h-6 w-6" /></button></DropdownMenuTrigger>
                        <DropdownMenuContent align="start" side="top" className="w-56" onCloseAutoFocus={event => event.preventDefault()}>
                          <DropdownMenuItem onSelect={() => cameraInputRef.current?.click()} className="min-h-11"><Camera className="mr-3 h-5 w-5" />Camera</DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => fileInputRef.current?.click()} className="min-h-11"><Paperclip className="mr-3 h-5 w-5" />Photo or document</DropdownMenuItem>
                          <DropdownMenuItem onSelect={sendCurrentLocation} disabled={sharingLocation} className="min-h-11"><MapPin className="mr-3 h-5 w-5" />Location</DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => { setCatalogShareUrl(window.location.origin + '/marketplace'); setShowCatalogShare(true); }} className="min-h-11"><Store className="mr-3 h-5 w-5" />Catalogue</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      {recording ? <div role="status" className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-full bg-muted px-4 text-sm"><span className="h-2 w-2 rounded-full bg-red-500" />Recording…</div> :
                        <Input type="text" value={newMessage} onChange={(e) => handleMessageChange(e.target.value)} placeholder="Message" aria-label="Message" className="h-11 min-w-0 flex-1 rounded-full border-0 bg-muted px-4 text-base shadow-none" disabled={sending || loadingMessages} />}
                      {hasDraft && !recording
                        ? <button type="submit" aria-label="Send message" className={`${chatIcon} chat-send`} disabled={sending || requestingMicrophone || loadingMessages}><Send className="h-5 w-5" /></button>
                        : <button type="button" onClick={() => void handleVoiceNote()} aria-label={recording ? 'Stop voice recording' : 'Record voice note'} disabled={sending || requestingMicrophone || loadingMessages} className={`${chatIcon} ${recording ? 'bg-destructive text-destructive-foreground hover:bg-destructive/80' : 'chat-send'}`}>{recording ? <Square className="h-4 w-4 fill-current" /> : <Mic className="h-5 w-5" />}</button>}
                    </form>}
                  </div>
                </>
              ) : <div className="flex h-full items-center justify-center p-8 text-center"><div><span className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-primary/10 text-primary"><MessageSquare className="h-8 w-8" /></span><p className="mt-4 text-sm font-semibold text-foreground">Select a chat to start</p><p className="mt-1 max-w-xs text-sm text-muted-foreground">Your conversations with businesses and students will appear here.</p></div></div>}
            </section>
          </div>
      </main>

      <Dialog open={Boolean(locationDraft)} onOpenChange={open => { if (!open) setLocationDraft(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Share your current location?</DialogTitle>
            <DialogDescription>Your location will be visible to the other person in this chat. It is not live tracking.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setLocationDraft(null)}>Cancel</Button>
            <Button type="button" disabled={sending || blocked} onClick={() => void confirmLocationShare()}>Share location</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showCatalogShare} onOpenChange={setShowCatalogShare}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Share a UniEco catalogue</DialogTitle>
            <DialogDescription>Share the Marketplace or a UniEco business page in this private chat.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="catalog-share-url">Marketplace or shop link</Label>
            <Input id="catalog-share-url" type="url" inputMode="url" value={catalogShareUrl} onChange={event => setCatalogShareUrl(event.target.value)} placeholder="https://www.uniecoghana.com/business/…" className="min-h-[44px]" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setShowCatalogShare(false)}>Cancel</Button>
            <Button type="button" disabled={sending || !catalogShareUrl.trim()} onClick={() => void shareCatalog()}><Store className="mr-2 h-4 w-4" />Share catalogue</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
            <DialogTitle>Start a new chat</DialogTitle>
            <DialogDescription>Search any registered student or business by name. Email addresses are never shown.</DialogDescription>
          </DialogHeader>
          <Input value={recipientQuery} onChange={(event) => setRecipientQuery(event.target.value)} placeholder="Search by name" autoFocus />
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {recipientSearching && <p className="p-2 text-sm text-muted-foreground">Searching…</p>}
            {!recipientSearching && recipientQuery.trim().length >= 2 && recipientResults.length === 0 && (
              <p className="p-2 text-sm text-muted-foreground">No registered student or business matched that name.</p>
            )}
            {recipientResults.map((recipient) => (
              <button key={recipient.id} onClick={() => startConversation(recipient)} className="flex w-full items-center gap-3 rounded-xl p-3 text-left hover:bg-muted">
                <Avatar className="h-10 w-10"><AvatarImage src={getPublicAvatarUrl(recipient.avatar_url)} alt="" /><AvatarFallback className="bg-primary/10 text-primary">{initials(recipient.full_name)}</AvatarFallback></Avatar>
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{recipient.full_name || 'Contact'}</span><span className="block text-xs text-muted-foreground">{recipient.subtitle || (recipient.kind === 'business' ? 'Business' : 'Student')}</span></span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Block Dialog */}
      <Dialog open={showBlock} onOpenChange={setShowBlock}>
        <DialogContent>
          <DialogHeader>
          <DialogTitle>{blocked ? 'Unblock' : 'Block'} {activeOtherUser?.full_name}?</DialogTitle>
            <DialogDescription>
            {blocked ? 'This person will be able to message you again.' : 'This person will not be able to send you messages.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBlock(false)}>Cancel</Button>
            <Button variant={blocked ? 'default' : 'destructive'} onClick={handleBlockToggle}>{blocked ? 'Unblock user' : 'Block user'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </>
  );
}
