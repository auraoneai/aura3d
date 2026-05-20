import { GLTFLoader as G3DGLTFLoader } from "/packages/assets/src/GLTFLoader.js";
import { LoadContext } from "/packages/assets/src/LoadContext.js";
import { createGLTFRenderResources } from "/packages/assets/src/GLTFRenderResources.js";
import {
  computePerspectiveCameraFrame,
  type CameraFrameBounds
} from "/packages/rendering/src/index.js";
import {
  ProductionWebGL2Renderer,
  createV6EnvironmentLightingResources,
  createV6PbrHdrPipelineFromRadiance,
  summarizeV6WebGL2Proof
} from "/packages/rendering/src/v6/index.js";
import {
  createV6ComposedProductionStageScene,
  createV6HeroShaderLibrary
} from "/tests/browser/v6-production-scene-tools.js";
import * as THREE from "/node_modules/three/build/three.module.js";
import { GLTFLoader as ThreeGLTFLoader } from "/node_modules/three/examples/jsm/loaders/GLTFLoader.js";
import { RGBELoader } from "/node_modules/three/examples/jsm/loaders/RGBELoader.js";

declare global {
  interface Window {
    __V7_MATERIAL_EXTENSION_PARITY__?: unknown;
  }
}

interface PixelStats {
  readonly nonBlackPixels: number;
  readonly uniqueColorBuckets: number;
  readonly averageLuma: number;
  readonly maxLuma: number;
}

interface DiffStats {
  readonly meanDelta: number;
  readonly maxDelta: number;
  readonly changedPixels: number;
  readonly structuralSimilarityProxy: number;
}

const SIZE = 512;
const HDR_URI = "/fixtures/v6/environments/hdri/industrial_high_contrast_1k.hdr";
const NEUTRAL_BACKGROUND = 0x171a1d;
const NEUTRAL_BACKGROUND_LINEAR = [0.009, 0.011, 0.013, 1] as const;
const MATERIAL_EXTENSION_ASSETS = [
  { id: "compare-anisotropy", uri: "/fixtures/v7/assets/material-extensions/compare-anisotropy.glb", expectedExtension: "KHR_materials_anisotropy", expectedFeature: "anisotropy" },
  { id: "compare-iridescence", uri: "/fixtures/v7/assets/material-extensions/compare-iridescence.glb", expectedExtension: "KHR_materials_iridescence", expectedFeature: "iridescence" },
  { id: "compare-transmission", uri: "/fixtures/v7/assets/material-extensions/compare-transmission.glb", expectedExtension: "KHR_materials_transmission", expectedFeature: "transmission" },
  { id: "compare-volume", uri: "/fixtures/v7/assets/material-extensions/compare-volume.glb", expectedExtension: "KHR_materials_volume", expectedFeature: "volume" },
  { id: "compare-clearcoat", uri: "/fixtures/v7/assets/material-extensions/compare-clearcoat.glb", expectedExtension: "KHR_materials_clearcoat", expectedFeature: "clearcoat" },
  { id: "compare-sheen", uri: "/fixtures/v7/assets/material-extensions/compare-sheen.glb", expectedExtension: "KHR_materials_sheen", expectedFeature: "sheen" },
  { id: "compare-specular", uri: "/fixtures/v7/assets/material-extensions/compare-specular.glb", expectedExtension: "KHR_materials_specular", expectedFeature: "specular" },
  { id: "compare-ior", uri: "/fixtures/v7/assets/material-extensions/compare-ior.glb", expectedExtension: "KHR_materials_ior", expectedFeature: "ior" },
  { id: "compare-dispersion", uri: "/fixtures/v7/assets/material-extensions/compare-dispersion.glb", expectedExtension: "KHR_materials_dispersion", expectedFeature: "dispersion" },
  { id: "compare-emissive-strength", uri: "/fixtures/v7/assets/material-extensions/compare-emissive-strength.glb", expectedExtension: "KHR_materials_emissive_strength", expectedFeature: "emissive" },
  { id: "diffuse-transmission-test", uri: "/fixtures/v7/assets/material-extensions/diffuse-transmission-test.glb", expectedExtension: "KHR_materials_diffuse_transmission", expectedFeature: "diffuse-transmission" }
] as const;

