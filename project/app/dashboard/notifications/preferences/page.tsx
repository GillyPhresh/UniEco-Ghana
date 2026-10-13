'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/lib/auth/auth-context';
import { RouteGuard } from '@/lib/auth/route-guard';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { Bell, Mail, Smartphone, MessageCircle, Phone, Save, Check } from 'lucide-react';
import {
  getNotificationPreferences,
  updateNotificationPreferences,
  getDefaultPrefsForCategory,
} from '@/lib/data/communication-client';
import type { NotificationCategory, CategoryChannelPrefs, NotificationPreferences } from '@/lib/types/communication';
import { NOTIFICATION_CATEGORIES_FULL, CHANNEL_LABELS } from '@/lib/types/communication';

const CHANNEL_ICONS: Record<keyof CategoryChannelPrefs, typeof Bell> = {
  in_app: Bell,
  email: Mail,
  push: Smartphone,
  whatsapp: MessageCircle,
  sms: Phone,
};

export default function NotificationPreferencesPage() {
  return (
    <RouteGuard requireAuth>
      <PreferencesContent />
    </RouteGuard>
  );
}

function PreferencesContent() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  const loadPrefs = useCallback(async () => {
    setLoading(true);
    const data = await getNotificationPreferences();
    setPrefs(data);
    setHasChanges(false);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadPrefs();
  }, [loadPrefs]);

  const toggleChannel = (category: NotificationCategory, channel: keyof CategoryChannelPrefs) => {
    if (!prefs) return;
    const current = prefs[category] ?? getDefaultPrefsForCategory(category);
    setPrefs({
      ...prefs,
      [category]: { ...current, [channel]: !current[channel] },
    });
    setHasChanges(true);
  };

  const handleSave = async () => {
    if (!prefs) return;
    setSaving(true);
    const { user_id, ...prefsToStore } = prefs;
    const result = await updateNotificationPreferences(prefsToStore as Partial<Record<NotificationCategory, CategoryChannelPrefs>>);
    setSaving(false);
    if (result.error) {
      toast({ title: 'Error', description: result.error, variant: 'destructive' });
    } else {
      toast({ title: 'Preferences saved', description: 'Your notification settings have been updated.' });
      setHasChanges(false);
    }
  };

  const channels: (keyof CategoryChannelPrefs)[] = ['in_app', 'email', 'push', 'whatsapp', 'sms'];

  return (
    <>
      <SiteHeader />
      <main className="container py-6 sm:py-8 max-w-3xl">
        <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Notification Preferences
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Control how you receive communications from UniEco Ghana.
            </p>
          </div>
          {hasChanges && (
            <Button onClick={handleSave} disabled={saving} size="sm">
              {saving ? <Save className="mr-1.5 h-4 w-4 animate-pulse" /> : <Check className="mr-1.5 h-4 w-4" />}
              {saving ? 'Saving...' : 'Save changes'}
            </Button>
          )}
        </div>

        {/* Channel legend */}
        <div className="mb-5 flex flex-wrap gap-4 rounded-xl border bg-muted/30 p-3 text-xs text-muted-foreground">
          {channels.map((ch) => {
            const Icon = CHANNEL_ICONS[ch];
            return (
              <div key={ch} className="flex items-center gap-1.5">
                <Icon className="h-3.5 w-3.5" />
                {CHANNEL_LABELS[ch]}
              </div>
            );
          })}
        </div>

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
          </div>
        ) : (
          <div className="space-y-4">
            {NOTIFICATION_CATEGORIES_FULL.map((cat) => {
              const currentPrefs = prefs?.[cat.key] ?? cat.defaultPrefs;
              return (
                <Card key={cat.key}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base font-semibold">{cat.label}</CardTitle>
                    <CardDescription className="text-sm">{cat.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                      {channels.map((channel) => {
                        const Icon = CHANNEL_ICONS[channel];
                        const isEnabled = currentPrefs[channel];
                        return (
                          <button
                            key={channel}
                            onClick={() => toggleChannel(cat.key, channel)}
                            className={`flex flex-col items-center gap-1.5 rounded-lg border p-3 transition-all ${
                              isEnabled
                                ? 'border-primary/40 bg-primary/5'
                                : 'border-border bg-background opacity-60'
                            }`}
                          >
                            <Icon className={`h-5 w-5 ${isEnabled ? 'text-primary' : 'text-muted-foreground'}`} />
                            <span className={`text-xs font-medium ${isEnabled ? 'text-foreground' : 'text-muted-foreground'}`}>
                              {CHANNEL_LABELS[channel]}
                            </span>
                            <Switch checked={isEnabled} className="scale-75" />
                          </button>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          <p className="font-medium">Privacy note</p>
          <p className="mt-1 text-amber-800 dark:text-amber-300">
            Your phone number and email are never shared with other users through notifications.
            WhatsApp and SMS messages are sent through approved providers and respect your consent at all times.
            You can change these settings at any time.
          </p>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
