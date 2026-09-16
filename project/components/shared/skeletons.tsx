import { cn } from '@/lib/utils';

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn('animate-pulse rounded-md bg-muted', className)} />
  );
}

export function BusinessCardSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <Skeleton className="mb-4 h-32 w-full rounded-xl" />
      <Skeleton className="mb-2 h-5 w-3/4" />
      <Skeleton className="mb-3 h-4 w-1/2" />
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-6 w-16" />
      </div>
    </div>
  );
}

export function EventCardSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
      <Skeleton className="h-40 w-full" />
      <div className="p-4">
        <Skeleton className="mb-2 h-5 w-2/3" />
        <Skeleton className="mb-3 h-4 w-1/2" />
        <Skeleton className="h-4 w-1/3" />
      </div>
    </div>
  );
}