async function run(): Promise<void> {
  const root = document.getElementById("material-extension-parity-root");
  if (!(root instanceof HTMLElement)) throw new Error("Missing material extension parity root.");
  const hdr = await fetchBytes(`${location.origin}${HDR_URI}`);
  const hdrPipeline = createV6PbrHdrPipelineFromRadiance(hdr, {
    id: "v7-material-extension-parity-hdr",
    label: "V7 Material Extension Parity HDR",
    intensity: 2.25,
    backgroundIntensity: 1.0,
    rotation: 0.29,
    toneMapping: { operator: "filmic", exposure: 1.08, whitePoint: 10.8 }
  });
  const lighting = createV6EnvironmentLightingResources(hdrPipeline);
  const cases = [];
  for (const asset of MATERIAL_EXTENSION_ASSETS) {
    const g3dCanvas = createCanvas(`${asset.id}-g3d`);
    const threeCanvas = createCanvas(`${asset.id}-threejs`);
    const diffCanvas = createCanvas(`${asset.id}-diff`);
    root.append(g3dCanvas, threeCanvas, diffCanvas);
    const g3d = await renderG3D(asset, g3dCanvas, lighting.lighting, hdrPipeline);
    const threejs = await renderThree(asset, threeCanvas, `${location.origin}${HDR_URI}`, g3d.frameBounds);
    const diff = renderDiff(g3d.pixels, threejs.pixels, diffCanvas);
    cases.push({
      id: asset.id,
      expectedExtension: asset.expectedExtension,
      expectedFeature: asset.expectedFeature,
      parity: { claim: "bounded-eleven-extension-material-delta-coverage" },
      g3d: {
        diagnostics: g3d.proof.diagnostics,
        importedAsset: g3d.proof.importedAsset,
        summary: summarizeV6WebGL2Proof(g3d.proof),
        pixelStats: analyzePixels(g3d.pixels),
        extensionsUsed: g3d.asset.loaderDiagnostics.extensionsUsed,
        materialFeatures: g3d.asset.loaderDiagnostics.materialFeatures,
        unsupportedExtensions: g3d.asset.loaderDiagnostics.unsupportedExtensions,
        transmissionBackdrop: g3d.transmissionBackdrop
      },
      threejs: {
        diagnostics: threejs.diagnostics,
        pixelStats: analyzePixels(threejs.pixels),
        pmremGenerator: true
      },
      diff,
      dataUrls: {
        g3d: pixelsToDataUrl(g3d.pixels, SIZE, SIZE, true),
        threejs: pixelsToDataUrl(threejs.pixels, SIZE, SIZE, true),
        diff: diffCanvas.toDataURL("image/png")
      }
    });
  }
  lighting.dispose();
  window.__V7_MATERIAL_EXTENSION_PARITY__ = {
    status: "ready",
    schema: "g3d-v7-material-extension-parity/v1",
    purpose: "same-extension G3D vs Three.js material delta gate",
    parity: {
      claim: "bounded-eleven-extension-material-delta-coverage",
      reason: "This compares eleven dedicated material-extension assets against a same-camera Three.js PMREM reference. It is bounded visual-delta coverage, not broad material-extension ecosystem parity."
    },
    scene: {
      setupAlignment: "same-hdri-pmrem-neutral-stage-calibrated-baseline-luma",
      width: SIZE,
      height: SIZE,
      hdrUri: HDR_URI
    },
    hdr: hdrPipeline.diagnostics,
    cases,
    openGaps: [
      "This is a bounded eleven-extension sample, not broad material-extension ecosystem parity.",
      "High-IOR thick-glass samples now exercise a bounded renderer-owned scene-color readback path for transmission backdrop sampling, but full screen-space refraction parity remains open.",
      "Transmission, diffuse transmission, and volume deltas still need physically stricter scene-specific acceptance thresholds.",
      "Broad WebGPU material-extension parity across every shader/postprocess/example path remains open."
    ]
  };
}

