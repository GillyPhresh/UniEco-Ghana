'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Compass } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { updateDate } from '@/lib/ai/update-copy';
import { intelligenceTopics, type IntelligenceTopic, type Recommendation } from '@/lib/intelligence/model';

export function ReaderRecommendations({ source, sourceLabel }: { source: string | null; sourceLabel?: string }) {
  const [topic, setTopic] = useState<IntelligenceTopic>('opportunities');
  const [items, setItems] = useState<Recommendation[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const task = useRef<AbortController | null>(null);
  useEffect(() => () => task.current?.abort(), []);
  const load = async () => {
    task.current?.abort();
    const controller = new AbortController();
    task.current = controller;
    setBusy(true); setError(''); setItems(null);
    try {
      const params = new URLSearchParams({ topic, ...(source ? { source } : {}) });
      const response = await fetch('/api/intelligence/recommendations?' + params.toString(), { signal: controller.signal });
      const data = await response.json().catch(() => null) as { items?: Recommendation[] } | null;
      if (!response.ok || !data?.items) throw new Error('Suggestions are temporarily unavailable. Try again.');
      if (!controller.signal.aborted) setItems(data.items);
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Suggestions could not load.');
    } finally { if (!controller.signal.aborted) setBusy(false); }
  };
  return <details className="my-4 rounded-xl border bg-muted/20 px-3 sm:px-4">
    <summary className="flex min-h-11 cursor-pointer items-center gap-2 py-2 text-sm font-bold text-primary">
      <Compass className="h-4 w-4" aria-hidden="true" /> Find updates for your interests
    </summary>
    <div className="space-y-3 pb-4">
      <p className="text-xs leading-5 text-muted-foreground">Choose a topic. Suggestions use your selection, not your browsing history.{sourceLabel ? ' Publisher: ' + sourceLabel + '.' : ''}</p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="grid min-w-36 gap-1 text-xs font-semibold">Topic
          <select className="min-h-11 rounded-lg border bg-background px-2.5 text-sm" value={topic} onChange={event => {
            task.current?.abort(); setBusy(false); setItems(null); setError(''); setTopic(event.target.value as IntelligenceTopic);
          }}>
            {intelligenceTopics.map(({ id, label }) => <option value={id} key={id}>{label}</option>)}
          </select>
        </label>
        <Button type="button" variant="outline" className="min-h-11" onClick={() => void load()} disabled={busy}>Show suggestions</Button>
      </div>
      <div aria-live="polite">
        {busy && <p className="text-sm text-muted-foreground">Finding recent approved updates…</p>}
        {error && <p className="text-sm text-muted-foreground">{error}</p>}
        {items && !items.length && <p className="text-sm text-muted-foreground">No approved updates matched this topic in the past 30 days. Try another topic{source ? ' or campus' : ''}.</p>}
        {items && items.length > 0 && <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {items.map(item => <li key={item.id} className="min-w-0">
            <Link href={'/updates/' + item.id} className="block min-h-11 rounded-lg border bg-background p-3 hover:border-primary">
              <span className="block break-words text-xs text-muted-foreground">{item.sourceLabel} · {updateDate(item.publishedAt)}</span>
              <span className="mt-1 block break-words text-sm font-semibold">{item.title} <ArrowUpRight className="inline h-3.5 w-3.5 text-primary" aria-hidden="true" /></span>
            </Link>
          </li>)}
        </ul>}
      </div>
    </div>
  </details>;
}
