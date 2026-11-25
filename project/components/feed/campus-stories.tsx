'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';

type Story = {id:string; author_name:string; mine:boolean; caption:string; ext:string; expires_at:string};
const formats:Record<string,string> = {'image/jpeg':'jpg','image/png':'png','image/webp':'webp','video/mp4':'mp4','video/webm':'webm'};
const active = (s:Story) => Date.parse(s.expires_at)>Date.now();

export function CampusStories({canPost,userId,avatar}:{canPost:boolean;userId:string;avatar?:string}) {
  const [rows,setRows]=useState<Story[]|null>(null);
  const [error,setError]=useState(false);
  const [compose,setCompose]=useState(false);
  const [caption,setCaption]=useState('');
  const [file,setFile]=useState<File|null>(null);
  const [selected,setSelected]=useState<string|null>(null);
  const [busy,setBusy]=useState(false);
  const lock=useRef(false);
  const revision=useRef(0);
  const refresh=useCallback(async()=>{
    const seq=++revision.current;
    const response=await supabase.rpc('active_campus_stories');
    if(seq!==revision.current)return;
    if(response.error){
      setRows(null);
      setError(response.error.code!=='PGRST202');
      return;
    }
    setError(false);
    setRows(((response.data??[]) as Story[]).filter(active));
  },[]);
  useEffect(()=>{
    void refresh();
    const tick=()=>{if(document.visibilityState==='visible')void refresh()};
    const timer=setInterval(tick,60_000);
    document.addEventListener('visibilitychange',tick);
    return ()=>{revision.current++;clearInterval(timer);document.removeEventListener('visibilitychange',tick)};
  },[refresh]);
  useEffect(()=>{
    if(!rows?.length)return;
    const next=Math.min(...rows.map(s=>Date.parse(s.expires_at)));
    const timer=setTimeout(()=>setRows(list=>list?.filter(active)??null),Math.max(0,next-Date.now()+1));
    return ()=>clearTimeout(timer);
  },[rows]);
  const story=rows?.find(s=>s.id===selected && active(s));
  const nextId=story && rows ? rows[rows.indexOf(story)+1]?.id ?? null : null;
  const [paused,setPaused]=useState(false);
  useEffect(()=>{
    if(!story || paused || ['mp4','webm'].includes(story.ext)) return;
    const timer=setTimeout(()=>{if(!document.hidden)setSelected(nextId)},8000);
    return ()=>clearTimeout(timer);
  },[story?.id,story?.ext,nextId,paused]);
  async function publish(){
    if(!canPost || lock.current || (!caption.trim() && !file))return;
    if(file && (!formats[file.type] || !file.size || file.size>12*1024*1024)){toast.error('Choose a supported photo or video, up to 12 MB.');return;}
    lock.current=true;setBusy(true);
    try {
      const ext=file?formats[file.type]:'text';
      const draft=await supabase.rpc('reserve_campus_story',{p_caption:caption.trim(),p_ext:ext});
      if(draft.error)throw new Error(draft.error.message==='Daily story limit reached'?'Daily story limit reached.':'Could not start your story. Check your posting access.');
      if(file){
        const upload=await supabase.storage.from('campus-stories').upload(userId+'/'+draft.data+'.'+ext,file,{upsert:false,contentType:file.type});
        if(upload.error)throw new Error('Media upload failed. Nothing was published.');
      }
      const result=await supabase.rpc('publish_campus_story',{p_id:draft.data});
      if(result.error)throw new Error('Publication not confirmed. Check Stories before retrying.');
      setCompose(false);setFile(null);setCaption('');toast.success('Your story is live for 24 hours.');await refresh();
    } catch(e){toast.error(e instanceof Error?e.message:'Could not publish your story.');}
    finally{lock.current=false;setBusy(false);}
  }
  if(!rows)return error?<button type="button" className="p-3 text-sm" onClick={()=>void refresh()}>Stories unavailable · Retry</button>:null;
  const index=rows.findIndex(s=>s.id===selected);
  return <section aria-label="Campus stories" className="border-b border-border/40">
    <h2 className="sr-only">Stories · shared for 24 hours</h2>
    <div className="flex items-start gap-3 overflow-x-auto px-3 py-3 [scrollbar-width:none]">
      {canPost && <button type="button" aria-label="Add story" onClick={()=>setCompose(true)} className="w-[4.75rem] shrink-0 text-center">
        <span className="relative mx-auto grid size-[4.25rem] place-items-center rounded-full bg-muted text-xl">{avatar?<img src={avatar} alt="" className="size-full rounded-full object-cover"/>:'You'}<span className="absolute -bottom-0.5 -right-0.5 grid size-6 place-items-center rounded-full border-2 border-background bg-foreground font-bold leading-none text-background">+</span></span>
        <span className="mt-1 block text-xs">Your story</span></button>}
      {rows.map(s=><button type="button" key={s.id} onClick={()=>{setPaused(false);setSelected(s.id)}} aria-label={'View story by '+s.author_name} className="w-[4.75rem] shrink-0 text-center">
        <span className="mx-auto grid size-[4.25rem] place-items-stretch rounded-full bg-gradient-to-tr from-amber-400 via-rose-500 to-fuchsia-600 p-[3px]"><span className="grid place-items-center overflow-hidden rounded-full border-[3px] border-background bg-muted font-bold">{['jpg','png','webp'].includes(s.ext)?<img loading="lazy" src={'/api/community/story-media?id='+s.id} alt="" className="size-full object-cover"/>:s.author_name.slice(0,2).toUpperCase()}</span></span><span className="mt-1 block truncate text-xs">{s.mine?'You':s.author_name}</span></button>)}
      {!canPost && rows.length===0 && <p className="text-xs text-muted-foreground">No active stories yet.</p>}
    </div>
    <Dialog open={compose && canPost} onOpenChange={v=>{if(!busy)setCompose(v)}}><DialogContent><DialogTitle>Create a story</DialogTitle><DialogDescription>Visible to signed-in campus readers for 24 hours. This will not create a feed post.</DialogDescription>
      <label>Story text<textarea value={caption} onChange={e=>setCaption(e.target.value)} maxLength={280} className="block w-full rounded-md border bg-background p-2" disabled={busy}/></label>
      <label>Photo or video (optional, 12 MB max)<input type="file" accept={Object.keys(formats).join(',')} disabled={busy} onChange={e=>setFile(e.target.files?.[0]??null)} className="block w-full"/></label>
      {file && <span className="truncate text-sm">{file.name}</span>}
      <Button disabled={busy||(!caption.trim()&&!file)} onClick={()=>void publish()}>{busy?'Publishing…':'Publish story'}</Button>
    </DialogContent></Dialog>
    <Dialog open={!!story} onOpenChange={v=>{if(!v)setSelected(null)}}><DialogContent className="max-h-[92dvh] content-center overflow-auto border-0 bg-neutral-950 text-white max-sm:!inset-0 max-sm:!h-dvh max-sm:!max-h-dvh max-sm:!w-full max-sm:!max-w-none max-sm:!translate-x-0 max-sm:!translate-y-0 max-sm:rounded-none sm:max-w-md">
      {story && <><div className="flex gap-1 pr-10" aria-hidden="true">{rows.map((s,i)=><span key={s.id} className={`h-0.5 flex-1 rounded ${i<=index?'bg-white':'bg-white/30'}`}/>)}</div><DialogTitle>{story.author_name}</DialogTitle><DialogDescription className="text-white/70">Story · {index+1} of {rows.length}</DialogDescription>
        {!['mp4','webm'].includes(story.ext) && <button type="button" aria-pressed={paused} onClick={()=>setPaused(!paused)} className="min-h-11 text-sm">{paused?'Resume story':'Pause story'}</button>}
        {story.ext!=='text' && (['mp4','webm'].includes(story.ext)?<video key={story.id} src={'/api/community/story-media?id='+story.id} controls playsInline autoPlay onEnded={()=>setSelected(nextId)} className="max-h-[52dvh] w-full"/>:<img src={'/api/community/story-media?id='+story.id} alt={story.caption||'Campus story photo'} className="max-h-[52dvh] w-full object-contain"/>)}
        {story.caption && <p className="whitespace-pre-wrap break-words rounded-xl bg-white/10 p-4">{story.caption}</p>}
        <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={index<=0} onClick={()=>setSelected(rows[index-1].id)}>Previous</Button><Button variant="outline" disabled={index+1>=rows.length} onClick={()=>setSelected(rows[index+1].id)}>Next</Button>
        {story.mine && <Button variant="ghost" onClick={async()=>{if(!window.confirm('Remove this story now?'))return;const result=await supabase.rpc('remove_campus_story',{p_id:story.id});if(result.error){toast.error('Could not remove story.');return;}setSelected(null);await refresh();}}>Remove</Button>}</div></>}
    </DialogContent></Dialog>
  </section>;
}
