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
    ? Array.from(value.trim().replace(/\s+/g, ' ')).slice(0, limit).join('')
    : fallback;
}

function flyerSummary(value: unknown, title: string) {
  let summary = printable(value, 500, 'Read the original source for complete details.');
  if (summary.toLocaleLowerCase().startsWith(title.toLocaleLowerCase())) {
    summary = summary.slice(title.length).replace(/^[\s:|–—-]+/, '').trim();
  }
  if (summary.length < 35 || summary.toLocaleLowerCase() === title.toLocaleLowerCase()) {
    return 'A source-linked campus update. Open the original publisher’s notice for full details, eligibility, and deadlines.';
  }
  return Array.from(summary).slice(0, 280).join('');
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
    const summary = flyerSummary(data.excerpt, title);
    const source = printable(data.source_label, 80, 'Original publisher');
    const coverage = printable(data.university_name, 90, 'UniEco Ghana campus network');
    const category = data.category === 'opportunities' ? 'STUDENT OPPORTUNITY' : data.category.replaceAll('_', ' ').toUpperCase();
    const date = data.published_at && !Number.isNaN(Date.parse(data.published_at))
      ? new Intl.DateTimeFormat('en-GH', { dateStyle: 'medium', timeZone: 'Africa/Accra' }).format(new Date(data.published_at))
      : 'Check the source for current details';

    return new ImageResponse(
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', padding: 42, color: '#10231b', background: 'linear-gradient(145deg, #eaf6f0 0%, #f9fbf8 48%, #f6f2df 100%)', fontFamily: 'Arial, sans-serif' }}>
        <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', padding: 48, borderRadius: 30, border: '1px solid #d9e8df', background: '#ffffff', boxShadow: '0 18px 60px rgba(14,60,39,.10)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '4px solid #0b9b69', paddingBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}><img src={logo} alt="UniEco Ghana logo" width="76" height="76" style={{ objectFit: 'contain' }} /><div style={{ display: 'flex', flexDirection: 'column' }}><span style={{ fontSize: 25, fontWeight: 700 }}>UniEco Ghana</span><span style={{ fontSize: 17, color: '#56665e' }}>Your campus. Your marketplace. Your community.</span></div></div>
          <span style={{ fontSize: 16, fontWeight: 700, color: '#087b54', letterSpacing: 2 }}>GHANA</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22, padding: '58px 0 50px', flex: 1 }}>
          <span style={{ display: 'flex', alignSelf: 'flex-start', padding: '11px 17px', borderRadius: 999, background: '#e2f4ec', color: '#087b54', fontSize: 16, fontWeight: 700, letterSpacing: 1.5 }}>{category}</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, borderLeft: '7px solid #0b9b69', paddingLeft: 24 }}>
            <div style={{ fontSize: title.length > 125 ? 42 : title.length > 80 ? 48 : 56, lineHeight: 1.13, fontWeight: 750, letterSpacing: -1 }}>{title}</div>
            <div style={{ fontSize: 25, lineHeight: 1.42, color: '#4c5c54' }}>{summary}</div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid #dce7e0', paddingTop: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 18, fontWeight: 700 }}><span>{source}</span><span style={{ color: '#66746c', fontWeight: 400 }}>{date}</span></div>
          <span style={{ fontSize: 15, color: '#66746c' }}>{coverage} · Independent, source-linked summary. Verify details with the original publisher.</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#087b54' }}>UNIECOGHANA.COM/UPDATES/{id}</span>
        </div>
        </div>
      </div>,
      { width: 1080, height: 1350, headers: { ...noStore, 'Content-Type': 'image/png', 'Content-Disposition': 'inline; filename="unieco-campus-update.png"' } },
    );
  } catch {
    return new Response('Share card is temporarily unavailable.', { status: 503, headers: noStore });
  }
}
