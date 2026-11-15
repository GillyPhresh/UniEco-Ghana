'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface NavigatorWithWebInstall extends Navigator {
  install?: () => Promise<void>;
}

export interface InstallGuide {
  title: string;
  intro: string;
  steps: string[];
}

interface InstallPromptContextValue {
  installed: boolean;
  inviteVisible: boolean;
  installAvailable: boolean;
  installBusy: boolean;
  guide: InstallGuide | null;
  statusMessage: string;
  installApp: () => Promise<void>;
  openInstallGuide: () => void;
  closeInstallGuide: () => void;
  dismissInvite: () => void;
}

const InstallPromptContext = createContext<InstallPromptContextValue | null>(null);
const DISMISSAL_KEY = 'unieco-pwa-install-dismissed';
const DISMISSAL_TTL = 1000 * 60 * 60 * 24 * 14;
const INVITE_DELAY = 9000;

function isDismissed(): boolean {
  try {
    const dismissedAt = Number(window.localStorage.getItem(DISMISSAL_KEY));
    return Number.isFinite(dismissedAt) && dismissedAt > 0 && Date.now() - dismissedAt < DISMISSAL_TTL;
  } catch {
    return false;
  }
}

function saveDismissal(): void {
  try {
    window.localStorage.setItem(DISMISSAL_KEY, String(Date.now()));
  } catch {
    // Install remains available from the site menu if storage is unavailable.
  }
}

