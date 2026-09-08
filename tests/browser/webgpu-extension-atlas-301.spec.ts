import { test, expect } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";
import { retainTemporalFrame } from "./root-temporal-evidence";
let server:ExampleDevServer;
test.beforeAll(async()=>{server=await startExampleDevServer();});test.afterAll(async()=>{await server.close();});
test("R04 native WebGPU atlas preserves each map, independent UVs and optional vertex attributes",async({page},testInfo)=>{
  test.setTimeout(240_000);const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));page.on("console",m=>{if(m.type()==="error")errors.push(m.text());});
  await page.goto(`${server.origin}/tests/browser/webgpu-extension-atlas-301-harness.html`);await page.click("#run");
  await page.waitForFunction(()=>["ready","error"].includes((window as any).__AURA_WEBGPU_ATLAS_301__?.status),undefined,{timeout:210_000});
  const result=await page.evaluate(()=>(window as any).__AURA_WEBGPU_ATLAS_301__);
  const frames=result.frames.map(({pixelsBase64,...frame}:any)=>({...frame,artifact:retainTemporalFrame(`tests/reports/webgpu-extension-atlas-301/${frame.id}.png`,frame.width,frame.height,Array.from(Buffer.from(pixelsBase64,"base64")),"top-left")}));
  await testInfo.attach("native-atlas-proof",{body:JSON.stringify({...result,frames,errors}),contentType:"application/json"});
  expect(result.status,JSON.stringify(result.errors)).toBe("ready");expect(result.backend).toBe("webgpu");expect(errors).toEqual([]);expect(result.errors).toEqual([]);expect(result.compilation.filter((item:any)=>item.severity==="error")).toEqual([]);
  expect(result.metrics).toHaveLength(40);for(const metric of result.metrics){if(metric.mode==="decoy"){expect(metric.changed,`${metric.slot}/unused-channel-decoy`).toBe(0);continue;}expect(metric.changed,`${metric.slot}/${metric.mode}`).toBeGreaterThan(10);expect(metric.mean,`${metric.slot}/${metric.mode}`).toBeGreaterThan(.01);}
  expect(result.zeroFilm.intensity).toEqual({changed:0,mean:0});expect(result.zeroFilm.thickness).toEqual({changed:0,mean:0});
  expect(result.missingAttributes.changed).toBe(0);expect(result.vertexColor.changed).toBeGreaterThan(100);
});

test("R04 diagnostic native GPU film decomposition (not acceptance evidence)",async({page},testInfo)=>{
  test.setTimeout(240_000);
  const errors:string[]=[];page.on("pageerror",error=>errors.push(error.message));
  for(const mode of ["film-mask","thickness","fresnel-difference","ggx-visibility","raw-film","normal-dot-products"]){
    await page.goto(`${server.origin}/tests/browser/webgpu-extension-atlas-301-harness.html?debug=${mode}`);await page.click("#run");
    await page.waitForFunction(()=>["ready","error"].includes((window as any).__AURA_WEBGPU_ATLAS_301__?.status),undefined,{timeout:30_000});
    const result=await page.evaluate(()=>(window as any).__AURA_WEBGPU_ATLAS_301__);
    await testInfo.attach(`native-atlas-diagnostic-${mode}`,{body:JSON.stringify(result),contentType:"application/json"});
    expect(result.status,JSON.stringify(result.errors)).toBe("ready");
    expect(result.compilation.filter((item:any)=>item.severity==="error")).toEqual([]);
  }
  expect(errors).toEqual([]);
});

test("R04 native film environment survives a zero-F0 substrate without double Fresnel weighting",async({page},testInfo)=>{
  test.setTimeout(90_000);const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
  await page.goto(`${server.origin}/tests/browser/webgpu-extension-atlas-301-harness.html?environment-regression=1`);await page.click("#run");
  await page.waitForFunction(()=>["ready","error"].includes((window as any).__AURA_WEBGPU_ATLAS_301__?.status),undefined,{timeout:60_000});
  const result=await page.evaluate(()=>(window as any).__AURA_WEBGPU_ATLAS_301__);
  const frames=result.frames.map(({pixelsBase64,...frame}:any)=>({...frame,artifact:retainTemporalFrame(`tests/reports/webgpu-extension-atlas-301-environment/${frame.id}.png`,frame.width,frame.height,Array.from(Buffer.from(pixelsBase64,"base64")),"top-left")}));
  await testInfo.attach("native-atlas-environment-proof",{body:JSON.stringify({...result,frames,errors}),contentType:"application/json"});
  expect(result.status,JSON.stringify(result.errors)).toBe("ready");expect(result.backend).toBe("webgpu");expect(errors).toEqual([]);expect(result.errors).toEqual([]);
  expect(result.compilation.filter((item:any)=>item.severity==="error")).toEqual([]);
  expect(result.drawUniformUploads).toEqual([
    {id:"all",environmentEnabled:1,diffuseIntensity:0,specularIntensity:1},
    {id:"film-no-environment",environmentEnabled:1,diffuseIntensity:0,specularIntensity:0},
    {id:"no-film-environment",environmentEnabled:1,diffuseIntensity:0,specularIntensity:1},
    {id:"no-film-no-environment",environmentEnabled:1,diffuseIntensity:0,specularIntensity:0}
  ]);
  expect(result.environmentRegression.zeroSubstrate).toEqual({changed:0,mean:0});
  expect(result.environmentRegression.film.changed).toBeGreaterThan(10);
  expect(result.environmentRegression.film.mean).toBeGreaterThan(.01);
});
