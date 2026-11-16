/* eslint-disable @next/next/no-img-element */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import type { ReactNode } from 'react';
import { oneLine, updateCategory, updateDate, updateSummary } from './update-copy';

export type FlyerItem = {
  id: string;
  title: string;
  excerpt: string;
  source_label: string;
  university_name: string;
  published_at: string | null;
  category: string;
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

export function renderUpdateFlyer(data: FlyerItem, options: { draft?: boolean; download?: boolean } = {}) {
  const title = oneLine(data.title, 180, 'Campus update');
  const summary = updateSummary(data.excerpt, data.title, 305) || fallbackSummary;
  const school = oneLine(data.university_name, 92, 'Ghana tertiary network');
  const source = oneLine(data.source_label, 95, 'Original publisher');
  return renderLetter(<div style={{ ...col, flex: 1, width: '100%', minHeight: 0 }}>
    <div style={{ ...col, marginTop: 53, gap: 18, flex: 1 }}>
      <div style={{ ...row, alignSelf: 'flex-start', background: '#dcefe1', borderRadius: 8, padding: '10px 15px' }}>
        <span style={label}>{updateCategory(data.category).toUpperCase()}</span>
      </div>
      <span style={{ fontSize: 22, lineHeight: 1.2, color: green, fontWeight: 700 }}>{school}</span>
      <div style={{ ...col, padding: '4px 0 8px 23px', borderLeft: '6px solid #d9ad43', gap: 24 }}>
        <span style={{ fontSize: title.length > 131 ? 53 : title.length > 76 ? 61 : 74, letterSpacing: -2, lineHeight: 1.08, fontWeight: 800, wordBreak: 'break-word' }}>{title}</span>
        <span style={{ color: subtle, fontSize: 31, lineHeight: 1.34 }}>{summary}</span>
      </div>
      <div style={{ ...col, marginTop: 22, padding: '21px 25px', gap: 8, background: '#eef2e7', borderRadius: 14 }}>
        <span style={label}>ORIGINAL PUBLISHER</span>
        <span style={{ fontSize: 25, fontWeight: 700, lineHeight: 1.18 }}>{source}</span>
        <span style={{ fontSize: 20, color: subtle }}>{updateDate(data.published_at)}</span>
      </div>
    </div>
    <div style={{ ...col, borderTop: '2px solid ' + line, paddingTop: 22, gap: 9 }}>
      <span style={{ fontSize: 20, fontWeight: 700, color: green, letterSpacing: 0.5 }}>{options.draft ? 'FOR MANAGEMENT REVIEW ONLY' : 'READ THE UPDATE ON UNIECO'}</span>
      <span style={{ fontSize: 18, color: ink }}>{options.draft ? 'Verify the original source and dates before sharing.' : 'uniecoghana.com/updates/' + data.id}</span>
      <span style={{ fontSize: 16, color: subtle }}>UniEco Ghana is an independent publisher. Consult the named source for full details.</span>
    </div>
  </div>, options.draft ? 'Editorial preview' : 'Campus update', options.draft ? 'unieco-draft-update.png' : 'unieco-campus-update.png', options);
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
