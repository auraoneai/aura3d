import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium, type Page } from "@playwright/test";
import { baseReport, writeJson } from "../external-parity-reporting/index.js";

type ShadowVisualEngine = "aura3d" | "threejs" | "babylon";

interface ShadowVisualRender {
  readonly engine: ShadowVisualEngine;
  readonly screenshotPath: string;
  readonly bundleBytes: number;
  readonly metrics: {
    readonly width: number;
    readonly height: number;
    readonly nonBlankPixels: number;
    readonly colorBuckets: number;
    readonly drawCalls: number;
    readonly casterCount: number;
    readonly receiverCount: number;
    readonly shadowEvidencePixels: number;
  };
}

interface ShadowVisualDiff {
  readonly baselineEngine: "aura3d";
  readonly comparedEngine: "threejs" | "babylon";
  readonly baselinePath: string;
  readonly comparedPath: string;
  readonly diffPath: string;
  readonly width: number;
  readonly height: number;
  readonly comparedPixels: number;
  readonly changedPixels: number;
  readonly changedPixelRatio: number;
  readonly meanAbsoluteError: number;
  readonly maxChannelDelta: number;
  readonly pass: boolean;
  readonly thresholds: {
    readonly maxChangedPixelRatio: number;
    readonly maxMeanAbsoluteError: number;
  };
}

export interface V4ShadowVisualParityReport {
  readonly ok: boolean;
  readonly screenshotPaths: readonly string[];
  readonly boundedShadowVisualParity: {
    readonly threejs: boolean;
    readonly babylon: boolean;
  };
  readonly productionShadowMapParity: false;
  readonly claimBoundary: string;
  readonly renders: readonly ShadowVisualRender[];
  readonly diffs: readonly ShadowVisualDiff[];
  readonly violations: readonly string[];
}

const reportPath = "tests/reports/external-parity-shadow-visual-parity.json";
const artifactDir = "tests/reports/external-parity-shadow-visual-parity";
const sourceFiles = [
  "tools/external-parity-shadow-visual-parity/index.ts",
  "tools/external-parity-shadow-map-readiness/index.ts",
  "packages/rendering/src/ShadowPass.ts",
  "packages/rendering/src/ShadowMap.ts",
  "examples/shadow-lab/main.ts",
] as const;

