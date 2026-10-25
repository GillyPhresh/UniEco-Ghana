'use client';

import { useEffect, useState } from 'react';
import { Bell, Check, Info, Loader2, RefreshCw, Send, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { subscribeToPush } from '@/lib/data/communication-client';
import { supabase } from '@/lib/supabase/client';

type PushSupport = {
  supported: boolean;
  installRequired: boolean;
  message: string;
};

function decodeBase64Url(value: string) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  if (bytes.length !== 65 || bytes[0] !== 4) {
    throw new Error('The production VAPID public key is invalid. Please regenerate one VAPID key pair and use the public key on both Railway and Supabase.');
  }
  return bytes;
}

function getPushSupport(): PushSupport {
  const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1);
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const hasWebPush = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

  if (isIos && !isStandalone) {
    return {
      supported: false,
      installRequired: true,
      message: 'On iPhone or iPad, add UniEco to your Home Screen first, then open the installed app to enable push notifications.',
    };
  }
  if (!hasWebPush) {
    return {
      supported: false,
      installRequired: false,
      message: 'This browser cannot receive web push notifications. Use Chrome, Edge, Firefox, Samsung Internet, or the installed UniEco app.',
    };
  }
  return {
    supported: true,
    installRequired: false,
    message: 'This device is ready. Notifications are registered separately on each phone and browser.',
  };
}

async function getPushRegistration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration('/');
  const registration = existing || await navigator.serviceWorker.register('/sw.js', {
    scope: '/',
    updateViaCache: 'none',
  });
  await registration.update().catch(() => undefined);
  if (registration.waiting) registration.waiting.postMessage('SKIP_WAITING');
  return navigator.serviceWorker.ready;
}

async function getSessionHeaders(): Promise<HeadersInit> {
  let { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    const refreshed = await supabase.auth.refreshSession();
    session = refreshed.data.session;
  }
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

async function getPushConfig(): Promise<{ publicKey: string }> {
  let response = await fetch('/api/notifications/push-config', {
    headers: await getSessionHeaders(),
    credentials: 'include',
    cache: 'no-store',
  });
  if (response.status === 401) {
    await supabase.auth.refreshSession();
    response = await fetch('/api/notifications/push-config', {
      headers: await getSessionHeaders(),
      credentials: 'include',
      cache: 'no-store',
    });
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok || typeof result.publicKey !== 'string') {
    throw new Error(result.error || 'Push notifications are not configured.');
  }
  return result as { publicKey: string };
}

export function PushPermissionCard({ onboarding = false }: { onboarding?: boolean }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [support, setSupport] = useState<PushSupport | null>(null);

  useEffect(() => {
    let cancelled = false;
    const detectedSupport = getPushSupport();
    setSupport(detectedSupport);
    if (!detectedSupport.supported) return;

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
        if (!cancelled) setSyncError('Could not synchronize this device with UniEco. Tap refresh to try again.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const enablePush = async () => {
    const detectedSupport = support || getPushSupport();
    setSupport(detectedSupport);
    if (!detectedSupport.supported) {
      toast({ title: detectedSupport.installRequired ? 'Install UniEco first' : 'Push not supported', description: detectedSupport.message, variant: 'destructive' });
      return;
    }
    setBusy(true);
    setSyncError(null);
    try {
      const config = await getPushConfig();
      if (Notification.permission === 'denied') {
        throw new Error('Notifications are blocked for UniEco in this browser. Allow them in site settings, then tap refresh.');
      }
      const permission = Notification.permission === 'granted'
        ? 'granted'
        : await Notification.requestPermission();
      if (permission !== 'granted') throw new Error('Notification permission was not granted.');

      const registration = await getPushRegistration();
      const existingSubscription = await registration.pushManager.getSubscription();
      // A refresh deliberately creates a new subscription. This repairs a
      // subscription created with an older VAPID public key or browser token.
      if (existingSubscription && enabled) await existingSubscription.unsubscribe();
      const subscription = await registration.pushManager.getSubscription() || await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodeBase64Url(config.publicKey),
      });
      const subscriptionJson = subscription.toJSON();
      const endpoint = subscriptionJson.endpoint;
      const p256dh = subscriptionJson.keys?.p256dh;
      const auth = subscriptionJson.keys?.auth;
      if (!endpoint || !p256dh || !auth) throw new Error('The browser returned an incomplete push subscription.');

      const result = await subscribeToPush({ endpoint, keys: { p256dh, auth }, expirationTime: subscriptionJson.expirationTime });
      if (result.error) throw new Error(result.error);
      setEnabled(true);
      toast({ title: 'Push notifications connected', description: 'This device is now registered with UniEco. Send a test notification to confirm delivery.' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Please try again.';
      setSyncError(message);
      toast({ title: 'Could not connect this device', description: message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const sendTestPush = async () => {
    setBusy(true);
    try {
      const response = await fetch('/api/notifications/push-test', {
        method: 'POST',
        headers: await getSessionHeaders(),
        credentials: 'include',
        cache: 'no-store',
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Push delivery failed.');
      toast({ title: 'Test notification sent', description: 'Check this phone’s notification tray. Delivery can take a few seconds.' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Push delivery failed.';
      setSyncError(message);
      toast({ title: 'Test notification failed', description: message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-5 rounded-xl border border-primary/20 bg-primary/5 p-4 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <Bell className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="font-semibold">Device notifications</p>
            <p className="mt-1 text-sm text-muted-foreground">{onboarding ? 'Receive messages, order updates, and campus alerts even when the site is closed.' : 'Receive important UniEco updates even when the site is closed.'}</p>
            {support && <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />{support.message}</p>}
            {syncError && <p className="mt-2 text-xs font-medium text-destructive">{syncError}</p>}
          </div>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-44">
          <Button type="button" size="sm" onClick={enablePush} disabled={busy || !support?.supported} className="w-full">
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : enabled ? <RefreshCw className="mr-2 h-4 w-4" /> : <Smartphone className="mr-2 h-4 w-4" />}
            {enabled ? 'Refresh connection' : support?.installRequired ? 'Install first' : onboarding ? 'Turn on notifications' : 'Enable push'}
          </Button>
          {enabled && <Button type="button" size="sm" variant="outline" onClick={sendTestPush} disabled={busy} className="w-full"><Send className="mr-2 h-4 w-4" /> Send test notification</Button>}
        </div>
      </div>
      {enabled && !syncError && <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300"><Check className="h-3.5 w-3.5" /> This device is registered for push delivery.</p>}
    </div>
  );
}
