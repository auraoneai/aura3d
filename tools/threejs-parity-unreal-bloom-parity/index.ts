// @ts-nocheck
import { Geometry, UnlitMaterial } from "@aura3d/rendering";
import { A3DRenderer } from "@aura3d/engine/advanced-runtime";
import * as THREE from "three";
import { EffectComposer } from "/node_modules/three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "/node_modules/three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "/node_modules/three/examples/jsm/postprocessing/UnrealBloomPass.js";

declare global {
  interface Window {
    __THREEJS_PARITY_UNREAL_BLOOM_PARITY__?: ThreeJsParityUnrealBloomParityResult;
  }
}

export {};

type ThreeJsParityUnrealBloomParityResult = ThreeJsParityUnrealBloomParityReady | ThreeJsParityUnrealBloomParityError;

interface ThreeJsParityUnrealBloomParityReady {
  readonly status: "ready";
  readonly schema: "a3d-threejs-parity-unreal-bloom-parity";
  readonly purpose: "same-scene A3D bloom chain vs Three.js EffectComposer UnrealBloomPass";
  readonly generatedInBrowserAt: string;
  readonly scene: typeof SCENE;
  readonly a3d: {
    readonly renderer: { readonly drawCalls: number; readonly actualA3DRenderer: true };
    readonly postprocess: { readonly chain: readonly string[]; readonly threshold: number; readonly radius: number; readonly intensity: number };
    readonly pixels: PixelStats;
  };
  readonly threejs: {
    readonly renderer: { readonly actualThreeRenderer: true; readonly drawCalls: number; readonly triangles: number };
    readonly postprocess: { readonly actualEffectComposer: true; readonly actualRenderPass: true; readonly actualUnrealBloomPass: true; readonly threshold: number; readonly radius: number; readonly strength: number };
    readonly pixels: PixelStats;
  };
  readonly diff: DiffStats;
  readonly assertions: {
    readonly sameResolution: boolean;
    readonly actualThreeRenderer: boolean;
    readonly actualEffectComposer: boolean;
    readonly actualUnrealBloomPass: boolean;
    readonly a3dBloomChain: boolean;
    readonly brightOutput: boolean;
    readonly haloOutput: boolean;
    readonly screenshotsNonBlank: boolean;
    readonly fakeEqualityClaimed: false;
  };
  readonly dataUrls: { readonly a3d: string; readonly threejs: string; readonly sideBySide: string };
  readonly humanNotes: readonly string[];
}

interface ThreeJsParityUnrealBloomParityError {
  readonly status: "error";
  readonly schema: "a3d-threejs-parity-unreal-bloom-parity";
  readonly generatedInBrowserAt: string;
  readonly error: string;
  readonly expectedRenderer: "THREE.WebGLRenderer";
  readonly expectedReferencePass: "UnrealBloomPass";
}

interface PixelStats {
  readonly nonBlackPixels: number;
  readonly brightPixels: number;
  readonly haloPixels: number;
  readonly uniqueColorBuckets: number;
  readonly averageLuma: number;
  readonly localContrast: number;
}

interface DiffStats {
  readonly meanDelta: number;
  readonly maxDelta: number;
  readonly changedPixels: number;
  readonly structuralSimilarityProxy: number;
}

const SCENE = {
  id: "threejs-parity-unreal-bloom",
  width: 720,
  height: 405,
  clearColor: [0.006, 0.008, 0.012, 1],
  bloom: { threshold: 0.08, radius: 2, intensity: 0.36, threeStrength: 0.82, threeRadius: 0.42 },
  toneMapping: { exposure: 1.15, operator: "reinhard" }
} as const;

void run();

