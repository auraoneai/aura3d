/** Node-safe revalidation of raw observed engine measurements. No browser imports. */
export function validateEnginePerfReport(value:unknown):string[]{
 const errors:string[]=[];const r=value as any;
 const positiveInteger=(n:unknown)=>Number.isInteger(n)&&Number(n)>0;
 const entries:Record<string,string>={auraRoot:"@aura3d/engine:createAuraApp.stepAsync",auraParticles:"@aura3d/rendering:ParticleSystem.update + Renderer.renderAsync",three:"three@0.185.1:WebGLRenderer.render",threeBloom:"three@0.185.1:WebGLRenderer.render + EffectComposer/UnrealBloomPass"};
 if(!r||r.schema!=="aura3d.engine-perf-301/v1")return ["Invalid engine performance schema"];
 if(r.producer!=="tests/browser/muse3jsparity-301-engine-perf.spec.ts")errors.push("Unexpected engine producer");
 if(r.complete!==true)errors.push("Engine timing producer did not complete");
 if(!Array.isArray(r.failures)||r.failures.length||!Array.isArray(r.errors)||r.errors.length)errors.push("Producer failures or browser errors");
 const expected=["bloomChain","instance4k","light64","particle10k"];
 if(!Array.isArray(r.workloads)||r.workloads.length!==4)return [...errors,"Four workloads required"];
 errors.push(...validatePerfBloomQuality(r.bloomQuality));
 const actual=r.workloads.map((w:any)=>w?.workload);
 if(new Set(actual).size!==4||expected.some(w=>!actual.includes(w)))errors.push("Missing or duplicate workloads");
 for(const workload of r.workloads){
  const a=workload.engines?.aura,b=workload.engines?.three;
  if(!a||!b){errors.push(`${workload.workload}: missing opponent`);continue;}
  if(a.qualityFingerprint!==b.qualityFingerprint||a.hardware!==b.hardware||a.backend!==b.backend)errors.push(`${workload.workload}: mismatched settings/hardware`);
  for(const engine of ["aura","three"]){
   const e=workload.engines[engine],prefix=`${workload.workload}/${engine}`;
   if(e.engine!==engine||e.workload!==workload.workload||e.backend!=="webgl2"||!e.hardware)errors.push(`${prefix}: identity missing`);
   if(e.entryPoint!==(engine==="aura"?(workload.workload==="particle10k"?entries.auraParticles:entries.auraRoot):(workload.workload==="bloomChain"?entries.threeBloom:entries.three)))errors.push(`${prefix}: engine entry point missing`);
   if(e.qualityFingerprint!==JSON.stringify(e.quality)||e.quality?.resolution?.join()!=="640,360"||e.quality?.adaptive!==false||e.quality?.pixelRatio!==1||e.quality?.antialias!==false)errors.push(`${prefix}: invalid quality`);
   if(JSON.stringify(e.quality?.camera)!==JSON.stringify({position:[0,0,4],fov:45,near:.1,far:100})||e.quality?.workload!==workload.workload||e.quality?.instances!==(workload.workload==="instance4k"?4000:0)||e.quality?.lights!==(workload.workload==="light64"?64:0)||e.quality?.particles!==(workload.workload==="particle10k"?10000:0))errors.push(`${prefix}: frozen workload changed`);
   if(workload.workload==="bloomChain"&&JSON.stringify(e.quality?.bloom)!==JSON.stringify({mips:5,format:"half-float",threshold:1,strength:1,radius:1}))errors.push(`${prefix}: bloom quality changed`);
   if(engine==="three"&&e.revision!=="185")errors.push(`${prefix}: opponent revision changed`);
   if(!Array.isArray(e.adaptation)||e.adaptation.length)errors.push(`${prefix}: adaptive reductions`);
   if(workload.workload==="light64"&&e.effectiveLights!==64)errors.push(`${prefix}: effective light proof missing`);
   if(!Array.isArray(e.trials)||e.trials.length!==3){errors.push(`${prefix}: three trials required`);continue;}
   for(const [index,trial]of e.trials.entries()){
    if(!Array.isArray(trial.samples)||trial.samples.length!==60){errors.push(`${prefix}/${index}: 60 samples required`);continue;}
    for(const s of trial.samples){
     if(!s){errors.push(`${prefix}: missing sample`);continue;}
     if(s.renderSize?.join()!=="640,360"||s.gpuCompleted!==true||![s.cpuSubmissionMs,s.engineCallAwaitMs,s.gpuCompletionMs,s.readbackMs,s.completedFrameMs,s.rafPacingMs,s.textureStorageBytes].every(n=>Number.isFinite(n)&&n>=0)||s.completedFrameMs<=0||!positiveInteger(s.native?.drawCalls)||!positiveInteger(s.native?.triangles))errors.push(`${prefix}/${index}: invalid completed frame`);
     if(workload.workload==="instance4k"&&s.native?.maxDrawInstances!==4000)errors.push(`${prefix}: 4000 rendered instances missing`);
     if(workload.workload==="particle10k"&&(s.liveParticles!==10000||s.native?.triangles!==20000))errors.push(`${prefix}: 10000 live rendered particles missing`);
     if(workload.workload==="bloomChain"){
      const native=s.bloomObservation?.native;
      if(!native||native.mipCount!==5||native.halfFloat!==true||native.threshold!==1||native.intensity!==1||s.bloomObservation?.toneMapping!=="aces"||s.bloomObservation?.exposure!==1||s.bloomObservation?.outputColorSpace!=="srgb")errors.push(`${prefix}: observed bloom settings missing`);
      for(const [width,height]of [[320,180],[160,90],[80,45],[40,23],[20,12]]){
       if(!Array.isArray(s.textureAllocations)||s.textureAllocations.filter((t:any)=>t.width===width&&t.height===height&&t.halfFloat===true).length<2)errors.push(`${prefix}: native half-float mip pair missing`);
       if(!Array.isArray(s.native?.viewportDraws)||s.native.viewportDraws.filter((v:any)=>v?.[0]===width&&v?.[1]===height).length<2)errors.push(`${prefix}: native mip draws missing`);
      }
     }
    }
   }
  }
 }
 return [...new Set(errors)];
}

