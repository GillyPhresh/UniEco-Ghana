import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { businessEmail } from '@/lib/constants/business-email';

export const metadata = {
  title: 'Privacy Policy | UniEco Ghana',
  description: 'How UniEco Ghana handles account, payment, communication, and platform data.',
};

export default function PrivacyPolicyPage() {
  return (
    <>
      <SiteHeader />
      <main className="container max-w-3xl py-10 sm:py-16">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">UniEco Ghana</p>
        <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Privacy Policy</h1>
        <p className="mt-3 text-sm text-muted-foreground">Last updated: 17 November 2026</p>
        <div className="mt-8 space-y-7 text-sm leading-7 text-muted-foreground">
          <section><h2 className="font-display text-lg font-semibold text-foreground">Information we use</h2><p className="mt-2">We use the account, university, vendor, order, payment, support, and notification details needed to provide UniEco Ghana and keep it safe.</p></section>
          <section><h2 className="font-display text-lg font-semibold text-foreground">Payments</h2><p className="mt-2">Paystack processes card and Mobile Money payments. UniEco Ghana records the verified payment result and reference needed to provide receipts, access, reconciliation, and support. We do not store card details.</p></section>
          <section><h2 className="font-display text-lg font-semibold text-foreground">Courier delivery</h2><p className="mt-2">Courier applications use a display name, phone number, campus area, and delivery type for review by authorised staff. A courier’s name and number are shared with the buyer and shop only during an accepted delivery. If you allow courier delivery for an order, the assigned courier sees the shop’s pickup point and receives your drop-off address after collecting the parcel. Addresses and handoff codes are not included in public job offers.</p></section>
          <section><h2 className="font-display text-lg font-semibold text-foreground">Messages and notifications</h2><p className="mt-2">We may send account, payment, order, safety, event, and service messages through the channels you enable. Notification links are checked before they are used.</p></section>
          <section><h2 className="font-display text-lg font-semibold text-foreground">Your choices</h2><p className="mt-2">You can manage notification preferences in your account and contact us about access, correction, or privacy requests at <a className="text-primary hover:underline" href={`mailto:${businessEmail.support}`}>{businessEmail.support}</a>.</p></section>
          <section><h2 className="font-display text-lg font-semibold text-foreground">Contact</h2><p className="mt-2">UniEco Ghana · <a className="text-primary hover:underline" href={`mailto:${businessEmail.general}`}>{businessEmail.general}</a> · <a className="text-primary hover:underline" href="https://www.uniecoghana.com">www.uniecoghana.com</a></p></section>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
