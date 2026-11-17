'use client';

import Link from 'next/link';
import { useCallback, useRef, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bike, CarFront, Footprints, MapPin, Navigation, PackageCheck, Phone, ShieldCheck } from 'lucide-react';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/lib/auth/auth-context';
import { withNext } from '@/lib/auth/redirects';
import { getShopCampuses } from '@/lib/data/shop-catalog-client';
import { courierGateway, CourierProgramUnavailable } from '@/lib/data/courier-client';
import {
  COURIER_VEHICLES, COURIER_WORK_PATH, PARCEL_SIZES, normalizeCourierPhone, showCourierFee,
  type CourierApplication, type CourierAssignment, type CourierVehicle, type CourierWorkspace,
} from '@/lib/courier/domain';
import type { ShopCampus } from '@/lib/marketplace/catalog';
import { businessEmail } from '@/lib/constants/business-email';
import { getGoogleMapsDirectionsUrl } from '@/lib/maps';
import { cn } from '@/lib/utils';

const vehicleIcons = { walking: Footprints, bicycle: Bike, motorbike: Bike, car: CarFront };

export default function CourierWorkPage() {
  const { user, loading } = useAuth();
  const query = useQuery<CourierWorkspace>({
    queryKey: ['courier-workspace', user?.id],
    enabled: Boolean(user?.id),
    queryFn: () => courierGateway.workspace(),
    refetchInterval: 20_000,
    retry: false,
  });
  const workspace: CourierWorkspace | undefined = query.data;
  return <>
    <SiteHeader />
    <main className="container max-w-4xl px-3 py-5 sm:px-6 sm:py-8">
      <Link href="/delivery" className="inline-flex min-h-[44px] items-center text-sm font-semibold text-primary">‹ UniEco Delivery</Link>
      <h1 className="mt-1 flex items-center gap-2 text-2xl font-black tracking-tight sm:text-3xl"><PackageCheck className="h-6 w-6 text-primary" aria-hidden="true" /> Courier workspace</h1>
      <div className="mt-4">
        {loading || (user && query.isPending) ? <p role="status" className="rounded-xl bg-muted p-4 text-sm">Loading courier workspace…</p>
          : !user ? <Button asChild><Link href={withNext('/signin', COURIER_WORK_PATH)}>Sign in</Link></Button>
          : query.error instanceof CourierProgramUnavailable ? <p className="rounded-xl border border-border p-4 text-sm">Courier applications aren’t open yet.</p>
          : query.isError || !workspace ? <div role="alert" className="rounded-xl border border-border bg-card p-4">
            <p className="mb-2 text-sm">Could not open your courier workspace. Make sure your email is confirmed.</p>
            <Button variant="outline" onClick={() => void query.refetch()}>Try again</Button>
          </div> : <Workspace key={user.id} workspace={workspace} reload={query.refetch} />}
      </div>
    </main>
    <SiteFooter />
  </>;
}

