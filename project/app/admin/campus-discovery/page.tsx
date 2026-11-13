'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { CalendarDays, ExternalLink, Loader2, RefreshCw, ScanSearch, Store } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type School = { id: string; name: string; short_name: string | null; website_url: string | null };
type Discovery = {
  id: string; university_id: string; listing_type: 'business' | 'event'; title: string; summary: string | null;
  location: string | null; starts_at: string | null; ends_at: string | null; source_url: string;
  source_label: string; external_url: string | null; status: 'pending_review' | 'published';
  last_checked_at: string; expires_at: string; university: { name: string; short_name: string | null; slug: string } | null;
};

export default function CampusDiscoveryAdminPage() {
  const [schools, setSchools] = useState<School[]>([]);
  const [items, setItems] = useState<Discovery[]>([]);
  const [schoolId, setSchoolId] = useState('');
  const [filter, setFilter] = useState<'pending_review' | 'published'>('pending_review');
  const [busy, setBusy] = useState<string | null>(null);
  const [scanProgress, setScanProgress] = useState('');

  const load = useCallback(async () => {
    setBusy('load');
    try {
      const response = await fetch('/api/admin/campus-discovery', { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Could not load discovery leads.');
      setSchools(payload.schools || []);
      setItems(payload.listings || []);
      setSchoolId((current) => current || payload.schools?.[0]?.id || '');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not load discovery leads.'); }
    finally { setBusy(null); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const visibleItems = useMemo(() => items.filter((item) => item.status === filter), [items, filter]);

  async function scan() {
    if (!schoolId) return;
    setBusy('scan');
    try {
      const response = await fetch('/api/admin/campus-discovery', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'scan', universityId: schoolId }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Campus scan failed.');
      toast.success(payload.message || `${payload.discovered} leads discovered.`);
      await load();
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Campus scan failed.'); }
    finally { setBusy(null); }
  }

  async function scanAllConfiguredSites() {
    const targets = schools.filter((school) => Boolean(school.website_url));
    if (!targets.length) {
      toast.error('No schools have a verified official website configured yet.');
      return;
    }

    setBusy('scan-all');
    setScanProgress('');
    let discovered = 0;
    let failures = 0;

    for (let index = 0; index < targets.length; index += 1) {
      const school = targets[index];
      if (!school) continue;
      setScanProgress(`Scanning ${index + 1} of ${targets.length}: ${school.name}`);
      try {
        const response = await fetch('/api/admin/campus-discovery', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'scan', universityId: school.id }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Campus scan failed.');
        discovered += Number(payload.discovered) || 0;
      } catch {
        failures += 1;
      }
    }

    setScanProgress('Refreshing review queue…');
    await load();
    setScanProgress('');
    setBusy(null);
    toast.success(`Checked ${targets.length} official school sites. ${discovered} leads added for review${failures ? `; ${failures} site scans failed` : ''}. Nothing was published automatically.`);
  }

  async function review(item: Discovery, status: 'published' | 'rejected') {
    setBusy(item.id);
    try {
      const response = await fetch('/api/admin/campus-discovery', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'review', id: item.id, status }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Could not save review decision.');
      toast.success(status === 'published' ? 'Source-attributed listing is now public.' : 'Lead dismissed.');
      await load();
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not save review decision.'); }
    finally { setBusy(null); }
  }

  return <main className="space-y-5 p-4 sm:p-6 lg:p-8">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Source-based campus directory</p><h1 className="mt-2 text-2xl font-bold sm:text-3xl">Campus discovery</h1><p className="mt-1 max-w-3xl text-sm text-muted-foreground">Scan a school’s official website for structured event and local-business listings. Leads stay private until reviewed; published items show their source and expire automatically.</p></div><Button variant="outline" onClick={() => void load()} disabled={busy !== null}><RefreshCw className={`mr-2 h-4 w-4 ${busy === 'load' ? 'animate-spin' : ''}`} />Refresh</Button></div>
    <Card><CardHeader><CardTitle className="text-base">Scan official school sources</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]"><Select value={schoolId} onValueChange={setSchoolId}><SelectTrigger aria-label="Institution to scan"><SelectValue placeholder="Choose an institution" /></SelectTrigger><SelectContent>{schools.map((school) => <SelectItem key={school.id} value={school.id}>{school.name}{school.website_url ? '' : ' · no official website configured'}</SelectItem>)}</SelectContent></Select><Button onClick={() => void scan()} disabled={!schoolId || busy !== null}><ScanSearch className="mr-2 h-4 w-4" />{busy === 'scan' ? 'Scanning…' : 'Scan one school'}</Button><Button variant="outline" onClick={() => void scanAllConfiguredSites()} disabled={busy !== null || !schools.some((school) => school.website_url)}><ScanSearch className="mr-2 h-4 w-4" />{busy === 'scan-all' ? 'Scanning all…' : `Scan all sites (${schools.filter((school) => school.website_url).length})`}</Button></CardContent></Card>
    {scanProgress && <p className="text-sm text-muted-foreground" role="status">{scanProgress}</p>}
    <div className="flex gap-2"><Button size="sm" variant={filter === 'pending_review' ? 'default' : 'outline'} onClick={() => setFilter('pending_review')}>Needs review ({items.filter((item) => item.status === 'pending_review').length})</Button><Button size="sm" variant={filter === 'published' ? 'default' : 'outline'} onClick={() => setFilter('published')}>Published ({items.filter((item) => item.status === 'published').length})</Button></div>
    {visibleItems.length ? <div className="grid gap-3 xl:grid-cols-2">{visibleItems.map((item) => <Card key={item.id}><CardContent className="space-y-3 p-4 sm:p-5"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wide text-primary">{item.university?.name || 'Institution'} · {item.listing_type === 'event' ? 'Event' : 'Business lead'}</p><h2 className="mt-1 font-semibold">{item.title}</h2></div>{item.listing_type === 'event' ? <CalendarDays className="h-5 w-5 shrink-0 text-primary" /> : <Store className="h-5 w-5 shrink-0 text-primary" />}</div>{item.summary && <p className="text-sm leading-5 text-muted-foreground">{item.summary}</p>}<p className="text-xs text-muted-foreground">{item.location ? `${item.location} · ` : ''}{item.starts_at ? new Date(item.starts_at).toLocaleString('en-GH', { dateStyle: 'medium', timeStyle: 'short' }) : 'Date not supplied'} · Source checked {new Date(item.last_checked_at).toLocaleDateString('en-GH')}</p><a href={item.source_url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-2 text-sm font-medium text-primary underline underline-offset-4">{item.source_label}<ExternalLink className="h-4 w-4" /></a>{item.status === 'pending_review' ? <div className="flex flex-wrap gap-2 border-t pt-3"><Button size="sm" onClick={() => void review(item, 'published')} disabled={busy !== null}>{busy === item.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Publish with source attribution</Button><Button size="sm" variant="outline" onClick={() => void review(item, 'rejected')} disabled={busy !== null}>Dismiss</Button></div> : <p className="border-t pt-3 text-xs text-muted-foreground">Public source lead · expires {new Date(item.expires_at).toLocaleDateString('en-GH')}</p>}</CardContent></Card>)}</div> : <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">No {filter === 'pending_review' ? 'new leads need review' : 'published source leads'} yet. Scan a school with an official website to discover structured listings.</div>}
    <p className="text-xs leading-5 text-muted-foreground">A scan reads up to five HTTPS pages on the institution’s own domain and extracts Schema.org Event and LocalBusiness records only. It does not scrape maps, collect personal contact details, publish automatically, or replace UniEco vendor verification.</p>
  </main>;
}
