'use client';
import {useEffect,useRef,useState} from 'react';
import {Button} from '@/components/ui/button';
import {publicSourceUrl} from '@/lib/ai/public-source-url';
import {publishEdition} from '@/lib/ai/publish-edition';
type Story={id:string;title:string;canonical_url:string;updated_at:string;published_at:string|null;source_label:string};

export function ReviewEdition({scope,onDone}:{scope:string;onDone:()=>void}){
 const [rows,setRows]=useState<Story[]>([]),[omit,setOmit]=useState<Set<string>>(new Set()),[checked,setChecked]=useState(false);
 const [busy,setBusy]=useState(false),[note,setNote]=useState('');const lock=useRef(false);
 const run=useRef<AbortController|null>(null);
 useEffect(()=>()=>run.current?.abort(),[]);
 const selection=rows.filter(r=>!omit.has(r.id)&&publicSourceUrl(r.canonical_url));
 async function load(){
   if(lock.current)return;lock.current=true;setBusy(true);setRows([]);setNote('Loading the current queue…');setChecked(false);setOmit(new Set());
   try{
     const all=new Map<string,Story>();let pages=1,total=-1;
     for(let page=1;page<=pages;page++){
       const params=new URLSearchParams({status:'pending',page:String(page),...(scope==='all'?{}:{source:scope})});
       const response=await fetch('/api/admin/campus-feed?'+params,{cache:'no-store'}),d=await response.json();
       if(!response.ok)throw Error(d.error||'Could not load the review queue.');
       if(page===1){pages=d.pages;total=d.total;}
       if(d.total!==total||d.pages!==pages)throw Error('The queue changed. Reload the batch before approving.');
       for(const r of d.items)all.set(r.id,r);
     }
     if(all.size!==total)throw Error('The queue changed. Reload the batch.');
     setRows(Array.from(all.values()));setNote(total?'Check the sources below. Untick any story that should stay private.':'There is nothing pending.');
   }catch(e){setNote(e instanceof Error?e.message:'Could not prepare batch.');}
   finally{lock.current=false;setBusy(false);}
 }
 async function publish(){
   if(lock.current||!checked||!selection.length)return;lock.current=true;setBusy(true);
   const controller=new AbortController();run.current=controller;
   try{
     const {published:done}=await publishEdition(selection,r=>fetch('/api/admin/campus-feed',{method:'POST',signal:controller.signal,headers:{'content-type':'application/json'},body:JSON.stringify({id:r.id,decision:'approved',sourceConfirmed:true,reviewedVersion:r.updated_at,reason:'Editor checked the source, accuracy and dates in the selected edition.'})}),i=>setNote('Publishing '+i+' of '+selection.length+'…'));
     if(controller.signal.aborted)return;
     setRows([]);setChecked(false);setNote(done+' published. '+(selection.length-done)+' not confirmed. '+(done<selection.length?'Reload the queue to review remaining stories. ':'')+'No notifications sent.');onDone();
   }finally{lock.current=false;setBusy(false);}
 }
 return <section className="grid gap-2 rounded-xl border p-3"><b>Publish a reviewed edition</b>
   <Button type="button" variant="outline" disabled={busy} onClick={()=>void load()}>Review all pending updates{scope==='all'?'':' from this publisher'}</Button>
   {!!rows.length&&<><div className="max-h-72 overflow-y-auto rounded border p-2">{rows.map(r=><div key={r.id} className="flex items-start gap-2 border-b py-2 text-sm"><input type="checkbox" aria-label={'Include '+r.title} disabled={busy||!publicSourceUrl(r.canonical_url)} checked={!omit.has(r.id)&&!!publicSourceUrl(r.canonical_url)} onChange={()=>{setChecked(false);setOmit(old=>{const s=new Set(old);if(s.has(r.id))s.delete(r.id);else s.add(r.id);return s;});}}/><div>{publicSourceUrl(r.canonical_url)?<a className="underline" href={r.canonical_url} target="_blank" rel="noopener noreferrer">{r.title} ↗</a>:r.title}<div>{r.source_label} · {r.published_at?.slice(0,10)||'Date not supplied'}</div></div></div>)}</div>
   <label className="text-sm"><input type="checkbox" checked={checked} disabled={busy} onChange={e=>setChecked(e.target.checked)}/> I checked the selected stories, dates and sources. Publishing does not grant photo rights.</label>
   <Button disabled={busy||!checked||!selection.length} onClick={()=>void publish()}>Approve &amp; publish {selection.length} updates</Button></>}
   {note&&<p role="status" className="text-sm">{note}</p>}</section>;
}
