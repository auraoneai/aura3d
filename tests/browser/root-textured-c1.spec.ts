import { createHash } from "node:crypto";
import { retainTemporalFrame, temporalCommandIdentity } from "./root-temporal-evidence";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer } from "./example-dev-server";

const REPORT = "tests/reports/root-textured-c1/c1-probe.json";

interface C1TexturedMaterial {
  readonly nodeName: string;
  readonly levelName: string;
  readonly status: string;
  readonly slots: readonly string[];
  readonly pixelBacked: boolean;
  readonly warnings: readonly string[];
}

interface C1Capture {
  readonly id: string;
  readonly texturedMaterials: readonly C1TexturedMaterial[];
  readonly warnings: readonly string[];
  readonly drawCalls: number;
  readonly backend: string;
  readonly runtimeSurface: string;
  readonly graphicsVersion: string;
  readonly renderer: string;
  readonly colorOracle?: {slot:string;texel:readonly number[];expected:readonly number[];matchingPixels:number;shaderSubstitutions:number};
  readonly pixels: readonly number[];
  readonly width: number;
  readonly height: number;
}

interface C1Window extends Omit<Window, "__AURA3D_C1_RUNNER__"> {
  readonly __AURA3D_C1_RUNNER__?: {
    renderVariant(id: string): Promise<C1Capture>;
  };
  readonly __AURA3D_C1_ERROR__?: string;
}

const retainedCaptures: {id:string; width:number; height:number; drawCalls:number; backend:string; runtimeSurface:string; graphicsVersion:string; renderer:string; colorOracle?:C1Capture["colorOracle"]; warnings:readonly string[]; texturedMaterials:readonly C1TexturedMaterial[]; png:ReturnType<typeof retainTemporalFrame>; raw:{path:string;sha256:string}}[]=[];
test.beforeEach(()=>{retainedCaptures.length=0;});
test.afterEach(async({},info)=>{
  if(!retainedCaptures.length)return;
  const name=info.title.replace(/[^a-zA-Z0-9_-]+/g,"-");
  writeJson(`tests/reports/root-textured-c1/captures/${name}.json`,{
    schema:"aura3d.root-material-captures/1",generatedAt:new Date().toISOString(),test:info.title,
    complete:info.status==="passed",command:temporalCommandIdentity(),threshold:{rgbSumGreaterThan:12,extensionChangedFractionGreaterThan:.001,baseChangedFractionGreaterThan:.02},
    captures:retainedCaptures
  });
});
function retainCapture(capture:C1Capture):C1Capture {
  const name=capture.id.replace(/[^a-zA-Z0-9_-]+/g,"-");
  const stem=`tests/reports/root-textured-c1/captures/${name}`;
  const raw=Buffer.from(capture.pixels);mkdirSync(dirname(resolve(stem)),{recursive:true});writeFileSync(`${stem}.rgba`,raw);
  const png=retainTemporalFrame(`${stem}.png`,capture.width,capture.height,capture.pixels,"bottom-left");
  retainedCaptures.push({id:capture.id,width:capture.width,height:capture.height,drawCalls:capture.drawCalls,backend:capture.backend,runtimeSurface:capture.runtimeSurface,graphicsVersion:capture.graphicsVersion,renderer:capture.renderer,
    ...(capture.colorOracle?{colorOracle:capture.colorOracle}:{}),warnings:capture.warnings,texturedMaterials:capture.texturedMaterials,png,raw:{path:`${stem}.rgba`,sha256:createHash("sha256").update(raw).digest("hex")}});
  expect(capture.backend).toBe("webgl2");expect(capture.runtimeSurface).toBe("production-runtime");expect(capture.graphicsVersion).toMatch(/^WebGL 2\.0/);expect(capture.drawCalls).toBeGreaterThan(0);
  return capture;
}

