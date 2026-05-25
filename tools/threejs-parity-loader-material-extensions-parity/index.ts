// @ts-nocheck
import { GLTFLoader as G3DGLTFLoader, LoadContext, createGLTFRenderResources } from "@galileo3d/assets";
import { G3DRenderer } from "@galileo3d/engine/advanced-runtime";
import { Material, computePerspectiveCameraFrame } from "@galileo3d/rendering";
import * as THREE from "three";
import { GLTFLoader as ThreeGLTFLoader } from "/node_modules/three/examples/jsm/loaders/GLTFLoader.js";

declare global {
  interface Window {
    __V9_LOADER_MATERIAL_EXTENSIONS_PARITY__?: LoaderMaterialExtensionsParityResult;
  }
}

export {};

type LoaderMaterialExtensionsParityResult = LoaderMaterialExtensionsParityReady | LoaderMaterialExtensionsParityError;

interface LoaderMaterialExtensionsParityReady {
  readonly status: "ready";
  readonly schema: "g3d-threejs-parity-loader-material-extensions-parity/v1";
  readonly purpose: "same generated glTF KHR_materials_sheen/KHR_materials_transmission loaded by G3D and actual Three.js GLTFLoader";
  readonly generatedInBrowserAt: string;
  readonly fixture: typeof FIXTURE;
  readonly g3d: {
    readonly loader: { readonly extensionsUsed: readonly string[]; readonly unsupportedRequired: readonly string[]; readonly meshCount: number; readonly materialCount: number };
    readonly renderer: { readonly drawCalls: number; readonly triangles: number };
    readonly materials: MaterialExtensionStats;
    readonly pixels: PixelStats;
  };
  readonly threejs: {
    readonly loader: { readonly actualGLTFLoader: true; readonly actualThreeRenderer: true; readonly meshCount: number; readonly materialCount: number };
    readonly renderer: { readonly drawCalls: number; readonly triangles: number };
    readonly materials: MaterialExtensionStats;
    readonly pixels: PixelStats;
  };
  readonly diff: DiffStats;
  readonly assertions: {
    readonly sameFixtureHash: boolean;
    readonly actualThreeGLTFLoader: boolean;
    readonly actualThreeRenderer: boolean;
    readonly g3dImportsSheen: boolean;
    readonly g3dImportsTransmission: boolean;
    readonly g3dTransmissionUsesBlend: boolean;
    readonly threeImportsSheen: boolean;
    readonly threeImportsTransmission: boolean;
    readonly screenshotsNonBlank: boolean;
    readonly fakeEqualityClaimed: false;
  };
  readonly dataUrls: { readonly g3d: string; readonly threejs: string; readonly sideBySide: string };
}

interface LoaderMaterialExtensionsParityError {
  readonly status: "error";
  readonly schema: "g3d-threejs-parity-loader-material-extensions-parity/v1";
  readonly generatedInBrowserAt: string;
  readonly error: string;
}

interface MaterialExtensionStats {
  readonly clearcoatMaterials: number;
  readonly sheenMaterials: number;
  readonly transmissionMaterials: number;
  readonly transparentMaterials: number;
  readonly materialUniforms: readonly MaterialExtensionUniformEvidence[];
}

interface MaterialExtensionUniformEvidence {
  readonly material: string;
  readonly clearcoatFactor: number;
  readonly clearcoatRoughnessFactor: number;
  readonly sheenColorFactor: readonly [number, number, number];
  readonly sheenRoughnessFactor: number;
  readonly transmissionFactor: number;
  readonly blend: boolean;
}

