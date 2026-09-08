import {describe,it,expect} from 'vitest';
import {measureRenderedPairQuality,type PairQualityFrame} from '../../../tools/locomotion-301/pair-quality';
function frames():PairQualityFrame[]{return Array.from({length:121},(_,i)=>({time:i/60,cycle:i<=60?0:1,sample:i<=60?i:i-60,maxRelativeSegmentLengthChange:0,maxQuaternionNormError:0,surfaces:(['left','right'] as const).map(side=>({side,mesh:side,vertex:0,worldPosition:[side==='left'?-.1:.1,0,0] as const}))}));}
describe('pair-specific rendered contact and seam gate',()=>{
 it('accepts two dense cycles with measured soles and preserved segments',()=>expect(measureRenderedPairQuality(frames(),2,0,{left:[[0,60]],right:[[0,60]]}).pass).toBe(true));
 it('measures contact at the lowest point while retaining a rotated sole for slip',()=>{const raw=frames().map(f=>({...f,surfaces:[...f.surfaces,{side:'left' as const,mesh:'left',vertex:1,worldPosition:[-.1,.08,0] as const},{side:'right' as const,mesh:'right',vertex:1,worldPosition:[.1,.06,0] as const}]}));const q=measureRenderedPairQuality(raw,2,0,{left:[[0,60]],right:[[0,60]]});expect(q.worstContactError).toBe(0);expect(q.stance.worstContactError).toBe(.08);expect(q.pass).toBe(true);});
 it('rejects horizontal sliding even while each sole stays on the plane',()=>{const raw=frames().map((f,i)=>({...f,surfaces:f.surfaces.map(p=>({...p,worldPosition:[p.worldPosition[0]+i*.001,0,0] as const}))}));expect(measureRenderedPairQuality(raw,2,0,{left:[[0,60]],right:[[0,60]]}).failures).toContain('planted sole slip exceeds one percent of rendered mesh height or stance is undersampled');});
 it('rejects an airborne pair rather than accepting zero measured stance',()=>{const raw=frames().map(f=>({...f,surfaces:f.surfaces.map(p=>({...p,worldPosition:[0,1,0] as const}))}));expect(measureRenderedPairQuality(raw,2,0).pass).toBe(false);});
 it('rejects missing side, sparse historical samples, segment distortion and malformed quaternion',()=>{for(const change of [(f:PairQualityFrame)=>({...f,surfaces:f.surfaces.filter(p=>p.side==='left')}),(f:PairQualityFrame)=>({...f,maxRelativeSegmentLengthChange:.02}),(f:PairQualityFrame)=>({...f,maxQuaternionNormError:NaN})])expect(measureRenderedPairQuality(frames().map(change),2,0).pass).toBe(false);expect(measureRenderedPairQuality(frames().slice(0,17),2,0).pass).toBe(false);});
 it('retains and rejects exact loop endpoint displacement',()=>{const raw=frames();raw[60]={...raw[60]!,surfaces:raw[60]!.surfaces.map(p=>({...p,worldPosition:[p.worldPosition[0],0,.03] as const}))};const q=measureRenderedPairQuality(raw,2,0);expect(q.worstSeam).toBeCloseTo(.03);expect(q.failures).toContain('loop endpoint sole discontinuity exceeds one percent of rendered mesh height');});
 it('rejects second-cycle endpoint drift and the first frame after wrapping',()=>{for(const index of [61,120]){const raw=frames();raw[index]={...raw[index]!,surfaces:raw[index]!.surfaces.map(p=>({...p,worldPosition:[p.worldPosition[0],0,.03] as const}))};const q=measureRenderedPairQuality(raw,2,0);expect(index===61?q.worstBoundary:q.worstSeam).toBeCloseTo(.03);expect(q.pass).toBe(false);}});

 it('subtracts accepted actor travel only for pose seams, preserving world contact slip',()=>{const raw=frames().map((f,i)=>({...f,actorPosition:[0,0,i*.001] as const,surfaces:f.surfaces.map(p=>({...p,worldPosition:[p.worldPosition[0],0,i*.001] as const}))}));const q=measureRenderedPairQuality(raw,2,0);expect(q.worstSeam).toBeCloseTo(0);expect(q.worstBoundary).toBeCloseTo(0);expect(q.stance.maxSlip).toBeCloseTo(.12);expect(q.pass).toBe(false);});

});

import {paletteJointPositions301,measureRenderedSegments301} from '../../browser/rig-palette-world-301';
describe('draw-bound joint reconstruction',()=>{
 it('undoes the actual inverse-bind transform and includes actor model translation',()=>{
  const model=[1,0,0,0,0,1,0,0,0,0,1,0,3,0,0,1],palette=[1,0,0,0,0,1,0,0,0,0,1,0,0,2,0,1],bind=[1,0,0,0,0,1,0,0,0,0,1,0,0,1,0,1];
  expect(paletteJointPositions301({jointCount:1,jointMatrices:palette,modelMatrix:model},{jointNames:['hip'],bindMatrices:[bind],hierarchyEdges:[]})).toEqual({hip:[3,3,0]});
 });
 it('rejects absent actual GPU model state and measures actual leg stretch',()=>{expect(()=>paletteJointPositions301({jointCount:1,jointMatrices:[],modelMatrix:null},{jointNames:['hip'],bindMatrices:[],hierarchyEdges:[]})).toThrow();const binding={skin:{jointNames:['hip','knee','foot'],bindMatrices:[],hierarchyEdges:[{parent:'hip',child:'knee',bindLength:1},{parent:'knee',child:'foot',bindLength:1}]}};const bind={hip:[0,2,0],knee:[0,1,0],foot:[0,0,0]} as const;expect(measureRenderedSegments301(binding,bind,{...bind,foot:[0,-.2,0]}).maxRelativeSegmentLengthChange).toBeCloseTo(.2);});
 it('uses the draw-bound bind frame and excludes coincident helper edges without calling them missing',()=>{
  const binding={skin:{jointNames:['root','hips','foot'],bindMatrices:[],hierarchyEdges:[{parent:'root',child:'hips',bindLength:99},{parent:'hips',child:'foot',bindLength:99}]}};
  const bind={root:[0,2,0],hips:[0,2,0],foot:[0,0,0]} as const;
  const result=measureRenderedSegments301(binding,bind,{root:[3,2,0],hips:[3,2,0],foot:[3,0,0]});
  expect(result.maxRelativeSegmentLengthChange).toBe(0);expect(result.missing).toEqual([]);expect(result.degenerate).toEqual(['root->hips']);
  const mapped=measureRenderedSegments301(binding,bind,{root:[3,9,0],hips:[3,2,0],foot:[3,0,0]},new Set(['hips','foot']));
  expect(mapped.segments.map(segment=>`${segment.from}->${segment.to}`)).toEqual(['hips->foot']);expect(mapped.maxRelativeSegmentLengthChange).toBe(0);
 });
});
