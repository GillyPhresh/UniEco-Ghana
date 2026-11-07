/* eslint-disable @next/next/no-img-element */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const noStore = { 'Cache-Control': 'no-store, max-age=0', 'X-Content-Type-Options': 'nosniff' };

function unavailable() {
  return new Response('Approved campus update not found.', { status: 404, headers: noStore });
}

function printable(value: unknown, limit: number, fallback: string) {
  return typeof value === 'string' && value.trim()
    ? Array.from(value.trim()).slice(0, limit).join('')
    : fallback;
}

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get('id') || '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return unavailable();

  const supabase = await createClient();
  const { data, error } = await supabase.from('campus_feed_public_items')
    .select('id,source_label,university_name,title,excerpt,published_at,category')
    .eq('id', id)
    .maybeSingle();
  if (error || !data) return unavailable();

  try {
    const logoBytes = await readFile(join(process.cwd(), 'public', 'unieco-main-logo.png'));
    const logo = `data:image/png;base64,${logoBytes.toString('base64')}`;
    const title = printable(data.title, 170, 'Campus update');
    const summary = printable(data.excerpt, 250, 'Read the original source for the complete update.');
    const source = printable(data.source_label, 80, 'Original publisher');
    const coverage = printable(data.university_name, 90, 'UniEco Ghana campus network');
    const category = data.category === 'opportunities' ? 'STUDENT OPPORTUNITY' : 'CAMPUS UPDATE';
    const date = data.published_at && !Number.isNaN(Date.parse(data.published_at))
      ? new Intl.DateTimeFormat('en-GH', { dateStyle: 'medium', timeZone: 'Africa/Accra' }).format(new Date(data.published_at))
      : 'Check the source for current details';

    return new ImageResponse(
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 64, color: '#10231b', background: 'linear-gradient(145deg, #f7fbf8 0%, #ffffff 55%, #f3f8f4 100%)', fontFamily: 'Arial, sans-serif' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '4px solid #0b9b69', paddingBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}><img src={logo} alt="UniEco Ghana logo" width="84" height="84" style={{ objectFit: 'contain' }} /><div style={{ display: 'flex', flexDirection: 'column' }}><span style={{ fontSize: 25, fontWeight: 700 }}>UniEco Ghana</span><span style={{ fontSize: 18, color: '#56665e' }}>Your campus. Your marketplace. Your community.</span></div></div>
          <span style={{ fontSize: 17, fontWeight: 700, color: '#087b54', letterSpacing: 2 }}>GHANA</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, padding: '34px 0' }}>
          <span style={{ display: 'flex', alignSelf: 'flex-start', padding: '12px 18px', borderRadius: 999, background: '#e2f4ec', color: '#087b54', fontSize: 18, fontWeight: 700, letterSpacing: 1.5 }}>{category}</span>
          <div style={{ fontSize: 54, lineHeight: 1.15, fontWeight: 750, letterSpacing: -1 }}>{title}</div>
          <div style={{ fontSize: 27, lineHeight: 1.42, color: '#4c5c54' }}>{summary}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, borderTop: '1px solid #dce7e0', paddingTop: 22 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 19, fontWeight: 700 }}><span>{source}</span><span style={{ color: '#66746c', fontWeight: 400 }}>{date}</span></div>
          <span style={{ fontSize: 17, color: '#66746c' }}>{coverage} · Source-linked summary. Follow the original publisher for full details.</span>
        </div>
      </div>,
      { width: 1080, height: 1350, headers: { ...noStore, 'Content-Type': 'image/png', 'Content-Disposition': 'attachment; filename="unieco-campus-update.png"' } },
    );
  } catch {
    return new Response('Share card is temporarily unavailable.', { status: 503, headers: noStore });
  }
}
