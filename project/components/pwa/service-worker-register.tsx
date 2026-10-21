'use client';

import { useEffect } from 'react';

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;

    const refreshAfterWorkerUpdate = () => window.location.reload();
    navigator.serviceWorker.addEventListener('controllerchange', refreshAfterWorkerUpdate);

    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js', {
          scope: '/',
          updateViaCache: 'none',
        });
        // Check for a new worker whenever the app opens. This keeps an
        // installed PWA from staying on an outdated mobile shell.
        await registration.update().catch(() => undefined);

        const activateWaitingWorker = () => {
          registration.waiting?.postMessage('SKIP_WAITING');
        };

        activateWaitingWorker();
        registration.addEventListener('updatefound', () => {
          registration.installing?.addEventListener('statechange', () => {
            if (registration.installing?.state === 'installed') {
              activateWaitingWorker();
            }
          });
        });
      } catch {
        // Silent fail — offline support is a progressive enhancement.
      }
    };

    void register();
    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', refreshAfterWorkerUpdate);
    };
  }, []);

  return null;
}
