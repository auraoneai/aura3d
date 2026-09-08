import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { validateNativeTemporal } from '../../../tools/muse3jsparity-readiness/temporal-acceptance';
const hash = (b: string | Uint8Array) => createHash('sha256').update(b).digest('hex');
function png(value: number) {
  const rgba = Buffer.alloc(256*256*4); for (let i=0;i<rgba.length;i+=4) { rgba.fill(value,i,i+3); rgba[i+3]=255; }
  const rows=Buffer.alloc(256*1025); for(let y=0;y<256;y++) rgba.copy(rows,y*1025+1,y*1024,(y+1)*1024);
  const chunk=(type:string,data:Buffer)=>{const body=Buffer.concat([Buffer.from(type),data]);let crc=0xffffffff;for(const b of body){crc^=b;for(let j=0;j<8;j++)crc=(crc>>>1)^(0xedb88320&-(crc&1));}const size=Buffer.alloc(4),end=Buffer.alloc(4);size.writeUInt32BE(data.length);end.writeUInt32BE((crc^0xffffffff)>>>0);return Buffer.concat([size,body,end]);};
  const header=Buffer.alloc(13);header.writeUInt32BE(256);header.writeUInt32BE(256,4);header[8]=8;header[9]=6;
  return {rgba,bytes:Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(rows)),chunk('IEND',Buffer.alloc(0))])};
}
function fixture() {
  const source={commit:'abc',fingerprint:'def'}, now=Date.now(), files=new Map<string,Buffer>();
  const command={worker:{executable:'/usr/bin/node',cwd:'/repo',argv:['worker']},ancestors:[{pid:10,parentPid:1,commandLine:'pnpm exec playwright test tests/browser/webgpu-post-j2.spec.ts'}]};
  let bindings=0;
  const frames=Array.from({length:175},(_,i)=>{
    const mode=i<32||i===136||i===146?'off':i<64?'fxaa':'taa';
    if(mode==='taa') bindings+=2;
    const x=i<128?(i%2?.3:-.3)*2/256:[145,146,155,156,165,174].includes(i)?.55:-.55;
    const value=i<32||i>=96&&i<128?(i%2?255:0):i<64?(i%2?200:0):i<96?100:x<0?255:0;
    const image=png(value),path=`frame-${i}.png`;files.set(path,image.bytes);
    return {frame:i+1,mode,x,reset:i>=96&&i<128,sceneKey:i===165?'r03-replacement':'r03-stable',width:256,height:256,nativeSubmissions:(i+1)*3,nativeTemporalBindings:bindings,artifact:{path,sha256:hash(image.bytes),readbackSha256:hash(image.rgba),width:256,height:256,format:'rgba8',readbackOrigin:'top-left',pngOrigin:'top-left'}};
  });
  const report:any={startedAt:new Date(now-1000).toISOString(),endedAt:new Date(now).toISOString(),sourceStart:source,sourceEnd:source,command,commandSha256:hash(JSON.stringify(command)),frames,errors:[],result:{status:'ready',backend:'webgpu',adapter:'NVIDIA RTX 4090 Vulkan',postErrors:[],checks:{frames:175,nativeTaaPasses:109,nativeFxaaPasses:32,nativeTemporalBindings:bindings,nativeSubmissions:525,nativeRenderPipelinesCreated:4,nativeTextureReadbacks:175,hotPathReadbacks:0,offFlicker:1,fxaaFlicker:200/255,taaFlicker:0,resetFlicker:1,taaVsFxaaPixels:65536,ghostMeanError:0,staleHistoryGhostMeanError:1,oldSilhouetteRoiCoverage:1,newSilhouetteRoiCoverage:0,cutMeanError:0,sceneReplacementMeanError:0,resizeMeanError:0}}};
  return {report,context:{source,now,bound:(r:{path:string;sha256:string})=>files.has(r.path)&&hash(files.get(r.path)!)===r.sha256,readBytes:(p:string)=>files.get(p)!}};
}
describe('native temporal acceptance',()=>{
  it('accepts a complete discriminating retained sequence (synthetic validator fixture only)',()=>{const f=fixture();expect(validateNativeTemporal(f.report,f.context)).toEqual([]);});
  it.each([null,{status:'unsupported'},{status:'error'},{status:'ready',backend:'webgpu',adapter:'SwiftShader'},{status:'ready',backend:'webgpu',adapter:'software forged native'}])('rejects unsupported/null/software result %j',result=>{const f=fixture();f.report.result=result;expect(validateNativeTemporal(f.report,f.context).length).toBeGreaterThan(0);});
  it('rejects missing frames and changed source',()=>{const f=fixture();f.report.frames.pop();f.report.sourceEnd={commit:'other'};expect(validateNativeTemporal(f.report,f.context)).toContain('R03 source identity mismatch');});
  it('rejects claimed quality that disagrees with retained pixels',()=>{const f=fixture();f.report.result.checks.taaFlicker=.3;expect(validateNativeTemporal(f.report,f.context)).toContain('R03 retained pixels disagree with taaFlicker');});
  it('rejects counter, chronology and PNG/readback tampering',()=>{const f=fixture();f.report.result.checks.hotPathReadbacks=1;f.report.frames[80].nativeTemporalBindings=0;f.report.frames[3].artifact.readbackSha256='forged';f.report.endedAt=new Date(f.context.now+1).toISOString();const errors=validateNativeTemporal(f.report,f.context);expect(errors).toContain('R03 native execution counters invalid');expect(errors.some(e=>e.includes('frame 81'))).toBe(true);expect(errors.some(e=>e.includes('readback hash'))).toBe(true);expect(errors).toContain('R03 capture timestamps invalid or stale');});
});
