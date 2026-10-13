'use client';

import { useState, useEffect, useRef } from 'react';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { VendorDashboardLayout, VendorRouteGuard } from '@/components/vendor/vendor-dashboard-layout';
import { useAuth } from '@/lib/auth/auth-context';
import { useVendor } from '@/hooks/use-vendor';
import {
  deleteMessage,
  deleteMessageAttachment,
  getConversations,
  getMessages,
  markMessagesRead,
  resolveMessageAttachmentUrl,
  sendMessage,
  uploadMessageAttachment,
  validateAttachment,
} from '@/lib/data/communication-client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { supabase } from '@/lib/supabase/client';
import type { ConversationWithDetails, MessageType, MessageWithMeta } from '@/lib/types/communication';
import { MessageSquare, Send, Search, Loader2, ArrowLeft, Paperclip, FileText, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { getPublicAvatarUrl } from '@/lib/storage/avatar-url';

function ProtectedAttachment({ reference, messageType }: { reference: string; messageType: MessageType }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    resolveMessageAttachmentUrl(reference).then((resolved) => {
      if (active) setUrl(resolved);
    });
    return () => { active = false; };
  }, [reference]);

  if (!url) return <p className="mt-2 text-xs opacity-70">Attachment unavailable or access has expired.</p>;
  if (messageType === 'image') {
    return <img src={url} alt="Message attachment" className="mt-2 max-h-60 max-w-full rounded-lg" />;
  }
  return <a href={url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-2 rounded-md bg-background/20 px-3 py-2 text-xs underline"><FileText className="h-4 w-4" />View document</a>;
}

export default function MessagesPage() {
  return (
    <VendorRouteGuard>
      <SiteHeader />
      <MessagesContent />
      <SiteFooter />
    </VendorRouteGuard>
  );
}

