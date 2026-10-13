'use client';

import { useInstallPrompt } from '@/hooks/use-install-prompt';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function InstallPrompt() {
  const { canInstall, installed, promptInstall, dismiss } = useInstallPrompt();

  if (installed || !canInstall) return null;

  return (
    <AnimatePresence>
      {canInstall && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 350, damping: 30 }}
          className="fixed bottom-4 left-1/2 z-[55] w-[calc(100%-2rem)] max-w-md -translate-x-1/2"
        >
          <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-xl">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <Download className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">Install UniEco Ghana</p>
              <p className="text-xs text-muted-foreground">Faster access, works better on mobile.</p>
            </div>
            <div className="flex items-center gap-1.5">
              <Button size="sm" onClick={() => promptInstall()}>
                Install
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={dismiss} aria-label="Dismiss install prompt">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
