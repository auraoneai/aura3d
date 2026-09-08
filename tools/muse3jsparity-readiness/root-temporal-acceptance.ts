import { createHash } from 'node:crypto';
import { decodeTemporalPixels, type NativeTemporalContext } from './temporal-acceptance';
import { measureRootTemporalQuality } from './root-temporal-quality';
const hash=(bytes:string|Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
export function validateRootTemporal(raw:unknown, context:NativeTemporalContext):string[] {
  const d=raw as any, errors:string[]=[];
  if(!d||d.schema!=='aura3d-root-temporal-sequences/v1'||!Array.isArray(d.sequences)) return ['missing R02 retained report'];
  for(const identity of [d.sourceStart,d.sourceEnd]) if(!identity||Object.entries(context.source).some(([key,value])=>JSON.stringify(identity[key])!==JSON.stringify(value))) errors.push('R02 source identity mismatch');
  const start=Date.parse(d.startedAt),end=Date.parse(d.endedAt);
  if(!Number.isFinite(start)||!Number.isFinite(end)||start>end||end>context.now||context.now-start>30*60*1000) errors.push('R02 capture timestamps invalid or stale');
  if(!d.command||hash(JSON.stringify(d.command))!==d.commandSha256||!d.command.ancestors?.some((a:any)=>typeof a.commandLine==='string'&&/playwright/.test(a.commandLine)&&/root-effects-a3/.test(a.commandLine))) errors.push('R02 command ancestry invalid');
  if(d.sequences.length!==19)errors.push('R02 requires all 19 retained sequences');
  if(d.command?.invocationReceipt) {const r=d.command.invocationReceipt;try{if(!context.bound(r)||hash(context.readBytes(r.path))!==r.sha256)errors.push('R02 invocation receipt mismatch');}catch{errors.push('R02 invocation receipt missing');}}
  const sequences=new Map<string,Buffer[]>();
  for(const s of d.sequences) {
    const sequenceStart=Date.parse(s.startedAt),sequenceEnd=Date.parse(s.endedAt);
    if(!Number.isFinite(sequenceStart)||!Number.isFinite(sequenceEnd)||sequenceStart<start||sequenceEnd<sequenceStart||sequenceEnd>end)errors.push('R02 sequence timestamps invalid');
    const key=`${s.effect}/${s.motion}/${Boolean(s.resetEveryFrame)}/${s.referenceScale??1}`;
    if(sequences.has(key)||!Array.isArray(s.frames)||s.frames.length!==24) {errors.push(`R02 invalid sequence ${key}`);continue;}
    const decoded:Buffer[]=[];
    for(const [i,f] of s.frames.entries()) try {
      const a=f.artifact;
      if(f.frame!==i||f.width!==240||f.height!==160||!context.bound(a)) throw Error('unbound frame');
      const bytes=context.readBytes(a.path);if(hash(bytes)!==a.sha256) throw Error('PNG hash');
      let rgba=decodeTemporalPixels(bytes,240,160);
      // Retained PNGs normalize WebGL bottom-left readback to top-left.
      if(a.readbackOrigin==='bottom-left') {const bottom=Buffer.alloc(rgba.length);for(let y=0;y<160;y++)rgba.copy(bottom,(159-y)*960,y*960,(y+1)*960);rgba=bottom;}
      if(hash(rgba)!==a.readbackSha256) throw Error('readback hash');
      if(s.effect!=='baseline'&&(!f.actualPasses?.includes(s.effect)||!f.pixelBacked||!(f.nativeTemporalPasses>0)||!(f.nativeTemporalBindings>0)||f.warnings?.some((w:string)=>w.includes('TEMPORAL_')))) throw Error('native submission');
      decoded.push(rgba);
    } catch(error){errors.push(`R02 frame ${key}/${i}: ${error}`);}
    if(decoded.length===24)sequences.set(key,decoded);
  }
  const get=(effect:string,motion:string,reset=false,scale=1)=>{const frames=sequences.get(`${effect}/${motion}/${reset}/${scale}`);if(!frames)throw Error(`missing ${effect}/${motion}/${reset}/${scale}`);return frames;};
  const stats=(a:Buffer,b:Buffer)=>{let sum=0,changed=0;for(let i=0;i<a.length;i+=4){let d=0;for(let c=0;c<3;c++)d+=Math.abs(a[i+c]!-b[i+c]!);sum+=d;if(d>12)changed++;}return {changedFraction:changed/(240*160),meanAbsoluteDelta:sum/(240*160)};};
  const delta=(a:Buffer,b:Buffer)=>stats(a,b).meanAbsoluteDelta;
  try {
    const {mask,...quality}=measureRootTemporalQuality({baseline:get('baseline','jitter'),taa:get('taa','jitter'),reset:get('taa','jitter',true),reference8:get('baseline','jitter',false,8),reference16:get('baseline','jitter',false,16)});
    errors.push(...quality.failures.map(e=>`R02 ${e}`));
    const {maskArtifact,...claimed}=d.metrics.quality;
    if(JSON.stringify(claimed)!==JSON.stringify(quality))errors.push('R02 reported quality disagrees with retained pixels');
    if(!context.bound(maskArtifact)||hash(context.readBytes(maskArtifact.path))!==hash(mask)||maskArtifact.sha256!==hash(mask))errors.push('R02 mask mismatch');
    const flicker=(f:Buffer[])=>f.slice(9).reduce((sum,a,i)=>sum+delta(a,f[i+8]!)/765,0)/15;
    const edge={off:flicker(get('baseline','jitter')),taa:flicker(get('taa','jitter')),reset:flicker(get('taa','jitter',true))};
    if(JSON.stringify(edge)!==JSON.stringify(d.metrics.edge))errors.push('R02 raw metric tamper');
    if(JSON.stringify(stats(get('taa','cut')[12]!,get('taa','cut',true)[12]!))!==JSON.stringify(d.metrics.cut))errors.push('R02 cut metric tamper');
    if(JSON.stringify(stats(get('taa','resume')[12]!,get('taa','disocclusion',true)[12]!))!==JSON.stringify(d.metrics.resume))errors.push('R02 resume metric tamper');
    if(delta(get('taa','cut')[12]!,get('taa','cut',true)[12]!)>=.5)errors.push('R02 cold cut differs from matched reset reference');
    if(delta(get('taa','resume')[12]!,get('taa','disocclusion',true)[12]!)>=.5)errors.push('R02 resume differs from matched reset reference');
    if(delta(get('baseline','static')[23]!,get('motion-blur','static')[23]!)>=.5)errors.push('R02 static blur changed scene');
    for(const motion of ['object','camera'])for(const effect of ['motion-blur','taa']) {
      const frames=get(effect,motion),baseline=get('baseline',motion);
      if(stats(baseline[5]!,baseline[20]!).changedFraction<=.0001||stats(frames[20]!,baseline[20]!).changedFraction<=.0001)errors.push('R02 missing moving pixel control');
    }
    const off=get('baseline','disocclusion'),taa=get('taa','disocclusion');let old=0,newCoverage=0,stale=0,ghost=0,count=0;
    for(let y=50;y<110;y++)for(let x=82;x<93;x++){const k=(y*240+x)*4; if((off[11]![k]!+off[11]![k+1]!+off[11]![k+2]!)/765>.5)old++;if((off[12]![k]!+off[12]![k+1]!+off[12]![k+2]!)/765>.5)newCoverage++;for(let c=0;c<3;c++){stale+=Math.abs(taa[11]![k+c]!-off[12]![k+c]!)/765;ghost+=Math.abs(taa[12]![k+c]!-off[12]![k+c]!)/765;}count++;}
    const ghostMetrics={roi:{x0:82,x1:93,y0:50,y1:110},oldCoverage:old/count,newCoverage:newCoverage/count,staleError:stale/count,actualError:ghost/count};
    if(JSON.stringify(ghostMetrics)!==JSON.stringify(d.metrics.ghost))errors.push('R02 ghost metric tamper');
    if(old/count<=.5||newCoverage/count>=.01||stale/count<=.1||ghost/count>=.01)errors.push('R02 covered/vacated ghost control failed');
  }catch(error){errors.push(`R02 replay failed: ${error}`);}
  return errors;
}
