'use client';

import { useCallback, useEffect, useState } from 'react';
import { AdminRouteGuard, AdminLayout } from '@/components/admin/admin-layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BrainCircuit, CheckCircle2, ExternalLink, Loader2, LockKeyhole, RefreshCw, Send, Sparkles, Newspaper, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

type Source = { id: string; label: string; url: string; description: string };
type Update = { id: string; sourceId: string; sourceLabel: string; title: string; summary: string; url: string; discoveredAt: string };
type ChatMessage = { role: 'user' | 'assistant'; content: string };

const initialMessage: ChatMessage = {
  role: 'assistant',
  content: 'I am UniEco Intelligence. I can help you inspect platform health, find public university updates, and prepare safe drafts. I will never publish or send anything without your review.',
};

export default function UniEcoAiPage() {
  return <AdminRouteGuard><AdminLayout><Content /></AdminLayout></AdminRouteGuard>;
}

function Content() {
  const [configured, setConfigured] = useState(false);
  const [sources, setSources] = useState<Source[]>([]);
  const [updates, setUpdates] = useState<Update[]>([]);
  const [selectedSource, setSelectedSource] = useState('all');
  const [query, setQuery] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([initialMessage]);
  const [busy, setBusy] = useState<'discover' | 'chat' | string | null>(null);
  const [audience, setAudience] = useState<'all' | 'students' | 'vendors'>('all');

  const loadStatus = useCallback(async () => {
    const response = await fetch('/api/admin/ai', { cache: 'no-store' });
    if (!response.ok) return;
    const data = await response.json() as { configured?: boolean; sources?: Source[] };
    setConfigured(Boolean(data.configured));
    setSources(data.sources || []);
  }, []);

  useEffect(() => { void loadStatus(); }, [loadStatus]);

  const scanSources = async () => {
    setBusy('discover');
    try {
      const response = await fetch('/api/admin/ai', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'discover', sourceId: selectedSource === 'all' ? undefined : selectedSource }) });
      const data = await response.json() as { updates?: Update[]; error?: string };
      if (!response.ok) throw new Error(data.error || 'Unable to scan trusted sources.');
      setUpdates(data.updates || []);
      toast.success(`${data.updates?.length || 0} public update leads found.`);
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Unable to scan trusted sources.'); }
    finally { setBusy(null); }
  };

  const sendMessage = async (preset?: string) => {
    const content = (preset || chatInput).trim();
    if (!content || busy === 'chat') return;
    const nextMessages = [...messages, { role: 'user' as const, content }];
    setMessages(nextMessages);
    setChatInput('');
    setBusy('chat');
    try {
      const response = await fetch('/api/admin/ai', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'chat', message: content, messages: nextMessages }) });
      const data = await response.json() as { reply?: string; error?: string };
      if (!response.ok) throw new Error(data.error || 'The private AI assistant is unavailable.');
      setMessages((current) => [...current, { role: 'assistant', content: data.reply || 'No response was returned.' }]);
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Unable to reach UniEco Intelligence.'); }
    finally { setBusy(null); }
  };

  const prepareDraft = async (update: Update) => {
    setBusy(update.id);
    try {
      const response = await fetch('/api/admin/ai', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'draft', audience, update }) });
      const data = await response.json() as { draftId?: string; error?: string };
      if (!response.ok) throw new Error(data.error || 'Unable to save the draft.');
      toast.success('Draft saved. Review it in Broadcasts before approval.');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Unable to save the draft.'); }
    finally { setBusy(null); }
  };

  const visibleUpdates = updates.filter((item) => !query.trim() || `${item.title} ${item.summary} ${item.sourceLabel}`.toLowerCase().includes(query.trim().toLowerCase()));

  return <div className="space-y-5 p-4 pb-28 sm:p-6 lg:pb-8">
    <header className="rounded-2xl border border-primary/20 bg-gradient-to-br from-[#081b2f] via-[#0b2540] to-primary/80 p-4 text-white shadow-sm sm:p-6">
      <div className="flex items-start gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/20"><Sparkles className="h-6 w-6 text-emerald-200" /></div>
        <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h1 className="font-display text-xl font-bold sm:text-2xl">UniEco Intelligence</h1><Badge className="border-white/20 bg-white/10 text-white">Super Admin only</Badge></div><p className="mt-1 max-w-2xl text-sm text-white/75">A private operations assistant for trusted news discovery, platform monitoring, and reviewable content drafts.</p></div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2 text-xs text-white/80"><span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5"><LockKeyhole className="h-3.5 w-3.5" /> Not visible to students or vendors</span><span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5"><ShieldCheck className="h-3.5 w-3.5" /> Human approval required</span><span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5">{configured ? 'AI provider connected' : 'Safe fallback mode'}</span></div>
    </header>

    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(22rem,0.85fr)]">
      <Card className="overflow-hidden"><CardHeader className="border-b bg-muted/20 pb-4"><CardTitle className="flex items-center gap-2 text-base"><BrainCircuit className="h-5 w-5 text-primary" /> Talk to UniEco Intelligence</CardTitle><p className="text-sm text-muted-foreground">Ask about platform operations, public updates, or safe next steps.</p></CardHeader><CardContent className="p-0"><div className="max-h-[28rem] space-y-3 overflow-y-auto p-4" aria-live="polite">{messages.map((message, index) => <div key={`${message.role}-${index}`} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[90%] whitespace-pre-wrap rounded-2xl px-3.5 py-3 text-sm ${message.role === 'user' ? 'rounded-br-md bg-primary text-primary-foreground' : 'rounded-bl-md bg-muted text-foreground'}`}>{message.content}</div></div>)}{busy === 'chat' && <div className="flex justify-start"><div className="rounded-2xl rounded-bl-md bg-muted px-3.5 py-3 text-sm text-muted-foreground"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Thinking safely…</div></div>}</div><div className="border-t p-3 sm:p-4"><div className="mb-2 flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={() => void sendMessage('Give me a safe summary of the current platform health.')}>Platform health</Button><Button variant="outline" size="sm" onClick={() => void sendMessage('What public university updates should I review today?')}>Today’s updates</Button><Button variant="outline" size="sm" onClick={() => void sendMessage('Suggest three useful messages for students and vendors.')}>Message ideas</Button></div><form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); void sendMessage(); }}><Input value={chatInput} onChange={(event) => setChatInput(event.target.value)} maxLength={2000} placeholder="Ask the private assistant…" aria-label="Ask UniEco Intelligence" /><Button type="submit" disabled={!chatInput.trim() || busy === 'chat'} size="icon" aria-label="Send message"><Send className="h-4 w-4" /></Button></form></div></CardContent></Card>

      <div className="space-y-5"><Card><CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><Newspaper className="h-5 w-5 text-primary" /> Trusted news monitor</CardTitle><p className="text-sm text-muted-foreground">Read-only scans of official pages. Results are leads, not automatic truth.</p></CardHeader><CardContent className="space-y-3"><div className="grid gap-2 sm:grid-cols-[1fr_auto]"><Select value={selectedSource} onValueChange={setSelectedSource}><SelectTrigger aria-label="Trusted news source"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All trusted sources</SelectItem>{sources.map((source) => <SelectItem key={source.id} value={source.id}>{source.label}</SelectItem>)}</SelectContent></Select><Button onClick={() => void scanSources()} disabled={busy === 'discover'}>{busy === 'discover' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}Scan now</Button></div><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter discovered leads…" aria-label="Filter discovered news" /><div className="rounded-xl border border-warning/30 bg-warning/5 p-3 text-xs text-muted-foreground">Only the URLs configured on the server can be scanned. Website content is treated as untrusted data and never as an instruction.</div></CardContent></Card><Card><CardHeader className="pb-3"><CardTitle className="text-base">Safe operating boundaries</CardTitle></CardHeader><CardContent><ul className="space-y-2 text-sm text-muted-foreground"><li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" /> Can read aggregate health signals.</li><li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" /> Can scan approved public sources.</li><li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" /> Can save a draft Broadcast only.</li><li className="flex gap-2"><LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-warning" /> Cannot publish, send, delete, refund, or change permissions.</li></ul></CardContent></Card></div>
    </div>

    <Card><CardHeader className="flex flex-col gap-3 border-b sm:flex-row sm:items-center sm:justify-between"><div><CardTitle className="text-base">Discovered update leads</CardTitle><p className="mt-1 text-sm text-muted-foreground">Review the source yourself before preparing a message.</p></div><div className="flex items-center gap-2"><span className="text-xs text-muted-foreground">Draft audience</span><Select value={audience} onValueChange={(value) => setAudience(value as typeof audience)}><SelectTrigger className="w-32" aria-label="Draft audience"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Everyone</SelectItem><SelectItem value="students">Students</SelectItem><SelectItem value="vendors">Vendors</SelectItem></SelectContent></Select></div></CardHeader><CardContent className="p-4">{visibleUpdates.length === 0 ? <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Run a trusted source scan to see public update leads here.</div> : <div className="grid gap-3 lg:grid-cols-2">{visibleUpdates.map((update) => <article key={update.id} className="rounded-xl border p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wide text-primary">{update.sourceLabel}</p><h2 className="mt-1 font-semibold leading-snug">{update.title}</h2></div><a className="shrink-0 rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-primary" href={update.url} target="_blank" rel="noreferrer" aria-label={`Open source for ${update.title}`}><ExternalLink className="h-4 w-4" /></a></div><p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{update.summary}</p><Button className="mt-3 w-full sm:w-auto" variant="outline" size="sm" onClick={() => void prepareDraft(update)} disabled={busy === update.id}>{busy === update.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}Prepare draft</Button></article>)}</div>}</CardContent></Card>
  </div>;
}