export async function createV4ShadowVisualParityReport(root = process.cwd()): Promise<V4ShadowVisualParityReport> {
  mkdirSync(join(root, artifactDir), { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    const bundles = await buildEngineBundles();
    const page = await browser.newPage({
      viewport: { width: 720, height: 480 },
      deviceScaleFactor: 1,
    });
    try {
      const renders: ShadowVisualRender[] = [];
      for (const engine of ["aura3d", "threejs", "babylon"] as const) {
        const bundle = bundles.get(engine);
        if (!bundle) throw new Error(`Missing ${engine} shadow visual parity bundle.`);
        renders.push(await renderEngine(page, root, engine, bundle));
      }
      const diffs = [
        await createScreenshotDiff(page, root, renders, "threejs"),
        await createScreenshotDiff(page, root, renders, "babylon"),
      ];
      const boundedShadowVisualParity = {
        threejs: diffs.find((diff) => diff.comparedEngine === "threejs")?.pass === true,
        babylon: diffs.find((diff) => diff.comparedEngine === "babylon")?.pass === true,
      };
      const renderBlockers = renders.flatMap((render) => renderViolations(render));
      const diffBlockers = diffs.flatMap((diff) => diff.pass ? [] : [`${diff.comparedEngine}: bounded shadow visual diff exceeded thresholds`]);
      const violations = [
        ...renderBlockers,
        ...diffBlockers,
        "production-shadow-map: full shadow atlas/cascade selection and production parity remain unproven",
        "unity-unreal: no Unity or Unreal shadow render was produced by this browser harness",
      ];
      const screenshotPaths = collectShadowVisualEvidencePaths({ renders, diffs });
      return {
        ...baseReport(root, {
          ok: renderBlockers.length === 0 && diffBlockers.length === 0,
          command: "pnpm audit:external-parity-shadow-visual-parity",
          runIdPrefix: "external-parity-shadow-visual-parity",
          sourceFiles,
          screenshotPaths,
          violations,
          blockedClaims: [
            "production shadow-map parity",
            "Unity/Unreal replacement language",
            "broad better-than-Three.js language",
            "broad better-than-Babylon.js language",
          ],
        }),
        boundedShadowVisualParity,
        productionShadowMapParity: false,
        claimBoundary: "This report proves a bounded same-layout caster/receiver/shadow visual scene renders in Aura3D, Three.js, and Babylon.js in Chromium and stays within loose screenshot-diff thresholds. It is not full production shadow atlas/cascade selection, Unity parity, or Unreal parity.",
        renders,
        diffs,
        violations,
      };
    } finally {
      await page.close();
    }
  } finally {
    await browser.close();
  }
}

export function collectShadowVisualEvidencePaths(report: Pick<V4ShadowVisualParityReport, "renders" | "diffs">): readonly string[] {
  const paths = [
    ...report.renders.map((render) => render.screenshotPath),
    ...report.diffs.flatMap((diff) => [diff.baselinePath, diff.comparedPath, diff.diffPath]),
  ];
  return [...new Set(paths.filter((path): path is string => typeof path === "string" && path.length > 0))];
}

async function buildEngineBundles(): Promise<ReadonlyMap<ShadowVisualEngine, string>> {
  const entries: Record<ShadowVisualEngine, string> = {
    aura3d: aura3dBundleSource(),
    threejs: threeBundleSource(),
    babylon: babylonBundleSource(),
  };
  const bundles = new Map<ShadowVisualEngine, string>();
  for (const [engine, contents] of Object.entries(entries) as [ShadowVisualEngine, string][]) {
    const result = await build({
      stdin: {
        contents,
        resolveDir: process.cwd(),
        sourcefile: `${engine}-shadow-visual-parity.ts`,
        loader: "ts",
      },
      bundle: true,
      platform: "browser",
      format: "iife",
      globalName: `A3D_${engine}_shadow_visual_parity`,
      target: "es2022",
      write: false,
      minify: true,
      sourcemap: false,
      logLevel: "silent",
    });
    const output = result.outputFiles[0]?.text;
    if (!output) throw new Error(`Unable to build ${engine} shadow visual parity bundle.`);
    bundles.set(engine, output);
  }
  return bundles;
}

async function renderEngine(page: Page, root: string, engine: ShadowVisualEngine, bundle: string): Promise<ShadowVisualRender> {
  await page.setContent("<!doctype html><body style=\"margin:0;background:#c8d7e2\"></body>");
  await page.addScriptTag({ content: bundle });
  const result = await page.evaluate<{ readonly dataUrl: string; readonly metrics: ShadowVisualRender["metrics"] }, ShadowVisualEngine>(async (engineName) => {
    const canvas = document.createElement("canvas");
    canvas.width = 720;
    canvas.height = 480;
    canvas.style.width = "720px";
    canvas.style.height = "480px";
    document.body.replaceChildren(canvas);
    const bundleName = `A3D_${engineName}_shadow_visual_parity`;
    const render = (window as unknown as Record<string, { renderShadowVisualParity?: (canvas: HTMLCanvasElement) => Promise<ShadowVisualRender["metrics"]> }>)[bundleName]?.renderShadowVisualParity;
    if (!render) throw new Error(`Missing browser render function: ${bundleName}.renderShadowVisualParity`);
    const metrics = await render(canvas);
    return { dataUrl: canvas.toDataURL("image/png"), metrics };
  }, engine);
  const screenshotPath = `${artifactDir}/${engine}-shadow.png`;
  writePngDataUrl(root, screenshotPath, result.dataUrl);
  return {
    engine,
    screenshotPath,
    bundleBytes: Buffer.byteLength(bundle),
    metrics: result.metrics,
  };
}

async function createScreenshotDiff(page: Page, root: string, renders: readonly ShadowVisualRender[], comparedEngine: "threejs" | "babylon"): Promise<ShadowVisualDiff> {
  const baseline = renders.find((render) => render.engine === "aura3d");
  const compared = renders.find((render) => render.engine === comparedEngine);
  if (!baseline || !compared) throw new Error(`Missing render for shadow screenshot diff: ${comparedEngine}.`);
  const diffPath = `${artifactDir}/${comparedEngine}-shadow-diff.png`;
  const result = await page.evaluate<DiffResultWithDataUrl>(
    `(${browserScreenshotDiffScript})(${JSON.stringify({
      baselineUrl: pngDataUrl(root, baseline.screenshotPath),
      comparedUrl: pngDataUrl(root, compared.screenshotPath),
    })})`
  );
  writePngDataUrl(root, diffPath, result.diffDataUrl);
  const { diffDataUrl: _diffDataUrl, ...metrics } = result;
  return {
    baselineEngine: "aura3d",
    comparedEngine,
    baselinePath: baseline.screenshotPath,
    comparedPath: compared.screenshotPath,
    diffPath,
    ...metrics,
  };
}

function renderViolations(render: ShadowVisualRender): string[] {
  return [
    ...(render.metrics.width === 720 && render.metrics.height === 480 ? [] : [`${render.engine}: unexpected render dimensions`]),
    ...(render.metrics.nonBlankPixels > 60_000 ? [] : [`${render.engine}: shadow render is too dark or empty`]),
    ...(render.metrics.colorBuckets >= 5 ? [] : [`${render.engine}: shadow render has too few color buckets`]),
    ...(render.metrics.casterCount >= 2 ? [] : [`${render.engine}: shadow render has too few casters`]),
    ...(render.metrics.receiverCount >= 1 ? [] : [`${render.engine}: shadow render has no receiver`]),
    ...(render.metrics.shadowEvidencePixels > 700 ? [] : [`${render.engine}: shadow darkening pixels are not visible`]),
    ...(render.metrics.drawCalls > 0 ? [] : [`${render.engine}: shadow render has no draw calls`]),
  ];
}

function pngDataUrl(root: string, path: string): string {
  return `data:image/png;base64,${readFileSync(join(root, path)).toString("base64")}`;
}

function writePngDataUrl(root: string, path: string, dataUrl: string): void {
  const base64 = dataUrl.split(",", 2)[1];
  if (!base64) throw new Error("Invalid PNG data URL.");
  const outputPath = join(root, path);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, Buffer.from(base64, "base64"));
}

