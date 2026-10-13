'use client';

import { useEffect, useState } from 'react';

interface UpdateState {
  needsUpdate: boolean;
  applying: boolean;
  applyUpdate: () => void;
}

export function useServiceWorkerUpdate(): UpdateState {
  const [needsUpdate, setNeedsUpdate] = useState(false);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;

    let refreshing = false;

    const checkForUpdate = async () => {
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) {
          await reg.update();
        }
      } catch {
        // Silent — update check is best-effort
      }
    };

    const onControllerChange = () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    // Check for updates on load and when page becomes visible
    checkForUpdate();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') checkForUpdate();
    };
    document.addEventListener('visibilitychange', onVisibility);

    // Listen for new service worker
    navigator.serviceWorker.getRegistration().then((reg) => {
      if (!reg) return;
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            setNeedsUpdate(true);
          }
        });
      });
    });

    // Poll for updates every 5 minutes
    const interval = setInterval(checkForUpdate, 1000 * 60 * 5);

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      document.removeEventListener('visibilitychange', onVisibility);
      clearInterval(interval);
    };
  }, []);

  const applyUpdate = () => {
    setApplying(true);
    navigator.serviceWorker
      .getRegistration()
      .then((reg) => {
        if (reg && reg.waiting) {
          reg.waiting.postMessage('SKIP_WAITING');
        } else {
          window.location.reload();
        }
      })
      .catch(() => {
        window.location.reload();
      });
  };

  return { needsUpdate, applying, applyUpdate };
}
