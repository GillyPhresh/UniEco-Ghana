'use client';

import { useEffect } from 'react';

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;

    const refreshAfterWorkerUpdate = () => window.location.reload();
    navigator.serviceWorker.addEventListener('controllerchange', refreshAfterWorkerUpdate);

    const register = () => {
      navigator.serviceWorker.register('/sw.js').then((registration) => {
        // Check for a new worker whenever the app opens. This keeps an
        // installed PWA from staying on an outdated mobile shell.
        registration.update().catch(() => {});

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
      }).catch(() => {
        // Silent fail — offline support is a progressive enhancement.
      });
    };

    window.addEventListener('load', register);
    return () => {
      window.removeEventListener('load', register);
      navigator.serviceWorker.removeEventListener('controllerchange', refreshAfterWorkerUpdate);
    };
  }, []);

  return null;
}
