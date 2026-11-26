import type { WireItem } from '@/lib/ai/publisher-wire';
import { directories, openOpportunities } from '@/lib/ai/opportunity-board';

const date = new Intl.DateTimeFormat('en-GB',{timeZone:'Africa/Accra',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',hour12:false});
export function PublisherDesk({wire,asOf,category,search}:{wire:WireItem[];asOf:number;category:string;search:string}){
  const matches=(text:string)=>text.toLowerCase().includes(search.trim().toLowerCase());
  const stories=wire.filter(s=>matches([s.title,s.desk,s.publisher].join(' ')));
  const notices=openOpportunities(asOf).filter(n=>matches([n.title,n.scope,n.issuer,n.detail].join(' ')));
  const links=directories.filter(d=>matches(d.label+' '+d.issuer));
  return <>
    {(category==='all'||category==='news') && (stories.length>0 || !search) && <section aria-labelledby="press-wire" className="my-5 border-y-2 border-foreground py-4">
      <p className="newsroom-kicker">Ghana / World / Culture</p>
      <h2 id="press-wire" className="newsroom-headline mt-1 text-3xl">From the publishers</h2>
      <p className="mt-1 text-sm text-muted-foreground">Original reporting from the past 48 hours. Times in Ghana. Each headline opens its publisher.</p>
      {stories.length>0 ? <ol className="mt-3 grid gap-x-6 sm:grid-cols-2">{stories.map(s=><li key={s.url} className="min-w-0 border-t border-border">
        <a href={s.url} target="_blank" rel="noopener noreferrer" className="block py-3 hover:text-primary">
          <span className="block text-xs text-muted-foreground">{s.desk} · {s.publisher} · <time dateTime={s.published}>{date.format(new Date(s.published))}</time></span>
          <strong className="mt-1 block leading-snug">{s.title} <span aria-hidden="true">↗</span></strong>
        </a></li>)}</ol> : <p className="mt-3 text-sm">No recent publisher headlines are available. UniEco’s reviewed updates are below.</p>}
    </section>}
    {(category==='all'||category==='opportunities') && (notices.length+links.length>0) && <section aria-labelledby="opportunity-board" className="my-5 rounded-lg border border-border bg-muted/30 p-4 sm:p-5">
      <p className="newsroom-kicker">Ghana &amp; abroad</p><h2 id="opportunity-board" className="newsroom-headline mt-1 text-2xl">Scholarships &amp; opportunities</h2>
      <div className="mt-3 grid gap-4 md:grid-cols-3">{notices.map(n=><article key={n.url} className="border-t border-border pt-2">
        <p className="text-xs font-bold text-primary">{n.scope} · {n.issuer}</p>
        <a className="block py-2 font-bold hover:underline" href={n.url} target="_blank" rel="noopener noreferrer">{n.title} ↗</a>
        <p className="text-sm text-muted-foreground">{n.detail}</p><p className="mt-2 text-xs font-bold">Deadline: {n.deadline}</p>
      </article>)}</div>
      {links.length>0 && <div className="mt-4 border-t border-border pt-2"><p className="text-xs font-bold uppercase">Official directories</p><div className="flex flex-wrap gap-x-5">{links.map(d=><a key={d.url} href={d.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-sm font-semibold text-primary hover:underline">{d.label} ↗</a>)}</div></div>}
    </section>}
  </>;
}