export const BLOOM_PERF_QUALITY_LIMITS={minimumHaloPixels:100,maximumClippedFraction:.02,minimumHaloRatio:.8,maximumHaloRatio:1.25,maximumCentroidDistance:2} as const;
export function analyzePerfBloomPair(off:readonly number[],on:readonly number[]){
 if(off.length!==640*360*4||on.length!==off.length)throw new Error("Expected exact performance viewport pixels");
 let haloPixels=0,haloEnergy=0,clipped=0,base=0,cx=0,cy=0;
 for(let i=0;i<on.length;i+=4){const before=(off[i]!+off[i+1]!+off[i+2]!)/3,after=(on[i]!+on[i+1]!+on[i+2]!)/3;
  if(before>32)base++;if(after>=254)clipped++;
  if(before<8&&after-before>4){haloPixels++;haloEnergy+=after-before;cx+=(i/4)%640;cy+=Math.floor(i/4/640);}
 }
 return {haloPixels,haloEnergy,clippedFraction:clipped/(640*360),basePixels:base,centroid:[cx/Math.max(1,haloPixels),cy/Math.max(1,haloPixels)]};
}
export function validatePerfBloomQuality(value:unknown):string[]{
 const q=value as any,failures:string[]=[];
 if(!q||JSON.stringify(q.limits)!==JSON.stringify(BLOOM_PERF_QUALITY_LIMITS))return ["Missing frozen performance bloom quality limits"];
 for(const engine of ["aura","three"]){const m=q[engine];if(!m||!Number.isFinite(m.haloPixels)||m.haloPixels<100||!Number.isFinite(m.haloEnergy)||m.haloEnergy<=0||!Number.isFinite(m.basePixels)||m.basePixels<100||!Number.isFinite(m.clippedFraction)||m.clippedFraction>.02)failures.push(`${engine}: performance bloom output quality failed`);}
 if(failures.length)return failures;
 for(const metric of ["haloPixels","haloEnergy"]){const ratio=q.aura[metric]/q.three[metric];if(ratio<.8||ratio>1.25)failures.push(`Performance bloom ${metric} is outside fixed equivalent-quality band`);}
 const delta=Math.hypot(q.aura.centroid?.[0]-q.three.centroid?.[0],q.aura.centroid?.[1]-q.three.centroid?.[1]);if(!Number.isFinite(delta)||delta>2)failures.push("Performance bloom halo centroids differ");
 return failures;
}
