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
  media_url?: string | null;
  media_type?: 'image' | 'video' | null;
};

export const flyerSize = { width: 1080, height: 1350 };
const updateCardSize = { width: 1080, height: 1440 };
const leadHeight = 852;
const newsRed = '#a31722';
const newsInk = '#242323';
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
  logoPromise ??= readFile(join(process.cwd(), 'public', 'unieco-flyer-mark.png'))
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

/** The news page uses the same story-bound visual as the shareable flyer. */
export async function renderUpdatePhoto(data: FlyerItem) {
  const [visual, fonts] = await Promise.all([resolveFlyerVisual(data), flyerFonts()]);
  const photo = visual.background;
  const caption = /^(Illustrative photo|Campus file photo)/.test(photo.description)
    ? photo.description : 'Photo: ' + photo.credit;
  const image = new ImageResponse(<div style={{ ...row, position: 'relative', width: 1080, height: 600, fontFamily: 'Noto Sans', background: '#192d27' }}>
    <img src={photo.src} alt="" width={1080} height={600} style={{ objectFit: 'cover' }} />
    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, display: 'flex', padding: '14px 24px', fontSize: 23, color: '#fff', background: 'rgba(0,0,0,0.78)' }}>{oneLine(caption, 130)}</div>
  </div>, { width: 1080, height: 600, ...(fonts.length ? { fonts } : {}) });
  const bytes = await sharp(Buffer.from(await image.arrayBuffer()), { limitInputPixels: 1080 * 600 })
    .jpeg({ quality: 84, mozjpeg: true }).toBuffer();
  return new Response(new Uint8Array(bytes), { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-store',
    'X-UniEco-Photo-Type': photo.description === 'Publisher photo' ? 'story' : 'fallback' } });
}