interface PixelStats {
  readonly nonBlackPixels: number;
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

const FIXTURE = {
  id: "v9-loader-material-extensions",
  width: 720,
  height: 480,
  extensions: ["KHR_materials_clearcoat", "KHR_materials_sheen", "KHR_materials_transmission"],
  materialNames: ["clearcoat-panel", "sheen-panel", "transmission-panel"]
} as const;

const FRAME_BOUNDS = { min: [-1.65, -0.55, -0.08], max: [1.65, 0.55, 0.08] } as const;
const FRAME = { yawRadians: 0, pitchRadians: 0, paddingRatio: 0.12, fovYRadians: 0.68, nearPadding: 0.1, farPadding: 1.6 } as const;

void run();

async function run(): Promise<void> {
  const status = document.getElementById("report-status");
  const json = document.getElementById("report-json");
  try {
    const fixture = createMaterialExtensionsFixtureDataUrl();
    const fixtureHash = await sha256(fixture);
    const g3dCanvas = requiredCanvas("g3d-loader-material-extensions", FIXTURE.width, FIXTURE.height);
    const threeCanvas = requiredCanvas("threejs-loader-material-extensions", FIXTURE.width, FIXTURE.height);
    const sideBySideCanvas = requiredCanvas("side-by-side", FIXTURE.width * 2, FIXTURE.height + 60);

    if (status) status.textContent = "rendering G3D material-extension fixture";
    const g3d = await renderG3D(g3dCanvas, fixture);
    if (status) status.textContent = "rendering Three.js GLTFLoader material-extension reference";
    const threejs = await renderThree(threeCanvas, fixture);

    const [g3dPixels, threePixels] = await Promise.all([dataUrlToPixels(g3d.dataUrl), dataUrlToPixels(threejs.dataUrl)]);
    const g3dStats = analyzeImageData(g3dPixels);
    const threeStats = analyzeImageData(threePixels);
    const diff = computeDiff(g3dPixels, threePixels);
    const sideBySide = await drawSideBySide(sideBySideCanvas, g3d.dataUrl, threejs.dataUrl, diff);

    const ready: LoaderMaterialExtensionsParityReady = {
      status: "ready",
      schema: "g3d-threejs-parity-loader-material-extensions-parity/v1",
      purpose: "same generated glTF KHR_materials_sheen/KHR_materials_transmission loaded by G3D and actual Three.js GLTFLoader",
      generatedInBrowserAt: new Date().toISOString(),
      fixture: { ...FIXTURE, hash: fixtureHash },
      g3d: {
        loader: {
          extensionsUsed: g3d.extensionsUsed,
          unsupportedRequired: g3d.unsupportedRequired,
          meshCount: g3d.meshCount,
          materialCount: g3d.materialCount
        },
        renderer: { drawCalls: g3d.drawCalls, triangles: g3d.triangles },
        materials: g3d.materials,
        pixels: g3dStats
      },
      threejs: {
        loader: {
          actualGLTFLoader: threejs.actualGLTFLoader,
          actualThreeRenderer: threejs.actualThreeRenderer,
          meshCount: threejs.meshCount,
          materialCount: threejs.materialCount
        },
        renderer: { drawCalls: threejs.drawCalls, triangles: threejs.triangles },
        materials: threejs.materials,
        pixels: threeStats
      },
      diff,
      assertions: {
        sameFixtureHash: g3d.fixtureHash === fixtureHash && threejs.fixtureHash === fixtureHash,
        actualThreeGLTFLoader: threejs.actualGLTFLoader,
        actualThreeRenderer: threejs.actualThreeRenderer,
        g3dImportsSheen: g3d.materials.sheenMaterials >= 1,
        g3dImportsTransmission: g3d.materials.transmissionMaterials >= 1,
        g3dTransmissionUsesBlend: g3d.materials.transparentMaterials >= 1,
        threeImportsSheen: threejs.materials.sheenMaterials >= 1,
        threeImportsTransmission: threejs.materials.transmissionMaterials >= 1,
        screenshotsNonBlank: g3dStats.nonBlackPixels > 70_000 && threeStats.nonBlackPixels > 70_000,
        fakeEqualityClaimed: false
      },
      dataUrls: { g3d: g3d.dataUrl, threejs: threejs.dataUrl, sideBySide }
    };

    window.__V9_LOADER_MATERIAL_EXTENSIONS_PARITY__ = ready;
    if (status) status.textContent = "ready";
    if (json) json.textContent = JSON.stringify(stripDataUrls(ready), null, 2);
  } catch (error) {
    const failure: LoaderMaterialExtensionsParityError = {
      status: "error",
      schema: "g3d-threejs-parity-loader-material-extensions-parity/v1",
      generatedInBrowserAt: new Date().toISOString(),
      error: error instanceof Error ? error.stack ?? error.message : String(error)
    };
    window.__V9_LOADER_MATERIAL_EXTENSIONS_PARITY__ = failure;
    if (status) status.textContent = "error";
    if (json) json.textContent = JSON.stringify(failure, null, 2);
  }
}

async function renderG3D(canvas: HTMLCanvasElement, fixtureUrl: string) {
  const asset = await new G3DGLTFLoader().load({ url: fixtureUrl }, new LoadContext());
  const resources = await createGLTFRenderResources(asset);
  const renderer = await G3DRenderer.create({
    canvas,
    width: FIXTURE.width,
    height: FIXTURE.height,
    backend: "webgl2",
    preserveDrawingBuffer: true,
    antialias: true,
    clearColor: [0.64, 0.64, 0.64, 1]
  });
  const input = resources.toRendererInput({ width: FIXTURE.width, height: FIXTURE.height }, {
    cameraPolicy: "require",
    frame: FRAME,
    cameraFrameBounds: FRAME_BOUNDS,
    frustumCulling: false,
    postprocess: {
      targetFormat: "rgba8",
      toneMapping: { exposure: 1.05, operator: "filmic", inputColorSpace: "linear", outputColorSpace: "srgb" },
      fxaa: true
    }
  });
  const result = renderer.renderFrame({
    source: input.source,
    camera: input.camera,
    metadata: {
      assetId: FIXTURE.id,
      assetName: "V9 Loader Material Extensions",
      assetUri: fixtureUrl,
      meshCount: 3,
      primitiveCount: 3,
      materialCount: 3,
      textureCount: 0,
      imageCount: 0,
      animationCount: 0,
      skinCount: 0,
      morphTargetCount: 0,
      extensionsUsed: FIXTURE.extensions
    }
  });
  return {
    fixtureHash: await sha256(fixtureUrl),
    extensionsUsed: asset.loaderDiagnostics.extensionsUsed,
    unsupportedRequired: asset.loaderDiagnostics.unsupportedRequired ?? [],
    meshCount: asset.loaderDiagnostics.meshCount,
    materialCount: asset.loaderDiagnostics.materialCount,
    materials: inspectG3DMaterials(resources),
    drawCalls: result.diagnostics.drawCalls,
    triangles: result.diagnostics.triangles,
    dataUrl: canvas.toDataURL("image/png")
  };
}

async function renderThree(canvas: HTMLCanvasElement, fixtureUrl: string) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(FIXTURE.width, FIXTURE.height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const loader = new ThreeGLTFLoader();
  const gltf = await loader.loadAsync(fixtureUrl);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xa3a3a3);
  scene.add(gltf.scene);
  scene.add(new THREE.AmbientLight(0xffffff, 0.65));
  const key = new THREE.DirectionalLight(0xffffff, 2.8);
  key.position.set(0.5, 1.6, 2.4);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xc8d6ff, 1.1);
  rim.position.set(-1.3, 1.2, 1.8);
  scene.add(rim);
  const frame = computePerspectiveCameraFrame(FRAME_BOUNDS, { width: FIXTURE.width, height: FIXTURE.height }, FRAME);
  const camera = new THREE.PerspectiveCamera(frame.fovYRadians * 180 / Math.PI, FIXTURE.width / FIXTURE.height, frame.near, frame.far);
  camera.position.set(...frame.cameraPosition);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  renderer.render(scene, camera);
  return {
    fixtureHash: await sha256(fixtureUrl),
    actualGLTFLoader: loader instanceof ThreeGLTFLoader,
    actualThreeRenderer: renderer instanceof THREE.WebGLRenderer,
    meshCount: countThreeMeshes(gltf.scene),
    materialCount: inspectThreeMaterials(gltf.scene).materialUniforms.length,
    materials: inspectThreeMaterials(gltf.scene),
    drawCalls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
    dataUrl: canvas.toDataURL("image/png")
  };
}

