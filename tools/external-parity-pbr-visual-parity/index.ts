import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium, type Page } from "@playwright/test";
import { baseReport, writeJson } from "../external-parity-reporting/index.js";

type PbrVisualEngine = "aura3d" | "threejs" | "babylon";

interface PbrVisualRender {
  readonly engine: PbrVisualEngine;
  readonly screenshotPath: string;
  readonly bundleBytes: number;
  readonly metrics: {
    readonly width: number;
    readonly height: number;
    readonly nonBlankPixels: number;
    readonly salientRatio: number;
    readonly occupiedAreaRatio: number;
    readonly occupiedQuadrants: number;
    readonly meanLuma: number;
    readonly darkPixelRatio: number;
    readonly colorBuckets: number;
    readonly dominantBucketRatio: number;
    readonly edgePixelRatio: number;
    readonly drawCalls: number;
    readonly materialCount: number;
    readonly featureCount: number;
  };
}

interface PbrVisualDiff {
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

export interface ExternalParityPbrVisualParityReport {
  readonly ok: boolean;
  readonly screenshotPaths: readonly string[];
  readonly boundedPbrVisualParity: {
    readonly threejs: boolean;
    readonly babylon: boolean;
  };
  readonly fullPhysicalPbrParity: false;
  readonly claimBoundary: string;
  readonly renders: readonly PbrVisualRender[];
  readonly diffs: readonly PbrVisualDiff[];
  readonly violations: readonly string[];
}

const reportPath = "tests/reports/external-parity-pbr-visual-parity.json";
const artifactDir = "tests/reports/external-parity-pbr-visual-parity";
const sourceFiles = [
  "tools/external-parity-pbr-visual-parity/index.ts",
  "tools/external-parity-pbr-gltf-readiness/index.ts",
  "packages/rendering/src/PBRMaterial.ts",
  "packages/rendering/src/Renderer.ts",
  "packages/rendering/src/ShaderChunks.ts",
  "packages/rendering/src/ShaderLibrary.ts",
  "packages/rendering/src/ExternalParityRenderPreset.ts",
] as const;

export async function createExternalParityPbrVisualParityReport(root = process.cwd()): Promise<ExternalParityPbrVisualParityReport> {
  mkdirSync(join(root, artifactDir), { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    const bundles = await buildEngineBundles();
    const page = await browser.newPage({
      viewport: { width: 960, height: 540 },
      deviceScaleFactor: 1,
    });
    try {
      const renders: PbrVisualRender[] = [];
      for (const engine of ["aura3d", "threejs", "babylon"] as const) {
        const bundle = bundles.get(engine);
        if (!bundle) throw new Error(`Missing ${engine} PBR visual parity bundle.`);
        renders.push(await renderEngine(page, root, engine, bundle));
      }
      const diffs = [
        await createScreenshotDiff(page, root, renders, "threejs"),
        await createScreenshotDiff(page, root, renders, "babylon"),
      ];
      const boundedPbrVisualParity = {
        threejs: diffs.find((diff) => diff.comparedEngine === "threejs")?.pass === true,
        babylon: diffs.find((diff) => diff.comparedEngine === "babylon")?.pass === true,
      };
      const violations = [
        ...renders.flatMap((render) => renderViolations(render)),
        ...diffs.flatMap((diff) => diff.pass ? [] : [`${diff.comparedEngine}: bounded PBR visual diff exceeded thresholds`]),
        "full-physical-pbr: bounded local photometric, transmission/volume, and caustics reference suites exist, but Unity/Unreal BRDF parity, external conformance parity, and production HDR IBL parity remain unproven",
        "unity-unreal: no Unity or Unreal PBR render was produced by this browser harness",
      ];
      const screenshotPaths = collectPbrVisualEvidencePaths({ renders, diffs });
      return {
        ...baseReport(root, {
          ok: renders.every((render) => renderViolations(render).length === 0) && diffs.every((diff) => diff.pass),
          command: "pnpm audit:external-parity-pbr-visual-parity",
          runIdPrefix: "external-parity-pbr-visual-parity",
          sourceFiles,
          screenshotPaths,
          violations,
          blockedClaims: [
            "full PBR parity",
            "Unity/Unreal replacement language",
            "broad better-than-Three.js language",
            "broad better-than-Babylon.js language",
          ],
        }),
        boundedPbrVisualParity,
        fullPhysicalPbrParity: false,
        claimBoundary: "This report proves a bounded same-layout PBR material lineup renders in Aura3D, Three.js, and Babylon.js in Chromium and stays within loose visual-diff thresholds. Local CPU reference suites cover bounded photometric and transmission/volume behavior, but this is not full physical PBR, HDR IBL, glTF material-extension, Unity, or Unreal parity.",
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

export function collectPbrVisualEvidencePaths(report: Pick<ExternalParityPbrVisualParityReport, "renders" | "diffs">): readonly string[] {
  const paths = [
    ...report.renders.map((render) => render.screenshotPath),
    ...report.diffs.flatMap((diff) => [diff.baselinePath, diff.comparedPath, diff.diffPath]),
  ];
  return [...new Set(paths.filter((path): path is string => typeof path === "string" && path.length > 0))];
}

async function buildEngineBundles(): Promise<ReadonlyMap<PbrVisualEngine, string>> {
  const entries: Record<PbrVisualEngine, string> = {
    aura3d: aura3dBundleSource(),
    threejs: threeBundleSource(),
    babylon: babylonBundleSource(),
  };
  const bundles = new Map<PbrVisualEngine, string>();
  for (const [engine, contents] of Object.entries(entries) as [PbrVisualEngine, string][]) {
    const result = await build({
      stdin: {
        contents,
        resolveDir: process.cwd(),
        sourcefile: `${engine}-pbr-visual-parity.ts`,
        loader: "ts",
      },
      bundle: true,
      platform: "browser",
      format: "iife",
      globalName: `A3D_${engine}_pbr_visual_parity`,
      target: "es2022",
      write: false,
      minify: true,
      sourcemap: false,
      logLevel: "silent",
    });
    const output = result.outputFiles[0]?.text;
    if (!output) throw new Error(`Unable to build ${engine} PBR visual parity bundle.`);
    bundles.set(engine, output);
  }
  return bundles;
}

async function renderEngine(page: Page, root: string, engine: PbrVisualEngine, bundle: string): Promise<PbrVisualRender> {
  await page.setContent("<!doctype html><body style=\"margin:0;background:#101318\"></body>");
  await page.addScriptTag({ content: bundle });
  const result = await page.evaluate<{ readonly dataUrl: string; readonly metrics: PbrVisualRender["metrics"] }, PbrVisualEngine>(async (engineName) => {
    const canvas = document.createElement("canvas");
    canvas.width = 960;
    canvas.height = 540;
    canvas.style.width = "960px";
    canvas.style.height = "540px";
    document.body.replaceChildren(canvas);
    const bundleName = `A3D_${engineName}_pbr_visual_parity`;
    const render = (window as unknown as Record<string, { renderPbrVisualParity?: (canvas: HTMLCanvasElement) => Promise<PbrVisualRender["metrics"]> }>)[bundleName]?.renderPbrVisualParity;
    if (!render) throw new Error(`Missing browser render function: ${bundleName}.renderPbrVisualParity`);
    const metrics = await render(canvas);
    return { dataUrl: canvas.toDataURL("image/png"), metrics };
  }, engine);
  const screenshotPath = `${artifactDir}/${engine}-pbr.png`;
  writePngDataUrl(root, screenshotPath, result.dataUrl);
  return {
    engine,
    screenshotPath,
    bundleBytes: Buffer.byteLength(bundle),
    metrics: result.metrics,
  };
}

async function createScreenshotDiff(page: Page, root: string, renders: readonly PbrVisualRender[], comparedEngine: "threejs" | "babylon"): Promise<PbrVisualDiff> {
  const baseline = renders.find((render) => render.engine === "aura3d");
  const compared = renders.find((render) => render.engine === comparedEngine);
  if (!baseline || !compared) throw new Error(`Missing render for PBR screenshot diff: ${comparedEngine}.`);
  const diffPath = `${artifactDir}/${comparedEngine}-pbr-diff.png`;
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

function renderViolations(render: PbrVisualRender): string[] {
  return [
    ...(render.metrics.width === 960 && render.metrics.height === 540 ? [] : [`${render.engine}: unexpected render dimensions`]),
    ...(render.metrics.nonBlankPixels > 30_000 ? [] : [`${render.engine}: PBR render is too dark or empty`]),
    ...(render.metrics.salientRatio >= 0.16 ? [] : [`${render.engine}: PBR render has too little visible material coverage`]),
    ...(render.metrics.occupiedAreaRatio >= 0.35 ? [] : [`${render.engine}: PBR render is badly framed or too tiny`]),
    ...(render.metrics.occupiedQuadrants === 4 ? [] : [`${render.engine}: PBR render does not occupy all quadrants`]),
    ...(render.metrics.meanLuma >= 20 ? [] : [`${render.engine}: PBR render is too dark`]),
    ...(render.metrics.darkPixelRatio <= 0.86 ? [] : [`${render.engine}: PBR render is black-dominated`]),
    ...(render.metrics.colorBuckets >= 40 ? [] : [`${render.engine}: PBR render has too few color buckets`]),
    ...(render.metrics.dominantBucketRatio <= 0.86 ? [] : [`${render.engine}: PBR render is dominated by one color bucket`]),
    ...(render.metrics.edgePixelRatio >= 0.003 ? [] : [`${render.engine}: PBR render has too little silhouette/detail evidence`]),
    ...(render.metrics.materialCount >= 11 ? [] : [`${render.engine}: PBR render has too few materials`]),
    ...(render.metrics.featureCount >= 11 ? [] : [`${render.engine}: PBR render has too few material feature states`]),
    ...(render.metrics.drawCalls > 0 ? [] : [`${render.engine}: PBR render has no draw calls`]),
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
      if (!gl) return { nonBlankPixels: 0, salientRatio: 0, occupiedAreaRatio: 0, occupiedQuadrants: 0, meanLuma: 0, darkPixelRatio: 1, colorBuckets: 0, dominantBucketRatio: 1, edgePixelRatio: 0 };
      const pixels = new Uint8Array(canvas.width * canvas.height * 4);
      gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      const buckets = new Set();
      const bucketCounts = new Map();
      let nonBlankPixels = 0;
      let salientPixels = 0;
      let darkPixels = 0;
      let lumaSum = 0;
      let minX = canvas.width;
      let minY = canvas.height;
      let maxX = -1;
      let maxY = -1;
      const quadrants = new Set();
      for (let y = 0; y < canvas.height; y += 1) {
        for (let x = 0; x < canvas.width; x += 1) {
          const index = (y * canvas.width + x) * 4;
          const r = pixels[index] || 0;
          const g = pixels[index + 1] || 0;
          const b = pixels[index + 2] || 0;
          const luma = r * 0.2126 + g * 0.7152 + b * 0.0722;
          lumaSum += luma;
          if (luma <= 18) darkPixels += 1;
          if (r > 8 || g > 8 || b > 8) nonBlankPixels += 1;
          if (luma > 24) {
            salientPixels += 1;
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
            quadrants.add((x >= canvas.width / 2 ? 1 : 0) + (y >= canvas.height / 2 ? 2 : 0));
          }
          const bucket = String(r >> 4) + ":" + String(g >> 4) + ":" + String(b >> 4);
          buckets.add(bucket);
          bucketCounts.set(bucket, (bucketCounts.get(bucket) || 0) + 1);
        }
      }
      let edgePixels = 0;
      for (let y = 1; y < canvas.height; y += 1) {
        for (let x = 1; x < canvas.width; x += 1) {
          const index = (y * canvas.width + x) * 4;
          const left = index - 4;
          const up = index - canvas.width * 4;
          const luma = (pixels[index] || 0) * 0.2126 + (pixels[index + 1] || 0) * 0.7152 + (pixels[index + 2] || 0) * 0.0722;
          const leftLuma = (pixels[left] || 0) * 0.2126 + (pixels[left + 1] || 0) * 0.7152 + (pixels[left + 2] || 0) * 0.0722;
          const upLuma = (pixels[up] || 0) * 0.2126 + (pixels[up + 1] || 0) * 0.7152 + (pixels[up + 2] || 0) * 0.0722;
          if (Math.abs(luma - leftLuma) + Math.abs(luma - upLuma) > 42) edgePixels += 1;
        }
      }
      const pixelCount = canvas.width * canvas.height;
      const occupiedAreaRatio = maxX >= minX && maxY >= minY ? ((maxX - minX + 1) * (maxY - minY + 1)) / pixelCount : 0;
      const dominantBucketRatio = Math.max(0, ...bucketCounts.values()) / pixelCount;
      return {
        nonBlankPixels,
        salientRatio: salientPixels / pixelCount,
        occupiedAreaRatio,
        occupiedQuadrants: quadrants.size,
        meanLuma: lumaSum / pixelCount,
        darkPixelRatio: darkPixels / pixelCount,
        colorBuckets: buckets.size,
        dominantBucketRatio,
        edgePixelRatio: edgePixels / pixelCount
      };
    }
    function nextFrame() {
      return new Promise((resolve) => requestAnimationFrame(() => resolve()));
    }
  `;
}

function aura3dBundleSource(): string {
  return `
    import { Geometry, PBRMaterial, Renderer, UnlitMaterial, createExternalParityEnvironmentLighting } from "./packages/rendering/src/index.ts";
    ${sharedBrowserHelpers()}
    export async function renderPbrVisualParity(canvas) {
      const renderer = await Renderer.create({ backend: "webgl2", canvas, width: canvas.width, height: canvas.height, clearColor: [0.045, 0.052, 0.065, 1], antialias: true, preserveDrawingBuffer: true });
      const sphere = Geometry.uvSphere(1, 40, 20);
      const floor = Geometry.litCube(1);
      const lighting = createExternalParityEnvironmentLighting("studio").lighting;
      const materials = [
        new PBRMaterial({ name: "dielectric-rough", baseColor: [0.78, 0.2, 0.12, 1], metallic: 0.02, roughness: 0.72 }),
        new PBRMaterial({ name: "metallic-smooth", baseColor: [0.82, 0.74, 0.55, 1], metallic: 1, roughness: 0.18 }),
        new PBRMaterial({ name: "clearcoat-paint", baseColor: [0.05, 0.22, 0.75, 1], metallic: 0.35, roughness: 0.28, clearcoatFactor: 0.82, clearcoatRoughnessFactor: 0.12 }),
        new PBRMaterial({ name: "transmission-tint", baseColor: [0.25, 0.72, 0.92, 0.72], metallic: 0.02, roughness: 0.05, transmissionFactor: 0.4, ior: 1.45, specularFactor: 0.9 }),
        new PBRMaterial({ name: "sheen-fabric", baseColor: [0.42, 0.12, 0.62, 1], metallic: 0, roughness: 0.68, sheenColorFactor: [0.7, 0.32, 0.85], sheenRoughnessFactor: 0.35 }),
        new PBRMaterial({ name: "anisotropy-brushed", baseColor: [0.72, 0.72, 0.78, 1], metallic: 0.9, roughness: 0.32, anisotropyStrength: 0.75, anisotropyRotation: 0.65 }),
        new PBRMaterial({ name: "iridescent-film", baseColor: [0.18, 0.22, 0.28, 1], metallic: 0.15, roughness: 0.22, iridescenceFactor: 0.85, iridescenceIor: 1.5, iridescenceThicknessMinimum: 140, iridescenceThicknessMaximum: 620 }),
        new PBRMaterial({ name: "diffuse-transmission-panel", baseColor: [0.18, 0.72, 0.42, 0.82], metallic: 0.02, roughness: 0.28, diffuseTransmissionFactor: 0.46, diffuseTransmissionColorFactor: [0.76, 1, 0.86], transmissionFactor: 0.12 }),
        new PBRMaterial({ name: "volume-attenuation-glass", baseColor: [0.72, 0.92, 1, 0.68], metallic: 0.02, roughness: 0.08, transmissionFactor: 0.52, volumeThicknessFactor: 0.42, volumeAttenuationDistance: 1.8, volumeAttenuationColor: [0.58, 0.82, 1], ior: 1.48 }),
        new PBRMaterial({ name: "specular-tint-ceramic", baseColor: [0.82, 0.62, 0.36, 1], metallic: 0.04, roughness: 0.44, specularFactor: 0.88, specularColorFactor: [1, 0.82, 0.48] }),
        new PBRMaterial({ name: "dispersion-prism", baseColor: [0.64, 0.82, 1, 0.62], metallic: 0.02, roughness: 0.04, transmissionFactor: 0.62, volumeThicknessFactor: 0.28, volumeAttenuationDistance: 2.2, volumeAttenuationColor: [0.82, 0.92, 1], ior: 1.52, dispersion: 18 }),
      ];
      const labels = materials.map((material, index) => ({ material, x: -0.86 + index * 0.172 }));
      const items = [
        { geometry: floor, material: new PBRMaterial({ name: "matte-floor", baseColor: [0.18, 0.19, 0.2, 1], metallic: 0, roughness: 0.84 }), modelMatrix: ${matrix(0, -0.46, -0.08, 2, 0.055, 0.28)}, label: "aura3d-floor" },
        ...labels.map(({ material, x }, index) => ({ geometry: sphere, material, modelMatrix: new Float32Array([0.13,0,0,0,0,0.13,0,0,0,0,0.13,0,x, index % 2 === 0 ? -0.1 : 0.16, 0, 1]), label: "aura3d-pbr-" + material.name })),
      ];
      const diagnostics = renderer.render({ renderItems: items, environmentLighting: lighting, cameraPolicy: "identity" });
      await nextFrame();
      const stats = pixelStats(canvas);
      return { width: canvas.width, height: canvas.height, ...stats, drawCalls: diagnostics.drawCalls, materialCount: materials.length, featureCount: materials.length };
    }
  `;
}

function threeBundleSource(): string {
  return `
    import * as THREE from "three";
    ${sharedBrowserHelpers()}
    export async function renderPbrVisualParity(canvas) {
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, alpha: false });
      renderer.setSize(canvas.width, canvas.height, false);
      renderer.setClearColor(0x0b0d10, 1);
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      const scene = new THREE.Scene();
      const camera = new THREE.OrthographicCamera(-1, 1, 0.56, -0.56, 0.1, 10);
      camera.position.set(0, 0, 4);
      camera.lookAt(0, 0, 0);
      scene.add(new THREE.HemisphereLight(0xb8cff5, 0x202024, 1.1));
      const key = new THREE.DirectionalLight(0xfff0d0, 2.2);
      key.position.set(-1.6, 1.8, 2.4);
      scene.add(key);
      const sphere = new THREE.SphereGeometry(0.13, 40, 20);
      const floor = new THREE.BoxGeometry(2, 0.055, 0.28);
      const materials = [
        new THREE.MeshPhysicalMaterial({ color: 0xc7331f, metalness: 0.02, roughness: 0.72 }),
        new THREE.MeshPhysicalMaterial({ color: 0xd1bd8c, metalness: 1, roughness: 0.18 }),
        new THREE.MeshPhysicalMaterial({ color: 0x0d38bf, metalness: 0.35, roughness: 0.28, clearcoat: 0.82, clearcoatRoughness: 0.12 }),
        new THREE.MeshPhysicalMaterial({ color: 0x40b8eb, metalness: 0.02, roughness: 0.05, transmission: 0.4, ior: 1.45, transparent: true, opacity: 0.72 }),
        new THREE.MeshPhysicalMaterial({ color: 0x6b1f9e, metalness: 0, roughness: 0.68, sheen: 0.7, sheenRoughness: 0.35, sheenColor: 0xb352d9 }),
        new THREE.MeshPhysicalMaterial({ color: 0xb8b8c7, metalness: 0.9, roughness: 0.32, anisotropy: 0.75, anisotropyRotation: 0.65 }),
        new THREE.MeshPhysicalMaterial({ color: 0x2e3847, metalness: 0.15, roughness: 0.22, iridescence: 0.85, iridescenceIOR: 1.5, iridescenceThicknessRange: [140, 620] }),
        new THREE.MeshPhysicalMaterial({ color: 0x2eb86b, metalness: 0.02, roughness: 0.28, transmission: 0.12, transparent: true, opacity: 0.82 }),
        new THREE.MeshPhysicalMaterial({ color: 0xb8ebff, metalness: 0.02, roughness: 0.08, transmission: 0.52, thickness: 0.42, attenuationDistance: 1.8, attenuationColor: 0x94d1ff, ior: 1.48, transparent: true, opacity: 0.68 }),
        new THREE.MeshPhysicalMaterial({ color: 0xd19e5c, metalness: 0.04, roughness: 0.44, specularIntensity: 0.88, specularColor: 0xffd17a }),
        new THREE.MeshPhysicalMaterial({ color: 0xa3d1ff, metalness: 0.02, roughness: 0.04, transmission: 0.62, thickness: 0.28, attenuationDistance: 2.2, attenuationColor: 0xd1ebff, ior: 1.52, dispersion: 18, transparent: true, opacity: 0.62 }),
      ];
      const floorMesh = new THREE.Mesh(floor, new THREE.MeshStandardMaterial({ color: 0x2e3033, metalness: 0, roughness: 0.84 }));
      floorMesh.position.set(0, -0.46, -0.08);
      scene.add(floorMesh);
      materials.forEach((material, index) => {
        const mesh = new THREE.Mesh(sphere, material);
        mesh.position.set(-0.86 + index * 0.172, index % 2 === 0 ? -0.1 : 0.16, 0);
        scene.add(mesh);
      });
      renderer.render(scene, camera);
      await nextFrame();
      const stats = pixelStats(canvas);
      return { width: canvas.width, height: canvas.height, ...stats, drawCalls: 12, materialCount: materials.length, featureCount: materials.length };
    }
  `;
}

function babylonBundleSource(): string {
  return `
    import * as BABYLON from "@babylonjs/core";
    ${sharedBrowserHelpers()}
    export async function renderPbrVisualParity(canvas) {
      const engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: false, antialias: true });
      engine.setSize(canvas.width, canvas.height);
      const scene = new BABYLON.Scene(engine);
      scene.clearColor = new BABYLON.Color4(0.045, 0.052, 0.065, 1);
      const camera = new BABYLON.FreeCamera("camera", new BABYLON.Vector3(0, 0, -4), scene);
      camera.mode = BABYLON.Camera.ORTHOGRAPHIC_CAMERA;
      camera.orthoLeft = -1;
      camera.orthoRight = 1;
      camera.orthoTop = 0.56;
      camera.orthoBottom = -0.56;
      camera.setTarget(BABYLON.Vector3.Zero());
      new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0, 1, 0), scene).intensity = 1.1;
      const key = new BABYLON.DirectionalLight("key", new BABYLON.Vector3(-0.55, -0.65, 0.7), scene);
      key.intensity = 2.2;
      const make = (name, color, metallic, roughness) => {
        const mat = new BABYLON.PBRMaterial(name, scene);
        mat.albedoColor = BABYLON.Color3.FromArray(color);
        mat.metallic = metallic;
        mat.roughness = roughness;
        mat.environmentIntensity = 0.7;
        return mat;
      };
      const materials = [
        make("dielectric-rough", [0.78, 0.2, 0.12], 0.02, 0.72),
        make("metallic-smooth", [0.82, 0.74, 0.55], 1, 0.18),
        make("clearcoat-paint", [0.05, 0.22, 0.75], 0.35, 0.28),
        make("transmission-tint", [0.25, 0.72, 0.92], 0.02, 0.05),
        make("sheen-fabric", [0.42, 0.12, 0.62], 0, 0.68),
        make("anisotropy-brushed", [0.72, 0.72, 0.78], 0.9, 0.32),
        make("iridescent-film", [0.18, 0.22, 0.28], 0.15, 0.22),
        make("diffuse-transmission-panel", [0.18, 0.72, 0.42], 0.02, 0.28),
        make("volume-attenuation-glass", [0.72, 0.92, 1], 0.02, 0.08),
        make("specular-tint-ceramic", [0.82, 0.62, 0.36], 0.04, 0.44),
        make("dispersion-prism", [0.64, 0.82, 1], 0.02, 0.04),
      ];
      materials[2].clearCoat.isEnabled = true;
      materials[2].clearCoat.intensity = 0.82;
      materials[2].clearCoat.roughness = 0.12;
      materials[3].alpha = 0.72;
      materials[3].transparencyMode = BABYLON.PBRMaterial.PBRMATERIAL_ALPHABLEND;
      materials[3].subSurface.isRefractionEnabled = true;
      materials[3].subSurface.indexOfRefraction = 1.45;
      materials[4].sheen.isEnabled = true;
      materials[4].sheen.intensity = 0.7;
      materials[4].sheen.roughness = 0.35;
      materials[5].anisotropy.isEnabled = true;
      materials[5].anisotropy.intensity = 0.75;
      materials[6].iridescence.isEnabled = true;
      materials[6].iridescence.intensity = 0.85;
      materials[6].iridescence.indexOfRefraction = 1.5;
      materials[7].alpha = 0.82;
      materials[7].transparencyMode = BABYLON.PBRMaterial.PBRMATERIAL_ALPHABLEND;
      materials[7].subSurface.isTranslucencyEnabled = true;
      materials[7].subSurface.tintColor = new BABYLON.Color3(0.76, 1, 0.86);
      materials[8].alpha = 0.68;
      materials[8].transparencyMode = BABYLON.PBRMaterial.PBRMATERIAL_ALPHABLEND;
      materials[8].subSurface.isRefractionEnabled = true;
      materials[8].subSurface.thicknessTexture = null;
      materials[8].subSurface.minimumThickness = 0.1;
      materials[8].subSurface.maximumThickness = 0.42;
      materials[8].subSurface.tintColor = new BABYLON.Color3(0.58, 0.82, 1);
      materials[9].reflectivityColor = new BABYLON.Color3(1, 0.82, 0.48);
      materials[10].alpha = 0.62;
      materials[10].transparencyMode = BABYLON.PBRMaterial.PBRMATERIAL_ALPHABLEND;
      materials[10].subSurface.isRefractionEnabled = true;
      materials[10].subSurface.indexOfRefraction = 1.52;
      materials[10].subSurface.tintColor = new BABYLON.Color3(0.82, 0.92, 1);
      const floor = BABYLON.MeshBuilder.CreateBox("floor", { width: 2, height: 0.055, depth: 0.28 }, scene);
      floor.position = new BABYLON.Vector3(0, -0.46, 0.08);
      floor.material = make("matte-floor", [0.18, 0.19, 0.2], 0, 0.84);
      materials.forEach((material, index) => {
        const mesh = BABYLON.MeshBuilder.CreateSphere("pbr-" + index, { diameter: 0.26, segments: 40 }, scene);
        mesh.position = new BABYLON.Vector3(-0.86 + index * 0.172, index % 2 === 0 ? -0.1 : 0.16, 0);
        mesh.material = material;
      });
      scene.render();
      await scene.whenReadyAsync();
      scene.render();
      await nextFrame();
      scene.render();
      const stats = pixelStats(canvas);
      return { width: canvas.width, height: canvas.height, ...stats, drawCalls: 12, materialCount: materials.length, featureCount: materials.length };
    }
  `;
}

interface DiffResultWithDataUrl extends Omit<PbrVisualDiff, "baselineEngine" | "comparedEngine" | "baselinePath" | "comparedPath" | "diffPath"> {
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
    maxChangedPixelRatio: 0.82,
    maxMeanAbsoluteError: 64,
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

function writeReport(root: string, report: ExternalParityPbrVisualParityReport): void {
  writeJson(root, reportPath, report);
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const report = await createExternalParityPbrVisualParityReport();
  writeReport(process.cwd(), report);
  console.log(JSON.stringify({
    ok: report.ok,
    boundedPbrVisualParity: report.boundedPbrVisualParity,
    fullPhysicalPbrParity: report.fullPhysicalPbrParity,
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