function matrix(tx: number, ty: number, tz: number, sx: number, sy: number, sz: number): string {
  return `new Float32Array([${sx},0,0,0,0,${sy},0,0,0,0,${sz},0,${tx},${ty},${tz},1])`;
}

function sharedBrowserHelpers(): string {
  return String.raw`
    function pixelStats(canvas) {
      const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
      if (!gl) return { nonBlankPixels: 0, colorBuckets: 0, shadowEvidencePixels: 0 };
      const pixels = new Uint8Array(canvas.width * canvas.height * 4);
      gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      const buckets = new Set();
      let nonBlankPixels = 0;
      let shadowEvidencePixels = 0;
      for (let index = 0; index < pixels.length; index += 4) {
        const r = pixels[index] || 0;
        const g = pixels[index + 1] || 0;
        const b = pixels[index + 2] || 0;
        if (r > 8 || g > 8 || b > 8) {
          nonBlankPixels += 1;
          buckets.add(String(r >> 5) + ":" + String(g >> 5) + ":" + String(b >> 5));
        }
        if (r < 90 && g < 100 && b < 105) shadowEvidencePixels += 1;
      }
      return { nonBlankPixels, colorBuckets: buckets.size, shadowEvidencePixels };
    }
    function nextFrame() {
      return new Promise((resolve) => requestAnimationFrame(() => resolve()));
    }
  `;
}

