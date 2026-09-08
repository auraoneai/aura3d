import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {expect,test} from '@playwright/test';
import {startExampleDevServer,type ExampleDevServer} from './example-dev-server';
import { measureRenderedPairQuality, PAIR_QUALITY_LIMITS } from '../../tools/locomotion-301/pair-quality';
import { resolvePairCorrectionDisposition } from '../../tools/locomotion-301/rig-pair-evidence';
import type { Fixture } from './rig-pair-rendered-301-harness';
// Generate with tools/locomotion-301/rig-pair-evidence.ts. A short historical
// 17-frame fixture cannot satisfy dense stance or loop certification.
const fixturePath=process.env.AURA301_RIG_PAIR_FIXTURE;
test.use({video:'on'});
test.describe('E01 translated locomotion across all certified rig pairs',()=>{
  test.setTimeout(300_000);
  let server:ExampleDevServer;
  test.beforeAll(async()=>{if(!fixturePath)throw new Error('Set AURA301_RIG_PAIR_FIXTURE to browser fixture output of tools/locomotion-301/rig-pair-evidence.ts');server=await startExampleDevServer();});
  test.afterAll(async()=>{await server?.close();});
  for(let index=0;index<16;index++)test(`ordered pair ${index}`,async({page},testInfo)=>{
    const bytes=readFileSync(fixturePath!);const fixture=JSON.parse(bytes.toString('utf8')) as Fixture;expect(fixture.pairs).toHaveLength(16);
    expect(new Set(fixture.pairs.map(p=>`${p.source}->${p.target}`)).size).toBe(16);
    expect(fixture.rigs).toHaveLength(4);
    const translatedPairs=fixture.pairs.filter(p=>p.samples.some(s=>s.rootMotion.classification==='authored-root-translation-consumed-once'&&Math.hypot(...s.rootMotion.cycleDelta)>1e-6));

    expect(createHash('sha256').update(readFileSync(fixture.translatedSource.file)).digest('hex'),'stale translated donor fixture').toBe(fixture.translatedSource.assetSha256);
    for(const rig of fixture.rigs)expect(createHash('sha256').update(readFileSync(rig.file)).digest('hex'),`${rig.rigId}: stale asset fixture`).toBe(rig.assetSha256);
    const pair=fixture.pairs[index]!;const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
    try{
      expect(pair.samples.length,'regenerate dense rig fixture').toBeGreaterThanOrEqual(PAIR_QUALITY_LIMITS.minimumCycleSamples);
      expect(pair.duration).toBeGreaterThan(0);expect(pair.clipSha256).toMatch(/^[a-f0-9]{64}$/);
      await page.goto(`${server.origin}/tests/browser/rig-pair-rendered-301-harness.html`);
      await page.waitForFunction(()=>Boolean(window.runAura301Pair),undefined,{timeout:90_000});
      await page.evaluate(async({fixture,index})=>window.runAura301Pair(fixture,index),{fixture,index});
      // Prime any stance interval that wraps across phase zero using the
      // previous cycle. This establishes the same persistent lock state at
      // both measured loop boundaries without adding duplicate metric rows.
      const wrappedStarts=Math.min(...(['left','right'] as const).flatMap(side=>pair.correctionValues.contactWindows[side].filter(([start])=>start>0).map(([start])=>start)));
      const hasWrappedWindow=(['left','right'] as const).some(side=>pair.correctionValues.contactWindows[side].some(([,end])=>end===pair.correctionValues.samplesPerCycle)&&pair.correctionValues.contactWindows[side].some(([start])=>start===0));
      if(hasWrappedWindow)for(let sample=wrappedStarts;sample<pair.samples.length;sample++)await page.evaluate(async sample=>window.sampleAura301Pair(sample,-1,false),sample);
      for(let sample=0;sample<pair.samples.length;sample++){
        await page.evaluate(async sample=>window.sampleAura301Pair(sample,0),sample);
        if(sample%15===0)await page.screenshot({path:testInfo.outputPath(`cycle-0-pose-${sample}.png`)});
      }
      // Replay the exact wrap phase through the real runtime before sampling cycle
      // two. It advances actor and lock state but is not a duplicate-time metric row.
      await page.evaluate(async()=>window.sampleAura301Pair(0,1,false));
      for(let sample=1;sample<pair.samples.length;sample++){
        await page.evaluate(async sample=>window.sampleAura301Pair(sample,1),sample);
        if(sample%15===0)await page.screenshot({path:testInfo.outputPath(`cycle-1-pose-${sample}.png`)});
      }
      const evidence=await page.evaluate(()=>window.__AURA301_PAIR__);
      const quality=measureRenderedPairQuality(evidence.frames,evidence.rigHeight!,evidence.supportY!,pair.correctionValues.contactWindows);
      if(translatedPairs.length===0)quality.failures.push('All-in-place roster: no translated pair; retained as negative controls only');
      if(pair.clipSelection!=='provenance-backed-translated-locomotion-candidate-unverified'||pair.clip!==fixture.translatedSource.clip||pair.clipSha256!==fixture.translatedSource.clipSha256)quality.failures.push('pair is not bound to the provenance-backed translated locomotion donor');
      const probes=evidence.frames.filter(f=>f.gpuOracle.probes>0);
      if(probes.length<8||probes.some(f=>f.gpuOracle.maximumError>1e-5||f.gpuOracle.minimumNegativeDelta<=.01))quality.failures.push('native palette skinning oracle or changed-palette negative control failed');
      if((evidence.rootNegativeControl?.changedPixels??0)<=20||(evidence.rootNegativeControl?.paletteChanged??0)===0)quality.failures.push('actual root draw palette/bone mutation did not change rendered pixels');
      const physics=evidence.physics as {backend?:{active?:string}};
      if(physics.backend?.active!=='rapier')quality.failures.push('root displacement is not owned by Rapier');
      let previous=[0,0,0];
      for(const frame of evidence.frames){
        const m=frame.motion;
        for(let axis=0;axis<3;axis++){
          if(Math.abs(m.requested[axis]!-m.accepted[axis]!-m.rejected[axis]!)>1e-6)quality.failures.push('root requested/accepted/rejected accounting mismatch');
          if(Math.abs(m.cumulative[axis]!-previous[axis]!-m.accepted[axis]!)>1e-6)quality.failures.push('actor motion applied more than once');
          if(Math.abs(m.cumulative[axis]!-m.target[axis]!)>evidence.rigHeight!*1e-5)quality.failures.push('unobstructed authored root displacement was not accepted');
        }
        previous=[...m.cumulative];
        if(frame.nativePalette.errors.length||!frame.nativePalette.draws.length)quality.failures.push('missing actual root GPU palette witness');
        if(frame.worldGeometry.missing.length)quality.failures.push('missing actual root joint world measurements');
      }
      quality.failures=[...new Set(quality.failures)];quality.pass=quality.failures.length===0;
      const correctionDisposition=resolvePairCorrectionDisposition(pair,quality.pass);
      writeFileSync(testInfo.outputPath('pair.json'),JSON.stringify({pair,translationCoverage:{pairClassification:pair.samples[0]!.rootMotion.classification,authoredCycleDistance:Math.hypot(...pair.samples.at(-1)!.rootMotion.cycleDelta),acceptedActorDistance:Math.hypot(...evidence.frames.at(-1)!.motion.cumulative),translatedPairs:translatedPairs.map(p=>`${p.source}->${p.target}`),inPlacePairs:fixture.pairs.length-translatedPairs.length,unsupportedSourceClips:fixture.unsupportedSourceClips},fixtureSha256:createHash('sha256').update(bytes).digest('hex'),evidence,quality,errors,correctionDisposition,qualityApproval:'independent-render-review-required'},null,2));
      expect(correctionDisposition.status).toBe(pair.source===pair.target?'explicit-no-pair-map-correction':'measured-pair-correction-applied');
      expect(errors).toEqual([]);expect(evidence.status).toBe('loaded');expect(evidence.frames).toHaveLength(pair.samples.length*2-1);expect(evidence.wrapPrime).toMatchObject({cycle:1,sample:0});
      const renderer=evidence.renderer as {runtime?:{backend?:string;mounted?:boolean}};expect(renderer.runtime?.backend).toBe('production-runtime');expect(renderer.runtime?.mounted).toBe(true);
      expect(evidence.frames.every(frame=>frame.colored>100)).toBe(true);
      expect(evidence.frames.every(frame=>(frame.imported.skinnedRenderItemCount??0)>0)).toBe(true);
      expect(Math.max(...evidence.frames.map(frame=>frame.changed))).toBeGreaterThan(20);
      expect(quality.failures,JSON.stringify(quality.failures)).toEqual([]);
    }finally{
      const partial=await page.evaluate(()=>window.__AURA301_PAIR__).catch(error=>({captureError:String(error)}));
      writeFileSync(testInfo.outputPath('partial.json'),JSON.stringify({pair:pair.source+'->'+pair.target,partial,errors},null,2));
      await page.evaluate(()=>window.disposeAura301Pair?.()).catch(()=>undefined);
    }
  });
});
