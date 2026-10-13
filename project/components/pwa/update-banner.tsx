'use client';

import { useServiceWorkerUpdate } from '@/hooks/use-sw-update';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState } from 'react';

export function UpdateBanner() {
  const { needsUpdate, applying, applyUpdate } = useServiceWorkerUpdate();
  const [dismissed, setDismissed] = useState(false);

  const handleDismiss = () => setDismissed(true);

  return (
    <AnimatePresence>
      {needsUpdate && !dismissed && (
        <motion.div
          initial={{ y: -100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -100, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 350, damping: 30 }}
          className="fixed left-1/2 top-0 z-[65] -translate-x-1/2 mt-0 w-full max-w-lg px-4 pt-2"
          role="alert"
          aria-live="polite"
        >
          <div className="flex items-center gap-3 rounded-xl bg-primary px-4 py-3 text-primary-foreground shadow-lg">
            <RefreshCw className="h-4 w-4 shrink-0" />
            <p className="flex-1 text-sm font-medium">A new version is available.</p>
            <Button
              size="sm"
              variant="secondary"
              onClick={applyUpdate}
              disabled={applying}
              className="shrink-0"
            >
              {applying ? 'Updating…' : 'Refresh to update'}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 shrink-0 text-primary-foreground hover:bg-primary-foreground/20"
              onClick={handleDismiss}
              aria-label="Dismiss update notification"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