/** C1 root textured PBR: asset-ref maps upgrade to TexturedPBRMaterial with deltas; uv1 selector proven; procedural warned. */
test("root textured C1 upgrades with pixel deltas and honest fallbacks", async ({ page }) => {
  test.setTimeout(300_000);
  const server = await startExampleDevServer();
  try {
    await page.goto(`${server.origin}/tests/browser/root-textured-c1-harness.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => {
      const harnessWindow = window as C1Window;
      return Boolean(harnessWindow.__AURA3D_C1_RUNNER__ || harnessWindow.__AURA3D_C1_ERROR__);
    }, undefined, { timeout: 90_000 });
    const harnessError = await page.evaluate(() => (window as C1Window).__AURA3D_C1_ERROR__);
    if (harnessError) throw new Error(harnessError);

    const render = (id: string): Promise<C1Capture> =>
      page.evaluate((variant) =>
        (window as C1Window).__AURA3D_C1_RUNNER__!.renderVariant(variant), id).then(retainCapture);

    const baseline = await render("baseline");
    expect(baseline.drawCalls).toBeGreaterThan(0);

    // Textured: all three slots bound, pixel-backed, real delta vs scalar.
    const textured = await render("textured");
    const subject = textured.texturedMaterials.find((entry) => entry.nodeName === "c1 subject box");
    expect(subject).toBeDefined();
    expect(subject!.status).toBe("textured");
    expect(subject!.pixelBacked).toBe(true);
    expect(subject!.slots).toEqual(expect.arrayContaining(["baseColor", "normal", "metallicRoughness"]));
    const texturedDelta = pixelDelta(textured, baseline);
    expect(texturedDelta.changedFraction).toBeGreaterThan(0.02);
    await page.screenshot({ path: resolve("tests/reports/root-textured-c1/c1-textured.png") });

    // uv1 selector: same maps on the tiling unwrap must sample differently.
    const uv1 = await render("uv1");
    const uv1Delta = pixelDelta(uv1, textured);
    expect(uv1Delta.changedFraction).toBeGreaterThan(0.02);
    await page.screenshot({ path: resolve("tests/reports/root-textured-c1/c1-uv1.png") });

    // Procedural: scalar retained, explicit warning, still draws.
    const procedural = await render("procedural");
    expect(procedural.drawCalls).toBeGreaterThan(0);
    expect(procedural.warnings.join(" ")).toContain("procedural texture");
    const proceduralSubject = procedural.texturedMaterials.find((entry) => entry.nodeName === "c1 subject box");
    expect(proceduralSubject?.pixelBacked ?? false).toBe(false);

    // Full maps: occlusion + emissive slots bound, pixel-backed, real delta vs textured.
    const fullmaps = await render("fullmaps");
    const fullmapsSubject = fullmaps.texturedMaterials.find((entry) => entry.nodeName === "c1 subject box");
    expect(fullmapsSubject).toBeDefined();
    expect(fullmapsSubject!.status).toBe("textured");
    expect(fullmapsSubject!.pixelBacked).toBe(true);
    expect(fullmapsSubject!.slots).toEqual(expect.arrayContaining(["baseColor", "normal", "metallicRoughness", "occlusion", "emissive"]));
    const fullmapsDelta = pixelDelta(fullmaps, textured);
    expect(fullmapsDelta.changedFraction).toBeGreaterThan(0.02);
    await page.screenshot({ path: resolve("tests/reports/root-textured-c1/c1-fullmaps.png") });

    // Transform: baseColor 0.5x scale resamples the checker (larger cells, no wrap), real delta vs textured.
    const xform = await render("xform");
    const xformSubject = xform.texturedMaterials.find((entry) => entry.nodeName === "c1 subject box");
    expect(xformSubject).toBeDefined();
    expect(xformSubject!.status).toBe("textured");
    expect(xformSubject!.pixelBacked).toBe(true);
    const xformDelta = pixelDelta(xform, textured);
    expect(xformDelta.changedFraction).toBeGreaterThan(0.02);
    await page.screenshot({ path: resolve("tests/reports/root-textured-c1/c1-xform.png") });

    writeJson(REPORT, {
      generatedAt: new Date().toISOString(),
      baseline: { ...baseline, pixels: `[${baseline.pixels.length} channels]` },
      textured: { ...textured, pixels: `[${textured.pixels.length} channels]` },
      texturedDelta,
      uv1Delta,
      fullmapsDelta,
      xformDelta
    });
  } finally {
    await server.close();
  }
});

function pixelDelta(a: C1Capture, b: C1Capture): { changedFraction: number; meanAbsoluteDelta: number } {
  expect(a.width).toBe(b.width);
  expect(a.height).toBe(b.height);
  const total = a.width * a.height;
  let changed = 0;
  let absoluteDelta = 0;
  for (let index = 0; index < total; index += 1) {
    const offset = index * 4;
    const delta =
      Math.abs((a.pixels[offset] ?? 0) - (b.pixels[offset] ?? 0)) +
      Math.abs((a.pixels[offset + 1] ?? 0) - (b.pixels[offset + 1] ?? 0)) +
      Math.abs((a.pixels[offset + 2] ?? 0) - (b.pixels[offset + 2] ?? 0));
    absoluteDelta += delta;
    if (delta > 12) changed += 1;
  }
  return { changedFraction: changed / total, meanAbsoluteDelta: absoluteDelta / total };
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(resolve(path)), { recursive: true });
  writeFileSync(resolve(path), `${JSON.stringify(value, null, 2)}\n`);
}


// Each map changes only its sampler input; scalar factors, camera and lights stay fixed.
for (const slot of ["clearcoat", "clearcoatRoughness", "clearcoatNormal", "sheenColor", "sheenRoughness", "iridescence", "iridescenceThickness", "anisotropy"]) {
  test(`root extension map ${slot} has independent visible UV sampling`, async ({ page }) => {
    test.setTimeout(240_000);
    const server = await startExampleDevServer();
    try {
      await page.goto(`${server.origin}/tests/browser/root-textured-c1-harness.html`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => Boolean((window as C1Window).__AURA3D_C1_RUNNER__), undefined, { timeout: 90_000 });
      // Force a real HTTP failure: dev-server SPA fallback can otherwise return HTML with status 200.
      await page.route("**/*.png.missing", (route) => route.fulfill({ status: 404, contentType: "text/plain", body: "C1 deliberate missing-resource negative control" }));
      const render = (mode: string) => page.evaluate((id) => (window as C1Window).__AURA3D_C1_RUNNER__!.renderVariant(id), `extension:${slot}:${mode}`).then(retainCapture);
      const off = await render("off");
      const on = await render("on");
      const subject = on.texturedMaterials.find((entry) => entry.nodeName === "c1 subject box");
      expect(subject?.status).toBe("textured");
      expect(subject?.slots).toEqual([slot, "baseColor"]);
      const uv1 = await render("uv1");
      const xform = await render("xform");
      const swapped = await render("swapped");
      if (slot === "anisotropy") {
        const direction = await render("direction");
        expect(pixelDelta(direction, on).changedFraction).toBeGreaterThan(0.001);
      }
      const disabled = await render("disabled");
      const disabledOff = await render("disabledOff");
      expect(pixelDelta(disabled, disabledOff).changedFraction).toBe(0);
      const missing = await render("missing");
      expect(missing.warnings.join(" ")).toContain("texture fetch failed");
      expect(missing.texturedMaterials.find((entry) => entry.nodeName === "c1 subject box")?.pixelBacked).not.toBe(true);
      if (["clearcoat", "clearcoatRoughness", "sheenRoughness", "iridescence", "iridescenceThickness"].includes(slot)) {
        const decoy = await render("decoy");
        expect(pixelDelta(decoy, on).changedFraction).toBe(0);
      }
      const deltas = { swapped: pixelDelta(swapped, on), on: pixelDelta(on, off), uv1: pixelDelta(uv1, on), xform: pixelDelta(xform, on) };
      for (const delta of Object.values(deltas)) expect(delta.changedFraction).toBeGreaterThan(0.001);
      writeJson(`tests/reports/root-textured-c1/extension-${slot}.json`, { generatedAt: new Date().toISOString(), slot, deltas, subject });
    } finally {
      await server.close();
    }
  });
}


for (const family of ["sheen", "iridescence"]) {
  test(`root clearcoat combined with ${family} maps binds every requested sampler`, async ({ page }) => {
    test.setTimeout(120_000);
    const server = await startExampleDevServer();
    try {
      await page.goto(`${server.origin}/tests/browser/root-textured-c1-harness.html`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => Boolean((window as C1Window).__AURA3D_C1_RUNNER__), undefined, { timeout: 90_000 });
      const render = (mode: string) => page.evaluate((id) => (window as C1Window).__AURA3D_C1_RUNNER__!.renderVariant(id), `combined:${family}:${mode}`).then(retainCapture);
      const off = await render("off");
      const on = await render("on");
      const subject = on.texturedMaterials.find((entry) => entry.nodeName === "c1 subject box");
      expect(subject?.pixelBacked).toBe(true);
      expect(subject?.slots).toEqual(family === "sheen" ? ["clearcoat", "clearcoatRoughness", "sheenColor", "sheenRoughness", "anisotropy", "baseColor"] : ["clearcoat", "clearcoatRoughness", "iridescence", "iridescenceThickness", "baseColor"]);
      expect(pixelDelta(on, off).changedFraction).toBeGreaterThan(0.001);
      writeJson(`tests/reports/root-textured-c1/combined-${family}.json`, { generatedAt: new Date().toISOString(), family, subject, delta: pixelDelta(on, off) });
    } finally { await server.close(); }
  });
}


test("root all eight extension maps retain all five base maps within WebGL2 sampler budget", async ({ page }) => {
  test.setTimeout(300_000);
  const server = await startExampleDevServer();
  try {
    await page.goto(`${server.origin}/tests/browser/root-textured-c1-harness.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean((window as C1Window).__AURA3D_C1_RUNNER__), undefined, { timeout: 90_000 });
    const render = (mode: string) => page.evaluate((id) => (window as C1Window).__AURA3D_C1_RUNNER__!.renderVariant(id), `all:${mode}`).then(retainCapture);
    const on = await render("on");
    const subject = on.texturedMaterials.find((entry) => entry.nodeName === "c1 subject box");
    expect(subject?.pixelBacked).toBe(true);
    expect(subject?.slots).toHaveLength(13);
    const deltas: Record<string, ReturnType<typeof pixelDelta>> = {};
    for (const slot of ["clearcoat", "clearcoatRoughness", "clearcoatNormal", "sheenColor", "sheenRoughness", "iridescence", "iridescenceThickness", "anisotropy"]) {
      const control = await render(slot);
      deltas[slot] = pixelDelta(on, control);
      mkdirSync("tests/reports/root-textured-c1", { recursive: true });
      if (slot === "iridescence" || slot === "iridescenceThickness") {
        writeFileSync(`tests/reports/root-textured-c1/all-${slot}-on.rgba`, new Uint8Array(on.pixels));
        writeFileSync(`tests/reports/root-textured-c1/all-${slot}-control.rgba`, new Uint8Array(control.pixels));
      }
      writeJson("tests/reports/root-textured-c1/all-extension-maps-progress.json", { generatedAt: new Date().toISOString(), subject, deltas });
      expect(deltas[slot]!.changedFraction, `${slot} must remain independently visible with all maps bound`).toBeGreaterThan(0.001);
      if (["clearcoat", "clearcoatRoughness", "sheenRoughness", "iridescence", "iridescenceThickness"].includes(slot)) {
        for (const mode of ["uv1", "xform"]) {
          const transformed = await render(`${slot}:${mode}`);
          deltas[`${slot}:${mode}`] = pixelDelta(on, transformed);
          writeJson("tests/reports/root-textured-c1/all-extension-maps-progress.json", { generatedAt: new Date().toISOString(), subject, deltas });
          expect(deltas[`${slot}:${mode}`]!.changedFraction, `${slot}/${mode} must address its independent atlas strip`).toBeGreaterThan(0.001);
        }
      }
    }
    writeJson("tests/reports/root-textured-c1/all-extension-maps.json", { generatedAt: new Date().toISOString(), subject, deltas });
  } finally { await server.close(); }
});


test("root extension texture color-space uploads match numerical sRGB and linear vectors",async({page})=>{
  test.setTimeout(240_000);const server=await startExampleDevServer();
  try{
    await page.goto(`${server.origin}/tests/browser/root-textured-c1-harness.html`);
    await page.waitForFunction(()=>Boolean((window as C1Window).__AURA3D_C1_RUNNER__));
    for(const slot of ["clearcoat","clearcoatRoughness","clearcoatNormal","sheenColor","sheenRoughness","iridescence","iridescenceThickness","anisotropy"]){
      const capture=retainCapture(await page.evaluate(id=>(window as C1Window).__AURA3D_C1_RUNNER__!.renderVariant(id),`color:${slot}`));
      expect(capture.colorOracle?.shaderSubstitutions).toBeGreaterThan(0);
      expect(capture.colorOracle?.matchingPixels,`${slot}: actual root-bound texture must produce the numerical channel vector`).toBeGreaterThan(100);
    }
  }finally{await server.close();}
});
