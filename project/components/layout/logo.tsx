import Link from 'next/link';
import Image from 'next/image';

export function Logo({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      className={`group flex items-center gap-2 font-display font-bold tracking-tight ${className ?? ''}`}
      aria-label="UniEco Ghana home"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-primary/10 transition-transform group-hover:scale-105">
        <Image src="/unieco-mark.svg" alt="" width={40} height={40} priority />
      </span>
      <span className="text-lg leading-none">
        <span className="text-primary">Uni</span><span className="text-secondary">Eco</span>{' '}
        <span className="text-foreground">Ghana</span>
      </span>
    </Link>
  );
}