function MessagesContent() {
  const { vendor, loading } = useVendor();
  const { user } = useAuth();
  const [conversations, setConversations] = useState<ConversationWithDetails[]>([]);
  const [selectedConv, setSelectedConv] = useState<ConversationWithDetails | null>(null);
  const [messages, setMessages] = useState<MessageWithMeta[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [messageBody, setMessageBody] = useState('');
  const [search, setSearch] = useState('');
  const [attachment, setAttachment] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!vendor) return;
    loadConversations();
  }, [vendor]);

  // Real-time subscription
  useEffect(() => {
    if (!selectedConv) return;
    const channel = supabase
      .channel(`messages:${selectedConv.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${selectedConv.id}`,
      }, () => {
        loadMessages(selectedConv.id);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [selectedConv]);

  async function loadConversations() {
    setDataLoading(true);
    const data = await getConversations();
    setConversations(data);
    setDataLoading(false);
  }

  async function loadMessages(convId: string) {
    const data = await getMessages(convId);
    setMessages(data);
    await markMessagesRead(convId);
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  }

  const handleSelectConversation = (conv: ConversationWithDetails) => {
    setSelectedConv(conv);
    loadMessages(conv.id);
  };

  const handleSend = async () => {
    if (!selectedConv || !messageBody.trim() || !user) return;
    const recipientId = selectedConv.other_participant?.id || '';
    if (!recipientId) return;

    setSending(true);
    let attachmentUrl: string | undefined;
    let messageType: MessageType = 'text';
    if (attachment) {
      const upload = await uploadMessageAttachment(selectedConv.id, attachment);
      if (!upload.url) {
        toast.error(upload.error || 'Attachment upload failed');
        setSending(false);
        return;
      }
      attachmentUrl = upload.url;
      messageType = attachment.type.startsWith('image/') ? 'image' : 'document';
    }

    const { error } = await sendMessage(selectedConv.id, recipientId, messageBody.trim() || null, messageType, attachmentUrl, selectedConv.order_id ?? undefined);
    if (error) { toast.error(error); }
    else {
      setMessageBody('');
      setAttachment(null);
      loadMessages(selectedConv.id);
      loadConversations();
    }
    setSending(false);
  };

  const handleAttachment = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    const validation = validateAttachment(file);
    if (!validation.valid) {
      toast.error(validation.error || 'File is not supported');
      return;
    }
    setAttachment(file);
  };

  const removeAttachment = async (message: MessageWithMeta) => {
    if (!message.attachment_url) return;
    const result = await deleteMessageAttachment(message.id, message.attachment_url);
    if (result.error) toast.error(result.error);
    else setMessages((current) => current.map((item) => item.id === message.id ? { ...item, attachment_url: null } : item));
  };

  const removeMessage = async (message: MessageWithMeta) => {
    const result = await deleteMessage(message.id);
    if (result.error) toast.error(result.error);
    else setMessages((current) => current.map((item) => item.id === message.id ? { ...item, is_deleted: true } : item));
  };

  const filteredConvs = conversations.filter(c =>
    c.other_participant?.full_name?.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <VendorDashboardLayout vendorName="" isVerified={false} subscriptionStatus="none">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="mt-6 h-96 rounded-xl" />
      </VendorDashboardLayout>
    );
  }

  return (
    <VendorDashboardLayout
      vendorName={vendor?.business_name || ''}
      isVerified={vendor?.is_verified || false}
      subscriptionStatus=""
    >
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">Messages</h1>
        <p className="mt-1 text-sm text-muted-foreground">Chat with students who contact your business.</p>
      </div>

      <Card className="h-[70vh] overflow-hidden">
        <div className="flex h-full">
          {/* Conversation list */}
          <div className={`flex flex-col border-r border-border ${selectedConv ? 'hidden w-full sm:flex sm:w-72' : 'w-full sm:w-72'}`}>
            <div className="border-b border-border p-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-9" placeholder="Search conversations..." value={search} onChange={e => setSearch(e.target.value)} />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {dataLoading ? (
                <div className="space-y-2 p-3">
                  {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 rounded-lg" />)}
                </div>
              ) : filteredConvs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <MessageSquare className="h-10 w-10 text-muted-foreground/40" />
                  <p className="mt-2 text-sm text-muted-foreground">No conversations yet</p>
                </div>
              ) : (
                filteredConvs.map(conv => (
                  <button
                    key={conv.id}
                    onClick={() => handleSelectConversation(conv)}
                    className={`flex w-full items-start gap-3 border-b border-border p-3 text-left transition-colors hover:bg-muted/50 ${
                      selectedConv?.id === conv.id ? 'bg-primary/5' : ''
                    }`}
                  >
                    <Avatar className="h-10 w-10 shrink-0">
                      <AvatarImage src={getPublicAvatarUrl(conv.other_participant?.avatar_url)} />
                      <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                        {conv.other_participant?.full_name?.charAt(0).toUpperCase() || '?'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-medium text-foreground">
                          {conv.other_participant?.full_name || 'Unknown'}
                        </p>
                        {conv.unread_count > 0 && (
                          <Badge className="shrink-0 bg-primary text-primary-foreground text-xs">{conv.unread_count}</Badge>
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {conv.last_message?.body || 'No messages yet'}
                      </p>
                      {conv.last_message && (
                        <p className="mt-0.5 text-xs text-muted-foreground/70">
                          {new Date(conv.last_message.created_at).toLocaleDateString('en-GH', { month: 'short', day: 'numeric' })}
                        </p>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Chat panel */}
          {selectedConv ? (
            <div className="flex flex-1 flex-col">
              {/* Header */}
              <div className="flex items-center gap-3 border-b border-border p-3">
                <Button size="icon" variant="ghost" className="sm:hidden" onClick={() => setSelectedConv(null)}>
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <Avatar className="h-8 w-8">
                  <AvatarImage src={getPublicAvatarUrl(selectedConv.other_participant?.avatar_url)} />
                  <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                    {selectedConv.other_participant?.full_name?.charAt(0).toUpperCase() || '?'}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-semibold text-foreground">{selectedConv.other_participant?.full_name || 'Unknown'}</p>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-center">
                    <p className="text-sm text-muted-foreground">No messages yet. Say hello!</p>
                  </div>
                ) : (
                  messages.map(msg => {
                    const isMine = msg.sender_id === user?.id;
                    if (msg.is_deleted) return <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}><p className="rounded-2xl bg-muted px-4 py-2 text-xs italic text-muted-foreground">Message deleted</p></div>;
                    return (
                      <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[75%] rounded-2xl px-4 py-2 ${
                          isMine ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'
                        }`}>
                          {msg.body && <p className="text-sm">{msg.body}</p>}
                          {msg.attachment_url && <ProtectedAttachment reference={msg.attachment_url} messageType={msg.message_type} />}
                          <p className={`mt-1 text-xs ${isMine ? 'text-primary-foreground/60' : 'text-muted-foreground/70'}`}>
                            {new Date(msg.created_at).toLocaleTimeString('en-GH', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                          {isMine && <div className="mt-2 flex gap-3 text-xs opacity-80">
                            {msg.attachment_url && <button onClick={() => removeAttachment(msg)} className="hover:underline">Remove attachment</button>}
                            <button onClick={() => removeMessage(msg)} className="hover:underline">Delete message</button>
                          </div>}
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className="border-t border-border p-3">
                {attachment && <div className="mb-2 inline-flex max-w-full items-center gap-2 rounded-md bg-muted px-3 py-2 text-xs"><FileText className="h-4 w-4" /><span className="truncate">{attachment.name}</span><button onClick={() => setAttachment(null)} aria-label="Remove attachment"><X className="h-3.5 w-3.5" /></button></div>}
                <div className="flex items-center gap-2">
                  <input ref={fileInputRef} type="file" className="hidden" accept="image/*,.pdf,.doc,.docx" onChange={handleAttachment} />
                  <Button type="button" variant="outline" size="icon" onClick={() => fileInputRef.current?.click()} disabled={sending} aria-label="Attach a file"><Paperclip className="h-4 w-4" /></Button>
                  <Input
                    placeholder="Type a message..."
                    value={messageBody}
                    onChange={e => setMessageBody(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                  />
                  <Button size="icon" onClick={handleSend} disabled={sending || (!messageBody.trim() && !attachment)}>
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="hidden flex-1 items-center justify-center sm:flex">
              <div className="text-center">
                <MessageSquare className="mx-auto h-12 w-12 text-muted-foreground/40" />
                <p className="mt-3 text-sm text-muted-foreground">Select a conversation to start chatting</p>
              </div>
            </div>
          )}
        </div>
      </Card>
    </VendorDashboardLayout>
  );
}
