'use client';

import { useEffect } from 'react';

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;

    // The first worker claims the already-current document. Reloading here
    // would discard a newly opened composer, comments sheet or share dialog.
    let lastController = navigator.serviceWorker.controller;
    const refreshAfterWorkerUpdate = () => {
      const controller = navigator.serviceWorker.controller;
      const replacing = Boolean(lastController && controller && lastController !== controller);
      lastController = controller;
      if (replacing) window.location.reload();
    };
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
