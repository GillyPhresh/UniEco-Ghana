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

export default function RegistrationInvitesPage() {
  return <AdminRouteGuard><AdminLayout><Content /></AdminLayout></AdminRouteGuard>;
}

function Content() {
  const [audience, setAudience] = useState<'student' | 'vendor'>('student');
  const [hours, setHours] = useState('168');
  const [note, setNote] = useState('');
  const [creating, setCreating] = useState(false);
  const [invite, setInvite] = useState<InviteResult | null>(null);

  const createInvite = async () => {
    setCreating(true);
    setInvite(null);
    const { data, error } = await supabase.rpc('create_registration_access_invite', {
      p_audience: audience,
      p_expires_hours: Number(hours),
      p_note: note.trim() || null,
    });
    setCreating(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    const result = data as InviteResult;
    setInvite(result);
    toast.success('Sponsored registration link created. Copy it now; it is shown only once.');
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
        <h1 className="flex items-center gap-2 font-display text-2xl font-bold"><Ticket className="h-6 w-6 text-primary" /> Sponsored access</h1>
        <p className="mt-1 text-sm text-muted-foreground">Create a controlled registration link for someone whose registration fee is being sponsored.</p>
      </div>

      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardContent className="flex gap-3 p-4 text-sm">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <p>Each link is single-use, expires automatically, and is recorded against your Super Admin account. It waives only the registration fee; normal identity and vendor verification still apply.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Create invite</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Registration type</Label>
            <Select value={audience} onValueChange={(value: 'student' | 'vendor') => setAudience(value)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="student">Student — sponsored GH₵10 fee</SelectItem><SelectItem value="vendor">Vendor — sponsored GH₵20 fee</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="space-y-2"><Label htmlFor="hours">Expires after (hours)</Label><Input id="hours" type="number" min={1} max={720} value={hours} onChange={event => setHours(event.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="note">Internal note (optional)</Label><Input id="note" placeholder="Reason or recipient name" value={note} onChange={event => setNote(event.target.value)} /></div>
          <Button onClick={() => void createInvite()} disabled={creating || !hours}>{creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Ticket className="mr-2 h-4 w-4" />}Create one-time link</Button>
        </CardContent>
      </Card>

      {invite && <Card className="border-primary/30"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Check className="h-5 w-5 text-primary" /> Link ready — copy it now</CardTitle></CardHeader><CardContent className="space-y-3"><p className="text-sm text-muted-foreground">This link expires {new Date(invite.expires_at).toLocaleString()} and cannot be displayed again after leaving this page.</p><div className="flex gap-2"><Input readOnly value={inviteUrl} /><Button variant="outline" onClick={() => void copyInvite()}><Copy className="mr-2 h-4 w-4" />Copy</Button></div></CardContent></Card>}
    </div>
  );
}
