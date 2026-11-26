export function headlineText(value: string) {
  const named: Record<string,string> = {amp:'&',quot:'"',apos:"'",nbsp:' ',rsquo:'’',lsquo:'‘',ldquo:'“',rdquo:'”',ndash:'–',mdash:'—',hellip:'…'};
  const decode = (text:string) => text.replace(/&(#x[\da-f]{1,6}|#\d{1,7}|[a-z]{2,8});/gi,(raw,key:string)=>{
    if (!key.startsWith('#')) return named[key.toLowerCase()] ?? raw;
    const n = key[1].toLowerCase()==='x' ? parseInt(key.slice(2),16) : Number(key.slice(1));
    return n >= 32 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : ' ';
  });
  return decode(decode(value)).replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g,' ').trim();
}

export function oneLine(value: unknown, limit: number, fallback = '') {
  if (typeof value !== 'string') return fallback;
  const clean = headlineText(value).replace(/\s+/g, ' ').trim();
  if (!clean) return fallback;
  const characters = Array.from(clean);
  if (characters.length <= limit) return clean;
  const head = characters.slice(0, limit - 1).join('');
  return (head.length - head.lastIndexOf(' ') < 18 ? head.slice(0, head.lastIndexOf(' ')) : head).trimEnd() + '…';
}

export function updateSummary(value: unknown, title: string, max = 430) {
  const raw = typeof value === 'string' ? value : '';
  let summary = raw.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+(?:\.[A-Z]{2,})?\b/gi, '')
    .replace(/\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),\s*\d{1,2}\/\d{1,2}\/\d{4}\s*-\s*\d{1,2}:\d{2}\b/g, ' ')
    .replace(/\b(?:read more|share this page|skip to main content)\b/gi, ' ')
    .replace(/\s+/g, ' ').trim();
  const heading = title.trim().toLowerCase();
  while (heading && summary.toLowerCase().startsWith(heading)) {
    summary = summary.slice(heading.length).replace(/^[\s:|–—.\-]+/, '');
  }
  return summary.length < 30 ? '' : oneLine(summary, max);
}

export function updateCategory(value: string) {
  return ({
    opportunities: 'Student opportunity', events: 'Campus event', research: 'Research',
    notices: 'Notice', campus_life: 'Campus life', news: 'News',
  } as Record<string, string>)[value] || 'Campus update';
}

export function updateDate(value: string | null, style: 'medium' | 'long' = 'medium') {
  if (!value || !Number.isFinite(Date.parse(value))) return 'Date not supplied';
  return new Intl.DateTimeFormat('en-GH', { dateStyle: style, timeZone: 'Africa/Accra' }).format(new Date(value));
}