function inspectG3DMaterials(resources): MaterialExtensionStats {
  const materialUniforms = [...resources.materialLibrary.values()]
    .filter((material): material is Material => material instanceof Material)
    .map((material) => ({
      material: material.name,
      clearcoatFactor: numberParameter(material, "u_clearcoatFactor"),
      clearcoatRoughnessFactor: numberParameter(material, "u_clearcoatRoughnessFactor"),
      sheenColorFactor: vec3Parameter(material, "u_sheenColorFactor"),
      sheenRoughnessFactor: numberParameter(material, "u_sheenRoughnessFactor"),
      transmissionFactor: numberParameter(material, "u_transmissionFactor"),
      blend: material.renderState.blend
    }));
  return summarizeMaterialUniforms(materialUniforms);
}

function inspectThreeMaterials(root: THREE.Object3D): MaterialExtensionStats {
  const materialUniforms: MaterialExtensionUniformEvidence[] = [];
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      if (!material) continue;
      const anyMaterial = material as any;
      const sheenColor = anyMaterial.sheenColor;
      const hasSheenColor = Boolean(sheenColor?.isColor && (finiteNumber(sheenColor.r) > 0 || finiteNumber(sheenColor.g) > 0 || finiteNumber(sheenColor.b) > 0));
      materialUniforms.push({
        material: material.name || material.type,
        clearcoatFactor: finiteNumber(anyMaterial.clearcoat),
        clearcoatRoughnessFactor: finiteNumber(anyMaterial.clearcoatRoughness),
        sheenColorFactor: sheenColor?.isColor ? [finiteNumber(sheenColor.r), finiteNumber(sheenColor.g), finiteNumber(sheenColor.b)] : [0, 0, 0],
        sheenRoughnessFactor: hasSheenColor ? finiteNumber(anyMaterial.sheenRoughness) : 0,
        transmissionFactor: finiteNumber(anyMaterial.transmission),
        blend: material.transparent === true
      });
    }
  });
  return summarizeMaterialUniforms(materialUniforms);
}