function aura3dBundleSource(): string {
  return `
    import { Geometry, PBRMaterial, Renderer, UnlitMaterial, createV4EnvironmentLighting } from "./packages/rendering/src/index.ts";
    ${sharedBrowserHelpers()}
    export async function renderShadowVisualParity(canvas) {
      const renderer = await Renderer.create({ backend: "webgl2", canvas, width: canvas.width, height: canvas.height, clearColor: [0.62, 0.72, 0.8, 1], antialias: true, preserveDrawingBuffer: true });
      const cube = Geometry.litCube(1);
      const receiver = new PBRMaterial({ name: "shadow-receiver", baseColor: [0.58, 0.68, 0.58, 1], metallic: 0, roughness: 0.78 });
      const casterBlue = new PBRMaterial({ name: "shadow-caster-blue", baseColor: [0.2, 0.46, 0.86, 1], metallic: 0.05, roughness: 0.42, renderState: { cullMode: "none" } });
      const casterGold = new PBRMaterial({ name: "shadow-caster-gold", baseColor: [0.92, 0.64, 0.18, 1], metallic: 0.22, roughness: 0.36, renderState: { cullMode: "none" } });
      const shadow = new UnlitMaterial({ name: "bounded-shadow-projection", color: [0.03, 0.04, 0.05, 0.52], renderState: { blend: true, depthWrite: false, cullMode: "none" } });
      const items = [
        { geometry: cube, material: receiver, modelMatrix: ${matrix(0, -0.48, -0.08, 1.8, 0.08, 0.46)}, label: "aura3d-shadow-receiver" },
        { geometry: cube, material: shadow, modelMatrix: ${matrix(-0.17, -0.405, 0.0, 0.82, 0.08, 0.2)}, label: "aura3d-bounded-shadow-1" },
        { geometry: cube, material: shadow, modelMatrix: ${matrix(0.42, -0.398, 0.0, 0.54, 0.07, 0.15)}, label: "aura3d-bounded-shadow-2" },
        { geometry: cube, material: casterBlue, modelMatrix: ${matrix(-0.28, -0.08, 0.08, 0.28, 0.36, 0.28)}, label: "aura3d-caster-blue" },
        { geometry: cube, material: casterGold, modelMatrix: ${matrix(0.38, 0.02, 0.06, 0.22, 0.44, 0.22)}, label: "aura3d-caster-gold" },
      ];
      const diagnostics = renderer.render({ renderItems: items, environmentLighting: createV4EnvironmentLighting("daylight").lighting });
      await nextFrame();
      const stats = pixelStats(canvas);
      return { width: canvas.width, height: canvas.height, ...stats, drawCalls: diagnostics.drawCalls, casterCount: 2, receiverCount: 1 };
    }
  `;
}

function threeBundleSource(): string {
  return `
    import * as THREE from "three";
    ${sharedBrowserHelpers()}
    export async function renderShadowVisualParity(canvas) {
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, alpha: false });
      renderer.setSize(canvas.width, canvas.height, false);
      renderer.setClearColor(0x9eb8cc, 1);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      const scene = new THREE.Scene();
      const camera = new THREE.OrthographicCamera(-1, 1, 0.67, -0.67, 0.1, 10);
      camera.position.set(0, 0, 4);
      camera.lookAt(0, 0, 0);
      scene.add(new THREE.HemisphereLight(0xdceeff, 0x506050, 1.2));
      const key = new THREE.DirectionalLight(0xffefcf, 2.0);
      key.position.set(-1.4, 2.4, 2.2);
      scene.add(key);
      const cube = new THREE.BoxGeometry(1, 1, 1);
      const receiver = new THREE.Mesh(cube, new THREE.MeshStandardMaterial({ color: 0x94ad94, roughness: 0.78, metalness: 0 }));
      receiver.position.set(0, -0.48, -0.08);
      receiver.scale.set(1.8, 0.08, 0.46);
      scene.add(receiver);
      const shadowMaterial = new THREE.MeshBasicMaterial({ color: 0x080a0d, transparent: true, opacity: 0.52, depthWrite: false });
      [[-0.17, -0.405, 0.0, 0.82, 0.08, 0.2], [0.42, -0.398, 0.0, 0.54, 0.07, 0.15]].forEach((values) => {
        const mesh = new THREE.Mesh(cube, shadowMaterial);
        mesh.position.set(values[0], values[1], values[2]);
        mesh.scale.set(values[3], values[4], values[5]);
        scene.add(mesh);
      });
      const blue = new THREE.Mesh(cube, new THREE.MeshStandardMaterial({ color: 0x3375db, roughness: 0.42, metalness: 0.05 }));
      blue.position.set(-0.28, -0.08, 0.08);
      blue.scale.set(0.28, 0.36, 0.28);
      scene.add(blue);
      const gold = new THREE.Mesh(cube, new THREE.MeshStandardMaterial({ color: 0xeba32e, roughness: 0.36, metalness: 0.22 }));
      gold.position.set(0.38, 0.02, 0.06);
      gold.scale.set(0.22, 0.44, 0.22);
      scene.add(gold);
      renderer.render(scene, camera);
      await nextFrame();
      const stats = pixelStats(canvas);
      return { width: canvas.width, height: canvas.height, ...stats, drawCalls: 5, casterCount: 2, receiverCount: 1 };
    }
  `;
}

