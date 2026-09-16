import Link from 'next/link';

export function Logo({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      className={`group flex items-center gap-2 font-display font-bold tracking-tight ${className ?? ''}`}
      aria-label="UniEco Ghana home"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm transition-transform group-hover:scale-105">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
          <path
            d="M12 3L20 18H4L12 3Z"
            fill="currentColor"
            fillOpacity="0.95"
          />
          <circle cx="12" cy="15.5" r="2.2" fill="#f59e0b" />
        </svg>
      </span>
      <span className="text-lg">
        UniEco<span className="text-primary"> Ghana</span>
      </span>
    </Link>
  );
}
