import type { RootGovernorReport } from './muse3jsparity-301-root-governor-harness';
/** Recompute resource assertions from raw frame observations, never a complete flag. */
export function validateRootGovernorReport(input:unknown):string[]{
 const issues:string[]=[];const fail=(s:string)=>issues.push(s);
 if(!input||typeof input!=='object')return ['report missing'];const r=input as RootGovernorReport;
 const errors=(input as {errors?:unknown}).errors;if(errors!==undefined&&(!Array.isArray(errors)||errors.length>0))fail('browser errors');
 if(r.schema!=='aura3d.root-governor-301/v1')fail('schema');if(r.error)fail('producer error');
 if(r.budget?.maxFrameTimeMs!==16.7||r.budget?.minFps!==55)fail('budget mismatch');
 if(typeof r.hardware!=='string'||!r.hardware.length)fail('hardware missing');
 if(!r.entryPoint?.includes('createAuraApp.stepAsync')||!r.entryPoint.includes('createGameAppRuntime.pollPerformance'))fail('root entry missing');
 if(!Array.isArray(r.rungs)||r.rungs.length!==11)return [...issues,'11 measured rungs required'];
 const order=['resolutionScale','resolutionScale','resolutionScale','particleScale','particleScale','particleScale','lodBias','lodBias','lodBias','shadowSize','shadowSize'];
 const sequence=[{resolutionScale:1,particleScale:1,lodBias:1,shadowSize:1024},...order.map(()=>({resolutionScale:1,particleScale:1,lodBias:1,shadowSize:1024}))];
 const levels:Record<string,number[]>={resolutionScale:[.85,.7,.5],particleScale:[.7,.4,.2],lodBias:[1.25,1.6,2],shadowSize:[512,256]};const cursors:Record<string,number>={};
 order.forEach((key,i)=>{sequence[i+1]={...sequence[i]!,[key]:levels[key]![cursors[key]??0]!};cursors[key]=(cursors[key]??0)+1;});
 const checkFrame=(f:RootGovernorReport['rungs'][number]['adapted'][number],q:typeof sequence[number],instances:number,label:string)=>{
  if(!f||f.gpuCompleted!==true||!Number.isFinite(f.frameMs)||f.frameMs<=0||!Number.isFinite(f.rafPacingMs)||f.rafPacingMs<=0)fail(`${label}: incomplete frame`);
  if(!f)return;if(f.width!==Math.round(960*q.resolutionScale)||f.height!==Math.round(540*q.resolutionScale)||!Number.isInteger(f.pixels)||f.pixels<=100||f.pixels>f.width*f.height)fail(`${label}: resolution/pixels`);
  const count=Math.floor(10000*q.particleScale),segments=q.lodBias===1?256:q.lodBias===1.25?128:q.lodBias===1.6?64:8;
  if(f.particles!==count||!Array.isArray(f.draws)) {fail(`${label}: particles/draws missing`);return;}
  if(!f.draws.some(d=>!d.indexed&&d.instances===1&&d.count===count*6))fail(`${label}: native particle vertices`);
  if(!f.draws.some(d=>d.indexed&&d.instances===instances&&d.count===segments*3))fail(`${label}: native LOD indices`);
  if(!f.draws.some(d=>d.shadow&&d.viewport?.[2]===q.shadowSize&&d.viewport?.[3]===q.shadowSize&&d.count>0))fail(`${label}: shadow depth target`);
 };
 r.rungs.forEach((g,i)=>{
  if(!g||!Array.isArray(g.changed)||g.changed.length!==1||g.changed[0]!==order[i]){fail(`rung ${i}: wrong change`);return;}
  if(!Number.isInteger(g.instances)||g.instances<512||g.instances>131072)fail(`rung ${i}: workload count`);
  for(const key of Object.keys(sequence[i]!) as Array<keyof typeof g.before>){if(g.before?.[key]!==sequence[i]![key]||g.after?.[key]!==sequence[i+1]![key])fail(`rung ${i}: quality ${key}`);}
  if(!Array.isArray(g.overload)||g.overload.length!==8)fail(`rung ${i}: overload samples`);else {g.overload.forEach(f=>checkFrame(f,sequence[i]!,g.instances,`overload ${i}`));if(!(g.overload.reduce((s,f)=>s+f.frameMs,0)/8>16.7))fail(`rung ${i}: no measured overload`);}
  if(!Array.isArray(g.adapted)||g.adapted.length!==3)fail(`rung ${i}: adapted samples`);else g.adapted.forEach(f=>checkFrame(f,sequence[i+1]!,g.instances,`adapted ${i}`));
 });
 if(!r.restored)fail('restoration missing');else checkFrame(r.restored,sequence[0]!,r.rungs[10]!.instances,'restored');
 return issues;
}