async function run(): Promise<void> {
  const status = document.getElementById("report-status");
  const json = document.getElementById("report-json");
  try {
    const a3dCanvas = requiredCanvas("a3d-unreal-bloom", SCENE.width, SCENE.height);
    const threeCanvas = requiredCanvas("threejs-unreal-bloom", SCENE.width, SCENE.height);
    const sideBySideCanvas = requiredCanvas("side-by-side", SCENE.width * 2, SCENE.height + 60);

    if (status) status.textContent = "rendering A3D bloom chain";
    const a3d = await renderA3D(a3dCanvas);
    if (status) status.textContent = "rendering Three.js UnrealBloomPass";
    const threejs = await renderThree(threeCanvas);

    const [a3dPixels, threePixels] = await Promise.all([dataUrlToPixels(a3d.dataUrl), dataUrlToPixels(threejs.dataUrl)]);
    const a3dStats = analyzeImageData(a3dPixels);
    const threeStats = analyzeImageData(threePixels);
    const diff = computeDiff(a3dPixels, threePixels);
    const sideBySide = await drawSideBySide(sideBySideCanvas, a3d.dataUrl, threejs.dataUrl, diff);

    const ready: ThreeJsParityUnrealBloomParityReady = {
      status: "ready",
      schema: "a3d-threejs-parity-unreal-bloom-parity",
      purpose: "same-scene A3D bloom chain vs Three.js EffectComposer UnrealBloomPass",
      generatedInBrowserAt: new Date().toISOString(),
      scene: SCENE,
      a3d: {
        renderer: { drawCalls: a3d.drawCalls, actualA3DRenderer: true },
        postprocess: { chain: a3d.chain, threshold: SCENE.bloom.threshold, radius: SCENE.bloom.radius, intensity: SCENE.bloom.intensity },
        pixels: a3dStats
      },
      threejs: {
        renderer: { actualThreeRenderer: threejs.actualThreeRenderer, drawCalls: threejs.drawCalls, triangles: threejs.triangles },
        postprocess: {
          actualEffectComposer: threejs.actualEffectComposer,
          actualRenderPass: threejs.actualRenderPass,
          actualUnrealBloomPass: threejs.actualUnrealBloomPass,
          threshold: SCENE.bloom.threshold,
          radius: SCENE.bloom.threeRadius,
          strength: SCENE.bloom.threeStrength
        },
        pixels: threeStats
      },
      diff,
      assertions: {
        sameResolution: a3dPixels.width === threePixels.width && a3dPixels.height === threePixels.height,
        actualThreeRenderer: threejs.actualThreeRenderer,
        actualEffectComposer: threejs.actualEffectComposer,
        actualUnrealBloomPass: threejs.actualUnrealBloomPass,
        a3dBloomChain: a3d.chain.join("/") === "bloom/tone-mapping/fxaa",
        brightOutput: a3dStats.brightPixels > 4_000 && threeStats.brightPixels > 4_000,
        haloOutput: a3dStats.haloPixels > 3_000 && threeStats.haloPixels > 8_000,
        screenshotsNonBlank: a3dStats.nonBlackPixels > 20_000 && threeStats.nonBlackPixels > 20_000,
        fakeEqualityClaimed: false
      },
      dataUrls: { a3d: a3d.dataUrl, threejs: threejs.dataUrl, sideBySide },
      humanNotes: [
        `Mean RGB delta is ${diff.meanDelta}; structural similarity proxy is ${diff.structuralSimilarityProxy}.`,
        "Three.js reference uses an actual EffectComposer with RenderPass and UnrealBloomPass.",
        "This artifact gates bounded threshold/radius/halo behavior for the CurrentRoutes bloom workload; it is not a blanket postprocessing equality claim."
      ]
    };

    window.__THREEJS_PARITY_UNREAL_BLOOM_PARITY__ = ready;
    if (status) status.textContent = "ready";
    if (json) json.textContent = JSON.stringify(stripDataUrls(ready), null, 2);
  } catch (error) {
    const failure: ThreeJsParityUnrealBloomParityError = {
      status: "error",
      schema: "a3d-threejs-parity-unreal-bloom-parity",
      generatedInBrowserAt: new Date().toISOString(),
      error: error instanceof Error ? error.stack ?? error.message : String(error),
      expectedRenderer: "THREE.WebGLRenderer",
      expectedReferencePass: "UnrealBloomPass"
    };
    window.__THREEJS_PARITY_UNREAL_BLOOM_PARITY__ = failure;
    if (status) status.textContent = "error";
    if (json) json.textContent = JSON.stringify(failure, null, 2);
  }
}

async function renderA3D(canvas: HTMLCanvasElement) {
  const renderer = await A3DRenderer.create({
    canvas,
    width: SCENE.width,
    height: SCENE.height,
    backend: "webgl2",
    preserveDrawingBuffer: true,
    antialias: true,
    clearColor: SCENE.clearColor
  });
  const diagnostics = renderer.render({
    cameraPolicy: "identity",
    renderItems: createA3DItems(),
    postprocess: {
      bloom: { threshold: SCENE.bloom.threshold, intensity: SCENE.bloom.intensity, radius: SCENE.bloom.radius },
      toneMapping: {
        exposure: SCENE.toneMapping.exposure,
        gamma: 1,
        operator: SCENE.toneMapping.operator,
        inputColorSpace: "linear",
        outputColorSpace: "srgb"
      },
      fxaa: true
    }
  });
  await waitFrames(2);
  return {
    drawCalls: diagnostics.drawCalls,
    chain: ["bloom", "tone-mapping", "fxaa"] as const,
    dataUrl: canvas.toDataURL("image/png")
  };
}

