'use client';

import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISSAL_KEY = 'unieco-pwa-install-dismissed';
const DISMISSAL_TTL = 1000 * 60 * 60 * 24 * 30; // 30 days

export function useInstallPrompt() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [canInstall, setCanInstall] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Check if already installed (standalone mode)
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (isStandalone) {
      setInstalled(true);
      return;
    }

    // Check if user previously dismissed
    const dismissedAt = localStorage.getItem(DISMISSAL_KEY);
    if (dismissedAt && Date.now() - parseInt(dismissedAt) < DISMISSAL_TTL) {
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setPromptEvent(e as BeforeInstallPromptEvent);
      setCanInstall(true);
    };

    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', () => {
      setInstalled(true);
      setCanInstall(false);
      setPromptEvent(null);
    });

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const promptInstall = async (): Promise<boolean> => {
    if (!promptEvent) return false;
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    if (choice.outcome === 'dismissed') {
      localStorage.setItem(DISMISSAL_KEY, Date.now().toString());
    }
    setPromptEvent(null);
    setCanInstall(false);
    return choice.outcome === 'accepted';
  };

  const dismiss = () => {
    localStorage.setItem(DISMISSAL_KEY, Date.now().toString());
    setCanInstall(false);
    setPromptEvent(null);
  };

  return { canInstall, installed, promptInstall, dismiss };
}