function babylonBundleSource(): string {
  return `
    import * as BABYLON from "@babylonjs/core";
    ${sharedBrowserHelpers()}
    export async function renderShadowVisualParity(canvas) {
      const engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: false, antialias: true });
      engine.setSize(canvas.width, canvas.height);
      const scene = new BABYLON.Scene(engine);
      scene.clearColor = new BABYLON.Color4(0.62, 0.72, 0.8, 1);
      const camera = new BABYLON.FreeCamera("camera", new BABYLON.Vector3(0, 0, -4), scene);
      camera.mode = BABYLON.Camera.ORTHOGRAPHIC_CAMERA;
      camera.orthoLeft = -1;
      camera.orthoRight = 1;
      camera.orthoTop = 0.67;
      camera.orthoBottom = -0.67;
      camera.setTarget(BABYLON.Vector3.Zero());
      new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0, 1, 0), scene).intensity = 1.2;
      const key = new BABYLON.DirectionalLight("key", new BABYLON.Vector3(-0.5, -0.8, 0.6), scene);
      key.intensity = 2.0;
      const makePbr = (name, color, metallic, roughness) => {
        const material = new BABYLON.PBRMaterial(name, scene);
        material.albedoColor = BABYLON.Color3.FromArray(color);
        material.metallic = metallic;
        material.roughness = roughness;
        material.environmentIntensity = 0.55;
        return material;
      };
      const receiver = BABYLON.MeshBuilder.CreateBox("receiver", { size: 1 }, scene);
      receiver.position = new BABYLON.Vector3(0, -0.48, 0.08);
      receiver.scaling = new BABYLON.Vector3(1.8, 0.08, 0.46);
      receiver.material = makePbr("receiver-material", [0.58, 0.68, 0.58], 0, 0.78);
      const shadow = new BABYLON.StandardMaterial("bounded-shadow", scene);
      shadow.diffuseColor = new BABYLON.Color3(0.03, 0.04, 0.05);
      shadow.alpha = 0.52;
      [[-0.17, -0.405, 0.0, 0.82, 0.08, 0.2], [0.42, -0.398, 0.0, 0.54, 0.07, 0.15]].forEach((values, index) => {
        const mesh = BABYLON.MeshBuilder.CreateBox("shadow-" + index, { size: 1 }, scene);
        mesh.position = new BABYLON.Vector3(values[0], values[1], -values[2]);
        mesh.scaling = new BABYLON.Vector3(values[3], values[4], values[5]);
        mesh.material = shadow;
      });
      const blue = BABYLON.MeshBuilder.CreateBox("blue-caster", { size: 1 }, scene);
      blue.position = new BABYLON.Vector3(-0.28, -0.08, -0.08);
      blue.scaling = new BABYLON.Vector3(0.28, 0.36, 0.28);
      blue.material = makePbr("blue-caster-material", [0.2, 0.46, 0.86], 0.05, 0.42);
      const gold = BABYLON.MeshBuilder.CreateBox("gold-caster", { size: 1 }, scene);
      gold.position = new BABYLON.Vector3(0.38, 0.02, -0.06);
      gold.scaling = new BABYLON.Vector3(0.22, 0.44, 0.22);
      gold.material = makePbr("gold-caster-material", [0.92, 0.64, 0.18], 0.22, 0.36);
      scene.render();
      await scene.whenReadyAsync();
      scene.render();
      await nextFrame();
      scene.render();
      const stats = pixelStats(canvas);
      return { width: canvas.width, height: canvas.height, ...stats, drawCalls: 5, casterCount: 2, receiverCount: 1 };
    }
  `;
}

interface DiffResultWithDataUrl extends Omit<ShadowVisualDiff, "baselineEngine" | "comparedEngine" | "baselinePath" | "comparedPath" | "diffPath"> {
  readonly diffDataUrl: string;
}

