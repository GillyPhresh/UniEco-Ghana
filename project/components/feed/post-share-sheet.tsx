'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { getOrCreateConversation, searchMessageContacts, sendMessage } from '@/lib/data/communication-client';
import { supabase } from '@/lib/supabase/client';

export function PostShareSheet({mode,postId,canSend,close,external,copy}:{
  mode:'share'|'repost';postId:string;canSend:boolean;close:()=>void;external:()=>Promise<void>;copy:()=>Promise<void>
}) {
  const [query,setQuery]=useState('');
  const [matches,setMatches]=useState<Awaited<ReturnType<typeof searchMessageContacts>>>([]);
  const [searching,setSearching]=useState(false);
  const [busy,setBusy]=useState(false);
  const lock=useRef(false);
  useEffect(()=>{
    let active=true;
    setMatches([]);
    const enabled=canSend && mode==='share' && query.trim().length>=2;
    setSearching(enabled);
    if(!enabled)return;
    const timer=setTimeout(async()=>{
      try {const rows=await searchMessageContacts(query);if(active)setMatches(rows);}
      catch {if(active)toast.error('Contacts could not be loaded. Try again.');}
      finally {if(active)setSearching(false);}
    },250);
    return ()=>{active=false;clearTimeout(timer)};
  },[query,mode,canSend]);
  async function publish(recipient?:string){
    if(lock.current)return;
    lock.current=true;setBusy(true);
    const url=new URL('/?post='+encodeURIComponent(postId),location.origin).href;
    try{
      if(mode==='repost'){
        const {error}=await supabase.rpc('create_campus_community_post_with_attachment',{
          p_caption:'Reposted on UniEco: '+url,p_media_path:null,p_media_type:null,p_attachment_path:null,p_attachment_name:null,p_attachment_size:null
        });
        if(error)throw error;
        toast.success('Reposted to your feed.');
      }else if(recipient){
        const conv=await getOrCreateConversation(recipient);
        if(!conv.id||conv.error)throw new Error();
        const result=await sendMessage(conv.id,recipient,url,'link');
        if(result.error)throw new Error();
        toast.success('Post sent in chat.');
      }
      close();
    }catch {toast.error(mode==='repost'?'Could not repost. Check your posting access and connection.':'Message not sent. Check your connection or choose another contact.');}
    finally{lock.current=false;setBusy(false);}
  }
  return <Dialog open onOpenChange={open=>{if(!open&&!lock.current)close()}}><DialogContent className="campus-feed-surface max-h-[85dvh] overflow-y-auto max-sm:!bottom-0 max-sm:!top-auto max-sm:!translate-y-0 max-sm:rounded-b-none">
    <DialogTitle>{mode==='share'?'Send post':'Repost to your feed?'}</DialogTitle>
    <DialogDescription>{mode==='share'?'Send a link privately, or share outside UniEco.':'This creates a post linking to the original. It does not copy the photo or video. You can delete your repost later.'}</DialogDescription>
    {mode==='repost'?<Button disabled={busy} onClick={()=>void publish()}>{busy?'Posting…':'Repost'}</Button>:<>
      {canSend && <><label className="text-sm font-semibold">Find a contact<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search by public name" className="mt-1 block h-11 w-full rounded-lg border bg-background px-3"/></label>
      {searching?<p role="status">Searching…</p>:matches.map(m=><button className="flex min-h-11 items-center justify-between gap-2 rounded-md px-2 hover:bg-muted" key={m.id} disabled={busy} onClick={()=>void publish(m.id)}><span>{m.full_name}</span><span className="text-primary">Send</span></button>)}
      {query.trim().length>=2&&!searching&&!matches.length&&<p className="text-sm text-muted-foreground">No matching contacts.</p>}</>}
      <Button disabled={busy} variant="outline" onClick={()=>void copy()}>Copy link</Button>
      <Button disabled={busy} onClick={()=>void external()}>Share outside UniEco</Button>
    </>}
  </DialogContent></Dialog>;
}
