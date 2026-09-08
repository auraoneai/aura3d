import { mkdirSync,writeFileSync } from 'node:fs';
import { expect,test } from '@playwright/test';
import { startExampleDevServer,type ExampleDevServer } from './example-dev-server';
import type { runBloomHdr301 } from './webgpu-bloom-hdr-301-harness';
test.describe('native WebGPU HDR bloom',()=>{
 let server:ExampleDevServer;test.beforeAll(async()=>{server=await startExampleDevServer();});test.afterAll(async()=>{await server.close();});
 test('preserves radiance above one through bloom before tone mapping for every quality',async({page},testInfo)=>{
  await page.goto(`${server.origin}/tests/browser/webgpu-bloom-hdr-301-harness.html`);
  await page.waitForFunction(()=>typeof(window as unknown as {runBloomHdr301:unknown}).runBloomHdr301==='function');
  const report=await page.evaluate(()=>(window as unknown as {runBloomHdr301:typeof runBloomHdr301}).runBloomHdr301());
  mkdirSync('tests/reports/webgpu-post-j2',{recursive:true});const path='tests/reports/webgpu-post-j2/hdr301.json';writeFileSync(path,JSON.stringify(report,null,2));await testInfo.attach('native float bloom numerical oracle',{path,contentType:'application/json'});
  expect(report.errors).toEqual([]);expect(report.source.slice(0,3)).toEqual([4,2,.5]);
  for(const result of report.results){expect(result.format).toBe('rgba16f');for(let c=0;c<3;c++){expect(Math.abs(result.hdr[c]!-report.expectedHdr[c]!)).toBeLessThan(.03);expect(Math.abs(result.toned[c]!-report.expectedToned[c]!)).toBeLessThanOrEqual(2);}expect(result.hdr[0]).toBeGreaterThan(1);expect(result.toned[0]).toBeGreaterThan(200);}
 });
});
