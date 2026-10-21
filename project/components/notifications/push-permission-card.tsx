'use client';

import { useEffect, useState } from 'react';
import { Bell, Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { subscribeToPush } from '@/lib/data/communication-client';

function decodeBase64Url(value: string) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

async function getPushRegistration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration('/');
  const registration = existing || await navigator.serviceWorker.register('/sw.js', {
    scope: '/',
    updateViaCache: 'none',
  });
  await registration.update().catch(() => undefined);
  return registration;
}

export function PushPermissionCard() {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    getPushRegistration()
      .then(async (registration) => {
        const subscription = await registration.pushManager.getSubscription();
        if (!subscription) return;
        const subscriptionJson = subscription.toJSON();
        const endpoint = subscriptionJson.endpoint;
        const p256dh = subscriptionJson.keys?.p256dh;
        const auth = subscriptionJson.keys?.auth;
        if (!endpoint || !p256dh || !auth) return;
        const result = await subscribeToPush({
          endpoint,
          keys: { p256dh, auth },
          expirationTime: subscriptionJson.expirationTime,
        });
        if (!cancelled) {
          if (result.error) setSyncError(result.error);
          else setEnabled(true);
        }
      })
      .catch(() => {
        if (!cancelled) setSyncError('Could not synchronize this device with UniEco.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const enablePush = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      toast({ title: 'Push not supported', description: 'This browser does not support web push notifications.', variant: 'destructive' });
      return;
    }
    setBusy(true);
    setSyncError(null);
    try {
      const configResponse = await fetch('/api/notifications/push-config');
      const config = await configResponse.json();
      if (!configResponse.ok) throw new Error(config.error || 'Push notifications are not configured.');

      if (Notification.permission === 'denied') {
        throw new Error('Notifications are blocked for UniEco in this browser. Allow them in site settings, then try again.');
      }
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') throw new Error('Notification permission was not granted.');

      const registration = await getPushRegistration();
      const subscription = await registration.pushManager.getSubscription() || await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: decodeBase64Url(config.publicKey),
        });
      const subscriptionJson = subscription.toJSON();
      const endpoint = subscriptionJson.endpoint;
      const p256dh = subscriptionJson.keys?.p256dh;
      const auth = subscriptionJson.keys?.auth;
      if (!endpoint || !p256dh || !auth) {
        throw new Error('The browser returned an incomplete push subscription.');
      }
      const result = await subscribeToPush({
        endpoint,
        keys: { p256dh, auth },
        expirationTime: subscriptionJson.expirationTime,
      });
      if (result.error) throw new Error(result.error);
      setEnabled(true);
      toast({ title: 'Push notifications enabled', description: 'UniEco can now alert you about important updates.' });
    } catch (error) {
      toast({ title: 'Could not enable push notifications', description: error instanceof Error ? error.message : 'Please try again.', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-5 flex flex-col gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <Bell className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div>
          <p className="font-medium">Device notifications</p>
          <p className="text-sm text-muted-foreground">Receive important UniEco updates even when the site is closed.</p>
        </div>
      </div>
      <Button type="button" size="sm" onClick={enablePush} disabled={busy} className="shrink-0">
        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : enabled ? <Check className="mr-2 h-4 w-4" /> : null}
        {enabled ? 'Enabled' : 'Enable push'}
      </Button>
      {syncError && <p className="text-xs text-destructive sm:max-w-xs sm:text-right">{syncError}</p>}
    </div>
  );
}
