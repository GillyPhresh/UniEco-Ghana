'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth/auth-context';
import { supabase } from '@/lib/supabase/client';
import { AuthLayout } from '@/components/auth/auth-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle, CheckCircle2, GraduationCap, Loader2, ShieldCheck } from 'lucide-react';

type Invite = { valid: boolean; message?: string; recipient_email?: string; institution_name?: string; institution_short_name?: string; expires_at?: string };

export default function InstitutionAdminInvitePage() {
  return <Suspense fallback={<main className="container py-12 text-center">Loading invitation…</main>}><InviteContent /></Suspense>;
}

function InviteContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';
  const router = useRouter();
  const { user, loading, refreshProfile } = useAuth();
  const [invite, setInvite] = useState<Invite | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState<string | null>(null);

  useEffect(() => {
    if (!token) { setInvite({ valid: false, message: 'Invitation link is missing.' }); return; }
    void (async () => {
      const { data, error: rpcError } = await supabase.rpc('get_institution_admin_invite', { p_token: token });
      setInvite(rpcError ? { valid: false, message: 'This invitation could not be loaded.' } : data as Invite);
    })();
  }, [token]);

  useEffect(() => {
    if (!user || !invite?.valid || accepting || accepted) return;
    void acceptInvite();
    // The invitation is accepted only after the authenticated email is checked by the database.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, invite?.valid]);

  async function acceptInvite() {
    setAccepting(true);
    setError(null);
    const { data, error: rpcError } = await supabase.rpc('accept_institution_admin_invite', { p_token: token });
    if (rpcError) setError(rpcError.message);
    else {
      const result = data as { institution_name?: string };
      setAccepted(result.institution_name || invite?.institution_name || 'your institution');
      await refreshProfile();
      window.setTimeout(() => router.push('/admin'), 1200);
    }
    setAccepting(false);
  }

  if (loading || !invite) return <AuthLayout title="Institution invitation" subtitle="Checking your secure invitation…"><div className="flex justify-center py-8"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div></AuthLayout>;

  if (!invite.valid) return <AuthLayout title="Invitation unavailable" subtitle="This administrator invitation cannot be used"><div className="space-y-5"><div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0" /><span>{invite.message || 'This invitation is invalid, expired, or already used.'}</span></div><Link href="/" className="block text-center text-sm font-medium text-primary hover:underline">Return to UniEco Ghana</Link></div></AuthLayout>;

  const next = `/institution-admin-invite?token=${encodeURIComponent(token)}`;
  return <AuthLayout title={accepted ? 'Access granted' : 'You are invited'} subtitle={accepted ? `You can now manage ${accepted}.` : 'Become the appointed institution administrator'}>
    <div className="space-y-5">
      {accepted ? <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-center"><CheckCircle2 className="mx-auto h-10 w-10 text-primary" /><p className="mt-2 text-sm font-semibold">Institution access activated</p><p className="mt-1 text-xs text-muted-foreground">Opening your management workspace…</p></div> : <>
        <Card className="border-primary/20 bg-primary/5"><CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><GraduationCap className="h-5 w-5 text-primary" />{invite.institution_name}</CardTitle></CardHeader><CardContent className="space-y-3 text-sm"><p>You have been appointed to manage this institution’s UniEco Ghana platform presence.</p><div className="flex items-start gap-2 text-muted-foreground"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span>Access is limited to this institution and is recorded in the administrator audit trail.</span></div><p className="text-xs text-muted-foreground">Invitation for {invite.recipient_email} · Expires {new Date(invite.expires_at || '').toLocaleString()}</p></CardContent></Card>
        {error && <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span></div>}
        {user ? <Button className="w-full" onClick={() => void acceptInvite()} disabled={accepting}>{accepting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}Accept and activate access</Button> : <div className="space-y-3"><p className="text-center text-sm text-muted-foreground">Create or sign in with the invited email address to activate access.</p><Link href={`/signup?institution_admin_invite=${encodeURIComponent(token)}`} className="block"><Button className="w-full">Create UniEco account</Button></Link><Link href={`/signin?next=${encodeURIComponent(next)}`} className="block text-center text-sm font-medium text-primary hover:underline">Already have an account? Sign in</Link></div>}
      </>}
    </div>
  </AuthLayout>;
}
