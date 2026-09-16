'use client';

import { useEffect, useRef, useState } from 'react';
import { useNetworkStatus } from '@/hooks/use-network-status';
import { WifiOff, Wifi, CloudOff } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export function OfflineIndicator() {
  const { online } = useNetworkStatus();
  const [wasOffline, setWasOffline] = useState(false);
  const [showOnlineToast, setShowOnlineToast] = useState(false);
  const firstRun = useRef(true);

  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      if (!online) setWasOffline(true);
      return;
    }

    if (!online) {
      setWasOffline(true);
    } else if (wasOffline && online) {
      setShowOnlineToast(true);
      const t = setTimeout(() => setShowOnlineToast(false), 4000);
      return () => clearTimeout(t);
    }
  }, [online, wasOffline]);

  return (
    <>
      <AnimatePresence>
        {!online && (
          <motion.div
            initial={{ y: -100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -100, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="fixed left-1/2 top-0 z-[60] -translate-x-1/2"
            role="status"
            aria-live="polite"
          >
            <div className="mt-2 flex items-center gap-2 rounded-full bg-amber-600 px-4 py-2 text-xs font-medium text-white shadow-lg sm:text-sm">
              <CloudOff className="h-4 w-4 shrink-0" />
              <span>You&apos;re offline. Some features may be unavailable.</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showOnlineToast && online && (
          <motion.div
            initial={{ y: -100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -100, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="fixed left-1/2 top-0 z-[60] -translate-x-1/2"
            role="status"
            aria-live="polite"
          >
            <div className="mt-2 flex items-center gap-2 rounded-full bg-success px-4 py-2 text-xs font-medium text-white shadow-lg sm:text-sm">
              <Wifi className="h-4 w-4 shrink-0" />
              <span>You&apos;re back online.</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

export function OfflineBadge() {
  const { online } = useNetworkStatus();
  if (online) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
      <WifiOff className="h-3 w-3" /> Offline
    </span>
  );
}
