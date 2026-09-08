export interface CleanupRef { path: string; sha256: string }
export interface CleanupInventory {
 schema: 'muse301-cleanup-inventory/v1'; task: 'muse3jsparity-3.0.1';
 resources: { kind: 'ec2'|'process'|'github-actions'; id: string; startedAt: string; creationProof: CleanupRef; processStart?: string }[];
}
export interface CleanupObservation { kind: 'ec2'|'process'|'github-actions'; command: string[]; exitCode: number; observedAt: string; output: CleanupRef }
export interface CleanupAcceptance { schema: 'muse301-cleanup/v1'; inventory: CleanupRef; observations: CleanupObservation[] }
/** Match actual terminal-state outputs against every registered task-owned resource. */
export function validateCleanup(data: CleanupAcceptance, bound: (ref: CleanupRef) => boolean, read: (path: string) => string, now: number): string[] {
 const errors: string[]=[];
 if(data?.schema!=='muse301-cleanup/v1'||!bound(data.inventory)||!Array.isArray(data.observations))return ['missing cleanup inventory/observations'];
 let inventory:CleanupInventory;
 try{inventory=JSON.parse(read(data.inventory.path));}catch{return ['unreadable cleanup inventory'];}
 if(inventory.schema!=='muse301-cleanup-inventory/v1'||inventory.task!=='muse3jsparity-3.0.1'||!Array.isArray(inventory.resources)||inventory.resources.length===0)return ['invalid or empty owned-resource inventory'];
 const ids=new Set<string>();
 for(const resource of inventory.resources){
  const key=`${resource.kind}:${resource.id}`;
  if(!['ec2','process','github-actions'].includes(resource.kind)||ids.has(key)||!resource.id||!bound(resource.creationProof)||!Number.isFinite(Date.parse(resource.startedAt))){errors.push(`invalid resource registration: ${key}`);continue;}ids.add(key);
  try {
   const creation=JSON.parse(read(resource.creationProof.path));
   const created=resource.kind==='ec2'?(creation.Instances??[]).find((i:any)=>i.InstanceId===resource.id):resource.kind==='github-actions'?(String(creation.databaseId)===resource.id?creation:undefined):(String(creation.pid)===resource.id&&creation.processStart===resource.processStart?creation:undefined);
   const createdAt=resource.kind==='ec2'?created?.LaunchTime:resource.kind==='github-actions'?created?.createdAt:created?.startedAt;
   if(!created||!Number.isFinite(Date.parse(createdAt))||Date.parse(createdAt)!==Date.parse(resource.startedAt)){errors.push(`creation record does not identify owned resource: ${key}`);continue;}
  }catch{errors.push(`invalid resource creation record: ${key}`);continue;}
  const observations=data.observations.filter(o=>o.kind===resource.kind&&o.exitCode===0&&bound(o.output)&&Date.parse(o.observedAt)>=Date.parse(resource.startedAt)&&Date.parse(o.observedAt)<=now);
  let terminal=false;
  for(const observation of observations){
   try{
    const output=read(observation.output.path);
    if(resource.kind==='ec2'){
     if(observation.command[0]!=='aws'||!observation.command.includes('ec2')||!observation.command.includes('describe-instances'))continue;
     const instances=(JSON.parse(output).Reservations??[]).flatMap((r:any)=>r.Instances??[]).filter((i:any)=>i.InstanceId===resource.id);
     if(instances.length===1&&instances[0].State?.Name==='terminated')terminal=true;
    }else if(resource.kind==='github-actions'){
     if(observation.command[0]!=='gh'||!observation.command.includes('view')||!observation.command.includes('run'))continue;
     const run=JSON.parse(output);if(String(run.databaseId)===resource.id&&run.status==='completed'&&typeof run.conclusion==='string'&&run.conclusion.length>0)terminal=true;
    }else{
     if(JSON.stringify(observation.command)!==JSON.stringify(['ps','-axo','pid=,lstart=,command='])||!/^\d+$/.test(resource.id)||!resource.processStart)continue;
     // Final process observation must be recent; a prior absence is not end-of-task proof.
     if(!/^\s*\d+\s+\S/m.test(output))continue;
     if(now-Date.parse(observation.observedAt)>60000)continue;
     const matching=output.split('\n').filter(line=>new RegExp(`^\\s*${resource.id}\\s`).test(line));
     if(matching.length===0||matching.every(line=>!line.includes(resource.processStart!)))terminal=true;
    }
   }catch{errors.push(`malformed cleanup observation: ${key}`);}
  }
  if(!terminal)errors.push(`owned resource not proven terminal: ${key}`);
 }
 return errors;
}
