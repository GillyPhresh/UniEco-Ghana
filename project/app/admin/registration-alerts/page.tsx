'use client';

import { useEffect, useState } from 'react';
import { AdminLayout, AdminRouteGuard } from '@/components/admin/admin-layout';
import { useAuth } from '@/lib/auth/auth-context';
import { supabase } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

type Contact = {
  id: string; created_at: string; kind: string; full_name: string | null; email: string | null;
  email_confirmed: boolean; phone: string | null; business_name: string | null; business_phone: string | null;
  business_email: string | null; university_name: string | null;
};
type Cursor = Pick<Contact, 'created_at' | 'id'> | null;
const pageSize = 25;
const labels: Record<string,string> = { buyer: 'Buyer setup', student: 'Student seller setup', external_vendor: 'Business setup',
  undecided: 'Account setup', student_completed: 'Student registered', vendor_completed: 'Business registered' };

function ContactLine({ label, value, phone = false }: { label: string; value: string | null; phone?: boolean }) {
  const href = !value ? undefined : phone
    ? (/^\+?[\d ()-]{5,24}$/.test(value) ? `tel:${value.replace(/[^+\d]/g,'')}` : undefined)
    : (/^[^\s@,;:?<>]+@[^\s@,;:?<>]+\.[^\s@,;:?<>]+$/.test(value) ? `mailto:${encodeURIComponent(value).replace('%40','@')}` : undefined);
  return <div className="min-w-0">
    <dt className="text-xs text-muted-foreground">{label}</dt>
    <dd className="break-all text-sm">{href ? <a className="inline-flex min-h-[44px] items-center font-medium text-primary underline" href={href}>{value}</a>
      : value || 'Not on file'}</dd>
  </div>;
}

function ContactList({ view }: { view: 'pending' | 'completed' }) {
  const [pages, setPages] = useState<Cursor[]>([null]);
  const cursor = pages[pages.length - 1];
  const [revision, setRevision] = useState(0);
  const [rows, setRows] = useState<Contact[]>([]);
  const [hasNext, setHasNext] = useState(false);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let current = true;
    async function load() {
      setStatus('loading'); setRows([]); setHasNext(false);
      try {
        const {data,error} = await supabase.rpc('registration_contact_page', {
          p_view: view, p_before: cursor?.created_at ?? null, p_before_id: cursor?.id ?? null, p_limit: pageSize + 1,
        });
        if (error) throw error;
        if (!current) return;
        const records = (data ?? []) as Contact[];
        setRows(records.slice(0,pageSize)); setHasNext(records.length > pageSize); setStatus('ready');
      } catch { if (current) setStatus('error'); }
    }
    void load();
    return () => { current = false; };
  }, [view,cursor,revision]);

  return <section className="space-y-3" aria-label="Registration contacts">
    <div className="flex items-center justify-between gap-2">
      <span aria-live="polite" className="text-sm text-muted-foreground">Page {pages.length}</span>
      <Button variant="outline" disabled={status==='loading'} onClick={() => {setPages([null]); setRevision(n=>n+1);}}>Refresh</Button>
    </div>
    {status==='loading' ? <p role="status">Loading contacts…</p> : status==='error' ? <p role="alert">Contacts could not be loaded. Refresh to retry.</p>
      : rows.length===0 ? <p>{view==='pending' ? 'No unfinished registrations on this page.' : 'No completed registration alerts on this page.'}</p>
      : rows.map(row => <Card key={row.id}><CardContent className="space-y-3 p-4">
        <div><p className="text-xs text-muted-foreground">{labels[row.kind] || 'Registration'} · {new Date(row.created_at).toLocaleDateString('en-GH', {dateStyle:'medium'})}</p>
          <h2 className="break-words text-lg font-semibold">{row.full_name || 'Name not on file'}</h2>
          <p className="break-words text-sm">{[row.business_name,row.university_name].filter(Boolean).join(' · ')}</p></div>
        <dl className="grid gap-3 sm:grid-cols-2">
          <ContactLine label={row.email && !row.email_confirmed ? 'Signup email · unconfirmed' : 'Signup email'} value={row.email}/>
          <ContactLine label="Account phone" value={row.phone} phone/>
          {(row.business_phone || row.business_email) && <>
            <ContactLine label="Business phone" value={row.business_phone} phone/>
            <ContactLine label="Business email" value={row.business_email}/>
          </>}
        </dl>
      </CardContent></Card>)}
    <nav aria-label="Contact pages" className="flex justify-between">
      <Button variant="outline" disabled={pages.length<2 || status==='loading'} onClick={()=>setPages(p=>p.slice(0,-1))}>Previous</Button>
      <Button variant="outline" disabled={!hasNext || status!=='ready'} onClick={()=>{
        const last=rows[rows.length-1]; if(last) setPages(p=>[...p,{created_at:last.created_at,id:last.id}]);
      }}>Next</Button>
    </nav>
  </section>;
}

function Followups() {
  const { user } = useAuth();
  const [view,setView] = useState<'pending'|'completed'>('pending');
  if (user?.role !== 'super_admin') return null;
  return <main className="mx-auto w-full max-w-4xl space-y-4 p-4 sm:p-6">
    <header><p className="text-xs font-semibold text-primary">Super Admin · Private</p>
      <h1 className="text-2xl font-bold">Registration follow-ups</h1>
      <p className="mt-1 text-sm text-muted-foreground">Unfinished accounts appear 30 minutes after signup. Use submitted contacts for registration support only.</p></header>
    <div className="flex gap-2">{(['pending','completed'] as const).map(key=><Button key={key} aria-pressed={view===key} variant={view===key?'default':'outline'} onClick={()=>setView(key)}>
      {key==='pending'?'Needs follow-up':'Completed alerts'}</Button>)}</div>
    <ContactList key={user.id+view} view={view}/>
  </main>;
}

export default function RegistrationAlertsPage() {
  return <AdminRouteGuard><AdminLayout><Followups/></AdminLayout></AdminRouteGuard>;
}
