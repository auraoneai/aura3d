import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { startExampleDevServer, type ExampleDevServer } from './example-dev-server';
import type { runShadowStability301 } from './shadow-stability-301-harness';
import { validateAcceptance } from '../../tools/muse3jsparity-readiness/acceptance';

test.describe('P02 rendered shadow stability',()=>{
  let server:ExampleDevServer;
  test.beforeAll(async()=>{server=await startExampleDevServer();});
  test.afterAll(async()=>{await server.close();});
  test('60 seconds of rendered spot point directional shadows discriminate instability',async({page},testInfo)=>{
    test.setTimeout(300_000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
    await page.setViewportSize({width:800,height:600});await page.bringToFront();
    await page.goto(`${server.origin}/tests/browser/shadow-stability-301-harness.html`);
    await page.waitForFunction(()=>typeof (window as unknown as {runShadowStability301?:unknown}).runShadowStability301==='function');
    const dir='tests/reports/contact-shimmer-b1b2';mkdirSync(dir,{recursive:true});
    const report=await page.evaluate(()=>(window as unknown as {runShadowStability301:typeof runShadowStability301}).runShadowStability301()).catch(async error=>{
      const probe=await page.evaluate(()=>(window as unknown as {__shadow301Probe?:{litPng?:string;darkPng?:string}}).__shadow301Probe);
      writeFileSync(`${dir}/shadow-stability-301-failure.json`,JSON.stringify({probe,errors,message:String(error)},null,2));
      for(const [name,png] of Object.entries({lit:probe?.litPng,dark:probe?.darkPng}))if(png){
        const path=`${dir}/shadow-stability-301-failure-${name}.png`;writeFileSync(path,Buffer.from(png.split(',')[1]!,'base64'));
        await testInfo.attach(`P02 failed ${name} native pixels`,{path,contentType:'image/png'});
      }
      await page.screenshot({path:`${dir}/shadow-stability-301-failure-page.png`});
      throw error;
    });
    writeFileSync(`${dir}/shadow-stability-301.json`,JSON.stringify({...report,errors},null,2));
    for(const [i,image] of report.images.entries()){
      const path=`${dir}/shadow-stability-301-frame-${i}.png`;writeFileSync(path,Buffer.from(image.png.split(',')[1]!,'base64'));
      await testInfo.attach(`P02 rendered frame ${image.frameId}`,{path,contentType:'image/png'});
    }
    const reviewFrames = await page.evaluate(async images => {
      const results: Array<{ frameId: number; topBandRedPixels: number; width: number; height: number }> = [];
      for (const image of images) {
        const bitmap = await createImageBitmap(await (await fetch(image.png)).blob());
        const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
        const context = canvas.getContext('2d', { willReadFrequently: true })!; context.drawImage(bitmap, 0, 0); bitmap.close();
        const pixels = context.getImageData(0, 0, canvas.width, Math.ceil(canvas.height * 0.1)).data;
        let topBandRedPixels = 0;
        for (let offset = 0; offset < pixels.length; offset += 4) {
          const red = pixels[offset]!, green = pixels[offset + 1]!, blue = pixels[offset + 2]!;
          if (red > 150 && red > green * 1.5 && red > blue * 1.5) topBandRedPixels += 1;
        }
        results.push({ frameId: image.frameId, topBandRedPixels, width: canvas.width, height: canvas.height });
      }
      return results;
    }, report.images);
    // The calibration comb is a real shadow caster, but never part of the
    // reviewable color composition. A prior run exposed/clipped its red slats
    // across the top edge while all shimmer metrics still passed.
    expect(reviewFrames.every(frame => frame.topBandRedPixels === 0), JSON.stringify(reviewFrames)).toBe(true);
    await testInfo.attach('P02 retained-frame composition review', { body: JSON.stringify(reviewFrames, null, 2), contentType: 'application/json' });
    await page.screenshot({path:`${dir}/shadow-stability-301.png`});
    await testInfo.attach('P02 raw receiver time series',{path:`${dir}/shadow-stability-301.json`,contentType:'application/json'});
    await testInfo.attach('P02 final rendered frame',{path:`${dir}/shadow-stability-301.png`,contentType:'image/png'});
    expect(validateAcceptance('p02',report,[])).toEqual([]);
    expect(errors).toEqual([]);expect(report.samples.at(-1)!.atMs-report.samples[0]!.atMs).toBeGreaterThanOrEqual(60_000);
    expect(report.samples.every(s=>s.shimmerScore<=report.threshold)).toBe(true);
    // P02 task 3 says controls "must worsen the metric", relative to the
    // same stabilized directional sequence, excluding its initial zero.
    const directional=report.sequences.directional!.slice(1);
    const referenceMean=directional.reduce((sum,s)=>sum+s.shimmerScore,0)/directional.length;
    expect(report.controls.snappingDisabledScore).toBeGreaterThan(referenceMean);
    expect(report.controls.jitteredLightScore).toBeGreaterThan(referenceMean);
    expect(report.renderedFrames).toBe(report.samples.length*10);
  });
});
