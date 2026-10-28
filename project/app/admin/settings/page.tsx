'use client';

import { useCallback, useEffect, useState } from 'react';
import { AdminLayout, AdminRouteGuard } from '@/components/admin/admin-layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { AlertTriangle, CheckCircle2, Clock3, History, LockKeyhole, RotateCcw, Save, Settings2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import {
  getAdminPlatformSettings, getAdminPlatformSettingHistory, rollbackAdminPlatformSettingChange,
  updateAdminPlatformSetting, type AdminPlatformSetting, type AdminPlatformSettingChange,
} from '@/lib/data/platform-settings-client';

type PendingChange = { setting: AdminPlatformSetting; nextValue: boolean | number | string } | null;

export default function PlatformSettingsPage() {
  return <AdminRouteGuard><AdminLayout><Content /></AdminLayout></AdminRouteGuard>;
}

function Content() {
  const [settings, setSettings] = useState<AdminPlatformSetting[]>([]);
  const [history, setHistory] = useState<AdminPlatformSettingChange[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingChange>(null);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [rollback, setRollback] = useState<AdminPlatformSettingChange | null>(null);
  const [rollbackReason, setRollbackReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextSettings, nextHistory] = await Promise.all([getAdminPlatformSettings(), getAdminPlatformSettingHistory()]);
      setSettings(nextSettings);
      setHistory(nextHistory);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load platform settings.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const submitChange = async () => {
    if (!pending || reason.trim().length < 10) return;
    setSaving(true);
    const result = await updateAdminPlatformSetting(pending.setting.setting_key, pending.nextValue, reason.trim());
    setSaving(false);
    if (result.error) { toast.error('Unable to save this setting.'); return; }
    toast.success(`${pending.setting.label} updated safely.`);
    setPending(null); setReason(''); void load();
  };

  const submitRollback = async () => {
    if (!rollback || rollbackReason.trim().length < 10) return;
    setSaving(true);
    const result = await rollbackAdminPlatformSettingChange(rollback.change_id, rollbackReason.trim());
    setSaving(false);
    if (result.error) { toast.error('Unable to roll back this setting.'); return; }
    toast.success(`${rollback.label} rolled back.`);
    setRollback(null); setRollbackReason(''); void load();
  };

  return <div className="space-y-5 p-4 pb-28 sm:p-6 lg:pb-8">
    <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div><h1 className="flex items-center gap-2 font-display text-2xl font-bold"><Settings2 className="h-6 w-6 text-primary" /> Platform settings</h1><p className="mt-1 max-w-2xl text-sm text-muted-foreground">Safe, reversible controls for the Super Admin. These controls do not replace code review or database migration safeguards.</p></div>
      <Button variant="outline" onClick={() => void load()} disabled={loading}><Clock3 className="mr-2 h-4 w-4" /> Refresh</Button>
    </header>

    <div className="grid gap-3 sm:grid-cols-3"><Card><CardContent className="flex items-center gap-3 p-4"><ShieldCheck className="h-5 w-5 text-success" /><div><p className="text-xs text-muted-foreground">Authority</p><p className="font-semibold">Super Admin only</p></div></CardContent></Card><Card><CardContent className="flex items-center gap-3 p-4"><History className="h-5 w-5 text-info" /><div><p className="text-xs text-muted-foreground">Changes</p><p className="font-semibold">Audited and reversible</p></div></CardContent></Card><Card><CardContent className="flex items-center gap-3 p-4"><LockKeyhole className="h-5 w-5 text-warning" /><div><p className="text-xs text-muted-foreground">Protected</p><p className="font-semibold">Auth, payments, roles</p></div></CardContent></Card></div>

    <Card><CardHeader><CardTitle className="text-base">Feature flags and editable controls</CardTitle><p className="text-sm text-muted-foreground">Every change requires a reason and is recorded in the history below. Flags only affect modules that explicitly consume them.</p></CardHeader><CardContent>{loading ? <div className="space-y-3"><div className="h-16 animate-pulse rounded-xl bg-muted" /><div className="h-16 animate-pulse rounded-xl bg-muted" /></div> : error ? <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive" role="alert">{error}<Button className="ml-3" size="sm" variant="outline" onClick={() => void load()}>Retry</Button></div> : <div className="divide-y">{settings.map((setting) => <SettingRow key={setting.setting_key} setting={setting} onRequestChange={(nextValue) => { setReason(''); setPending({ setting, nextValue }); }} />)}</div>}</CardContent></Card>

    <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><History className="h-5 w-5 text-primary" /> Recent setting changes</CardTitle><p className="text-sm text-muted-foreground">Rollback creates a new audited change; it never erases history.</p></CardHeader><CardContent>{history.length === 0 ? <p className="text-sm text-muted-foreground">No setting changes have been recorded yet.</p> : <div className="space-y-3">{history.map((change) => <article key={change.change_id} className="rounded-xl border p-3 sm:p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{change.label}</p><Badge variant="outline">{formatValue(change.new_value)}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{change.reason}</p><p className="mt-1 text-xs text-muted-foreground">{change.changed_by_name} · {new Date(change.created_at).toLocaleString('en-GH')}</p></div><Button size="sm" variant="outline" onClick={() => { setRollbackReason(''); setRollback(change); }}><RotateCcw className="mr-2 h-3.5 w-3.5" /> Roll back</Button></div></article>)}</div>}</CardContent></Card>

    {pending && <ConfirmationPanel title={`Save ${pending.setting.label}?`} description={`Change ${pending.setting.setting_key} from ${formatValue(pending.setting.value)} to ${formatValue(pending.nextValue)}. This change will be audited.`} reason={reason} setReason={setReason} saving={saving} onCancel={() => setPending(null)} onConfirm={() => void submitChange()} action="Save change" />}
    {rollback && <ConfirmationPanel title={`Roll back ${rollback.label}?`} description={`Restore the value from before this change: ${formatValue(rollback.old_value)}. A new audit entry will be created.`} reason={rollbackReason} setReason={setRollbackReason} saving={saving} onCancel={() => setRollback(null)} onConfirm={() => void submitRollback()} action="Roll back" danger />}
  </div>;
}

function SettingRow({ setting, onRequestChange }: { setting: AdminPlatformSetting; onRequestChange: (value: boolean | number | string) => void }) {
  const [draft, setDraft] = useState(String(setting.value));
  useEffect(() => { setDraft(String(setting.value)); }, [setting.value]);
  return <div className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold">{setting.label}</h2><Badge variant="outline" className="font-mono text-[10px]">{setting.setting_key}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{setting.description}</p><p className="mt-1 text-xs text-muted-foreground">Current: <span className="font-medium text-foreground">{formatValue(setting.value)}</span></p></div>{setting.value_type === 'boolean' ? <Switch checked={Boolean(setting.value)} disabled={!setting.is_editable} onCheckedChange={(value) => onRequestChange(value)} aria-label={`Change ${setting.label}`} /> : <div className="flex w-full gap-2 sm:max-w-sm"><Input value={draft} maxLength={240} disabled={!setting.is_editable} onChange={(event) => setDraft(event.target.value)} aria-label={setting.label} /><Button variant="outline" size="sm" disabled={!setting.is_editable || draft === String(setting.value)} onClick={() => onRequestChange(draft)}><Save className="mr-2 h-4 w-4" /> Save</Button></div>}</div>;
}

function ConfirmationPanel({ title, description, reason, setReason, saving, onCancel, onConfirm, action, danger = false }: { title: string; description: string; reason: string; setReason: (value: string) => void; saving: boolean; onCancel: () => void; onConfirm: () => void; action: string; danger?: boolean }) {
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-3 sm:items-center sm:p-6"><Card className="w-full max-w-lg shadow-2xl"><CardHeader><CardTitle className="flex items-center gap-2 text-base">{danger ? <AlertTriangle className="h-5 w-5 text-warning" /> : <ShieldCheck className="h-5 w-5 text-primary" />}{title}</CardTitle><p className="text-sm text-muted-foreground">{description}</p></CardHeader><CardContent className="space-y-3"><div><Label htmlFor="setting-change-reason">Reason required</Label><Textarea id="setting-change-reason" value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} placeholder="Explain why this safe configuration change is needed (at least 10 characters)." rows={3} /></div><div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button variant="outline" onClick={onCancel} disabled={saving}>Cancel</Button><Button onClick={onConfirm} disabled={saving || reason.trim().length < 10}>{saving ? 'Saving…' : action}</Button></div></CardContent></Card></div>;
}

function formatValue(value: boolean | number | string) {
  if (typeof value === 'boolean') return value ? 'Enabled' : 'Disabled';
  if (value === '') return 'Empty';
  return String(value);
}