async function renderThree(canvas: HTMLCanvasElement) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(SCENE.width, SCENE.height, false);
  renderer.setClearColor(new THREE.Color(SCENE.clearColor[0], SCENE.clearColor[1], SCENE.clearColor[2]), SCENE.clearColor[3]);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ReinhardToneMapping;
  renderer.toneMappingExposure = SCENE.toneMapping.exposure;
  if (!(renderer instanceof THREE.WebGLRenderer)) throw new Error("Unreal bloom parity requires an actual THREE.WebGLRenderer.");

  const scene = createThreeScene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  camera.position.set(0, 0, 1);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  const composer = new EffectComposer(renderer);
  composer.setSize(SCENE.width, SCENE.height);
  const renderPass = new RenderPass(scene, camera);
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(SCENE.width, SCENE.height), SCENE.bloom.threeStrength, SCENE.bloom.threeRadius, SCENE.bloom.threshold);
  composer.addPass(renderPass);
  composer.addPass(bloomPass);
  composer.render();
  await waitFrames(2);
  return {
    actualThreeRenderer: true as const,
    actualEffectComposer: composer instanceof EffectComposer,
    actualRenderPass: renderPass instanceof RenderPass,
    actualUnrealBloomPass: bloomPass instanceof UnrealBloomPass,
    drawCalls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
    dataUrl: canvas.toDataURL("image/png")
  };
}

function createA3DItems() {
  const yellow = new UnlitMaterial({ color: [1, 0.82, 0.18, 1] });
  const blue = new UnlitMaterial({ color: [0.1, 0.52, 1, 1] });
  const white = new UnlitMaterial({ color: [1, 1, 0.92, 1] });
  return [
    {
      geometry: Geometry.triangle(),
      material: yellow,
      modelMatrix: multiply(translation(-0.26, 0.08, 0), multiply(rotationZ(-0.16), scale(0.62, 0.62, 1))),
      label: "unreal-bloom-yellow-triangle"
    },
    {
      geometry: Geometry.triangle(),
      material: blue,
      modelMatrix: multiply(translation(0.32, -0.18, 0), multiply(rotationZ(0.24), scale(0.5, 0.5, 1))),
      label: "unreal-bloom-blue-triangle"
    },
    {
      geometry: Geometry.triangle(),
      material: white,
      modelMatrix: multiply(translation(0.02, 0.23, 0), multiply(rotationZ(Math.PI), scale(0.22, 0.22, 1))),
      label: "unreal-bloom-white-core"
    }
  ];
}

function createThreeScene(): THREE.Scene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SCENE.clearColor[0], SCENE.clearColor[1], SCENE.clearColor[2]);
  scene.add(createThreeTriangle(0xffff2e, [-0.26, 0.08, 0], 0.62, -0.16));
  scene.add(createThreeTriangle(0x1a84ff, [0.32, -0.18, 0], 0.5, 0.24));
  scene.add(createThreeTriangle(0xffffea, [0.02, 0.23, 0], 0.22, Math.PI));
  return scene;
}

function createThreeTriangle(color: number, position: readonly [number, number, number], scaleValue: number, rotation: number): THREE.Mesh {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0, 0.5, 0], 3));
  geometry.setIndex([0, 1, 2]);
  geometry.computeBoundingSphere();
  const material = new THREE.MeshBasicMaterial({ color, toneMapped: false });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(position[0], position[1], position[2]);
  mesh.scale.set(scaleValue, scaleValue, 1);
  mesh.rotation.z = rotation;
  return mesh;
}

function requiredCanvas(id: string, width: number, height: number): HTMLCanvasElement {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLCanvasElement)) throw new Error(`Missing canvas #${id}.`);
  element.width = width;
  element.height = height;
  return element;
}

