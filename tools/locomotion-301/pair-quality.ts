import { measureLocomotionStances, type LocomotionContactSample } from '../../packages/animation/src/LocomotionEvidence.js';

export const PAIR_QUALITY_LIMITS = Object.freeze({ slipHeightRatio: .01, contactHeightRatio: .01, seamHeightRatio: .01, segmentRelativeChange: .01, quaternionNormError: 1e-4, minimumCycleSamples: 61 });
export interface PairSurface { side: 'left'|'right'; mesh: string; vertex: number; worldPosition: readonly [number,number,number] }
export interface PairQualityFrame { time: number; cycle: number; sample: number; actorPosition?: readonly [number,number,number]; surfaces: readonly PairSurface[]; maxRelativeSegmentLengthChange: number|null; maxQuaternionNormError: number; }
export interface PairContactWindows { readonly left: readonly (readonly [number,number])[]; readonly right: readonly (readonly [number,number])[] }
/** Contact windows come from the retained uncorrected capture, independently of
 * corrected output. Ground proximity remains an additional error gate; it must
 * not turn a low-clearance swing into one continuous planted interval. */
export function measureRenderedPairQuality(frames: readonly PairQualityFrame[], rigHeight: number, supportY: number, contactWindows?: PairContactWindows) {
  const failures: string[]=[];
  if (!Number.isFinite(rigHeight)||rigHeight<=0||!Number.isFinite(supportY)) throw new Error('Pair requires a measured mesh height and fixed bind support plane');
  const threshold=rigHeight*PAIR_QUALITY_LIMITS.slipHeightRatio;
  const contacts:LocomotionContactSample[]=frames.flatMap(frame=>{
    const sideMin={left:Infinity,right:Infinity};
    for(const p of frame.surfaces)sideMin[p.side]=Math.min(sideMin[p.side],p.worldPosition[1]);
    return frame.surfaces.map(p=>({time:frame.time,side:p.side,pointId:`${p.mesh}:${p.vertex}`,supportId:'fixed-bind-sole-plane',stance:contactWindows ? contactWindows[p.side].some(([start,end])=>frame.sample>=start&&frame.sample<=end) : sideMin[p.side]-supportY<=threshold,supportLocalPosition:[p.worldPosition[0],p.worldPosition[1]-supportY,p.worldPosition[2]] as [number,number,number],contactError:Math.abs(p.worldPosition[1]-supportY)}));
  });
  const stance=measureLocomotionStances(contacts,rigHeight);
  // Contact is made by the lowest rendered sole point for each foot and frame.
  // Other retained sole vertices may rise as the foot rotates; treating their
  // height as penetration/contact error rejects a correctly planted rigid sole.
  const contactErrors=frames.flatMap(frame=>(['left','right'] as const).flatMap(side=>{
    const points=frame.surfaces.filter(point=>point.side===side);
    const inStance=contactWindows ? contactWindows[side].some(([start,end])=>frame.sample>=start&&frame.sample<=end) : points.some(point=>point.worldPosition[1]-supportY<=threshold);
    return inStance&&points.length ? [Math.abs(Math.min(...points.map(point=>point.worldPosition[1]))-supportY)] : [];
  }));
  const worstContactError=Math.max(0,...contactErrors);
  const cycleZero=frames.filter(f=>f.cycle===0),cycleOne=frames.filter(f=>f.cycle===1);
  if(cycleZero.length<PAIR_QUALITY_LIMITS.minimumCycleSamples||cycleOne.length<PAIR_QUALITY_LIMITS.minimumCycleSamples-1)failures.push('fewer than two densely sampled complete cycles');
  for(const side of ['left','right'] as const){
    if(!stance.intervals.some(i=>i.side===side&&i.samples>=3))failures.push(`${side}: no non-vacuous measured stance`);
    if(frames.some(f=>!f.surfaces.some(p=>p.side===side)))failures.push(`${side}: missing rendered sole surfaces`);
  }
  if(!stance.passed)failures.push('planted sole slip exceeds one percent of rendered mesh height or stance is undersampled');
  if(worstContactError>rigHeight*PAIR_QUALITY_LIMITS.contactHeightRatio)failures.push('worst sole contact error exceeds one percent of rendered mesh height');
  const first=cycleZero[0];
  const compare=(a:PairQualityFrame|undefined,b:PairQualityFrame|undefined)=>a&&b?a.surfaces.map(p=>{const end=b.surfaces.find(q=>q.side===p.side&&q.mesh===p.mesh&&q.vertex===p.vertex);return {side:p.side,mesh:p.mesh,vertex:p.vertex,displacement:end?Math.hypot(...p.worldPosition.map((v,i)=>(v-(a.actorPosition?.[i]??0))-(end.worldPosition[i]!-(b.actorPosition?.[i]??0)))):Infinity};}):[];
  const loopSeams=[{cycle:0,surfaces:compare(first,cycleZero.at(-1))},{cycle:1,surfaces:compare(first,cycleOne.at(-1))}];
  const seam=loopSeams.flatMap(s=>s.surfaces.map(p=>({...p,cycle:s.cycle})));
  const worstSeam=seam.length&&loopSeams.every(s=>s.surfaces.length)?Math.max(...seam.map(s=>s.displacement)):Infinity;
  if(worstSeam>rigHeight*PAIR_QUALITY_LIMITS.seamHeightRatio)failures.push('loop endpoint sole discontinuity exceeds one percent of rendered mesh height');
  // The first post-wrap sample must match the same authored phase from cycle0;
  // this catches repeat-only drift without mistaking ordinary swing velocity for a seam jump.
  const firstPostWrap=cycleOne[0];
  const boundary=compare(cycleZero.find(f=>f.sample===firstPostWrap?.sample),firstPostWrap);
  const worstBoundary=boundary.length?Math.max(...boundary.map(s=>s.displacement)):Infinity;
  if(worstBoundary>rigHeight*PAIR_QUALITY_LIMITS.seamHeightRatio)failures.push('first post-wrap pose differs from the same authored phase');
  if(frames.some(f=>f.maxRelativeSegmentLengthChange===null||!Number.isFinite(f.maxRelativeSegmentLengthChange)||f.maxRelativeSegmentLengthChange>PAIR_QUALITY_LIMITS.segmentRelativeChange))failures.push('missing or stretched mapped segments');
  if(frames.some(f=>!Number.isFinite(f.maxQuaternionNormError)||f.maxQuaternionNormError>PAIR_QUALITY_LIMITS.quaternionNormError))failures.push('invalid pose quaternion normalization');
  return {schema:'aura3d-rendered-pair-quality/v1' as const,limits:PAIR_QUALITY_LIMITS,rigHeight,supportY,contacts,stance,worstContactError,seam,worstSeam,boundary,worstBoundary,failures,pass:failures.length===0,independentVisualReview:'required' as const};
}