async function renderG3D(
  asset: typeof MATERIAL_EXTENSION_ASSETS[number],
  canvas: HTMLCanvasElement,
  environmentLighting: NonNullable<Parameters<typeof createV6ComposedProductionStageScene>[2]["environmentLighting"]>,
  hdrPipeline: ReturnType<typeof createV6PbrHdrPipelineFromRadiance>
) {
  const assetUri = `${location.origin}${asset.uri}`;
  const loaded = await new G3DGLTFLoader().load({ url: assetUri }, new LoadContext());
  const resources = await createGLTFRenderResources(loaded);
  const input = resources.toRendererInput({ width: SIZE, height: SIZE }, {
    qualityPreset: "hdr-studio-preview",
    environmentLighting,
    cameraPolicy: "require"
  });
  const staged = createV6ComposedProductionStageScene([{
    source: input.source,
    resources,
    metadata: { assetId: asset.id, assetName: asset.id }
  }], { width: SIZE, height: SIZE }, {
    yawRadians: -0.42,
    pitchRadians: -0.1,
    paddingRatio: 0.08,
    includeFloor: false,
    includeBackdrop: false,
    includeSoftboxes: false,
    environmentLighting,
    hdrSkybox: undefined
  });
  const renderer = await ProductionWebGL2Renderer.create({
    canvas,
    width: SIZE,
    height: SIZE,
    preserveDrawingBuffer: true,
    clearColor: NEUTRAL_BACKGROUND_LINEAR,
    shaderLibrary: createV6HeroShaderLibrary()
  });
  const proof = renderer.renderImportedAsset({
    source: staged.source,
    camera: staged.camera,
    metadata: {
      assetId: asset.id,
      assetName: asset.id,
      assetUri,
      meshCount: loaded.meshes.length,
      primitiveCount: loaded.meshes.length,
      materialCount: loaded.materials.length,
      textureCount: loaded.textures.length,
      imageCount: loaded.images.length,
      animationCount: loaded.animations.length,
      skinCount: loaded.skins.length,
      morphTargetCount: loaded.meshes.reduce((total, mesh) => total + mesh.morphTargets.length, 0),
      vertexCount: loaded.loaderDiagnostics.vertexCount,
      indexCount: loaded.loaderDiagnostics.indexCount,
      extensionsUsed: loaded.loaderDiagnostics.extensionsUsed,
      environmentId: hdrPipeline.id,
      hdrEnvironmentUri: `${location.origin}${HDR_URI}`
    },
    ...(asset.id === "compare-ior" ? {
      transmissionBackdropCapture: {
        mode: "scene-color-readback",
        strength: 0.82,
        refractionScale: 0.032
      }
    } : {})
  });
  const pixels = readCanvasWebGLPixels(canvas);
  renderer.dispose();
  resources.dispose();
  return {
    proof,
    pixels,
    asset: loaded,
    frameBounds: staged.frameBounds,
    transmissionBackdrop: proof.transmissionBackdropCapture
  };
}

