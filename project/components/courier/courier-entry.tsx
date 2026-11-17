'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth/auth-context';
import { withNext } from '@/lib/auth/redirects';
import { COURIER_JOIN_PATH, COURIER_WORK_PATH } from '@/lib/courier/domain';
import { courierGateway } from '@/lib/data/courier-client';

export const COURIER_PROGRAM_KEY = ['courier-program-availability'] as const;

export function CourierEntry() {
  const { user, loading } = useAuth();
  const program = useQuery<boolean>({
    queryKey: COURIER_PROGRAM_KEY,
    queryFn: () => courierGateway.availability(),
    staleTime: 30_000,
  });
  if (loading) return <div className="mt-4 h-11 w-36 animate-pulse rounded-xl bg-muted" aria-hidden="true" />;
  if (user) return <Button asChild className="mt-4 min-h-[44px] gap-2 self-start rounded-xl">
    <Link href={COURIER_WORK_PATH}>Courier workspace <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
  </Button>;
  return <div className="mt-4 flex flex-wrap items-center gap-2">
    {program.data === true && <Button asChild className="min-h-[44px] rounded-xl"><Link href={COURIER_JOIN_PATH}>Apply to deliver</Link></Button>}
    <Button asChild variant="outline" className="min-h-[44px] rounded-xl"><Link href={withNext('/signin', COURIER_WORK_PATH)}>Sign in</Link></Button>
    {program.isError && <button type="button" className="text-sm text-primary underline" onClick={() => void program.refetch()}>Check again</button>}
    {program.data === false && <span className="text-xs text-muted-foreground">New applications are closed.</span>}
  </div>;
}
