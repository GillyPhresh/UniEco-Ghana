import Link from 'next/link';
import Image from 'next/image';

export function Logo({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      className={`group flex items-center gap-2 font-display font-bold tracking-tight ${className ?? ''}`}
      aria-label="UniEco Ghana home"
    >
      <Image src="/unieco-logo.svg" alt="UniEco Ghana" width={148} height={52} priority className="h-11 w-[148px] object-contain object-left" />
    </Link>
  );
}