function summarizeMaterialUniforms(materialUniforms: readonly MaterialExtensionUniformEvidence[]): MaterialExtensionStats {
  return {
    clearcoatMaterials: materialUniforms.filter((material) => material.clearcoatFactor > 0).length,
    sheenMaterials: materialUniforms.filter((material) => Math.max(...material.sheenColorFactor) > 0 || material.sheenRoughnessFactor > 0).length,
    transmissionMaterials: materialUniforms.filter((material) => material.transmissionFactor > 0).length,
    transparentMaterials: materialUniforms.filter((material) => material.blend).length,
    materialUniforms
  };
}

function countThreeMeshes(root: THREE.Object3D): number {
  let meshCount = 0;
  root.traverse((object) => {
    if ((object as THREE.Mesh).isMesh) meshCount += 1;
  });
  return meshCount;
}

function numberParameter(material: Material, name: string): number {
  const value = material.getParameter(name);
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function vec3Parameter(material: Material, name: string): readonly [number, number, number] {
  const value = material.getParameter(name);
  if (Array.isArray(value) && value.length >= 3) return [finiteNumber(value[0]), finiteNumber(value[1]), finiteNumber(value[2])];
  if (ArrayBuffer.isView(value) && value.length >= 3) return [finiteNumber(value[0]), finiteNumber(value[1]), finiteNumber(value[2])];
  return [0, 0, 0];
}

function createMaterialExtensionsFixtureDataUrl(): string {
  const positions = floatBytes([-0.42, -0.36, 0, 0.42, -0.36, 0, 0.42, 0.36, 0, -0.42, 0.36, 0]);
  const normals = floatBytes([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]);
  const indices = uint16Bytes([0, 1, 2, 0, 2, 3]);
  const binary = concatAligned([positions, normals, indices], 4);
  const gltf = {
    asset: { version: "2.0", generator: "Galileo3D V9 loader material extensions parity fixture" },
    extensionsUsed: FIXTURE.extensions,
    extensionsRequired: FIXTURE.extensions,
    buffers: [{ uri: `data:application/octet-stream;base64,${base64(binary.buffer)}`, byteLength: binary.buffer.byteLength }],
    bufferViews: [
      { buffer: 0, byteOffset: binary.offsets[0], byteLength: positions.byteLength },
      { buffer: 0, byteOffset: binary.offsets[1], byteLength: normals.byteLength },
      { buffer: 0, byteOffset: binary.offsets[2], byteLength: indices.byteLength }
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 4, type: "VEC3", min: [-0.42, -0.36, 0], max: [0.42, 0.36, 0] },
      { bufferView: 1, componentType: 5126, count: 4, type: "VEC3" },
      { bufferView: 2, componentType: 5123, count: 6, type: "SCALAR" }
    ],
    materials: [
      {
        name: "clearcoat-panel",
        doubleSided: true,
        pbrMetallicRoughness: { baseColorFactor: [0.86, 0.12, 0.08, 1], roughnessFactor: 0.22, metallicFactor: 0.22 },
        extensions: { KHR_materials_clearcoat: { clearcoatFactor: 0.9, clearcoatRoughnessFactor: 0.12 } }
      },
      {
        name: "sheen-panel",
        doubleSided: true,
        pbrMetallicRoughness: { baseColorFactor: [0.38, 0.22, 0.86, 1], roughnessFactor: 0.72, metallicFactor: 0 },
        extensions: { KHR_materials_sheen: { sheenColorFactor: [0.82, 0.62, 1], sheenRoughnessFactor: 0.28 } }
      },
      {
        name: "transmission-panel",
        doubleSided: true,
        alphaMode: "BLEND",
        pbrMetallicRoughness: { baseColorFactor: [0.62, 0.92, 1, 0.56], roughnessFactor: 0.08, metallicFactor: 0 },
        extensions: { KHR_materials_transmission: { transmissionFactor: 0.82 } }
      }
    ],
    meshes: [0, 1, 2].map((material) => ({ primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material }] })),
    nodes: [
      { name: "clearcoat-panel-node", mesh: 0, translation: [-1.08, 0, 0] },
      { name: "sheen-panel-node", mesh: 1, translation: [0, 0, 0] },
      { name: "transmission-panel-node", mesh: 2, translation: [1.08, 0, 0] }
    ],
    scenes: [{ name: "v9-loader-material-extensions-scene", nodes: [0, 1, 2] }],
    scene: 0
  };
  return `data:model/gltf+json;base64,${base64(new TextEncoder().encode(JSON.stringify(gltf)))}`;
}

