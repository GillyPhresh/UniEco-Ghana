'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { usePathname } from 'next/navigation';
import { Download, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useInstallPrompt } from '@/hooks/use-install-prompt';

export function InstallPrompt() {
  const pathname = usePathname();
  const isHomeFeed = pathname === '/';
  const isPlanningJourney = pathname === '/campus-mate' || pathname.startsWith('/campus-mate/');
  const isReadingUpdates = pathname === '/updates' || pathname.startsWith('/updates/');
  const {
    inviteVisible,
    installed,
    installAvailable,
    installBusy,
    guide,
    statusMessage,
    installApp,
    closeInstallGuide,
    dismissInvite,
  } = useInstallPrompt();

  return (
    <>
      <AnimatePresence>
        {inviteVisible && !installed && !isHomeFeed && !isReadingUpdates && !isPlanningJourney && pathname !== '/dashboard/messages' && (
          <motion.aside
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 24, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 350, damping: 30 }}
            className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] left-2 z-[55] w-[calc(100%-1rem)] sm:left-1/2 sm:max-w-md sm:-translate-x-1/2 lg:bottom-4"
            aria-label="Install UniEco"
          >
            <div className="flex items-center gap-2.5 rounded-2xl border border-border bg-card/95 p-3 shadow-xl backdrop-blur sm:gap-3 sm:p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                <Download className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">Get UniEco on your device</p>
                <p className="text-xs text-muted-foreground">Open it quickly from your Home Screen or apps.</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button size="sm" className="px-3" onClick={() => void installApp()} disabled={installBusy}>
                  {installBusy ? 'Opening…' : installAvailable ? 'Install' : 'Show me'}
                </Button>
                <Button size="icon" variant="ghost" className="h-9 w-9" onClick={dismissInvite} aria-label="Dismiss install suggestion">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      <Dialog open={Boolean(guide)} onOpenChange={(open) => { if (!open) closeInstallGuide(); }}>
        <DialogContent>
          {guide && (
            <>
              <DialogHeader className="pr-8">
                <DialogTitle>{guide.title}</DialogTitle>
                <DialogDescription>{guide.intro}</DialogDescription>
              </DialogHeader>
              <ol className="space-y-3">
                {guide.steps.map((step, index) => (
                  <li key={step} className="flex gap-3 text-sm leading-6 text-foreground">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{index + 1}</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
              {statusMessage && <p className="text-sm text-muted-foreground" role="status">{statusMessage}</p>}
              {installAvailable && (
                <Button className="min-h-11 w-full" onClick={() => void installApp()} disabled={installBusy}>
                  <Download className="mr-2 h-4 w-4" />{installBusy ? 'Opening install…' : 'Try browser install'}
                </Button>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      <p className="sr-only" role="status" aria-live="polite">{statusMessage}</p>
    </>
  );
}
