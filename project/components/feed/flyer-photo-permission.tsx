'use client';
import {useState} from 'react';
import {Button} from '@/components/ui/button';

export function FlyerPhotoPermission({id,onSaved}:{id:string;onSaved?:()=>void}){
  const [asset,setAsset]=useState<{asset:string;url:string;source:string;credit:string}|null>(null);
  const [credit,setCredit]=useState(''),[evidence,setEvidence]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  async function act(action:'inspect'|'allow'|'revoke'){
    if(busy)return;
    setBusy(true);setMessage('');
    try{
      const r=await fetch('/api/admin/campus-feed/photo-permission',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,id,asset:asset?.asset,credit,evidence})});
      const d=await r.json();if(!r.ok)throw Error(d.error||'Photo decision was not saved.');
      if(action==='inspect'){setAsset(d);setCredit(d.credit);setEvidence('');}
      else{setAsset(null);setMessage(action==='allow'?'Photo cleared. New exports can include this exact image.':'Photo permission withdrawn for future exports.');onSaved?.();}
    }catch(e){setMessage(e instanceof Error?e.message:'Unable to check the photo.');}
    finally{setBusy(false);}
  }
  return <div className="grid gap-2 rounded-lg border p-3 text-sm">
    {!asset?<Button type="button" variant="outline" disabled={busy} onClick={()=>void act('inspect')}>Manage flyer photo</Button>:<>
      <div className="flex gap-3 font-semibold"><a href={asset.url} target="_blank" rel="noopener noreferrer" className="underline">View exact photo ↗</a><a href={asset.source} target="_blank" rel="noopener noreferrer" className="underline">Original report ↗</a></div>
      <label>Photo credit<input maxLength={90} value={credit} onChange={e=>setCredit(e.target.value)} className="block w-full rounded border bg-background p-2" placeholder="Photographer or rights holder"/></label>
      <label>Permission reference<input maxLength={500} value={evidence} onChange={e=>setEvidence(e.target.value)} className="block w-full rounded border bg-background p-2" placeholder="Licence URL or written permission reference"/></label>
      <p className="text-xs text-muted-foreground">Confirm only if UniEco may redistribute this photo on social media. A publisher credit alone is not permission.</p>
      <Button disabled={busy||!credit.trim()||evidence.trim().length<8} onClick={()=>void act('allow')}>Confirm photo rights</Button>
      {asset.credit&&<Button variant="outline" disabled={busy||!credit.trim()||evidence.trim().length<8} onClick={()=>void act('revoke')}>Withdraw permission</Button>}
      <button type="button" onClick={()=>setAsset(null)}>Close photo settings</button>
    </>}
    {message&&<p role="status">{message}</p>}
  </div>;
}