function floatBytes(values: readonly number[]): Uint8Array {
  return new Uint8Array(new Float32Array(values).buffer);
}

function uint16Bytes(values: readonly number[]): Uint8Array {
  return new Uint8Array(new Uint16Array(values).buffer);
}

function concatAligned(parts: readonly Uint8Array[], alignment: number): { readonly buffer: Uint8Array; readonly offsets: readonly number[] } {
  const offsets: number[] = [];
  let cursor = 0;
  for (const part of parts) {
    cursor = Math.ceil(cursor / alignment) * alignment;
    offsets.push(cursor);
    cursor += part.byteLength;
  }
  const buffer = new Uint8Array(cursor);
  parts.forEach((part, index) => buffer.set(part, offsets[index] ?? 0));
  return { buffer, offsets };
}

function base64(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function requiredCanvas(id: string, width: number, height: number): HTMLCanvasElement {
  const canvas = document.getElementById(id);
  if (!(canvas instanceof HTMLCanvasElement)) throw new Error(`Missing canvas #${id}`);
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

async function dataUrlToPixels(dataUrl: string): Promise<ImageData> {
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Unable to read image pixels.");
  context.drawImage(image, 0, 0);
  return context.getImageData(0, 0, canvas.width, canvas.height);
}

function analyzeImageData(image: ImageData): PixelStats {
  let nonBlackPixels = 0;
  let lumaSum = 0;
  let minLuma = 255;
  let maxLuma = 0;
  const buckets = new Set<string>();
  for (let offset = 0; offset < image.data.length; offset += 4) {
    const r = image.data[offset]!;
    const g = image.data[offset + 1]!;
    const b = image.data[offset + 2]!;
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    lumaSum += luma;
    minLuma = Math.min(minLuma, luma);
    maxLuma = Math.max(maxLuma, luma);
    if (r + g + b > 24) nonBlackPixels += 1;
    buckets.add(`${r >> 4}:${g >> 4}:${b >> 4}`);
  }
  const pixels = image.width * image.height;
  return { nonBlackPixels, uniqueColorBuckets: buckets.size, averageLuma: round(lumaSum / pixels), localContrast: round(maxLuma - minLuma) };
}

function computeDiff(a: ImageData, b: ImageData): DiffStats {
  if (a.width !== b.width || a.height !== b.height) throw new Error("Cannot diff images with different dimensions.");
  let total = 0;
  let maxDelta = 0;
  let changedPixels = 0;
  for (let offset = 0; offset < a.data.length; offset += 4) {
    const delta = (Math.abs(a.data[offset]! - b.data[offset]!) + Math.abs(a.data[offset + 1]! - b.data[offset + 1]!) + Math.abs(a.data[offset + 2]! - b.data[offset + 2]!)) / 3;
    total += delta;
    maxDelta = Math.max(maxDelta, delta);
    if (delta > 22) changedPixels += 1;
  }
  const meanDelta = total / (a.width * a.height);
  return { meanDelta: round(meanDelta), maxDelta: round(maxDelta), changedPixels, structuralSimilarityProxy: round(Math.max(0, 1 - meanDelta / 255)) };
}

async function drawSideBySide(canvas: HTMLCanvasElement, g3dDataUrl: string, threeDataUrl: string, diff: DiffStats): Promise<string> {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Unable to draw side-by-side loader material extension comparison.");
  const [g3d, three] = await Promise.all([loadImage(g3dDataUrl), loadImage(threeDataUrl)]);
  context.fillStyle = "#f2f3f5";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(g3d, 0, 0);
  context.drawImage(three, FIXTURE.width, 0);
  context.fillStyle = "#15171c";
  context.font = "16px sans-serif";
  context.fillText("G3D GLTFLoader + PBR uniforms", 18, FIXTURE.height + 28);
  context.fillText("Three.js GLTFLoader + MeshPhysicalMaterial", FIXTURE.width + 18, FIXTURE.height + 28);
  context.fillStyle = "#46515f";
  context.font = "12px sans-serif";
  context.fillText(`mean delta ${diff.meanDelta}, similarity proxy ${diff.structuralSimilarityProxy}`, 18, FIXTURE.height + 48);
  return canvas.toDataURL("image/png");
}

async function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  return image;
}

function stripDataUrls(result: LoaderMaterialExtensionsParityReady): Omit<LoaderMaterialExtensionsParityReady, "dataUrls"> {
  const { dataUrls: _dataUrls, ...rest } = result;
  return rest;
}

function finiteNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function round(value: number): number {
  return Number(value.toFixed(3));
}
