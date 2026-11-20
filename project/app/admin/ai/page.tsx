'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, BrainCircuit, ClipboardCheck, FileText, Globe2, Image as PhotoIcon, Lightbulb, Loader2, Newspaper, Search, ShieldCheck, Video } from 'lucide-react';
import { toast } from 'sonner';
import { AdminRouteGuard, AdminLayout } from '@/components/admin/admin-layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { publicSourceUrl } from '@/lib/ai/public-source-url';
import { updateCategory, updateDate } from '@/lib/ai/update-copy';
import { CampusFeedReview } from './campus-feed-review';
import { PlatformIntelligence } from '@/components/admin/platform-intelligence';
import { coverageLabels, editorialRequest, type Candidate, type Coverage, type Outcome, type SourceOption } from './editorial-types';

const tabs = [['research', 'Research', Search], ['review', 'Review', ClipboardCheck], ['flyers', 'Flyers', FileText], ['coverage', 'Coverage', Globe2], ['assistant', 'Assistant', BrainCircuit], ['intelligence', 'Intelligence', Lightbulb]] as const;
type Tab = (typeof tabs)[number][0];
const fieldClass = 'min-h-11 w-full min-w-0 rounded-lg border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary';
const panel = 'min-w-0 space-y-4 rounded-2xl border bg-card p-4 sm:p-6';
const quiet = 'text-sm leading-6 text-muted-foreground';

export default function UniEcoAiPage() {
  return <AdminRouteGuard><AdminLayout><EditorialDesk /></AdminLayout></AdminRouteGuard>;
}

function SourceSelect({ sources, value, onChange, label, disabled = false }: {
  sources: SourceOption[]; value: string; onChange: (value: string) => void; label: string; disabled?: boolean;
}) {
  const schools = sources.filter((source) => source.schoolSlug);
  const news = sources.filter((source) => !source.schoolSlug && source.sourceKind === 'news');
  const opportunities = sources.filter((source) => !source.schoolSlug && source.sourceKind === 'opportunities');
  return <label className="grid min-w-0 gap-1 text-sm font-semibold">{label}
    <select className={fieldClass} value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled}>
      <option value="all">All campuses, news and scholarships</option>
      <optgroup label={'Schools (' + schools.length + ')'}>{schools.map((source) => <option key={source.id} value={source.id}>{source.label}{source.state === 'ready' ? '' : ' · ' + coverageLabels[source.state]}</option>)}</optgroup>
      {news.length > 0 && <optgroup label="News publishers">{news.map((source) => <option key={source.id} value={source.id}>{source.label}</option>)}</optgroup>}
      {opportunities.length > 0 && <optgroup label="Scholarships and opportunities">{opportunities.map((source) => <option key={source.id} value={source.id}>{source.label}</option>)}</optgroup>}
    </select>
  </label>;
}