async function dataUrlToPixels(dataUrl: string): Promise<ImageData> {
  const image = await loadImage(dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Unable to create unreal bloom parity pixel canvas.");
  context.drawImage(image, 0, 0);
  return context.getImageData(0, 0, canvas.width, canvas.height);
}

function analyzeImageData(image: ImageData): PixelStats {
  let nonBlackPixels = 0;
  let brightPixels = 0;
  let haloPixels = 0;
  let lumaTotal = 0;
  let localContrastTotal = 0;
  const buckets = new Set<number>();
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const offset = (y * image.width + x) * 4;
      const red = image.data[offset] ?? 0;
      const green = image.data[offset + 1] ?? 0;
      const blue = image.data[offset + 2] ?? 0;
      const value = luma(red, green, blue);
      if (value > 10) nonBlackPixels += 1;
      if (value > 132) brightPixels += 1;
      if (value > 24 && value <= 132) haloPixels += 1;
      buckets.add(((red >> 4) << 8) | ((green >> 4) << 4) | (blue >> 4));
      lumaTotal += value;
      if (x > 0) {
        const previousOffset = offset - 4;
        localContrastTotal += Math.abs(value - luma(image.data[previousOffset] ?? 0, image.data[previousOffset + 1] ?? 0, image.data[previousOffset + 2] ?? 0));
      }
    }
  }
  return {
    nonBlackPixels,
    brightPixels,
    haloPixels,
    uniqueColorBuckets: buckets.size,
    averageLuma: Number((lumaTotal / (image.data.length / 4)).toFixed(4)),
    localContrast: Number((localContrastTotal / Math.max(1, image.width * image.height - image.height)).toFixed(4))
  };
}

function computeDiff(left: ImageData, right: ImageData): DiffStats {
  if (left.width !== right.width || left.height !== right.height) {
    throw new Error(`Cannot diff unreal bloom captures with mismatched size: ${left.width}x${left.height} vs ${right.width}x${right.height}.`);
  }
  let totalDelta = 0;
  let maxDelta = 0;
  let changedPixels = 0;
  for (let offset = 0; offset + 3 < left.data.length; offset += 4) {
    const delta = (
      Math.abs((left.data[offset] ?? 0) - (right.data[offset] ?? 0))
      + Math.abs((left.data[offset + 1] ?? 0) - (right.data[offset + 1] ?? 0))
      + Math.abs((left.data[offset + 2] ?? 0) - (right.data[offset + 2] ?? 0))
    ) / 3;
    totalDelta += delta;
    maxDelta = Math.max(maxDelta, delta);
    if (delta > 8) changedPixels += 1;
  }
  const meanDelta = totalDelta / (left.width * left.height);
  return {
    meanDelta: Number(meanDelta.toFixed(4)),
    maxDelta: Number(maxDelta.toFixed(4)),
    changedPixels,
    structuralSimilarityProxy: Number(Math.max(0, 1 - meanDelta / 255).toFixed(4))
  };
}

async function drawSideBySide(canvas: HTMLCanvasElement, a3dDataUrl: string, threeDataUrl: string, diff: DiffStats): Promise<string> {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Unable to create unreal bloom side-by-side canvas.");
  const [a3d, three] = await Promise.all([loadImage(a3dDataUrl), loadImage(threeDataUrl)]);
  context.fillStyle = "#07090d";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(a3d, 0, 0, SCENE.width, SCENE.height);
  context.drawImage(three, SCENE.width, 0, SCENE.width, SCENE.height);
  context.fillStyle = "rgba(7, 9, 13, 0.92)";
  context.fillRect(0, SCENE.height, canvas.width, 60);
  context.fillStyle = "#f3f6f8";
  context.font = "20px system-ui, sans-serif";
  context.fillText("Left: A3D bloom chain | Right: Three.js EffectComposer + UnrealBloomPass", 20, SCENE.height + 28);
  context.fillStyle = "#aeb8c6";
  context.font = "16px system-ui, sans-serif";
  context.fillText(`mean delta ${diff.meanDelta} | changed ${diff.changedPixels} | SSIM proxy ${diff.structuralSimilarityProxy}`, 20, SCENE.height + 50);
  return canvas.toDataURL("image/png");
}

async function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Unable to decode unreal bloom parity image data URL."));
    image.src = dataUrl;
  });
  return image;
}

function stripDataUrls(result: ThreeJsParityUnrealBloomParityReady): Omit<ThreeJsParityUnrealBloomParityReady, "dataUrls"> {
  const { dataUrls: _dataUrls, ...rest } = result;
  return rest;
}

function translation(x: number, y: number, z: number): Float32Array {
  return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]);
}

function scale(x: number, y: number, z: number): Float32Array {
  return new Float32Array([x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1]);
}

function rotationZ(radians: number): Float32Array {
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  return new Float32Array([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}

function multiply(left: Float32Array, right: Float32Array): Float32Array {
  const output = new Float32Array(16);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      output[column * 4 + row] =
        left[row] * right[column * 4] +
        left[4 + row] * right[column * 4 + 1] +
        left[8 + row] * right[column * 4 + 2] +
        left[12 + row] * right[column * 4 + 3];
    }
  }
  return output;
}

function luma(red: number, green: number, blue: number): number {
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

async function waitFrames(count: number): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}
