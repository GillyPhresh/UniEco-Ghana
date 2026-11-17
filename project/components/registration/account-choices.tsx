import { ChevronRight, GraduationCap, ShoppingBag, Store } from 'lucide-react';
import type { RegistrationIntent } from '@/lib/auth/registration-access';

const choices = {
  buyer: { name: 'Student buyer', description: 'Shop, message and explore. No posting or referral links.', badge: 'Free', icon: ShoppingBag },
  student: { name: 'Student seller', description: 'Sell, publish campus posts and earn eligible referrals.', badge: 'Paid', icon: GraduationCap },
  external_vendor: { name: 'Business', description: 'Register a business and submit it for approval.', badge: 'Paid', icon: Store },
} as const;

export const registrationAccountName = (intent: RegistrationIntent) => choices[intent].name;

export function AccountChoices({
  onChoose,
  busy = false,
  sellerInvite = false,
}: {
  onChoose: (intent: RegistrationIntent) => void;
  busy?: boolean;
  sellerInvite?: boolean;
}) {
  const choice = (intent: RegistrationIntent) => {
    const { name, description, badge, icon: Icon } = choices[intent];
    return (
      <button type="button" onClick={() => onChoose(intent)} disabled={busy}
        className="group flex min-h-[4.75rem] w-full items-center gap-3 rounded-xl border border-border bg-card p-3 text-left text-card-foreground transition hover:border-primary/50 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 sm:px-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><Icon className="size-5" aria-hidden="true" /></span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm font-semibold">
            {name}
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">{badge}</span>
          </span>
          <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{description}</span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground group-hover:text-primary" aria-hidden="true" />
      </button>
    );
  };
  return (
    <div className="space-y-4">
      {sellerInvite && <p className="text-xs leading-5 text-muted-foreground">This invitation is for a seller or business. You can still join as a free buyer without using it.</p>}
      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-semibold">I’m joining as a student</legend>
        {choice('buyer')}
        {choice('student')}
      </fieldset>
      <fieldset>
        <legend className="mb-2 text-sm font-semibold">I’m registering a business</legend>
        {choice('external_vendor')}
      </fieldset>
    </div>
  );
}
