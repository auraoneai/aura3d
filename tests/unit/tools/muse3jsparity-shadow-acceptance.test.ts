import { describe, expect, it } from 'vitest';
import { validateRawShadowAcceptance } from '../../../tools/muse3jsparity-readiness/shadow-acceptance';
const modes=['directional','spot','point','snappingDisabled','jitteredLight'];
function fixture():any {
  const matrix=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
  const sequences:any={};
  for(let m=0;m<5;m++)sequences[modes[m]!]=Array.from({length:3},(_,i)=>({atMs:i*30000+m+1,frameId:i*10+(m+1)*2,shimmerScore:i&&m>2?.2:0,receiverSamples:i?250:0,shadowedSamples:250,attenuation:Array(250).fill(m>2&&i%2?.4:.2),eye:[i*.1,7,10],shadow:{lightMatrix:matrix,cascades:Array.from({length:4},(_,j)=>({index:j,near:j*10,far:(j+1)*10,lightMatrix:matrix})),pointFaceMatrices:Array.from({length:6},()=>matrix).flat(),pointFaceRects:Array.from({length:6},(_,j)=>[(j%3)/3,Math.floor(j/3)/2,1/3,1/2]).flat(),stabilize:m!==3,shadowRenderTargetsAllocated:1,submissionFrameId:i*10+(m+1)*2},drawCalls:4,litDrawCalls:4}));
  return {schema:'muse301-shadows/v1',threshold:.03,oracle:'Fixed world receiver grid 0.2m, bilinear projected RGB; attenuation=1-shadow/lit, mean absolute temporal delta; fixed threshold .03 established before run; 512px PCF16; same scene/camera/time for paired controls',width:640,height:480,backend:'webgl2',adapter:'NVIDIA',readbackMs:200,lightTypes:['spot','point','directional'],sequences,samples:structuredClone(sequences.directional),renderedFrames:30,samplingHz:1/30,controls:{snappingDisabledScore:.2,jitteredLightScore:.2}};
}
// Rebuild internally consistent raw series; no reported-score-only mutations.
function setTemporalDelta(f:any,mode:string,delta:number) {
  for(const [i,sample] of f.sequences[mode].entries()) {
    sample.attenuation.fill(.2+(i%2)*delta);
    sample.shimmerScore=i?delta:0;
  }
  if(mode==='directional')f.samples=structuredClone(f.sequences.directional);
  if(mode==='snappingDisabled')f.controls.snappingDisabledScore=delta;
  if(mode==='jitteredLight')f.controls.jitteredLightScore=delta;
}
describe('raw shadow acceptance',()=>{
  it('accepts consistent synthetic raw renderer evidence',()=>expect(validateRawShadowAcceptance(fixture())).toEqual([]));
  it('compares each raw control mean to stabilized directional, not the primary ceiling',()=>{
    const f=fixture();setTemporalDelta(f,'directional',.01);
    setTemporalDelta(f,'snappingDisabled',.02);setTemporalDelta(f,'jitteredLight',.025);
    expect(validateRawShadowAcceptance(f)).toEqual([]);
  });
  it.each(['snappingDisabled','jitteredLight'])('rejects equal or better %s controls',mode=>{
    for(const delta of [.01,.005]){
      const f=fixture();setTemporalDelta(f,'directional',.01);setTemporalDelta(f,mode,delta);
      expect(validateRawShadowAcceptance(f)).toContain(`P02 ${mode} negative control does not discriminate`);
    }
  });
  it.each(['snappingDisabled','jitteredLight'])('rejects a mismatched reported %s mean',mode=>{
    const f=fixture();setTemporalDelta(f,'directional',.01);setTemporalDelta(f,mode,.02);
    f.controls[`${mode}Score`]=.025;
    expect(validateRawShadowAcceptance(f)).toContain(`P02 ${mode} reported control mean disagrees with raw receiver samples`);
  });
  it('accepts GPU Float32 atlas endpoints but rejects a representable overflow',()=>{
    const f=fixture();
    for(const sample of f.sequences.point)sample.shadow.pointFaceRects=Array.from(new Float32Array(sample.shadow.pointFaceRects));
    expect(validateRawShadowAcceptance(f)).toEqual([]);
    f.sequences.point[0].shadow.pointFaceRects[10]=Math.fround(1/3+2**-22);
    expect(validateRawShadowAcceptance(f)).toContain('P02 point/0 invalid face rect/matrix');
  });
  it.each(['snappingDisabled','jitteredLight'])('requires the complete sixty-second %s window',mode=>{
    const f=fixture();f.sequences[mode][2].atMs=f.sequences[mode][0].atMs+59999;
    expect(validateRawShadowAcceptance(f)).toContain(`P02 ${mode} sequence shorter than sixty seconds`);
  });
  it('does not accept a summary without the raw five modes',()=>{const f=fixture();delete f.sequences;expect(validateRawShadowAcceptance(f)).toContain('P02 five raw sequences required');});
  it('rejects changed fixed threshold or oracle',()=>{const f=fixture();f.threshold=.1;expect(validateRawShadowAcceptance(f)).toContain('P02 predeclared oracle/threshold changed');});
  it('recomputes primary shimmer instead of trusting zero summary',()=>{const f=fixture();f.sequences.spot[1].attenuation.fill(.9);expect(validateRawShadowAcceptance(f)).toContain('P02 spot/1 actual shimmer exceeds fixed threshold');});
  it('recomputes controls instead of trusting high reported scores',()=>{const f=fixture();f.sequences.snappingDisabled.forEach((s:any)=>s.attenuation.fill(.2));expect(validateRawShadowAcceptance(f)).toContain('P02 snappingDisabled negative control does not discriminate');});
  it('rejects broken receiver overlap and counts',()=>{const f=fixture();f.sequences.point[1].attenuation.fill(null,0,100);expect(validateRawShadowAcceptance(f)).toContain('P02 point/1 raw receiver metrics disagree');});
  it('requires the combined primary maximum and directional metadata',()=>{const f=fixture();f.samples[1].eye=[8,8,8];expect(validateRawShadowAcceptance(f)).toContain('P02 combined sample 1 does not reproduce raw primary maximum');});
  it('requires actual matrices, four cascades and six point face rectangles',()=>{const f=fixture();f.sequences.directional[0].shadow.cascades.pop();f.sequences.point[0].shadow.pointFaceRects.pop();const errors=validateRawShadowAcceptance(f);expect(errors).toContain('P02 directional/0 four actual cascades missing');expect(errors).toContain('P02 point/0 actual six-face atlas missing');});
  it('requires paired cameras, real draws, complete duration and rendering chronology',()=>{const f=fixture();f.sequences.point[1].eye=[1,2,3];f.sequences.spot[0].drawCalls=0;f.sequences.spot[2].atMs=59999;f.sequences.point[2].frameId=25;const errors=validateRawShadowAcceptance(f);expect(errors).toContain('P02 point/1 controls use different camera');expect(errors).toContain('P02 spot/0 actual scene draws missing');expect(errors).toContain('P02 spot sequence shorter than sixty seconds');expect(errors).toContain('P02 point/2 rendering chronology invalid');});
});
