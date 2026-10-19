import Link from 'next/link';
import Image from 'next/image';

export function Logo({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      className={`group flex items-center gap-2 font-display font-bold tracking-tight ${className ?? ''}`}
      aria-label="UniEco Ghana home"
    >
      <Image
        src="/UniEco%20Ghana%20Logo%20(No%20Background)paystack.png"
        alt="UniEco Ghana"
        width={72}
        height={72}
        priority
        className="h-10 w-14 object-contain object-left sm:h-11 sm:w-16"
      />
    </Link>
  );
}
