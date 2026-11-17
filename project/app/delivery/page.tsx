import Link from 'next/link';
import { Bike, CarFront, Footprints, PackageCheck, ShieldCheck } from 'lucide-react';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { CatalogPhoto } from '@/components/marketplace/catalog-photo';
import { CourierEntry } from '@/components/courier/courier-entry';
import { courierPhotography } from '@/lib/courier/photography';

export const metadata = {
  title: 'Deliver with UniEco Ghana',
  description: 'Apply to deliver Marketplace parcels by foot, bicycle, motorbike or car.',
};

const modes = [
  { name: 'On foot', icon: Footprints },
  { name: 'Bicycle', icon: Bike },
  { name: 'Motorbike / okada', icon: Bike },
  { name: 'Car / taxi', icon: CarFront },
] as const;

export default function DeliveryPage() {
  return <>
    <SiteHeader />
    <main className="container max-w-5xl px-3 py-5 sm:px-6 sm:py-8">
      <Link href="/marketplace" className="mb-3 inline-flex min-h-[44px] items-center text-sm font-semibold text-primary">‹ Marketplace</Link>
      <section className="overflow-hidden rounded-[1.75rem] border border-border bg-card sm:grid sm:grid-cols-2">
        <div className="relative aspect-[16/8] bg-muted sm:aspect-auto sm:min-h-[22rem]">
          <CatalogPhoto sources={[courierPhotography.image]} alt="A courier hands a parcel to a customer at the door." sizes="(min-width: 1024px) 520px, (min-width: 640px) 50vw, 97vw" priority />
        </div>
        <div className="flex flex-col justify-center px-4 py-5 sm:px-7 lg:px-9">
          <p className="mb-2 flex items-center gap-2 text-xs font-extrabold uppercase tracking-[.17em] text-primary"><PackageCheck className="h-4 w-4" aria-hidden="true" /> UniEco Delivery</p>
          <h1 className="text-3xl font-black tracking-tight sm:text-4xl">Deliver near campus.</h1>
          <p className="mt-2 text-sm text-muted-foreground">Apply to take parcel jobs from UniEco shops. See the fee before you accept.</p>
          <CourierEntry />
        </div>
      </section>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        {modes.map(({ name, icon: Icon }) => <div key={name} className="flex min-h-[64px] items-center gap-2.5 rounded-xl border border-border bg-card px-2.5 text-sm font-semibold sm:px-4">
          <Icon className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />{name}
        </div>)}
      </div>
      <p className="mt-4 flex items-start gap-2 text-sm text-muted-foreground"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" /> Parcels only. Applications are free. Staff verify eligibility and applicable licences before you can accept jobs.</p>
      <Link href="/marketplace/photo-credits" className="mt-3 inline-flex min-h-[44px] items-center text-xs text-muted-foreground underline">Photo credits</Link>
    </main>
    <SiteFooter />
  </>;
}
