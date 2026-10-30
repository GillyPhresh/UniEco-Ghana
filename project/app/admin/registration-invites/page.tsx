'use client';

import { useState } from 'react';
import { AdminRouteGuard, AdminLayout } from '@/components/admin/admin-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/lib/supabase/client';
import { Check, Copy, Loader2, ShieldCheck, Ticket } from 'lucide-react';
import { toast } from 'sonner';

type InviteResult = { token: string; audience: 'student' | 'vendor'; expires_at: string };
const REASONS = [
  ['no_momo', 'No access to MoMo'],
  ['financial_hardship', 'Financial hardship'],
  ['institution_sponsored', 'Institution-sponsored registration'],
  ['outreach', 'Community outreach or partnership'],
  ['other', 'Other reason'],
] as const;

export default function RegistrationInvitesPage() {
  return <AdminRouteGuard><AdminLayout><Content /></AdminLayout></AdminRouteGuard>;
}

function Content() {
  const [audience, setAudience] = useState<'student' | 'vendor'>('student');
  const [hours, setHours] = useState('24');
  const [reason, setReason] = useState('no_momo');
  const [note, setNote] = useState('');
  const [creating, setCreating] = useState(false);
  const [invite, setInvite] = useState<InviteResult | null>(null);

  const createInvite = async () => {
    const expiryHours = Number(hours);
    if (![24, 48, 72, 168, 720].includes(expiryHours)) {
      toast.error('Choose a valid expiry period.');
      return;
    }
    if (reason === 'other' && !note.trim()) {
      toast.error('Add a short explanation for the other reason.');
      return;
    }
    setCreating(true);
    setInvite(null);
    const reasonLabel = REASONS.find(([value]) => value === reason)?.[1] || reason;
    const auditNote = note.trim() ? `${reasonLabel}: ${note.trim()}` : reasonLabel;
    const { data, error } = await supabase.rpc('create_registration_access_invite', {
      p_audience: audience,
      p_expires_hours: expiryHours,
      p_note: auditNote,
    });
    setCreating(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    const result = data as InviteResult;
    setInvite(result);
    toast.success('Cash registration link created. Copy it now; it is shown only once.');
  };

  const inviteUrl = invite ? `${window.location.origin}/signup?invite=${encodeURIComponent(invite.token)}` : '';

  const copyInvite = async () => {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
    toast.success('Invite link copied.');
  };

  return (
    <div className="max-w-3xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="flex items-center gap-2 font-display text-2xl font-bold"><Ticket className="h-6 w-6 text-primary" /> Cash registration links</h1>
        <p className="mt-1 text-sm text-muted-foreground">Create a controlled one-time link for someone who will register with cash instead of Paystack Mobile Money.</p>
      </div>

      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardContent className="flex gap-3 p-4 text-sm">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <p>Each link is single-use, expires automatically, and is recorded against your Super Admin account. It confirms the registration fee through the approved cash workflow; normal identity and vendor verification still apply.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Create cash registration link</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Registration type</Label>
            <Select value={audience} onValueChange={(value: 'student' | 'vendor') => setAudience(value)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="student">Student — sponsored registration</SelectItem><SelectItem value="vendor">Vendor — sponsored registration</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Expires after</Label>
            <Select value={hours} onValueChange={setHours}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="24">24 hours (recommended)</SelectItem>
                <SelectItem value="48">48 hours</SelectItem>
                <SelectItem value="72">3 days</SelectItem>
                <SelectItem value="168">7 days</SelectItem>
                <SelectItem value="720">30 days</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Reason for sponsorship</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{REASONS.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2"><Label htmlFor="note">Additional details {reason === 'other' ? '(required)' : '(optional)'}</Label><Input id="note" placeholder="Recipient name or short explanation" value={note} onChange={event => setNote(event.target.value)} /></div>
          <Button onClick={() => void createInvite()} disabled={creating}>{creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Ticket className="mr-2 h-4 w-4" />}Create one-time link</Button>
        </CardContent>
      </Card>

      {invite && <Card className="border-primary/30"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Check className="h-5 w-5 text-primary" /> Link ready — copy it now</CardTitle></CardHeader><CardContent className="space-y-3"><p className="text-sm text-muted-foreground">This link expires {new Date(invite.expires_at).toLocaleString()} and cannot be displayed again after leaving this page.</p><div className="flex gap-2"><Input readOnly value={inviteUrl} /><Button variant="outline" onClick={() => void copyInvite()}><Copy className="mr-2 h-4 w-4" />Copy</Button></div></CardContent></Card>}
    </div>
  );
}
