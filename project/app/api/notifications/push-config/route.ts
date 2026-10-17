import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  const publicKey = process.env.VAPID_PUBLIC_KEY;
  if (!publicKey) return NextResponse.json({ error: 'Push notifications are not configured' }, { status: 503 });

  return NextResponse.json({ publicKey });
}