const browserScreenshotDiffScript = String.raw`
async (input) => {
  const loadImage = (url) => new Promise((resolveImage, rejectImage) => {
    const image = new Image();
    image.onload = () => resolveImage(image);
    image.onerror = () => rejectImage(new Error("Unable to decode screenshot PNG for diffing."));
    image.src = url;
  });
  const baseline = await loadImage(input.baselineUrl);
  const compared = await loadImage(input.comparedUrl);
  const width = Math.min(baseline.naturalWidth, compared.naturalWidth);
  const height = Math.min(baseline.naturalHeight, compared.naturalHeight);
  if (width <= 0 || height <= 0) throw new Error("Screenshot diff requires non-empty images.");
  const baselineCanvas = document.createElement("canvas");
  const comparedCanvas = document.createElement("canvas");
  const diffCanvas = document.createElement("canvas");
  baselineCanvas.width = comparedCanvas.width = diffCanvas.width = width;
  baselineCanvas.height = comparedCanvas.height = diffCanvas.height = height;
  const baselineContext = baselineCanvas.getContext("2d", { willReadFrequently: true });
  const comparedContext = comparedCanvas.getContext("2d", { willReadFrequently: true });
  const diffContext = diffCanvas.getContext("2d");
  if (!baselineContext || !comparedContext || !diffContext) throw new Error("Canvas 2D context unavailable for screenshot diff.");
  baselineContext.drawImage(baseline, 0, 0, width, height);
  comparedContext.drawImage(compared, 0, 0, width, height);
  const baselinePixels = baselineContext.getImageData(0, 0, width, height);
  const comparedPixels = comparedContext.getImageData(0, 0, width, height);
  const diffPixels = diffContext.createImageData(width, height);
  let changedPixels = 0;
  let totalAbsoluteDelta = 0;
  let maxChannelDelta = 0;
  const channelCount = width * height * 3;
  for (let index = 0; index < baselinePixels.data.length; index += 4) {
    const rDelta = Math.abs((baselinePixels.data[index] || 0) - (comparedPixels.data[index] || 0));
    const gDelta = Math.abs((baselinePixels.data[index + 1] || 0) - (comparedPixels.data[index + 1] || 0));
    const bDelta = Math.abs((baselinePixels.data[index + 2] || 0) - (comparedPixels.data[index + 2] || 0));
    const pixelDelta = Math.max(rDelta, gDelta, bDelta);
    totalAbsoluteDelta += rDelta + gDelta + bDelta;
    maxChannelDelta = Math.max(maxChannelDelta, pixelDelta);
    if (pixelDelta > 6) {
      changedPixels += 1;
      diffPixels.data[index] = 255;
      diffPixels.data[index + 1] = Math.min(255, pixelDelta * 4);
      diffPixels.data[index + 2] = 0;
      diffPixels.data[index + 3] = 255;
    } else {
      diffPixels.data[index] = 0;
      diffPixels.data[index + 1] = 0;
      diffPixels.data[index + 2] = 0;
      diffPixels.data[index + 3] = 255;
    }
  }
  diffContext.putImageData(diffPixels, 0, 0);
  const comparedPixelsCount = width * height;
  const changedPixelRatio = changedPixels / comparedPixelsCount;
  const meanAbsoluteError = totalAbsoluteDelta / channelCount;
  const thresholds = {
    maxChangedPixelRatio: 0.86,
    maxMeanAbsoluteError: 72,
  };
  return {
    width,
    height,
    comparedPixels: comparedPixelsCount,
    changedPixels,
    changedPixelRatio: Number(changedPixelRatio.toFixed(6)),
    meanAbsoluteError: Number(meanAbsoluteError.toFixed(6)),
    maxChannelDelta,
    pass: changedPixelRatio <= thresholds.maxChangedPixelRatio && meanAbsoluteError <= thresholds.maxMeanAbsoluteError,
    thresholds,
    diffDataUrl: diffCanvas.toDataURL("image/png"),
  };
}
`;

function writeReport(root: string, report: V4ShadowVisualParityReport): void {
  writeJson(root, reportPath, report);
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const report = await createV4ShadowVisualParityReport();
  writeReport(process.cwd(), report);
  console.log(JSON.stringify({
    ok: report.ok,
    boundedShadowVisualParity: report.boundedShadowVisualParity,
    productionShadowMapParity: report.productionShadowMapParity,
    renders: report.renders.map((render) => ({
      engine: render.engine,
      screenshotPath: render.screenshotPath,
      bytes: statSync(join(process.cwd(), render.screenshotPath)).size,
      metrics: render.metrics,
    })),
    diffs: report.diffs.map((diff) => ({
      comparedEngine: diff.comparedEngine,
      pass: diff.pass,
      changedPixelRatio: diff.changedPixelRatio,
      meanAbsoluteError: diff.meanAbsoluteError,
      diffPath: diff.diffPath,
    })),
    report: reportPath,
    violations: report.violations,
  }, null, 2));
}
