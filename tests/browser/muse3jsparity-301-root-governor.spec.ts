import { validateRootGovernorReport } from "./muse3jsparity-301-root-governor-contract";
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test, expect } from '@playwright/test';
import { startExampleDevServer, type ExampleDevServer } from './example-dev-server';
import type { RootGovernorReport } from './muse3jsparity-301-root-governor-harness';

test.describe('3.0.1 V02 actual overloaded root governor resource adaptation',()=>{
 let server:ExampleDevServer;
 test.beforeAll(async()=>{server=await startExampleDevServer();});
 test.afterAll(async()=>{await server.close();});
 test('resolution particles LOD and shadows change native resources after measured overload',async({page},testInfo)=>{
  test.setTimeout(900000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`${server.origin}/tests/browser/muse3jsparity-301-root-governor-harness.html`);
  await page.waitForFunction(()=>Boolean(window.__AURA301_ROOT_GOVERNOR__));
  const report:RootGovernorReport=await page.evaluate(()=>window.__AURA301_ROOT_GOVERNOR__!.run());
  const path=resolve('tests/reports/muse3jsparity/root-governor-301.json');mkdirSync(resolve('tests/reports/muse3jsparity'),{recursive:true});
  const save=()=>writeFileSync(path,JSON.stringify({...report,producer:'tests/browser/muse3jsparity-301-root-governor.spec.ts',generatedAt:new Date().toISOString(),errors},null,2)+'\n');save();await testInfo.attach('root-governor-resource-observations',{path,contentType:'application/json'});
  expect(errors).toEqual([]);expect(report.error).toBeUndefined();expect(report.rungs).toHaveLength(11);
  expect(report.rungs.flatMap(r=>r.changed)).toEqual(['resolutionScale','resolutionScale','resolutionScale','particleScale','particleScale','particleScale','lodBias','lodBias','lodBias','shadowSize','shadowSize']);
  for(const rung of report.rungs){
   expect(rung.overload).toHaveLength(8);expect(rung.overload.reduce((s,f)=>s+f.frameMs,0)/8).toBeGreaterThan(report.budget.maxFrameTimeMs);
   expect(rung.changed).toHaveLength(1);
   for(const sample of rung.adapted){
    expect(sample.frameMs).toBeGreaterThan(0);expect(sample.pixels).toBeGreaterThan(100);
    expect(sample.width).toBe(Math.round(960*rung.after.resolutionScale));expect(sample.height).toBe(Math.round(540*rung.after.resolutionScale));
    const particleCount=Math.floor(10000*rung.after.particleScale);expect(sample.particles).toBe(particleCount);
    expect(sample.draws.some(d=>!d.indexed&&d.instances===1&&d.count===particleCount*6)).toBe(true);
    const segments=rung.after.lodBias===1?256:rung.after.lodBias===1.25?128:rung.after.lodBias===1.6?64:8;
    expect(sample.draws.some(d=>d.indexed&&d.instances===rung.instances&&d.count===segments*3)).toBe(true);
    expect(sample.draws.some(d=>d.shadow&&d.viewport[2]===rung.after.shadowSize&&d.viewport[3]===rung.after.shadowSize&&d.count>0)).toBe(true);
   }
  }
  expect(report.restored?.width).toBe(960);expect(report.restored?.height).toBe(540);expect(report.restored?.particles).toBe(10000);
  expect(report.restored?.draws.some(d=>!d.indexed&&d.count===60000)).toBe(true);
  expect(report.restored?.draws.some(d=>d.indexed&&d.count===768&&d.instances>1)).toBe(true);
  expect(report.restored?.draws.some(d=>d.shadow&&d.viewport[2]===1024&&d.viewport[3]===1024)).toBe(true);
  expect(validateRootGovernorReport(report)).toEqual([]);report.complete=true;save();await testInfo.attach('root-governor-final-frame',{body:await page.locator('#engine').screenshot(),contentType:'image/png'});
 });
});
