import { describe, expect, it } from 'vitest';
import { measureRootTemporalQuality, rootTemporalQualityClaimErrors } from '../../../tools/muse3jsparity-readiness/root-temporal-quality';
function fixture() {
  const reference=Array.from({length:24},(_,i)=>{
    const frame=new Uint8Array(240*160*4);
    for(let y=50;y<110;y++)for(let x=100+(i%2);x<130+(i%2);x++)for(let c=0;c<3;c++)frame[(y*240+x)*4+c]=180;
    return frame;
  });
  const baseline=reference.map((f,i)=>{const out=f.slice();for(let y=50;y<110;y++)for(let x=100+(i%2);x<103+(i%2);x++)for(let c=0;c<3;c++)out[(y*240+x)*4+c]+=i%2?20:-20;return out;});
  return {baseline,reset:baseline,taa:reference,reference8:reference,reference16:reference};
}
describe('frozen root temporal motion-aware quality',()=>{
  it('accepts faithful moving edges with less residual while retaining raw physical motion',()=>{
    const data=fixture(),r=measureRootTemporalQuality(data);
    expect(r.failures).toEqual([]);expect(r.references[16].taa.rawFrameDifference).toBeGreaterThan(0);
    expect(r.references[16].taa.temporalResidual).toBe(0);expect(r.maskSha256).toHaveLength(64);
    expect(r.referenceHashes[16]).toHaveLength(24);
  });
  it('rejects motion lag even when it smooths movement',()=>{
    const data=fixture();data.taa=data.reference16.map((_,i)=>data.reference16[Math.max(0,i-1)]!);
    expect(measureRootTemporalQuality(data).failures.some(e=>e.includes('spatial error'))).toBe(true);
  });
  it('rejects spatial blur that can lower temporal frame difference',()=>{
    const data=fixture();data.taa=data.reference16.map(f=>{const out=f.slice();for(let y=0;y<160;y++)for(let x=1;x<239;x++)for(let c=0;c<3;c++)out[(y*240+x)*4+c]=Math.round((f[(y*240+x-1)*4+c]!+f[(y*240+x)*4+c]!+f[(y*240+x+1)*4+c]!)/3);return out;});
    expect(measureRootTemporalQuality(data).failures.some(e=>e.includes('spatial error'))).toBe(true);
  });
  it('rejects inconsistent independent reference resolution',()=>{
    const data=fixture();data.reference8=data.baseline;
    expect(measureRootTemporalQuality(data).failures).toContain('reference convergence exceeds one quarter of baseline edge error');
  });
  it('rejects raw metric and reference hash tampering',()=>{
    const data=fixture();const {mask: _mask,...claim}=measureRootTemporalQuality(data);
    expect(rootTemporalQualityClaimErrors(data,claim)).toEqual([]);
    claim.references[16].taa.rawFrameDifference=0;
    expect(rootTemporalQualityClaimErrors(data,claim)).toContain('R02 reported quality disagrees with retained pixels');
    claim.referenceHashes[16][0]='forged';
    expect(rootTemporalQualityClaimErrors(data,claim).length).toBeGreaterThan(0);
  }, 15_000);
  it('rejects missing reference frames instead of trusting reported hashes',()=>{
    const data=fixture();data.reference16=data.reference16.slice(1);
    expect(()=>measureRootTemporalQuality(data)).toThrow('Invalid temporal pixels');
  });
});