function Workspace({ workspace, reload }: { workspace: CourierWorkspace; reload: () => Promise<unknown> }) {
  const app = workspace.application;
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const act = useCallback(async (action: () => Promise<unknown>, success: string) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setNotice('');
    try { await action(); setNotice(success); await reload(); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Could not complete that action.'); await reload(); }
    finally { lock.current = false; setBusy(false); }
  }, [reload]);

  return <div className="space-y-4">
    {notice && <p role="status" className="rounded-xl border border-border bg-card px-3 py-2 text-sm">{notice}</p>}
    {!app || app.status === 'declined' ? (
      workspace.open ? <ApplicationForm applicant={app} busy={busy} submit={(...arguments_) => act(() => courierGateway.apply(...arguments_), 'Application sent for review.')} />
        : <p className="rounded-xl border border-border bg-card p-4 text-sm">New applications are closed.</p>
    ) : app.status === 'pending' ? <StatusCard title="Application under review" text="We’ll check your eligibility before you can accept work. Don’t send permits or ID numbers through chat." />
      : app.status === 'paused' ? <StatusCard title="Courier access paused" text="Contact UniEco support if you think this is a mistake." />
      : !workspace.can_work ? <StatusCard title="Approval needs attention" text="Ask support to review your eligibility or update expired documents." />
      : <>
        {workspace.assignment && <ActiveAssignment key={workspace.assignment.id + workspace.assignment.state} job={workspace.assignment} busy={busy} act={act} />}
        {!workspace.assignment && <>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4">
            <div><h2 className="font-bold">{app.display_name}</h2><p className="text-xs text-muted-foreground">{COURIER_VEHICLES[app.vehicle].title} · {app.available && workspace.open ? 'Available' : 'Offline'}</p></div>
            {workspace.open && <Button type="button" variant={app.available ? 'outline' : 'default'} aria-pressed={app.available} disabled={busy} className="min-h-[44px]"
              onClick={() => void act(() => courierGateway.setAvailable(!app.available), app.available ? 'You’re offline.' : 'You’re ready for jobs.')}>{app.available ? 'Go offline' : 'Go available'}</Button>}
          </div>
          {workspace.open && app.available ? <>
            <h2 className="text-lg font-bold">Campus offers</h2>
            {workspace.offers.length === 0 ? <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">No offers in your area.</p> : <div className="grid gap-3 sm:grid-cols-2">
              {workspace.offers.map(offer => <article key={offer.id} className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
                <div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold text-muted-foreground">{PARCEL_SIZES[offer.parcel_size]}</p><p className="text-lg font-black text-primary">{showCourierFee(offer.fee_pesewas)}</p></div>
                <p className="flex items-center gap-1.5 text-sm"><MapPin className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" /> {offer.campus}</p>
                <Button disabled={busy} className="min-h-[44px]" onClick={() => void act(() => courierGateway.claim(offer.id, offer.fee_pesewas), 'This delivery is assigned to you.')}>Accept delivery</Button>
              </article>)}
            </div>}
            <p className="text-xs text-muted-foreground">Addresses appear only on your assigned job. The displayed fee is settled by UniEco operations, not collected from the customer.</p>
          </> : <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">{workspace.open ? 'Go available to see offers in your campus area.' : 'New delivery offers are paused.'}</p>}
        </>}
      </>}
  </div>;
}

function StatusCard({ title, text }: { title: string; text: string }) {
  return <div className="rounded-2xl border border-border bg-card p-4">
    <h2 className="flex items-center gap-2 font-bold"><ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" /> {title}</h2>
    <p className="mt-2 text-sm text-muted-foreground">{text}</p>
    <a className="mt-2 inline-flex min-h-[44px] items-center text-sm font-semibold text-primary" href={`mailto:${businessEmail.support}`}>Contact support</a>
  </div>;
}

function ApplicationForm({ applicant, busy, submit }: { applicant: CourierApplication | null; busy: boolean;
  submit: (campus: string, name: string, phone: string, vehicle: CourierVehicle, attested: boolean) => Promise<void> }) {
  const [vehicle, setVehicle] = useState<CourierVehicle>(applicant?.vehicle ?? 'motorbike');
  const [campus, setCampus] = useState(applicant?.campus_id ?? '');
  const [name, setName] = useState(applicant?.display_name ?? '');
  const [phone, setPhone] = useState(applicant?.phone ?? '');
  const [attested, setAttested] = useState(false);
  const [inputError, setInputError] = useState('');
  const query = useQuery<ShopCampus[]>({
    queryKey: ['marketplace-campus-options'], queryFn: ({ signal }) => getShopCampuses(signal), staleTime: 30 * 60_000,
  });
  const campuses: ShopCampus[] = query.data ?? [];

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const number = normalizeCourierPhone(phone);
    if (!number || !campus || name.trim().length < 2 || !attested) {
      setInputError('Choose a campus and add a display name and valid Ghana phone number.');
      return;
    }
    setInputError('');
    void submit(campus, name.trim(), number, vehicle, attested);
  }

  return <form onSubmit={onSubmit} className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
    <h2 className="text-lg font-bold">{applicant ? 'Update your application' : 'Apply to deliver'}</h2>
    <fieldset className="space-y-2">
      <legend className="text-sm font-semibold">How will you deliver?</legend>
      <div className="grid grid-cols-2 gap-2">
        {(Object.keys(COURIER_VEHICLES) as CourierVehicle[]).map(mode => {
          const Icon = vehicleIcons[mode];
          return <button type="button" key={mode} aria-pressed={vehicle === mode} onClick={() => setVehicle(mode)}
            className={cn('flex min-h-[52px] items-center gap-2 rounded-xl border px-2.5 text-left text-sm font-semibold focus-visible:ring-2 focus-visible:ring-primary',
              vehicle === mode ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-background')}>
            <Icon className="h-5 w-5 shrink-0" aria-hidden="true" /> {COURIER_VEHICLES[mode].title}
          </button>;
        })}
      </div>
    </fieldset>
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1"><Label htmlFor="courier-alias">Display name</Label><Input id="courier-alias" value={name} onChange={event => setName(event.target.value)} className="min-h-[44px]" minLength={2} maxLength={50} required /></div>
      <div className="space-y-1"><Label htmlFor="courier-phone">Ghana phone</Label><Input id="courier-phone" type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={event => setPhone(event.target.value)} className="min-h-[44px]" maxLength={24} required /></div>
      <div className="space-y-1 sm:col-span-2"><Label htmlFor="courier-campus">Campus area</Label>
        <select id="courier-campus" required value={campus} onChange={event => setCampus(event.target.value)} className="min-h-[44px] w-full rounded-xl border border-border bg-background px-3 text-sm">
          <option value="">{query.isPending ? 'Loading campuses…' : 'Choose a campus'}</option>
          {campuses.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}
        </select>
        {query.isError && <button type="button" onClick={() => void query.refetch()} className="text-xs font-semibold text-primary underline">Reload campuses</button>}
      </div>
    </div>
    <label className="flex items-start gap-2 text-sm text-muted-foreground"><input type="checkbox" required checked={attested} className="mt-1" onChange={event => setAttested(event.target.checked)} />
      <span>I’m an adult, meet the rules for my delivery type, and agree to share my display name and phone with the shop and buyer on jobs I accept. Staff will verify any required licence and insurance.</span>
    </label>
    {inputError && <p role="alert" className="text-sm text-destructive">{inputError}</p>}
    <Button type="submit" disabled={busy || !attested} className="min-h-[44px]">{busy ? 'Submitting…' : 'Send application'}</Button>
  </form>;
}

function ActiveAssignment({ job, busy, act }: { job: CourierAssignment; busy: boolean;
  act: (action: () => Promise<unknown>, success: string) => Promise<void> }) {
  const [code, setCode] = useState('');
  const [showRelease, setShowRelease] = useState(false);
  const atShop = job.state === 'claimed';
  const point = job.dropoff;
  const address = atShop ? job.pickup : point ? [point.line1, point.landmark, point.city, point.region].filter(Boolean).join(', ') : null;
  const directions = address ? getGoogleMapsDirectionsUrl({ address: address + ', Ghana' }) : null;
  const shopPhone = job.shop_phone ? normalizeCourierPhone(job.shop_phone) : null;
  function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!/^\d{6}$/.test(code)) return;
    void act(async () => {
      const result = await courierGateway.recordHandoff(job.id, code);
      setCode('');
      if (!result.ok) throw new Error(result.reason === 'wait' ? 'Too many attempts. Wait 15 minutes or contact support.' : 'That code does not match. Ask the sender or receiver to check it.');
    }, atShop ? 'Pickup confirmed.' : 'Drop-off confirmed.');
  }
  return <article className="space-y-4 rounded-2xl border border-primary/30 bg-card p-4 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div><h2 className="text-lg font-bold">{atShop ? 'Collect the parcel' : 'Deliver the parcel'}</h2><p className="text-xs text-muted-foreground">{job.reference || 'Assigned delivery'} · {job.campus}</p></div>
      <span className="font-bold text-primary">{showCourierFee(job.fee_pesewas)}</span>
    </div>
    <div className="rounded-xl bg-muted p-3"><p className="text-xs font-semibold text-muted-foreground">{atShop ? `Pickup · ${job.shop}` : 'Drop-off'}</p><p className="break-words text-sm font-semibold">{address || 'Contact support for directions.'}</p></div>
    <div className="flex flex-wrap gap-2">
      {directions && <Button asChild variant="outline" className="min-h-[44px] gap-2"><a href={directions} target="_blank" rel="noopener noreferrer"><Navigation className="h-4 w-4" aria-hidden="true" /> Maps directions</a></Button>}
      {shopPhone && <Button asChild variant="outline" className="min-h-[44px] gap-2"><a href={`tel:${shopPhone}`}><Phone className="h-4 w-4" aria-hidden="true" /> Call shop</a></Button>}
    </div>
    <form onSubmit={confirm} className="space-y-2">
      <Label htmlFor="courier-handoff">{atShop ? 'Shop pickup code' : 'Customer drop-off code'}</Label>
      <div className="flex flex-wrap items-center gap-2">
        <Input id="courier-handoff" className="min-h-[44px] w-32 font-mono" value={code} inputMode="numeric" autoComplete="off" maxLength={6} onChange={event => setCode(event.target.value.replace(/\D/g, ''))} />
        <Button type="submit" disabled={busy || code.length !== 6} className="min-h-[44px]">{atShop ? 'Confirm pickup' : 'Confirm drop-off'}</Button>
      </div>
    </form>
    <p className="text-xs text-muted-foreground">Get the code when you hand over the parcel. Don’t collect the order payment.</p>
    <div className="flex flex-wrap gap-2">
      <Button asChild variant="ghost" className="min-h-[44px]"><a href={`mailto:${businessEmail.support}`}>Get delivery help</a></Button>
      {atShop && <Button type="button" variant="ghost" className="min-h-[44px]" disabled={busy} aria-expanded={showRelease}
        onClick={() => setShowRelease(!showRelease)}>Release job</Button>}
    </div>
    {atShop && showRelease && <div className="rounded-xl border border-border p-3 text-sm">
      <p>Release only if you haven’t collected the parcel. You’ll go offline.</p>
      <Button type="button" variant="outline" className="mt-2 min-h-[44px]" disabled={busy}
        onClick={() => void act(() => courierGateway.release(job.id), 'Job released. You are offline.')}>Confirm release</Button>
    </div>}
  </article>;
}
