type Candidate={id:string;updated_at:string};
export async function publishEdition(rows:Candidate[],send:(r:Candidate)=>Promise<{ok:boolean;status:number}>,progress:(index:number)=>void){
  let published=0,index=0;
  for(const row of rows){
    progress(++index);
    try{
      const response=await send(row);
      if(response.ok)published++;
      else if(response.status!==409)break; // stale or paused stories stay private; stop on a service or session failure
    }catch{break;}
  }
  return {published,unconfirmed:rows.length-published};
}
