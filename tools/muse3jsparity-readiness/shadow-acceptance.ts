/** Raw renderer receiver samples are authoritative; summary scores are replayed. */
const MODES = ['directional','spot','point','snappingDisabled','jitteredLight'] as const;
const ORACLE = 'Fixed world receiver grid 0.2m, bilinear projected RGB; attenuation=1-shadow/lit, mean absolute temporal delta; fixed threshold .03 established before run; 512px PCF16; same scene/camera/time for paired controls';
const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const vector = (x: unknown, length: number): x is number[] => Array.isArray(x) && x.length === length && x.every(finite);
const near = (a: unknown, b: number) => finite(a) && Math.abs(a-b) <= 1e-10;
const mean = (a: number[]) => a.reduce((x,y)=>x+y,0) / Math.max(1,a.length);

export function validateRawShadowAcceptance(raw: unknown): string[] {
  const d = raw as any, errors: string[] = [];
  if (!d || typeof d !== 'object' || d.schema !== 'muse301-shadows/v1') return ['missing raw P02 shadow acceptance'];
  if (d.threshold !== .03 || d.oracle !== ORACLE) errors.push('P02 predeclared oracle/threshold changed');
  if (d.width !== 640 || d.height !== 480 || d.backend !== 'webgl2' || typeof d.adapter !== 'string' || !d.adapter.trim() || !finite(d.readbackMs) || d.readbackMs <= 0) errors.push('P02 renderer workload metadata missing');
  if (!Array.isArray(d.lightTypes) || d.lightTypes.length !== 3 || !['directional','spot','point'].every(k=>d.lightTypes.includes(k))) errors.push('P02 light types incomplete');
  const sequences=d.sequences;
  if (!sequences || !MODES.every(m=>Array.isArray(sequences[m]))) return [...errors,'P02 five raw sequences required'];
  const n=sequences.directional.length;
  if (n<2 || MODES.some(m=>sequences[m].length!==n) || !Array.isArray(d.samples) || d.samples.length!==n) return [...errors,'P02 unequal or missing sample sequences'];
  if (d.renderedFrames!==n*10) errors.push('P02 actual rendered frame count mismatch');
  const scores: Record<string,number[]> = {};
  let previousAt=-Infinity;
  for (let i=0;i<n;i++) for(let modeIndex=0;modeIndex<MODES.length;modeIndex++) {
    const mode=MODES[modeIndex]!, s=sequences[mode][i], previous=sequences[mode][i-1];
    if (!s || typeof s!=='object') {errors.push(`P02 ${mode}/${i} missing sample`);continue;}
    if (!finite(s.atMs) || s.atMs<0 || s.atMs<=previousAt || s.frameId!==i*10+(modeIndex+1)*2) errors.push(`P02 ${mode}/${i} rendering chronology invalid`);
    previousAt=s.atMs;
    if (!vector(s.eye,3) || JSON.stringify(s.eye)!==JSON.stringify(sequences.directional[i]?.eye)) errors.push(`P02 ${mode}/${i} controls use different camera`);
    if (!Number.isInteger(s.drawCalls) || s.drawCalls<4 || !Number.isInteger(s.litDrawCalls) || s.litDrawCalls<4) errors.push(`P02 ${mode}/${i} actual scene draws missing`);
    const shadow=s.shadow;
    if (!shadow || !vector(shadow.lightMatrix,16) || shadow.lightMatrix.every((v:number)=>v===0) || shadow.submissionFrameId!==s.frameId || shadow.stabilize!==(mode!=='snappingDisabled') || !Number.isInteger(shadow.shadowRenderTargetsAllocated) || shadow.shadowRenderTargetsAllocated<1) errors.push(`P02 ${mode}/${i} actual shadow resource witness invalid`);
    if (mode==='directional'||mode==='snappingDisabled'||mode==='jitteredLight') {
      const cascades=shadow?.cascades;
      if (!Array.isArray(cascades)||cascades.length!==4||cascades.some((c:any,j:number)=>!c||c.index!==j||!finite(c.near)||!finite(c.far)||c.near<0||c.far<=c.near||!vector(c.lightMatrix,16)||c.lightMatrix.every((v:number)=>v===0)||(j>0&&c.near<cascades[j-1].far))) errors.push(`P02 ${mode}/${i} four actual cascades missing`);
    }
    // Atlas coordinates are uploaded as Float32; evaluate the endpoint in
    // that arithmetic (f32(2/3)+f32(1/3) rounds to 1 on the GPU).
    if(mode==='point') {
      if (!vector(shadow?.pointFaceMatrices,96)||!vector(shadow?.pointFaceRects,24)) errors.push(`P02 point/${i} actual six-face atlas missing`);
      else for(let face=0;face<6;face++) {const rect=shadow.pointFaceRects.slice(face*4,face*4+4);if(rect[0]<0||rect[1]<0||rect[2]<=0||rect[3]<=0||Math.fround(rect[0]+rect[2])>1||Math.fround(rect[1]+rect[3])>1||shadow.pointFaceMatrices.slice(face*16,face*16+16).every((v:number)=>v===0))errors.push(`P02 point/${i} invalid face rect/matrix`);}
    }
    if (!Array.isArray(s.attenuation)||s.attenuation.length<200||s.attenuation.some((v:unknown)=>v!==null&&(!finite(v)||v<0||v>1))||s.attenuation.length!==sequences.directional[0]?.attenuation?.length||(i>0&&!Array.isArray(previous?.attenuation))) {errors.push(`P02 ${mode}/${i} raw attenuation missing/invalid`);continue;}
    const deltas:number[]=[];
    if(i>0) s.attenuation.forEach((v:number|null,j:number)=>{const p=previous.attenuation[j];if(v!==null&&finite(p))deltas.push(Math.abs(v-p));});
    const score=mean(deltas), active=s.attenuation.filter((v:number|null)=>v!==null&&v>.03).length;
    (scores[mode]??=[])[i]=score;
    if (!near(s.shimmerScore,score)||s.receiverSamples!==deltas.length||s.shadowedSamples!==active||active<20||(i>0&&deltas.length<200)) errors.push(`P02 ${mode}/${i} raw receiver metrics disagree`);
    if(modeIndex<3&&score>.03)errors.push(`P02 ${mode}/${i} actual shimmer exceeds fixed threshold`);
  }
  for(const mode of MODES) if(!finite(sequences[mode].at(-1)?.atMs)||sequences[mode].at(-1).atMs-sequences[mode][0]?.atMs<60000)errors.push(`P02 ${mode} sequence shorter than sixty seconds`);
  for(let i=0;i<n;i++) {
    const s=d.samples[i], directional=sequences.directional[i];
    if(!s||!directional){errors.push('P02 combined sample missing');continue;}
    const {shimmerScore: _ignored,...base}=directional;
    const {shimmerScore,...copy}=s;
    const maximum=Math.max(...MODES.slice(0,3).map(m=>scores[m]?.[i]??NaN));
    if(JSON.stringify(base)!==JSON.stringify(copy)||!near(shimmerScore,maximum))errors.push(`P02 combined sample ${i} does not reproduce raw primary maximum`);
  }
  const gaps=sequences.directional.slice(1).map((s:any,i:number)=>s?.atMs-sequences.directional[i]?.atMs);
  if(!near(d.samplingHz,1000/Math.max(...gaps)))errors.push('P02 sampling frequency disagrees with retained samples');
  // PRD P02 task 3: negative controls "must worsen the metric".
  // Freeze the comparison as each control's temporal mean strictly exceeding
  // the paired stabilized directional mean. Exclude the initial no-history
  // zero from both. The .03 primary ceiling above is unchanged; requiring
  // controls to exceed that ceiling was an unsupported stronger condition.
  // Recompute both means from raw attenuation, never from reported summaries.
  const reference=scores.directional?mean(scores.directional.slice(1)):NaN;
  for(const [mode,key] of [['snappingDisabled','snappingDisabledScore'],['jitteredLight','jitteredLightScore']] as const){
    const values=scores[mode];
    const control=values?mean(values.slice(1)):NaN;
    if(!near(d.controls?.[key],control))errors.push(`P02 ${mode} reported control mean disagrees with raw receiver samples`);
    if(!(control>reference))errors.push(`P02 ${mode} negative control does not discriminate`);
  }
  return errors;
}