function detectInstalled(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches
    || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function getInstallGuide(): InstallGuide {
  const userAgent = navigator.userAgent;
  const isIPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  const isAppleMobile = /iPhone|iPad|iPod/i.test(userAgent) || isIPadOS;
  const isMacSafari = /Macintosh|Mac OS X/i.test(userAgent)
    && /Safari/i.test(userAgent)
    && !/Chrome|Chromium|Edg|OPR/i.test(userAgent);
  const isAndroid = /Android/i.test(userAgent);

  if (isAppleMobile) {
    return {
      title: 'Add UniEco to your Home Screen',
      intro: 'On iPhone and iPad, add UniEco from Safari’s Share menu. If you opened this in another browser, open uniecoghana.com in Safari first.',
      steps: [
        'Tap Share in Safari (the square with the arrow).',
        'Choose “Add to Home Screen”.',
        'Turn on “Open as Web App”, then tap “Add”.',
      ],
    };
  }

  if (isMacSafari) {
    return {
      title: 'Add UniEco to your Mac',
      intro: 'Safari can save UniEco as a web app in your Dock.',
      steps: [
        'In Safari, open the Share menu or the File menu.',
        'Choose “Add to Dock”.',
        'Confirm the name and choose “Add”.',
      ],
    };
  }

  if (isAndroid) {
    return {
      title: 'Install UniEco on this device',
      intro: 'Use your browser’s install option to add UniEco to your Home Screen and app list.',
      steps: [
        'Open the browser menu (⋮) at the top of the screen.',
        'Choose “Install app” or “Add to Home screen”.',
        'Confirm “Install” or “Add”.',
      ],
    };
  }

  return {
    title: 'Install UniEco in your browser',
    intro: 'Your browser controls installation. Look for its install option for this website.',
    steps: [
      'In Chrome or Edge, choose “Install UniEco” from the address-bar install icon or browser menu.',
      'In Safari on Mac, choose Share or File → “Add to Dock”.',
      'Confirm the browser’s installation prompt.',
    ],
  };
}

export function InstallPromptProvider({ children }: { children: React.ReactNode }) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [supportsWebInstall, setSupportsWebInstall] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [inviteVisible, setInviteVisible] = useState(false);
  const [installBusy, setInstallBusy] = useState(false);
  const [guide, setGuide] = useState<InstallGuide | null>(null);
  const [statusMessage, setStatusMessage] = useState('');
  const dismissedRef = useRef(false);

  useEffect(() => {
    setInstalled(detectInstalled());
    setSupportsWebInstall(typeof (navigator as NavigatorWithWebInstall).install === 'function');
    const dismissed = isDismissed();
    dismissedRef.current = dismissed;
    let inviteTimer: ReturnType<typeof setTimeout> | undefined;
    if (!dismissed && !detectInstalled()) {
      inviteTimer = setTimeout(() => setInviteVisible(true), INVITE_DELAY);
    }

    const onBeforeInstallPrompt = (rawEvent: Event) => {
      const event = rawEvent as BeforeInstallPromptEvent;
      event.preventDefault();
      setDeferredPrompt(event);
      if (!dismissedRef.current) setInviteVisible(true);
    };
    const onAppInstalled = () => {
      setInstalled(true);
      setInviteVisible(false);
      setDeferredPrompt(null);
      setGuide(null);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);
    return () => {
      if (inviteTimer) clearTimeout(inviteTimer);
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  const openInstallGuide = useCallback(() => {
    if (installed) {
      setStatusMessage('UniEco is already installed on this device.');
      return;
    }
    setGuide(getInstallGuide());
    setStatusMessage('');
  }, [installed]);

  const closeInstallGuide = useCallback(() => setGuide(null), []);

  const dismissInvite = useCallback(() => {
    dismissedRef.current = true;
    saveDismissal();
    setInviteVisible(false);
  }, []);

  const installApp = useCallback(async () => {
    if (installed || installBusy) return;
    const navigatorWithInstall = navigator as NavigatorWithWebInstall;
    if (typeof navigatorWithInstall.install === 'function') {
      setInstallBusy(true);
      setStatusMessage('');
      try {
        // Call immediately in the user gesture so browser activation is preserved.
        await navigatorWithInstall.install();
        setInstalled(true);
        setInviteVisible(false);
        setStatusMessage('UniEco was installed or opened.');
      } catch (error) {
        const errorName = error instanceof Error ? error.name : '';
        if (errorName === 'AbortError') {
          setStatusMessage('Installation was cancelled. You can try again whenever you’re ready.');
        } else {
          setStatusMessage('Your browser could not start installation. Use the browser steps below.');
          setGuide(getInstallGuide());
        }
      } finally {
        setInstallBusy(false);
      }
      return;
    }

    if (deferredPrompt) {
      const promptEvent = deferredPrompt;
      setDeferredPrompt(null);
      setInstallBusy(true);
      setStatusMessage('');
      try {
        // The captured prompt is single-use; invoke it directly from this click.
        void promptEvent.prompt();
        const choice = await promptEvent.userChoice;
        if (choice.outcome === 'accepted') {
          setInstalled(true);
          setInviteVisible(false);
          setStatusMessage('UniEco was installed.');
        } else {
          setStatusMessage('Installation was cancelled. You can try again whenever you’re ready.');
        }
      } catch {
        setStatusMessage('Your browser could not start installation. Use the browser steps below.');
        setGuide(getInstallGuide());
      } finally {
        setInstallBusy(false);
      }
      return;
    }

    openInstallGuide();
  }, [deferredPrompt, installBusy, installed, openInstallGuide]);

  const value = useMemo<InstallPromptContextValue>(() => ({
    installed,
    inviteVisible,
    installAvailable: supportsWebInstall || Boolean(deferredPrompt),
    installBusy,
    guide,
    statusMessage,
    installApp,
    openInstallGuide,
    closeInstallGuide,
    dismissInvite,
  }), [installed, inviteVisible, supportsWebInstall, deferredPrompt, installBusy, guide, statusMessage, installApp, openInstallGuide, closeInstallGuide, dismissInvite]);

  return <InstallPromptContext.Provider value={value}>{children}</InstallPromptContext.Provider>;
}

export function useInstallPrompt(): InstallPromptContextValue {
  const context = useContext(InstallPromptContext);
  if (!context) throw new Error('useInstallPrompt must be used inside InstallPromptProvider');
  return context;
}
