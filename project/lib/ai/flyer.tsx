/* eslint-disable @next/next/no-img-element */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import sharp from 'sharp';
import type { ReactNode } from 'react';
import { oneLine, updateCategory, updateDate, updateSummary } from './update-copy';
import { resolveFlyerVisual } from './flyer-media';

export type FlyerItem = {
  id: string;
  title: string;
  excerpt: string;
  source_label: string;
  university_name: string;
  published_at: string | null;
  category: string;
  source_id?: string;
  canonical_url?: string;
};

export const flyerSize = { width: 1080, height: 1350 };
const ink = '#102c24';
const green = '#096347';
const subtle = '#465c53';
const line = '#c8d8ca';
const label = { fontSize: 18, fontWeight: 700, color: green, letterSpacing: 2.1 };
const fallbackSummary = 'Read the original publisher’s notice for details and the next steps.';
const row = { display: 'flex', flexDirection: 'row' as const };
const col = { display: 'flex', flexDirection: 'column' as const };
let logoPromise: Promise<string | null> | undefined;
type FlyerFont = { name: string; weight: 400 | 700; data: ArrayBuffer };
let fontsPromise: Promise<FlyerFont[]> | undefined;

function flyerFonts() {
  fontsPromise ??= Promise.all(([[400, 'Regular'], [700, 'Bold']] as const).map(async ([weight, variant]) => ({
    name: 'Noto Sans',
    weight,
    data: new Uint8Array(await readFile(join(process.cwd(), 'public', 'assets', 'flyers', 'NotoSans-' + variant + '.ttf'))).buffer,
  }))).catch(() => []);
  return fontsPromise;
}

function logoData() {
  logoPromise ??= readFile(join(process.cwd(), 'public', 'unieco-main-logo.png'))
    .then((bytes) => 'data:image/png;base64,' + bytes.toString('base64'), () => null);
  return logoPromise;
}

function Letterhead({ logo, serial, draft }: { logo: string | null; serial: string; draft?: boolean }) {
  return <div style={{ ...col, gap: 24 }}>
    <div style={{ ...row, height: 7, borderRadius: 4, overflow: 'hidden' }}>
      <div style={{ width: '34%', background: '#c42f35' }} /><div style={{ width: '33%', background: '#edbe47' }} /><div style={{ width: '33%', background: '#148353' }} />
    </div>
    <div style={{ ...row, justifyContent: 'space-between', alignItems: 'center' }}>
      <div style={{ ...row, alignItems: 'center', gap: 18 }}>
        {logo && <img src={logo} width="76" height="76" alt="" style={{ objectFit: 'contain' }} />}
        <div style={{ ...col, gap: 5 }}>
          <span style={{ fontSize: 32, fontWeight: 800, color: ink }}>UniEco Ghana</span>
          <span style={{ ...label, fontSize: 13 }}>CAMPUS NEWS DESK</span>
        </div>
      </div>
      <div style={{ ...col, alignItems: 'flex-end', gap: 6 }}>
        <span style={{ ...label, fontSize: 14, color: draft ? '#9b2e22' : green }}>{draft ? 'DRAFT · NOT PUBLIC' : 'TERTIARY CAMPUS NETWORK'}</span>
        <span style={{ fontSize: 16, color: subtle }}>{serial}</span>
      </div>
    </div>
  </div>;
}

async function renderLetter(content: ReactNode, serial: string, filename: string, options: { draft?: boolean; download?: boolean } = {}) {
  const logo = await logoData();
  return new ImageResponse(
    <div style={{ ...col, width: '100%', height: '100%', padding: 31, background: '#e4eee5', color: ink }}>
      <div style={{ ...col, width: '100%', height: '100%', padding: '37px 43px 33px', borderRadius: 28, border: '1px solid #c8d8ca', background: '#fcfbf3' }}>
        <Letterhead logo={logo} serial={serial} draft={options.draft} />
        {content}
      </div>
    </div>,
    {
      ...flyerSize,
      headers: {
        'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': (options.download ? 'attachment' : 'inline') + '; filename="' + filename + '"',
        ...(options.draft ? { 'X-Robots-Tag': 'noindex, nofollow' } : {}),
      },
    },
  );
}

export type UpdateFlyerOptions = { draft?: boolean; download?: boolean; format?: 'png' | 'jpeg' };

