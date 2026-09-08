import { createHash } from 'node:crypto';

export const ROOT_TEMPORAL_CONTRACT = Object.freeze({ schema: 'aura3d-root-temporal-quality/v2', width: 240, height: 160, frames: 24, firstSteadyFrame: 9, edgeGradient: 32, edgeDilation: 2, improvement: .9, convergenceFraction: .25, referenceScales: [8, 16] as const });
export type TemporalPixels = readonly ArrayLike<number>[];
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
export function measureRootTemporalQuality(input: { baseline: TemporalPixels; taa: TemporalPixels; reset: TemporalPixels; reference8: TemporalPixels; reference16: TemporalPixels }) {
  const { width:w, height:h, frames:n } = ROOT_TEMPORAL_CONTRACT;
  for (const [name, frames] of Object.entries(input)) {
    if (frames.length !== n || frames.some(frame => frame.length !== w*h*4 || Array.from(frame).some(v => !Number.isInteger(v) || v < 0 || v > 255))) throw Error(`Invalid temporal pixels: ${name}`);
  }
  const mask = new Uint8Array(w*h);
  for (const frame of input.reference16) for (let y=0;y<h;y++) for(let x=0;x<w;x++) {
    let edge=false;
    for(const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      const xx=x+dx!, yy=y+dy!; if(xx<0||xx>=w||yy<0||yy>=h) continue;
      for(let c=0;c<3;c++) if(Math.abs(frame[(y*w+x)*4+c]!-frame[(yy*w+xx)*4+c]!)>=32) edge=true;
    }
    if(edge) for(let dy=-2;dy<=2;dy++) for(let dx=-2;dx<=2;dx++) if(x+dx>=0&&x+dx<w&&y+dy>=0&&y+dy<h) mask[(y+dy)*w+x+dx]=1;
  }
  const maskPixels=mask.reduce((a,b)=>a+b,0); if(!maskPixels) throw Error('Temporal reference has no silhouette edges');
  const score=(frames:TemporalPixels, reference:TemporalPixels)=>{
    let temporal=0, spatial=0, edgeSpatial=0, raw=0;
    for(let i=9;i<n;i++) for(let p=0;p<w*h;p++) for(let c=0;c<3;c++) {
      const k=p*4+c, error=frames[i]![k]!-reference[i]![k]!;
      spatial+=Math.abs(error); raw+=Math.abs(frames[i]![k]!-frames[i-1]![k]!);
      if(mask[p]) {edgeSpatial+=Math.abs(error); temporal+=Math.abs(error-(frames[i-1]![k]!-reference[i-1]![k]!));}
    }
    return { temporalResidual:temporal/(15*maskPixels*765), spatialError:spatial/(15*w*h*765), edgeSpatialError:edgeSpatial/(15*maskPixels*765), rawFrameDifference:raw/(15*w*h*765) };
  };
  const references = Object.fromEntries(([8,16] as const).map(scale=>{
    const reference=input[scale===8?'reference8':'reference16'];
    return [scale,{baseline:score(input.baseline,reference),taa:score(input.taa,reference),reset:score(input.reset,reference)}];
  })) as Record<8|16,Record<'baseline'|'taa'|'reset',ReturnType<typeof score>>>;
  const convergence=score(input.reference8,input.reference16).edgeSpatialError;
  const failures:string[]=[];
  if(convergence>ROOT_TEMPORAL_CONTRACT.convergenceFraction*references[16].baseline.edgeSpatialError) failures.push('reference convergence exceeds one quarter of baseline edge error');
  for(const scale of [8,16] as const) for(const control of ['baseline','reset'] as const) {
    if(!(references[scale].taa.temporalResidual < .9*references[scale][control].temporalResidual)) failures.push(`TAA temporal residual does not improve ${control} by 10% against reference ${scale}`);
    if(references[scale].taa.spatialError>references[scale][control].spatialError) failures.push(`TAA spatial error exceeds ${control} against reference ${scale}`);
  }
  return { contract:ROOT_TEMPORAL_CONTRACT, mask, maskPixels, maskSha256:hash(mask), referenceHashes:{8:input.reference8.map(f=>hash(Uint8Array.from(f))),16:input.reference16.map(f=>hash(Uint8Array.from(f)))}, convergence, references, failures };
}

/** Consumer-side replay also binds raw diagnostic metrics and reference hashes. */
export function rootTemporalQualityClaimErrors(input: Parameters<typeof measureRootTemporalQuality>[0], claimed: unknown): string[] {
  const { mask: _mask, ...actual } = measureRootTemporalQuality(input);
  return JSON.stringify(actual) === JSON.stringify(claimed) ? [] : ['R02 reported quality disagrees with retained pixels'];
}
