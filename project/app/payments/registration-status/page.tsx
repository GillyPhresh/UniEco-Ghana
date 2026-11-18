import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { parseRegistrationAccess, registrationReminderRole } from '@/lib/auth/registration-access';

export const dynamic = 'force-dynamic';

export default async function RegistrationStatus({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  const { state } = await searchParams;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('get_my_registration_access');
  const access = error ? null : parseRegistrationAccess(data);
  const role = registrationReminderRole(access);
  const exempt = access?.status === 'staff_exempt' || access?.buyer_restricted;
  const paid = access?.status === 'paid' || access?.status === 'cash_verified';
  const home = access?.role === 'super_admin' || access?.role === 'moderator' ? '/admin'
    : access?.role === 'university_admin' ? '/university-admin' : access?.allowed ? '/dashboard' : '/onboarding';

  let title = 'We couldn’t open checkout';
  let description = 'No new checkout was opened on this page. Please try again in a moment or contact support.';
  let href = role ? '/payments/registration-checkout' : home;
  let label = role ? 'Try checkout again' : 'Back to UniEco';
  if (exempt || paid || (access?.allowed && !role)) {
    title = paid ? 'Your registration payment is confirmed' : 'No registration payment is due';
    description = 'You don’t need to pay from this reminder. You can close it and continue using UniEco.';
    href = home;
    label = exempt && !access?.allowed ? 'Continue free registration' : 'Back to UniEco';
  } else if (role && state === 'check') {
    title = 'Check your registration payment';
    description = 'We couldn’t safely reopen the previous Paystack checkout yet. If you already paid or approved a Mobile Money prompt, don’t pay again. Try checking again shortly.';
    label = 'Check with Paystack again';
  } else if (access && (state === 'details' || (!role && state === 'no-fee'))) {
    title = 'Continue your registration';
    description = 'This link did not open a payment. Check your registration details to see your next step.';
    href = access.registration_path ?? home;
    label = 'Continue registration';
  }

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-xl items-center px-5 py-14">
      <section className="w-full rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
        <p className="mb-3 text-sm font-medium text-muted-foreground">UniEco Ghana · Registration</p>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{description}</p>
        <div className="mt-6 flex flex-wrap items-center gap-4 text-sm">
          <Link prefetch={false} href={href} className="rounded-lg bg-primary px-4 py-3 font-semibold text-primary-foreground">{label}</Link>
          <a className="underline underline-offset-4" href="mailto:support@uniecoghana.com">Contact support</a>
        </div>
      </section>
    </main>
  );
}