export async function renderUpdateFlyer(data: FlyerItem, options: UpdateFlyerOptions = {}) {
  const [logo, visual, fonts] = await Promise.all([logoData(), resolveFlyerVisual(data, !options.draft), flyerFonts()]);
  const title = oneLine(data.title, 220, 'Campus update');
  const summary = updateSummary(data.excerpt, data.title, title.length > 150 ? 142 : 194);
  const source = oneLine(data.source_label, 85, 'Original publisher');
  const portraits = visual.portraits.slice(0, 2);
  const requiresCreditLink = [visual.background, ...portraits].some((photo) => photo.attributionRequired);
  const credits = [visual.background.credit, ...portraits.map((photo) => photo.credit)];
  const dedupedCredits = Array.from(new Set(credits));
  const format = options.format || 'png';
  const filename = (options.draft ? 'unieco-draft-update' : 'unieco-campus-update') + (format === 'jpeg' ? '.jpg' : '.png');
  const headers = {
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': (options.download ? 'attachment' : 'inline') + '; filename="' + filename + '"',
    ...(options.draft ? { 'X-Robots-Tag': 'noindex, nofollow' } : {}),
  };

  const card = new ImageResponse(
    <div style={{ ...col, width: '100%', height: '100%', position: 'relative', fontFamily: 'Noto Sans', background: '#faf8f0', color: ink }}>
      <div style={{ ...row, height: 704, width: '100%', position: 'relative', flexShrink: 0, background: '#12382d' }}>
        <img src={visual.background.src} alt="" width={1080} height={704} style={{ position: 'absolute', top: 0, left: 0, objectFit: 'cover' }} />
        <div style={{ ...row, position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', backgroundImage: 'linear-gradient(180deg, rgba(7,24,18,0.48) 0%, transparent 30%, transparent 65%, rgba(7,24,18,0.88) 100%)' }} />
        <div style={{ ...row, alignItems: 'center', position: 'absolute', top: 38, left: 48, gap: 12, padding: '9px 20px 9px 10px', borderRadius: 13, background: '#fffdf7' }}>
          {logo && <img src={logo} alt="" width={65} height={65} style={{ objectFit: 'contain' }} />}
          <div style={{ ...col, gap: 3 }}>
            <span style={{ color: ink, fontWeight: 900, fontSize: 28, lineHeight: 1.1 }}>UniEco Ghana</span>
            <span style={{ ...label, fontSize: 13 }}>CAMPUS NEWS DESK</span>
          </div>
        </div>
        {options.draft && <span style={{ position: 'absolute', right: 48, top: 48, padding: '10px 14px', background: '#9b2e22', color: '#fff', fontWeight: 800, fontSize: 19 }}>DRAFT · NOT PUBLIC</span>}
        <span style={{ position: 'absolute', bottom: 27, left: 50, background: 'rgba(8,30,22,0.88)', padding: '9px 14px', borderRadius: 4, color: '#fffaf0', fontSize: 18, fontWeight: 700 }}>
          {visual.background.description}
        </span>
        {portraits.length > 0 && <div style={{ ...row, position: 'absolute', right: 48, bottom: 23, gap: 15, alignItems: 'flex-end' }}>
          {portraits.map((portrait) => <div key={portrait.name} style={{ ...col, width: 188, alignItems: 'center', gap: 7 }}>
            <div style={{ ...row, width: 154, height: 154, borderRadius: 77, overflow: 'hidden', border: '6px solid #fffdf7', background: '#e9eee4' }}>
              <img src={portrait.src} alt="" width={142} height={142} style={{ objectFit: 'cover' }} />
            </div>
            <span style={{ fontSize: 17, fontWeight: 800, color: '#fffdf7', textAlign: 'center', padding: '4px 10px', background: '#0d3025', borderRadius: 5 }}>{portrait.name}</span>
          </div>)}
        </div>}
      </div>
      <div style={{ ...row, width: '100%', height: 7, flexShrink: 0 }}>
        <div style={{ width: '33%', background: '#ad2635' }} /><div style={{ width: '34%', background: '#e9b843' }} /><div style={{ width: '33%', background: '#087450' }} />
      </div>
      <div style={{ ...col, width: '100%', padding: '25px 50px 0', gap: 15 }}>
        <div style={{ ...row, alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <span style={{ padding: '8px 15px', fontSize: 17, fontWeight: 800, letterSpacing: 2, color: '#fffdf4', background: '#09583f' }}>{updateCategory(data.category).toUpperCase()}</span>
          {data.published_at && <span style={{ color: green, fontSize: 20, fontWeight: 800 }}>{updateDate(data.published_at).toUpperCase()}</span>}
        </div>
        <span style={{ fontSize: title.length > 168 ? 45 : title.length > 115 ? 51 : title.length > 74 ? 58 : 67, fontWeight: 900, lineHeight: 1.03, letterSpacing: -1.6, wordBreak: 'break-word' }}>{title}</span>
        {summary && <span style={{ fontSize: title.length > 150 ? 25 : 28, color: subtle, lineHeight: 1.22, wordBreak: 'break-word' }}>{summary}</span>}
        <span style={{ color: green, fontSize: 21, fontWeight: 800 }}>Source: {source}</span>
      </div>
      <div style={{ ...col, position: 'absolute', width: 980, left: 50, bottom: 24, borderTop: '2px solid ' + line, paddingTop: 9, gap: 6 }}>
        <div style={{ ...row, justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 16, color: green, fontWeight: 900, letterSpacing: 1 }}>{options.draft ? 'FOR MANAGEMENT REVIEW ONLY' : 'UNIECO GHANA · CAMPUS UPDATES'}</span>
          {!options.draft && <span style={{ fontSize: 15, color: ink }}>uniecoghana.com/updates/{data.id}</span>}
        </div>
        {dedupedCredits.map((credit, index) => <span key={credit} style={{ fontSize: 15, color: subtle }}>{index ? 'Portrait: ' : 'Photo: '}{credit}</span>)}
        {requiresCreditLink && <span style={{ fontSize: 14, color: subtle }}>Photos cropped · creativecommons.org/licenses/by/4.0 · Source details on UniEco</span>}
        <span style={{ fontSize: 14, color: subtle }}>UniEco Ghana is an independent publisher. See the original source for full details.</span>
      </div>
    </div>, { ...flyerSize, headers, ...(fonts.length ? { fonts } : {}) },
  );
  if (format === 'png') return card;
  const bytes = await sharp(Buffer.from(await card.arrayBuffer()), { limitInputPixels: 1_500_000 })
    .flatten({ background: '#faf8f0' }).jpeg({ quality: 89, mozjpeg: true }).toBuffer();
  return new Response(new Uint8Array(bytes), { headers: { ...headers, 'Content-Type': 'image/jpeg' } });
}

export function renderBulletinFlyer(data: { items: FlyerItem[]; heading: string; period: string; page: number; pages: number; link: string }, download = false) {
  return renderLetter(<div style={{ ...col, flex: 1, width: '100%', minHeight: 0 }}>
    <div style={{ ...col, marginTop: 35, gap: 7 }}>
      <span style={label}>SOURCE-LINKED BULLETIN</span>
      <span style={{ fontSize: 56, fontWeight: 800, letterSpacing: -2, lineHeight: 1.12 }}>Campus briefing</span>
      <span style={{ fontSize: 22, color: green, lineHeight: 1.2 }}>{oneLine(data.heading, 106)} · {data.period}</span>
    </div>
    <div style={{ ...col, flex: 1, marginTop: 24, gap: 12 }}>
      {data.items.length === 0 && <span style={{ color: subtle, fontSize: 26 }}>No approved updates in this edition.</span>}
      {data.items.map((item, index) => <div key={item.id} style={{ ...row, width: '100%', gap: 15, padding: '14px 19px', background: index % 2 ? '#f4f3e9' : '#edf2e8', borderRadius: 10 }}>
        <span style={{ color: green, fontWeight: 700, fontSize: 22, minWidth: 30 }}>{String(index + 1).padStart(2, '0')}</span>
        <div style={{ ...col, flex: 1, gap: 5 }}>
          <span style={{ fontSize: 16, color: green, fontWeight: 700 }}>{updateCategory(item.category)} · {updateDate(item.published_at)}</span>
          <span style={{ fontSize: 29, lineHeight: 1.12, fontWeight: 750 }}>{oneLine(item.title, 130)}</span>
          <span style={{ color: subtle, fontSize: 18, lineHeight: 1.25 }}>{updateSummary(item.excerpt, item.title, 122) || fallbackSummary}</span>
          <span style={{ color: ink, fontSize: 15, lineHeight: 1.2 }}>Source: {oneLine(item.source_label, 74, 'Original publisher')}</span>
        </div>
      </div>)}
    </div>
    <div style={{ ...col, borderTop: '2px solid ' + line, paddingTop: 18, gap: 7 }}>
      <span style={{ ...label, fontSize: 16 }}>READ THIS EDITION &amp; ITS ORIGINAL SOURCES</span>
      <span style={{ fontSize: 17, color: ink }}>{data.link}</span>
      <span style={{ fontSize: 15, color: subtle }}>Independent UniEco Ghana briefing. Confirm current details with each original publisher.</span>
    </div>
  </div>, 'Page ' + data.page + ' of ' + data.pages, 'unieco-campus-briefing-' + data.page + '.png', { download });
}
