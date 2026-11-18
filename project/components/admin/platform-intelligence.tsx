'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Lightbulb, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { intelligenceTopics, type IntelligenceSnapshot, type IntelligenceWindow } from '@/lib/intelligence/model';

export function PlatformIntelligence({ onResearch }: { onResearch: () => void }) {
  const [days, setDays] = useState<IntelligenceWindow>(7);
  const [data, setData] = useState<IntelligenceSnapshot | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setData(null);
    setError('');
    try {
      const res = await fetch('/api/admin/intelligence?days=' + days, { cache: 'no-store', signal: controller.signal });
      const result = await res.json().catch(() => null) as (IntelligenceSnapshot & { error?: string }) | null;
      if (!res.ok || !result) throw new Error(result?.error || 'Intelligence could not load.');
      if (!controller.signal.aborted) setData(result);
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Intelligence could not load.');
    } finally { if (!controller.signal.aborted) setBusy(false); }
  }, [days]);
  useEffect(() => { void load(); return () => request.current?.abort(); }, [load]);

  return <section className="space-y-5 rounded-2xl border bg-card p-4 sm:p-6" aria-labelledby="intelligence-title">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="max-w-xl">
        <h2 id="intelligence-title" className="text-lg font-bold">UniEco Intelligence</h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">A read-only brief on search gaps, recent official updates, and operational risks. Every idea is tied to a signal you can check.</p>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="grid gap-1 text-xs font-semibold">Time window
          <select className="min-h-11 rounded-lg border bg-background px-2.5 text-sm" value={days}
            onChange={event => setDays(event.target.value === '30' ? 30 : 7)}>
            <option value="7">7 days</option><option value="30">30 days</option>
          </select>
        </label>
        <Button type="button" variant="outline" disabled={busy} className="min-h-11" onClick={() => void load()}>
          <RefreshCw className="mr-1.5 h-4 w-4" aria-hidden="true" /> Refresh
        </Button>
      </div>
    </div>
    {busy ? <p role="status" className="rounded-lg bg-muted/50 p-3 text-sm">Checking available signals…</p> : error
      ? <p role="alert" className="rounded-lg border border-destructive/30 p-3 text-sm">{error}</p> : data && <>
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="rounded-lg border bg-background p-3">
          <h3 className="text-xs font-semibold text-muted-foreground">Recorded searches without results</h3>
          <p className="mt-1 text-xl font-bold">{data.searches ? `${data.searches.noMatch} / ${data.searches.total}` : 'Unavailable'}</p>
        </div>
        <div className="rounded-lg border bg-background p-3">
          <h3 className="text-xs font-semibold text-muted-foreground">Stuck communications now</h3>
          <p className="mt-1 text-xl font-bold">{data.operations?.stuck ?? 'Unavailable'}</p>
        </div>
        <div className="rounded-lg border bg-background p-3">
          <h3 className="text-xs font-semibold text-muted-foreground">Recorded security events</h3>
          <p className="mt-1 text-xl font-bold">{data.security?.recordedEvents ?? 'Unavailable'}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">This is a log count, not a security clearance.</p>
        </div>
      </div>
      <div>
        <h3 className="flex items-center gap-2 font-bold"><Lightbulb className="h-4 w-4 text-primary" aria-hidden="true" /> Suggested next steps</h3>
        {!data.suggestions.length && <p className="mt-2 text-sm text-muted-foreground">No recommendation met the evidence rules in the available data. That does not mean there are no issues.</p>}
        <div className="mt-2 grid gap-2 lg:grid-cols-2">
          {data.suggestions.map(item => <article key={item.id} className="min-w-0 rounded-lg border bg-background p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{item.severity === 'review' ? 'Needs review' : item.severity === 'opportunity' ? 'Opportunity' : 'Signal'}</p>
            <h4 className="mt-1 break-words font-semibold">{item.title}</h4>
            <p className="mt-1 text-sm leading-5 text-muted-foreground">{item.detail}</p>
            {item.id === 'editorial-supply'
              ? <button type="button" onClick={onResearch} className="mt-2 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-primary hover:underline">{item.action} <ArrowUpRight className="h-4 w-4" /></button>
              : <Link href={item.href} className="mt-2 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-primary hover:underline">{item.action} <ArrowUpRight className="h-4 w-4" /></Link>}
          </article>)}
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="min-w-0 rounded-lg border p-3">
          <h3 className="font-bold">Campus search friction</h3>
          {data.campuses === null ? <p className="mt-2 text-sm text-muted-foreground">Campus-level signals are not available on this deployment.</p>
            : !data.campuses.length ? <p className="mt-2 text-sm text-muted-foreground">Not enough activity to report a campus safely.</p>
            : <ul className="mt-2 divide-y">
              {data.campuses.map(campus => <li key={campus.slug} className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1 py-2 text-sm">
                <span className="min-w-0 break-words font-medium">{campus.name}</span>
                <span className="text-xs text-muted-foreground">{campus.searchDays} search days · {campus.noMatchDays === null ? 'no-match count withheld' : `${campus.noMatchDays} with no match`}</span>
              </li>)}
            </ul>}
          <p className="mt-2 text-xs leading-5 text-muted-foreground">Complete UTC days only. Each searcher counts once per campus per day; small groups are withheld. Unscoped searches use the member’s current campus when known.</p>
        </div>
        <div className="min-w-0 rounded-lg border p-3">
          <h3 className="font-bold">Recent approved content</h3>
          {!data.content ? <p className="mt-2 text-sm text-muted-foreground">Publisher counts are temporarily unavailable.</p>
            : <dl className="mt-2 divide-y text-sm">
              {data.content.map(item => <div key={item.topic} className="flex justify-between gap-2 py-2">
                <dt>{intelligenceTopics.find(topic => topic.id === item.topic)?.label}</dt><dd className="font-semibold tabular-nums">{item.approved}</dd>
              </div>)}
            </dl>}
          <p className="mt-2 text-xs leading-5 text-muted-foreground">Content supply only. A low count is a reason to check publishers, not proof of demand.</p>
        </div>
      </div>
      <p className="text-xs leading-5 text-muted-foreground">Checked {new Date(data.checkedAt).toLocaleString('en-GH', { timeZone: 'Africa/Accra' })} GMT. This report does not publish, message users, change payments, or scan for vulnerabilities.</p>
    </>}
  </section>;
}