async function renderThree(
  asset: typeof MATERIAL_EXTENSION_ASSETS[number],
  canvas: HTMLCanvasElement,
  environmentUri: string,
  frameBounds: CameraFrameBounds
): Promise<{ readonly diagnostics: { readonly drawCalls: number; readonly triangles: number; readonly textures: number }; readonly pixels: Uint8Array }> {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(SIZE, SIZE, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.68;
  const hdrTexture = await new Promise<THREE.Texture>((resolve, reject) => {
    new RGBELoader().load(environmentUri, resolve, undefined, reject);
  });
  hdrTexture.mapping = THREE.EquirectangularReflectionMapping;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromEquirectangular(hdrTexture).texture;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(NEUTRAL_BACKGROUND);
  scene.environment = environment;
  scene.add(new THREE.HemisphereLight(0xb7c3d0, 0x22252a, 0.32));
  const light = new THREE.DirectionalLight(0xffefd6, 1.36);
  light.position.set(2.6, 3.2, 2.4);
  scene.add(light);
  const gltf = await new Promise<{ scene: THREE.Object3D }>((resolve, reject) => {
    new ThreeGLTFLoader().load(`${location.origin}${asset.uri}`, resolve, undefined, reject);
  });
  const model = gltf.scene;
  scene.add(model);
  const frame = computePerspectiveCameraFrame(frameBounds, { width: SIZE, height: SIZE }, {
    yawRadians: -0.42,
    pitchRadians: -0.1,
    paddingRatio: 0.08,
    nearPadding: 0.25,
    farPadding: 3.5
  });
  const camera = new THREE.PerspectiveCamera(frame.fovYRadians * 180 / Math.PI, frame.aspect, frame.near, frame.far);
  camera.position.set(frame.cameraPosition[0], frame.cameraPosition[1], frame.cameraPosition[2]);
  camera.lookAt(frame.center[0], frame.center[1], frame.center[2]);
  renderer.render(scene, camera);
  const gl = renderer.getContext();
  gl.finish();
  const pixels = new Uint8Array(SIZE * SIZE * 4);
  gl.readPixels(0, 0, SIZE, SIZE, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  const diagnostics = {
    drawCalls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
    textures: renderer.info.memory.textures
  };
  environment.dispose();
  pmrem.dispose();
  hdrTexture.dispose();
  renderer.dispose();
  return { diagnostics, pixels };
}

function renderDiff(leftPixels: Uint8Array, rightPixels: Uint8Array, output: HTMLCanvasElement): DiffStats {
  const context = output.getContext("2d");
  if (!context) throw new Error("Material extension diff canvas requires 2D context.");
  const image = context.createImageData(SIZE, SIZE);
  let totalDelta = 0;
  let maxDelta = 0;
  let changedPixels = 0;
  for (let offset = 0; offset + 3 < image.data.length; offset += 4) {
    const redDelta = Math.abs((leftPixels[offset] ?? 0) - (rightPixels[offset] ?? 0));
    const greenDelta = Math.abs((leftPixels[offset + 1] ?? 0) - (rightPixels[offset + 1] ?? 0));
    const blueDelta = Math.abs((leftPixels[offset + 2] ?? 0) - (rightPixels[offset + 2] ?? 0));
    const delta = (redDelta + greenDelta + blueDelta) / 3;
    totalDelta += delta;
    maxDelta = Math.max(maxDelta, delta);
    if (delta > 8) changedPixels += 1;
    image.data[offset] = Math.min(255, redDelta * 2);
    image.data[offset + 1] = Math.min(255, greenDelta * 2);
    image.data[offset + 2] = Math.min(255, blueDelta * 2);
    image.data[offset + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  const meanDelta = totalDelta / (SIZE * SIZE);
  return {
    meanDelta: Number(meanDelta.toFixed(4)),
    maxDelta: Number(maxDelta.toFixed(4)),
    changedPixels,
    structuralSimilarityProxy: Number(Math.max(0, 1 - meanDelta / 255).toFixed(4))
  };
}

function analyzePixels(pixels: Uint8Array): PixelStats {
  let nonBlackPixels = 0;
  let lumaTotal = 0;
  let maxLuma = 0;
  const buckets = new Set<number>();
  for (let offset = 0; offset + 3 < pixels.length; offset += 4) {
    const red = pixels[offset] ?? 0;
    const green = pixels[offset + 1] ?? 0;
    const blue = pixels[offset + 2] ?? 0;
    const luma = red * 0.2126 + green * 0.7152 + blue * 0.0722;
    if (red + green + blue > 12) nonBlackPixels += 1;
    lumaTotal += luma;
    maxLuma = Math.max(maxLuma, luma);
    buckets.add(((red >> 4) << 8) | ((green >> 4) << 4) | (blue >> 4));
  }
  return {
    nonBlackPixels,
    uniqueColorBuckets: buckets.size,
    averageLuma: Number((lumaTotal / (SIZE * SIZE)).toFixed(6)),
    maxLuma: Number(maxLuma.toFixed(6))
  };
}

function pixelsToDataUrl(pixels: Uint8Array, width: number, height: number, flipY: boolean): string {
  const output = document.createElement("canvas");
  output.width = width;
  output.height = height;
  const context = output.getContext("2d");
  if (!context) throw new Error("Could not create material extension capture canvas.");
  const image = context.createImageData(width, height);
  for (let y = 0; y < height; y += 1) {
    const sourceY = flipY ? height - 1 - y : y;
    for (let x = 0; x < width; x += 1) {
      const sourceOffset = (sourceY * width + x) * 4;
      const targetOffset = (y * width + x) * 4;
      image.data[targetOffset] = pixels[sourceOffset] ?? 0;
      image.data[targetOffset + 1] = pixels[sourceOffset + 1] ?? 0;
      image.data[targetOffset + 2] = pixels[sourceOffset + 2] ?? 0;
      image.data[targetOffset + 3] = pixels[sourceOffset + 3] ?? 255;
    }
  }
  context.putImageData(image, 0, 0);
  return output.toDataURL("image/png");
}

function readCanvasWebGLPixels(canvas: HTMLCanvasElement): Uint8Array {
  const gl = (canvas.getContext("webgl2") ?? canvas.getContext("webgl")) as WebGLRenderingContext | WebGL2RenderingContext | null;
  if (!gl) throw new Error("Unable to read material extension WebGL pixels.");
  gl.finish();
  const pixels = new Uint8Array(SIZE * SIZE * 4);
  gl.readPixels(0, 0, SIZE, SIZE, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  return pixels;
}

function createCanvas(id: string): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.id = id;
  canvas.width = SIZE;
  canvas.height = SIZE;
  return canvas;
}

async function fetchBytes(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);
  return response.arrayBuffer();
}

run().catch((error) => {
  window.__V7_MATERIAL_EXTENSION_PARITY__ = {
    status: "error",
    error: error instanceof Error ? error.stack ?? error.message : String(error)
  };
});