export async function renderUpdateFlyer(data: FlyerItem, options: UpdateFlyerOptions = {}) {
  const [logo, visual, fonts] = await Promise.all([logoData(), resolveFlyerVisual(data, !options.draft), flyerFonts()]);
  const title = oneLine(data.title, 220, 'Campus update');
  const summary = updateSummary(data.excerpt, data.title, title.length > 135 ? 82 : 138);
  const source = oneLine(data.source_label, 85, 'Original publisher');
  const portraits = visual.portraits.slice(0, 2);
  const requiresCreditLink = [visual.background, ...portraits].some((photo) => photo.attributionRequired);
  const portraitCredits = Array.from(new Set(portraits.map((portrait) => portrait.credit))).join(' / ');
  const photoNote = /^(Illustrative photo|Campus file photo)/.test(visual.background.description) ? visual.background.description + ' · ' : 'Photo: ';
  const portraitNames = portraits.map((portrait) => oneLine(portrait.name, 46)).join(' · ');
  const titleSize = title.length > 172 ? 39 : title.length > 134 ? 43 : title.length > 98 ? 48 : title.length > 62 ? 53 : 59;
  const format = options.format || 'png';
  const filename = (options.draft ? 'unieco-draft-update' : 'unieco-campus-update') + (format === 'jpeg' ? '.jpg' : '.png');
  const headers = {
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
    'X-UniEco-Photo-Type': visual.background.description === 'Publisher photo' ? 'story' : 'fallback',
    'Content-Disposition': (options.download ? 'attachment' : 'inline') + '; filename="' + filename + '"',
    ...(options.draft ? { 'X-Robots-Tag': 'noindex, nofollow' } : {}),
  };

  const card = new ImageResponse(
    <div style={{ ...col, width: '100%', height: '100%', fontFamily: 'Noto Sans', color: newsInk, background: '#eeeeec' }}>
      <div style={{ ...row, height: leadHeight, width: '100%', position: 'relative', flexShrink: 0, background: '#192d27' }}>
        <img src={visual.background.src} alt="" width={1080} height={leadHeight} style={{ position: 'absolute', top: 0, left: 0, objectFit: 'cover' }} />
        <div style={{ ...row, alignItems: 'center', justifyContent: 'center', position: 'absolute', top: 38, left: 44, width: 194, height: 194, background: '#fff', boxShadow: '0 4px 16px rgba(0,0,0,0.28)' }}>
          {logo ? <img src={logo} alt="UniEco Ghana" width={184} height={184} style={{ objectFit: 'contain' }} />
            : <span style={{ fontSize: 28, fontWeight: 700, color: ink }}>UniEco</span>}
        </div>
        {options.draft && <span style={{ position: 'absolute', right: 72, top: 45, padding: '10px 14px', background: newsRed, color: '#fff', fontWeight: 700, fontSize: 19 }}>DRAFT · NOT PUBLIC</span>}
        {portraits.length > 0 && <div style={{ ...row, position: 'absolute', bottom: 72, left: 100, right: 100, justifyContent: portraits.length === 1 ? 'flex-end' : 'space-between' }}>
          {portraits.map((portrait) =>
            <div key={portrait.name} style={{ ...row, flexShrink: 0, width: 272, height: 272, borderRadius: 136, overflow: 'hidden', border: '10px solid #fff', background: '#fff' }}>
              <img src={portrait.src} alt={portrait.name} width={252} height={252} style={{ objectFit: 'cover' }} />
            </div>
          )}
        </div>}
        <div style={{ ...row, position: 'absolute', bottom: 0, width: '100%', height: 52, alignItems: 'center', justifyContent: 'flex-end', padding: '0 80px', background: 'rgba(245,245,245,0.44)' }}>
          {data.published_at && Number.isFinite(Date.parse(data.published_at)) &&
            <span style={{ padding: '4px 11px', background: '#fff', color: newsRed, fontSize: 19, fontWeight: 700 }}>{updateDate(data.published_at, 'long').toUpperCase()}</span>}
        </div>
        <svg aria-hidden="true" width={132} height={108} viewBox="0 0 132 108" style={{ position: 'absolute', left: 48, bottom: -4 }}>
          <path fill={newsRed} d="M0 0h42v34c0 28-12 49-36 68L0 87c12-11 18-23 18-36H0V0zm58 0h42v34c0 28-12 49-36 68l-6-15c12-11 18-23 18-36H58V0z" />
        </svg>
      </div>
      <div style={{ ...col, flex: 1, minHeight: 0, width: '100%', padding: '24px 100px 21px', backgroundImage: 'linear-gradient(145deg, #fafaf9 0%, #e9e9e7 100%)' }}>
        <div style={{ ...row, alignItems: 'center', marginBottom: 14 }}>
          <span style={{ padding: '5px 13px', fontSize: 25, fontWeight: 700, color: '#fff', background: newsRed }}>{updateCategory(data.category).toUpperCase()}</span>
        </div>
        <span style={{ fontSize: titleSize, fontWeight: 400, lineHeight: 1.13, letterSpacing: -0.8, wordBreak: 'break-word' }}>{title}</span>
        {summary && <span style={{ marginTop: 12, fontSize: 26, color: '#444444', lineHeight: 1.2, wordBreak: 'break-word' }}>{summary}</span>}
        <div style={{ ...col, alignItems: 'flex-end', justifyContent: 'flex-end', flexGrow: 1, marginTop: 12, gap: 3, textAlign: 'right' }}>
          {portraitNames && <span style={{ fontSize: 20, color: newsInk }}>Pictured: {portraitNames}</span>}
          <span style={{ color: newsRed, fontSize: 25, fontWeight: 700 }}>— {source}</span>
        </div>
      </div>
      <div style={{ ...col, width: '100%', flexShrink: 0, background: '#e5e5e3', borderTop: '2px solid #c8c8c5', padding: '10px 62px 12px', gap: 5 }}>
        <div style={{ ...row, justifyContent: 'space-between', alignItems: 'center', gap: 14 }}>
          <span style={{ fontSize: 17, color: newsInk, fontWeight: 700 }}>{options.draft ? 'UNIECO GHANA · MANAGEMENT PREVIEW' : 'UNIECO GHANA  ·  uniecoghana.com'}</span>
          <div style={{ ...row, alignItems: 'center', gap: 10, color: '#242323' }}>
            <span style={{ fontSize: 15, fontWeight: 700, border: '2px solid #242323', borderRadius: 5, padding: '1px 4px' }}>IG</span>
            <span style={{ fontSize: 20, fontWeight: 700 }}>f</span>
            <span style={{ fontSize: 18, fontWeight: 700 }}>X</span>
            <span style={{ fontSize: 15, fontWeight: 700 }}>@UniEcoGhana</span>
          </div>
        </div>
        {!options.draft && <span style={{ fontSize: 14, color: newsInk, fontWeight: 700 }}>uniecoghana.com/updates/{data.id}</span>}
        <span style={{ fontSize: 14, color: '#474747' }}>{photoNote}{visual.background.credit}</span>
        {portraitCredits && <span style={{ fontSize: 15, color: '#474747' }}>Portraits: {portraitCredits}</span>}
        {requiresCreditLink && <span style={{ fontSize: 14, color: '#474747' }}>Photos cropped · creativecommons.org/licenses/by/4.0 · Source details on UniEco</span>}
      </div>
    </div>, { ...updateCardSize, headers, ...(fonts.length ? { fonts } : {}) },
  );
  if (format === 'png') return card;
  const bytes = await sharp(Buffer.from(await card.arrayBuffer()), { limitInputPixels: updateCardSize.width * updateCardSize.height })
    .flatten({ background: '#eeeeec' }).jpeg({ quality: 89, mozjpeg: true }).toBuffer();
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
