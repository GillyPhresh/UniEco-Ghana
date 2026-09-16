'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth/auth-context';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { VendorDashboardLayout, VendorRouteGuard } from '@/components/vendor/vendor-dashboard-layout';
import { useVendor } from '@/hooks/use-vendor';
import { getVendorSettings, updateVendorSettings } from '@/lib/data/vendor-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Save, Loader2, Bell, Shield, Lock, Smartphone, Check,
  KeyRound, LogOut, Monitor,
} from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

export default function SettingsPage() {
  return (
    <VendorRouteGuard>
      <SiteHeader />
      <SettingsContent />
      <SiteFooter />
    </VendorRouteGuard>
  );
}

function SettingsContent() {
  const { user, changePassword, signOutAll } = useAuth();
  const router = useRouter();
  const { vendor, loading } = useVendor();
  const [settings, setSettings] = useState<{
    email_notifications: boolean;
    push_notifications: boolean;
    order_alerts: boolean;
    review_alerts: boolean;
    message_alerts: boolean;
    two_factor_enabled: boolean;
  } | null>(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    if (!vendor) return;
    loadSettings();
  }, [vendor]);

  async function loadSettings() {
    if (!vendor) return;
    setDataLoading(true);
    const data = await getVendorSettings(vendor.id);
    if (data) {
      setSettings({
        email_notifications: data.email_notifications,
        push_notifications: data.push_notifications,
        order_alerts: data.order_alerts,
        review_alerts: data.review_alerts,
        message_alerts: data.message_alerts,
        two_factor_enabled: data.two_factor_enabled,
      });
    } else {
      setSettings({
        email_notifications: true,
        push_notifications: true,
        order_alerts: true,
        review_alerts: true,
        message_alerts: true,
        two_factor_enabled: false,
      });
    }
    setDataLoading(false);
  }

  const handleSaveSettings = async () => {
    if (!vendor || !settings) return;
    setSaving(true);
    const { error } = await updateVendorSettings(vendor.id, settings);
    if (error) { toast.error(error); }
    else { toast.success('Settings saved'); }
    setSaving(false);
  };

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) { toast.error('New passwords do not match'); return; }
    if (newPassword.length < 6) { toast.error('Password must be at least 6 characters'); return; }

    setChangingPassword(true);
    const { error } = await changePassword(currentPassword, newPassword);
    if (error) { toast.error(error); }
    else {
      toast.success('Password changed successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    }
    setChangingPassword(false);
  };

  const handleSignOutAll = async () => {
    if (!confirm('This will sign you out from all devices. Continue?')) return;
    const { error } = await signOutAll();
    if (error) { toast.error(error); }
    else { router.push('/'); }
  };

  if (loading) {
    return (
      <VendorDashboardLayout vendorName="" isVerified={false} subscriptionStatus="none">
        <Skeleton className="h-8 w-48" />
        <div className="mt-6 space-y-4">
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
        </div>
      </VendorDashboardLayout>
    );
  }

  return (
    <VendorDashboardLayout
      vendorName={vendor?.business_name || ''}
      isVerified={vendor?.is_verified || false}
      subscriptionStatus=""
    >
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage your notification, security, and account settings.</p>
      </div>

      <div className="space-y-6">
        {/* Notification Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Bell className="h-5 w-5 text-primary" />
              Notification Settings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {dataLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-12 rounded-lg" />)}
              </div>
            ) : settings ? (
              <>
                <NotificationRow
                  icon={Bell}
                  label="Email Notifications"
                  description="Receive notifications via email"
                  checked={settings.email_notifications}
                  onChange={v => setSettings(p => p ? { ...p, email_notifications: v } : p)}
                />
                <NotificationRow
                  icon={Smartphone}
                  label="Push Notifications"
                  description="Get push notifications on your device"
                  checked={settings.push_notifications}
                  onChange={v => setSettings(p => p ? { ...p, push_notifications: v } : p)}
                />
                <NotificationRow
                  icon={Check}
                  label="Order Alerts"
                  description="When you receive a new order"
                  checked={settings.order_alerts}
                  onChange={v => setSettings(p => p ? { ...p, order_alerts: v } : p)}
                />
                <NotificationRow
                  icon={Check}
                  label="Review Alerts"
                  description="When you receive a new review"
                  checked={settings.review_alerts}
                  onChange={v => setSettings(p => p ? { ...p, review_alerts: v } : p)}
                />
                <NotificationRow
                  icon={Check}
                  label="Message Alerts"
                  description="When you receive a new message"
                  checked={settings.message_alerts}
                  onChange={v => setSettings(p => p ? { ...p, message_alerts: v } : p)}
                />
                <Button onClick={handleSaveSettings} disabled={saving} className="w-full">
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  {saving ? 'Saving...' : 'Save Settings'}
                </Button>
              </>
            ) : null}
          </CardContent>
        </Card>

        {/* Security */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Shield className="h-5 w-5 text-primary" />
              Security
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Change password */}
            <div className="space-y-3 rounded-lg border border-border p-4">
              <div className="flex items-center gap-2">
                <Lock className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-semibold text-foreground">Change Password</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="current_pw">Current Password</Label>
                <Input id="current_pw" type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} />
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="new_pw">New Password</Label>
                  <Input id="new_pw" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm_pw">Confirm New Password</Label>
                  <Input id="confirm_pw" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
                </div>
              </div>
              <Button onClick={handleChangePassword} disabled={changingPassword || !currentPassword || !newPassword} size="sm">
                {changingPassword ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
                {changingPassword ? 'Changing...' : 'Change Password'}
              </Button>
            </div>

            {/* Two-factor auth */}
            <div className="flex items-center justify-between rounded-lg border border-border p-4">
              <div>
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-muted-foreground" />
                  <p className="text-sm font-medium text-foreground">Two-Factor Authentication</p>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Add an extra layer of security to your account</p>
                <Badge variant="outline" className="mt-2 text-xs">Coming soon</Badge>
              </div>
              <Switch checked={false} disabled />
            </div>

            {/* Active sessions */}
            <div className="rounded-lg border border-border p-4">
              <div className="flex items-center gap-2">
                <Monitor className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-semibold text-foreground">Active Sessions</p>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                You are currently signed in. Manage your sessions below.
              </p>
              <Button variant="outline" size="sm" className="mt-3 text-destructive" onClick={handleSignOutAll}>
                <LogOut className="mr-2 h-3.5 w-3.5" />
                Sign out from all devices
              </Button>
            </div>

            {/* Login history info */}
            <div className="rounded-lg border border-border p-4">
              <div className="flex items-center gap-2">
                <Monitor className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-semibold text-foreground">Account Info</p>
              </div>
              <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                <p>Email: {user?.email}</p>
                <p>Role: {user?.role.replace(/_/g, ' ')}</p>
                <p>Member since: {user?.profile?.created_at ? new Date(user.profile.created_at).toLocaleDateString('en-GH', { year: 'numeric', month: 'long', day: 'numeric' }) : 'N/A'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </VendorDashboardLayout>
  );
}

function NotificationRow({ icon: Icon, label, description, checked, onChange }: {
  icon: typeof Bell;
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border p-4">
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 h-4 w-4 text-muted-foreground" />
        <div>
          <p className="text-sm font-medium text-foreground">{label}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