function EditorialDesk() {
  const [tab, setTab] = useState<Tab>('research');
  const [sources, setSources] = useState<SourceOption[]>([]);
  const [coverage, setCoverage] = useState<Coverage | null>(null);
  const [loadError, setLoadError] = useState('');
  const [source, setSource] = useState('all');
  const [outcomes, setOutcomes] = useState<Record<string, Outcome>>({});
  const [scan, setScan] = useState<{ done: number; total: number; active: boolean; status: string } | null>(null);
  const [resume, setResume] = useState<{ source: string; offset: number } | null>(null);
  const [filter, setFilter] = useState('');
  const [limit, setLimit] = useState(12);
  const [queueBusy, setQueueBusy] = useState('');
  const [queued, setQueued] = useState<Record<string, boolean>>({});
  const [coverageFilter, setCoverageFilter] = useState('');
  const [gapsOnly, setGapsOnly] = useState(false);
  const [flyerScope, setFlyerScope] = useState('all');
  const [days, setDays] = useState('30');
  const controller = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/ai', { cache: 'no-store' });
      const result = await response.json() as { sources?: SourceOption[]; schoolCoverage?: Coverage; error?: string };
      if (!response.ok) throw new Error(result.error || 'Could not load the editorial desk.');
      setSources(result.sources || []);
      setCoverage(result.schoolCoverage || null);
      setLoadError('');
    } catch (error) { setLoadError(error instanceof Error ? error.message : 'Could not load the editorial desk.'); }
  }, []);
  useEffect(() => {
    void refresh();
    return () => controller.current?.abort();
  }, [refresh]);

  const startScan = async (scope = source, start = 0) => {
    if (controller.current) return;
    const task = new AbortController();
    controller.current = task;
    setSource(scope);
    setTab('research');
    setResume(null);
    setLimit(12);
    if (start === 0) setOutcomes((previous) => {
      if (scope === 'all') return {};
      const next = { ...previous }; delete next[scope]; return next;
    });
    let offset = start;
    let checked = start;
    let total = scope === 'all' ? sources.length : 1;
    setScan({ done: checked, total, active: true, status: 'Checking publishers…' });
    try {
      while (!task.signal.aborted) {
        const data = await editorialRequest<{ outcomes: Outcome[]; total: number; nextOffset: number | null }>('discover',
          { ...(scope === 'all' ? {} : { sourceId: scope }), offset }, task.signal);
        if (task.signal.aborted) break;
        setOutcomes((previous) => ({ ...previous, ...Object.fromEntries(data.outcomes.map((outcome) => [outcome.source.id, outcome])) }));
        checked += data.outcomes.length;
        total = data.total;
        setScan({ done: checked, total, active: true, status: 'Checking publishers…' });
        if (data.nextOffset === null) break;
        if (!Number.isSafeInteger(data.nextOffset) || data.nextOffset <= offset) throw new Error('The scan cursor could not advance.');
        offset = data.nextOffset;
      }
      if (task.signal.aborted && scope === 'all' && offset < total) setResume({ source: scope, offset });
      setScan({ done: checked, total, active: false, status: task.signal.aborted ? 'Paused · completed results kept' : 'Scan complete' });
    } catch (error) {
      if (scope === 'all' && offset < total) setResume({ source: scope, offset });
      setScan({ done: checked, total, active: false, status: task.signal.aborted ? 'Paused · completed results kept' : 'Interrupted · retry from this batch' });
      if (!task.signal.aborted) toast.error(error instanceof Error ? error.message : 'Could not scan publishers.');
    } finally { if (controller.current === task) controller.current = null; }
  };

  const queue = async (lead: Candidate) => {
    if (queueBusy) return;
    setQueueBusy(lead.proof);
    try {
      const result = await editorialRequest<{ added: number; existing: number }>('queue', { proof: lead.proof });
      setQueued((previous) => ({ ...previous, [lead.source_item_key]: true }));
      toast.success(result.added ? 'Added to Campus feed review. Nothing is public yet.' : 'This update is already recorded.');
      void refresh();
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not queue this update.'); }
    finally { setQueueBusy(''); }
  };

  const selected = sources.find((entry) => entry.id === source);
  const matches = Object.values(outcomes).filter((result) => source === 'all' || result.source.id === source);
  const leads = matches.flatMap((result) => result.leads.map((lead) => ({ lead, school: result.source })))
    .filter(({ lead, school }) => (lead.title + ' ' + school.label + ' ' + lead.category).toLowerCase().includes(filter.trim().toLowerCase()))
    .sort((a, b) => (b.lead.published_at || '').localeCompare(a.lead.published_at || ''));
  const schoolRows = sources.filter((item) => item.schoolSlug
    && (!gapsOnly || item.state !== 'ready' || outcomes[item.id]?.state === 'unreachable')
    && item.label.toLowerCase().includes(coverageFilter.trim().toLowerCase()));
  const briefingSchool = sources.find((item) => item.id === flyerScope);
  const canOpenBriefing = flyerScope === 'all' || Boolean(briefingSchool?.registered && briefingSchool.state === 'ready');
  const bulletinSource = briefingSchool?.feedSourceId || 'all';
  const briefingLink = '/updates/bulletin?' + new URLSearchParams({ source: bulletinSource, days }).toString();

  return <div className="mx-auto max-w-7xl space-y-4 px-3 py-4 pb-24 sm:space-y-5 sm:px-6 sm:pb-8">
    <header className="relative overflow-hidden rounded-2xl border border-emerald-900/50 bg-[#102c25] p-4 text-white sm:p-7">
      <div className="mb-4 h-1 w-16 rounded bg-gradient-to-r from-red-500 via-amber-300 to-emerald-400" />
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-200">UniEco Ghana · Editorial desk</p>
      <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-4xl">UniEco AI</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-emerald-50/85">Research trusted tertiary, Ghanaian and international news, and official scholarship sources. Review the evidence and source media before preparing branded updates.</p>
      <p className="mt-3 flex items-center gap-2 text-xs font-semibold text-emerald-100"><ShieldCheck className="h-4 w-4 shrink-0" />Super-admin only · Publication and notifications need separate approval</p>
    </header>

    {loadError && <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-destructive/30 bg-card p-3 text-sm"><span>{loadError}</span><Button size="sm" variant="outline" onClick={() => void refresh()}>Retry</Button></div>}
    {coverage && <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Campus research coverage">
      {[[coverage.total, 'Schools in scope'], [coverage.ready, 'Ready to scan'], [coverage.total - coverage.ready, 'Need source review'], [coverage.pending ?? '—', 'Updates pending']].map(([number, label]) => <div className="min-w-0 rounded-xl border bg-card p-2.5 sm:p-4" key={label}><p className="text-xl font-bold sm:text-2xl">{number}</p><p className="text-xs text-muted-foreground">{label}</p></div>)}
    </div>}
    <nav aria-label="Editorial workspace" className="flex flex-wrap gap-1 rounded-xl border bg-card p-1.5">
      {tabs.map(([id, label, Icon]) => <Button key={id} type="button" size="sm" className="min-h-10" variant={tab === id ? 'default' : 'ghost'}
        aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)}><Icon className="mr-1.5 h-4 w-4" />{label}</Button>)}
    </nav>

    {tab === 'intelligence' && <PlatformIntelligence onResearch={() => setTab('research')} />}

    {tab === 'research' && <>
      <section className={panel} aria-labelledby="editorial-research">
        <div><h2 id="editorial-research" className="text-lg font-bold">Find verified updates</h2><p className={quiet}>Scan a school, a trusted news publisher or an official scholarship source. Leads remain private until an administrator checks and publishes them.</p></div>
        <div className="grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <SourceSelect sources={sources} value={source} onChange={(value) => { setSource(value); setLimit(12); setResume(null); }} label="Publisher to scan" disabled={scan?.active} />
          {scan?.active ? <Button type="button" className="min-h-11" variant="outline" onClick={() => controller.current?.abort()}>Pause scan</Button>
            : <Button type="button" className="min-h-11" disabled={!coverage || Boolean(selected && selected.state !== 'ready')} onClick={() => void startScan(source, resume?.source === source ? resume.offset : 0)}><Search className="mr-2 h-4 w-4" />{resume?.source === source ? 'Continue scan' : 'Scan now'}</Button>}
        </div>
        {selected && selected.state !== 'ready' && <p className="rounded-lg bg-muted p-3 text-sm">{coverageLabels[selected.state]}. Open Coverage to check the school profile and official links.</p>}
        {scan && <div className="space-y-1.5 text-sm" role="status">
          <div className="flex flex-wrap justify-between gap-2"><span className="font-semibold">{scan.status}</span><span className="text-muted-foreground">{scan.done} of {scan.total} source records processed</span></div>
          <progress className="h-2 w-full accent-primary" value={scan.done} max={Math.max(1, scan.total)} aria-label="Research progress" />
        </div>}
        <p className="text-xs leading-5 text-muted-foreground">Only recent, low-risk stories verified on a school’s official site may be published automatically. General news, scholarship offers, sensitive stories and unconfirmed leads remain private until a Super Admin verifies them. No paid AI service is contacted.{coverage?.lastSweep ? ' Last scheduled sweep: ' + updateDate(coverage.lastSweep) + '.' : ''}</p>
      </section>
      <section className={panel}>
        <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-lg font-bold">Discovered leads</h2><p className={quiet}>Open the publisher, verify the story, then queue it for review.</p></div><Button variant="outline" onClick={() => setTab('review')}>Campus feed review</Button></div>
        <Input placeholder="Filter these leads by school, title or category" aria-label="Filter discovered leads" value={filter} onChange={(event) => { setFilter(event.target.value); setLimit(12); }} />
        {!leads.length ? <p className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">{matches.length ? 'No matching leads are available in this selection. Check Coverage for the publisher outcome.' : 'Run a scan to discover source-linked stories.'}</p>
          : <div className="grid gap-3 lg:grid-cols-2">{leads.slice(0, limit).map(({ lead, school }) => {
            const original = publicSourceUrl(lead.canonical_url);
            return <article className="min-w-0 space-y-2 rounded-xl border p-3.5 sm:p-4" key={school.id + lead.source_item_key}>
              <p className="text-xs font-semibold text-primary">{school.label} · {updateCategory(lead.category)}</p>
              <h3 className="break-words font-semibold leading-snug">{lead.title}</h3>
              <p className="text-xs text-muted-foreground">{updateDate(lead.published_at)} {lead.media_type && <span className="ml-1 inline-flex items-center gap-1">· {lead.media_type === 'video' ? <Video className="h-3.5 w-3.5" /> : <PhotoIcon className="h-3.5 w-3.5" />}{lead.media_type === 'video' ? 'Source video' : 'Source photo'}</span>}</p>
              {lead.excerpt && <p className={quiet + ' break-words'}>{lead.excerpt}</p>}
              <div className="flex flex-wrap gap-2 pt-1">
                {original && <Button asChild size="sm" variant="outline"><a href={original.href} target="_blank" rel="noopener noreferrer">Read source <ArrowUpRight className="ml-1.5 h-4 w-4" /></a></Button>}
                <Button size="sm" className="min-h-10" disabled={Boolean(queueBusy) || Boolean(queued[lead.source_item_key])} onClick={() => void queue(lead)}>
                  {queueBusy === lead.proof && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{queued[lead.source_item_key] ? 'Already in review records' : 'Queue for review'}
                </Button>
              </div>
            </article>;
          })}</div>}
        {leads.length > limit && <Button variant="outline" onClick={() => setLimit(limit + 12)}>Show more leads ({leads.length - limit})</Button>}
      </section>
    </>}

    {tab === 'review' && <CampusFeedReview sources={sources} onDecision={() => void refresh()} />}
    {tab === 'flyers' && <section className={panel}>
      <div className="rounded-xl border border-emerald-900/10 bg-emerald-50 p-4 text-emerald-950 dark:bg-emerald-950 dark:text-emerald-50"><Newspaper className="mb-2 h-6 w-6" /><h2 className="text-lg font-bold">Letterhead flyers and briefings</h2><p className="mt-1 text-sm leading-6">Every approved update has a branded PNG. A briefing combines your selected school’s approved stories into numbered, shareable pages. The original publisher is credited on every item.</p></div>
      <div className="grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
          <SourceSelect sources={sources} value={flyerScope} onChange={setFlyerScope} label="Briefing source" />
        <label className="grid gap-1 text-sm font-semibold">Edition<select className={fieldClass} value={days} onChange={(event) => setDays(event.target.value)}><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="all">All updates</option></select></label>
      </div>
      {!canOpenBriefing && <p role="status" className={quiet}>This publisher does not have a public UniEco update source yet. Scan and review a sourced story first.</p>}
      <div className="flex flex-wrap gap-2">{canOpenBriefing && <Button asChild><Link href={briefingLink} target="_blank">Open public briefing <ArrowUpRight className="ml-2 h-4 w-4" /></Link></Button>}<Button variant="outline" onClick={() => setTab('review')}>Preview a draft flyer in Review</Button></div>
    </section>}
    {tab === 'coverage' && <section className={panel}>
      <div><h2 className="text-lg font-bold">School coverage</h2><p className={quiet}>A configured source is not proof of a recent update. Missing, paused and shared sources stay visible and are never replaced by a guess. Confirm the publisher, then add the official HTTPS website under <Link href="/admin/universities" className="font-semibold text-primary underline">Universities</Link>.</p></div>
      <div className="flex flex-wrap items-center gap-3"><Input className="min-w-40 flex-1" placeholder="Search school names" aria-label="Search campus coverage" value={coverageFilter} onChange={(event) => setCoverageFilter(event.target.value)} /><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={gapsOnly} onChange={(event) => setGapsOnly(event.target.checked)} />Only sources needing attention</label></div>
      <p className="text-xs text-muted-foreground">{schoolRows.length} school records shown</p>
      <ul className="divide-y">{schoolRows.map((item) => {
        const state = outcomes[item.id]?.state || item.state;
        const publisher = publicSourceUrl(item.website);
        return <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
          <div className="min-w-0 flex-1"><p className="break-words text-sm font-semibold">{item.label}</p><p className="text-xs leading-5 text-muted-foreground">{coverageLabels[state]}{outcomes[item.id]?.leads.length ? ' · ' + outcomes[item.id].leads.length + ' leads' : ''}</p></div>
          <div className="flex flex-wrap gap-1.5">
            {publisher && <Button asChild variant="ghost" size="sm"><a href={publisher.href} target="_blank" rel="noopener noreferrer">Publisher <ArrowUpRight className="ml-1 h-3 w-3" /></a></Button>}
            {item.state === 'missing_source' && <Button asChild variant="ghost" size="sm"><a href={'https://www.google.com/search?q=' + encodeURIComponent('"' + item.label + '" Ghana official website news')} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">Find official source <ArrowUpRight className="ml-1 h-3 w-3" /></a></Button>}
            {item.state === 'ready' ? <Button size="sm" variant="outline" disabled={scan?.active} onClick={() => void startScan(item.id)}>Scan</Button> : <Button asChild size="sm" variant="outline"><Link href={'/university/' + item.schoolSlug} target="_blank">Profile</Link></Button>}
          </div>
        </li>;
      })}</ul>
    </section>}
    {tab === 'assistant' && <EditorialAssistant source={source} onRefresh={refresh} />}
  </div>;
}

type AssistantMessage = { role: 'assistant' | 'user'; text: string; citations?: { title: string; url: string }[] };
function EditorialAssistant({ source, onRefresh }: { source: string; onRefresh: () => Promise<void> }) {
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const ask = async (preset?: string) => {
    const message = (preset || question).trim();
    if (!message || busy) return;
    setBusy(true);
    setQuestion('');
    setMessages((previous) => [...previous, { role: 'user', text: message }]);
    try {
      const result = await editorialRequest<{ reply: string; citations?: AssistantMessage['citations'] }>('chat', { message, sourceId: source });
      setMessages((previous) => [...previous, { role: 'assistant', text: result.reply, citations: result.citations }]);
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not load assistant evidence.'); }
    finally { setBusy(false); }
  };
  return <section className={panel}>
    <h2 className="text-lg font-bold">Ask the editorial assistant</h2><p className={quiet}>Get a cited briefing from approved updates, inspect the private review queue, or check aggregate platform health. The assistant cannot publish, broadcast, or change account access.</p>
    <div className="flex flex-wrap gap-2">
      {['Latest approved updates', 'Pending review queue', 'School coverage', 'System health'].map((prompt) => <Button key={prompt} size="sm" variant="outline" disabled={busy} onClick={() => void ask(prompt)}>{prompt}</Button>)}
      <Button size="sm" variant="ghost" disabled={busy} onClick={() => void editorialRequest<{ message: string }>('test').then((result) => { toast.success(result.message); void onRefresh(); }, (error: Error) => toast.error(error.message))}>Check assistant</Button>
    </div>
    <div className="max-h-[32rem] space-y-2 overflow-auto" aria-live="polite">{messages.map((entry, index) => <div key={index} className={'min-w-0 rounded-xl px-3.5 py-3 text-sm leading-6 ' + (entry.role === 'assistant' ? 'bg-muted' : 'border border-primary/20 bg-primary/5')}><p className="whitespace-pre-wrap break-words">{entry.text}</p>{entry.citations?.length ? <ul className="mt-2 space-y-1">{entry.citations.flatMap((citation) => {
      const url = publicSourceUrl(citation.url);
      return url ? [<li key={url.href}><a href={url.href} target="_blank" rel="noopener noreferrer" className="text-primary underline">{citation.title}</a></li>] : [];
    })}</ul> : null}</div>)}{busy && <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Checking recorded evidence…</p>}</div>
    <form className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]" onSubmit={(event) => { event.preventDefault(); void ask(); }}>
      <Input aria-label="Ask a question" placeholder="What campus events have been approved?" value={question} maxLength={800} onChange={(event) => setQuestion(event.target.value)} />
      <Button type="submit" disabled={busy || !question.trim()}>Ask UniEco AI</Button>
    </form>
  </section>;
}
