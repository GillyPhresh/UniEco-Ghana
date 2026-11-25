'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AuthLayout } from '@/components/auth/auth-layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { COURIER_PROGRAM_KEY } from '@/components/courier/courier-entry';
import { useAuth } from '@/lib/auth/auth-context';
import { withNext } from '@/lib/auth/redirects';
import { COURIER_WORK_PATH } from '@/lib/courier/domain';
import { courierGateway } from '@/lib/data/courier-client';

export default function CourierJoinPage() {
  const { user, signUp, loading } = useAuth();
  const router = useRouter();
  const program = useQuery<boolean>({ queryKey: COURIER_PROGRAM_KEY, queryFn: () => courierGateway.availability() });
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!agreed || saving || program.data !== true) return;
    setSaving(true);
    setError('');
    try {
      const result = await signUp(email.trim(), password, { full_name: name.trim(), signup_experience: 'courier' });
      if (result.error) setError('Could not create the account. Check your email or sign in if you already have an account.');
      else if (result.session) router.replace(COURIER_WORK_PATH);
      else setSubmitted(true);
    } finally { setSaving(false); }
  }

  return <AuthLayout title="Join as a courier" subtitle="Free account · no student registration fee">
    {user ? <Button asChild className="w-full min-h-[44px]"><Link href={COURIER_WORK_PATH}>Open courier workspace</Link></Button>
      : submitted ? <p role="status" className="rounded-xl border border-primary/25 bg-primary/5 p-4 text-sm">Check your email to confirm your account, then complete your courier application.</p>
      : program.isPending || loading ? <p role="status" className="text-sm text-muted-foreground">Checking applications…</p>
      : program.data !== true ? <div className="space-y-3">
        <p className="text-sm text-muted-foreground">{program.isError ? 'Could not check applications.' : 'New applications are closed.'}</p>
        <Button asChild variant="outline"><Link href="/delivery">Back to delivery</Link></Button>
      </div>
      : <form onSubmit={onSubmit} className="space-y-3">
        <p className="text-xs text-muted-foreground">Your display name is public. You can choose a nickname or hide your registered name in Profile.</p>
        <div className="space-y-1"><Label htmlFor="courier-account-name">Display name</Label><Input className="min-h-[44px]" id="courier-account-name" autoComplete="nickname" required minLength={2} maxLength={50} value={name} onChange={event => setName(event.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor="courier-account-email">Email address</Label><Input className="min-h-[44px]" id="courier-account-email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor="courier-password">Password</Label><Input className="min-h-[44px]" id="courier-password" type="password" autoComplete="new-password" minLength={8} maxLength={72} required value={password} onChange={event => setPassword(event.target.value)} /></div>
        <label className="flex min-h-[44px] items-start gap-2 text-sm"><input type="checkbox" className="mt-1" required checked={agreed} onChange={event => setAgreed(event.target.checked)} /><span>I agree to the <Link href="/terms-of-service" className="underline">terms</Link> and <Link href="/privacy-policy" className="underline">privacy policy</Link>.</span></label>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={saving || !agreed} className="w-full min-h-[44px]">{saving ? 'Creating account…' : 'Create courier account'}</Button>
      </form>}
    {!user && <p className="mt-4 text-sm text-muted-foreground">Have an account? <Link className="font-semibold text-primary" href={withNext('/signin', COURIER_WORK_PATH)}>Sign in</Link></p>}
  </AuthLayout>;
}
