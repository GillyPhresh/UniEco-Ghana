import { cn } from '@/lib/utils';

interface OpeningHours {
  open: string;
  close: string;
}

type OpeningHoursMap = Record<string, OpeningHours>;

function getCurrentDay(): string {
  const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  return days[new Date().getDay()];
}

function isCurrentlyOpen(hours: OpeningHoursMap | null | undefined): boolean {
  if (!hours || Object.keys(hours).length === 0) return false;
  const day = getCurrentDay();
  const today = hours[day];
  if (!today) return false;

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const [openH, openM] = today.open.split(':').map(Number);
  const [closeH, closeM] = today.close.split(':').map(Number);
  const openMinutes = openH * 60 + openM;
  const closeMinutes = closeH * 60 + closeM;

  return currentMinutes >= openMinutes && currentMinutes < closeMinutes;
}

function getTodayHoursLabel(hours: OpeningHoursMap | null | undefined): string {
  if (!hours || Object.keys(hours).length === 0) return 'Hours not specified';
  const day = getCurrentDay();
  const today = hours[day];
  if (!today) return 'Closed today';
  return `${today.open} – ${today.close}`;
}

interface OpenStatusProps {
  openingHours: OpeningHoursMap | null | undefined;
  className?: string;
}

export function OpenStatus({ openingHours, className }: OpenStatusProps) {
  const isOpen = isCurrentlyOpen(openingHours);
  const label = getTodayHoursLabel(openingHours);

  return (
    <div className={cn('flex items-center gap-1.5 text-xs', className)}>
      <span
        className={cn(
          'h-2 w-2 rounded-full',
          isOpen ? 'bg-success' : 'bg-muted-foreground'
        )}
      />
      <span className={isOpen ? 'font-medium text-success' : 'text-muted-foreground'}>
        {isOpen ? 'Open' : 'Closed'}
      </span>
      <span className="text-muted-foreground">· {label}</span>
    </div>
  );
}
