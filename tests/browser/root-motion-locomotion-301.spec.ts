import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { measureLocomotionStances, type LocomotionContactSample } from "../../packages/animation/src/LocomotionEvidence";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

test.use({ video: "retain-on-failure" });
test.describe("E01 root translated walking with physical movement",()=>{
  test.setTimeout(180_000);
  let server:ExampleDevServer;
  test.beforeAll(async()=>{server=await startExampleDevServer();});
  test.afterAll(async()=>{await server.close();});
  for(const scenario of ["straight","turn","blocked","slope","crossfade"]){
    test(`${scenario}: retains raw root displacement, contact and renderer evidence`,async({page},testInfo)=>{
      const errors:string[]=[];page.on("pageerror",error=>errors.push(error.message));
      await page.goto(`${server.origin}/tests/browser/root-motion-locomotion-301-harness.html?scenario=${scenario}`);
      try {
        await page.waitForFunction(()=>["complete","error"].includes((window as unknown as {__AURA301_LOCOMOTION__?:{status:string}}).__AURA301_LOCOMOTION__?.status??""),undefined,{timeout:120_000});
      } catch (error) {
        const partial=await page.evaluate(()=>({state:(window as unknown as {__AURA301_LOCOMOTION__?:unknown}).__AURA301_LOCOMOTION__,body:document.body.innerText})).catch(reason=>({captureError:String(reason)}));
        writeFileSync(testInfo.outputPath(`${scenario}-timeout.json`),JSON.stringify({partial,errors,waitError:String(error)},null,2));
        await page.screenshot({path:testInfo.outputPath(`${scenario}-timeout.png`)}).catch(()=>undefined);
        throw error;
      }
      const evidence=await page.evaluate(()=> (window as unknown as {__AURA301_LOCOMOTION__: {status:string;error?:string;frames:{deformation:{maxRelativeLengthChange:number;upperBefore:number;upperAfter:number;lowerBefore:number;lowerAfter:number}[];surfaces:{side:"left"|"right";mesh:string;vertex:number;worldPosition:readonly[number,number,number];groundError:number|null}[];heading:number;time:number;position:readonly[number,number,number];requested:readonly[number,number,number];accepted:readonly[number,number,number];rejected:readonly[number,number,number];feet:{side:"left"|"right";worldPosition:readonly[number,number,number];locked:boolean;contactError:number}[]}[];rigHeight:number;gpuOracle?:{maximumError:number;minimumNegativeDelta:number;probes:number};pixels?:{changed:number;colored:number};renderer?:{runtime?:{backend?:string;mounted?:boolean;warnings?:string[]}};backend?:{active?:string};navigation?:{success?:boolean}}}).__AURA301_LOCOMOTION__);
      const samples:LocomotionContactSample[]=evidence.frames.flatMap(frame=>frame.feet.map(foot=>({time:frame.time,side:foot.side,stance:foot.locked,supportId:"ground",supportLocalPosition:foot.worldPosition,contactError:foot.contactError})));
      const measurement=measureLocomotionStances(samples,evidence.rigHeight);
      const soleSamples:LocomotionContactSample[]=evidence.frames.flatMap(frame=>frame.surfaces.map(point=>({time:frame.time,side:point.side,pointId:`${point.mesh}:${point.vertex}`,stance:frame.feet.some(foot=>foot.side===point.side&&foot.locked),supportId:"ground",supportLocalPosition:point.worldPosition,contactError:Math.abs(point.groundError??Infinity)})));
      const soleMeasurement=measureLocomotionStances(soleSamples,evidence.rigHeight);
      const directory=testInfo.outputPath("locomotion");mkdirSync(directory,{recursive:true});
      writeFileSync(`${directory}/${scenario}.json`,JSON.stringify({evidence,measurement,soleMeasurement,errors,provenance:JSON.parse(readFileSync("tests/fixtures/locomotion-301/rival-translated-walk.glb.provenance.json","utf8"))},null,2));
      await page.screenshot({path:`${directory}/${scenario}.png`});
      expect(evidence.error).toBeUndefined();expect(evidence.status).toBe("complete");expect(errors).toEqual([]);
      expect(evidence.navigation?.success).toBe(true);expect(evidence.backend?.active).toBe("rapier");
      expect(evidence.renderer?.runtime?.backend).toBe("production-runtime");expect(evidence.renderer?.runtime?.mounted).toBe(true);
      expect(evidence.renderer?.runtime?.warnings?.some(warning=>/and 1 Aura primitive/.test(warning))).toBe(true);
      expect(evidence.gpuOracle?.probes).toBeGreaterThan(5);expect(evidence.gpuOracle?.maximumError).toBeLessThan(1e-5);expect(evidence.gpuOracle?.minimumNegativeDelta).toBeGreaterThan(0.01);
      expect(evidence.pixels?.changed).toBeGreaterThan(100);expect(evidence.pixels?.colored).toBeGreaterThan(100);
      expect(evidence.frames).toHaveLength(360);expect(samples.length).toBeGreaterThan(360);
      expect(soleSamples.length).toBeGreaterThan(360);expect(soleMeasurement.passed).toBe(true);
      expect(soleMeasurement.worstContactError).toBeLessThanOrEqual(evidence.rigHeight*0.01);
      expect(measurement.passed).toBe(true);expect(measurement.maxSlip).toBeLessThanOrEqual(evidence.rigHeight*0.01);
      const last=evidence.frames.at(-1)!;const travelled=Math.hypot(last.position[0],last.position[2]);
      if(scenario==="blocked"){
        expect(travelled).toBeLessThan(0.7);
        expect(evidence.frames.some(frame=>Math.hypot(...frame.rejected)>0.001)).toBe(true);
      }else expect(travelled).toBeGreaterThan(0.5);
      if(scenario==="turn"){expect(last.heading).toBeGreaterThan(0.7);expect(last.position[0]).toBeGreaterThan(0.5);expect(last.position[2]).toBeGreaterThan(0.5);}
      for(const frame of evidence.frames){expect(frame.deformation).toHaveLength(2);for(const leg of frame.deformation)expect(leg.maxRelativeLengthChange).toBeLessThan(1e-3);}
      for(const frame of evidence.frames)for(let axis=0;axis<3;axis++)expect(frame.requested[axis]).toBeCloseTo(frame.accepted[axis]!+frame.rejected[axis]!,6);
    });
  }
});
