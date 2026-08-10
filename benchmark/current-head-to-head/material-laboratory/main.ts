import { loadProductionGLTFRenderPipeline } from "@aura3d/assets";
import { A3DRenderer, DirectionalLight } from "@aura3d/engine/advanced-runtime";
import { loadHdrEnvironment } from "@aura3d/engine/production-runtime";
import { PBRMaterial, computePerspectiveCameraFrame, type CollectedLight, type RenderSource } from "@aura3d/rendering";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";

type MaterialMode = "satin" | "chrome" | "gold" | "rubber" | "clearcoat" | "emissive";

const ASSET = { id: "showcaseHeadphones", url: "/aura-assets/showcaseHeadphones.40b1fdf7.glb", sha256: "40b1fdf7e0afdf0e5f950040f42608d3655561e61f32b9ad59690476abb15833", bytes: 1_589_596 } as const;
const ENVIRONMENT = { id: "studio-small-08", url: "/fixtures/environment-corpus/hdri/studio_small_08_1k.hdr", intensity: 1, rotation: 0 } as const;
const VIEWPORT = { width: 1440, height: 900, dpr: 1 } as const;
const FRAME = { paddingRatio: 0.14, fovYRadians: 45 * Math.PI / 180, yawRadians: -0.34, pitchRadians: -0.12, nearPadding: 0.1, farPadding: 2.2 } as const;
const MODES = ["satin", "chrome", "gold", "rubber", "clearcoat", "emissive"] as const;

declare global {
  interface Window {
    __AURA_THREE_HEAD_TO_HEAD_MATERIAL_LAB__?: any;
    __AURA_THREE_HEAD_TO_HEAD_MATERIAL_LAB_ERROR__?: string;
    __AURA_THREE_HEAD_TO_HEAD_MATERIAL_LAB_DISPOSE__?: () => unknown;
  }
}

const state: Record<string, any> = {
  ready: false,
  workload: "same-asset-material-laboratory",
  asset: ASSET,
  viewport: VIEWPORT,
  contract: { frame: FRAME, modes: MODES, background: [5, 7, 11, 255], environment: ENVIRONMENT, toneMapping: { operator: "aces", exposure: 1, outputSpace: "srgb" } },
  selectedMode: "satin",
  modes: {},
  lifecycle: null,
  claimBoundary: "Exact frozen product, viewport, frame, and selected material parameters against current Three.js r185. This is a bounded six-state comparison, not pixel, PBR, HDR/IBL, draw-call, performance, or ecosystem parity."
};
const publish = () => { window.__AURA_THREE_HEAD_TO_HEAD_MATERIAL_LAB__ = structuredClone(state); };
publish();
void run().catch((error) => { window.__AURA_THREE_HEAD_TO_HEAD_MATERIAL_LAB_ERROR__ = error instanceof Error ? error.stack ?? error.message : String(error); });

async function run(): Promise<void> {
  const auraCanvas = requiredCanvas("aura");
  const threeCanvas = requiredCanvas("three");
  const pipeline = await loadProductionGLTFRenderPipeline({
    url: ASSET.url,
    assetId: ASSET.id,
    assetName: "Aura3D Headphones Material Laboratory",
    width: VIEWPORT.width,
    height: VIEWPORT.height,
    rendererInput: { qualityPreset: "studio-preview", cameraPolicy: "require", frame: FRAME, postprocess: false, frustumCulling: false }
  });
  const auraRenderer = await A3DRenderer.create({ canvas: auraCanvas, width: VIEWPORT.width, height: VIEWPORT.height, backend: "webgl2", preserveDrawingBuffer: true, antialias: true, clearColor: [5 / 255, 7 / 255, 11 / 255, 1] });
  const auraMaterials = new Map(MODES.map((mode) => [mode, auraMaterial(mode)] as const));
  const auraEnvironment = await loadHdrEnvironment({ ...ENVIRONMENT, label: "Shared neutral studio", toneMapping: { operator: "aces", exposure: 1 } });
  const auraKeySource = new DirectionalLight("shared-key");
  auraKeySource.color = linearRgb(0xfff4e6);
  auraKeySource.intensity = 2.6;
  const auraKey: CollectedLight = {
    kind: "directional",
    color: auraKeySource.color,
    intensity: auraKeySource.intensity,
    position: [8, 14, 10],
    direction: normalize3([-8, -14, -10]),
    right: [1, 0, 0],
    up: [0, 1, 0],
    range: 0,
    width: 0,
    height: 0,
    spotAngle: 0,
    penumbra: 0,
    castsShadow: false,
    layerMask: 0xffffffff,
    source: auraKeySource
  };
  const baseInput = pipeline.resources.toRendererInput(VIEWPORT, {
    qualityPreset: "hdr-studio-preview",
    cameraPolicy: "require",
    frame: FRAME,
    environmentLighting: { ...auraEnvironment.environmentLighting, color: [1, 1, 1], intensity: 0.35 },
    collectedLights: [auraKey],
    postprocess: { toneMapping: { operator: "aces", exposure: 1, inputColorSpace: "linear", outputColorSpace: "srgb" } },
    frustumCulling: false
  });

  const threeRenderer = new THREE.WebGLRenderer({ canvas: threeCanvas, antialias: true, preserveDrawingBuffer: true });
  threeRenderer.setPixelRatio(1);
  threeRenderer.setSize(VIEWPORT.width, VIEWPORT.height, false);
  threeRenderer.setClearColor(0x05070b, 1);
  threeRenderer.outputColorSpace = THREE.SRGBColorSpace;
  threeRenderer.toneMapping = THREE.ACESFilmicToneMapping;
  threeRenderer.toneMappingExposure = 1;
  const pmrem = new THREE.PMREMGenerator(threeRenderer);
  const threeHdr = await new RGBELoader().loadAsync(ENVIRONMENT.url);
  threeHdr.mapping = THREE.EquirectangularReflectionMapping;
  const environmentTarget = pmrem.fromEquirectangular(threeHdr);
  const gltf = await new GLTFLoader().loadAsync(ASSET.url);
  const threeScene = new THREE.Scene();
  threeScene.background = new THREE.Color(0x05070b);
  threeScene.environment = environmentTarget.texture;
  threeScene.environmentIntensity = 1;
  threeScene.add(gltf.scene, new THREE.AmbientLight(0xffffff, 0.35));
  const key = new THREE.DirectionalLight(0xfff4e6, 2.6);
  key.position.set(8, 14, 10);
  threeScene.add(key);
  const bounds = new THREE.Box3().setFromObject(gltf.scene);
  const frame = computePerspectiveCameraFrame({ min: [bounds.min.x, bounds.min.y, bounds.min.z], max: [bounds.max.x, bounds.max.y, bounds.max.z] }, VIEWPORT, FRAME);
  const threeCamera = new THREE.PerspectiveCamera(frame.fovYRadians * 180 / Math.PI, frame.aspect, frame.near, frame.far);
  threeCamera.position.set(...frame.cameraPosition);
  threeCamera.lookAt(...frame.center);
  threeCamera.updateProjectionMatrix();
  const originalThreeMaterials = new Set<THREE.Material>();
  gltf.scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    for (const entry of Array.isArray(object.material) ? object.material : [object.material]) originalThreeMaterials.add(entry);
  });
  const threeMaterials = new Map(MODES.map((mode) => [mode, threeMaterial(mode)] as const));

  const renderMode = async (mode: MaterialMode, retainCapture: boolean) => {
    const auraMaterialForMode = auraMaterials.get(mode)!;
    const source = baseInput.source as RenderSource;
    const materialLibrary = new Map([...pipeline.resources.materialLibrary.keys()].map((key) => [key, auraMaterialForMode] as const));
    if (materialLibrary.size === 0) throw new Error("Frozen product pipeline produced no material bindings.");
    const auraDiagnostics = auraRenderer.render({ ...source, materialLibrary, postprocess: false }, baseInput.camera);

    const threeMaterialForMode = threeMaterials.get(mode)!;
    gltf.scene.traverse((object) => { if (object instanceof THREE.Mesh) object.material = threeMaterialForMode; });
    threeRenderer.info.reset();
    threeRenderer.render(threeScene, threeCamera);
    await nextFrame();
    const auraPixels = auraRenderer.device.readPixels(0, 0, VIEWPORT.width, VIEWPORT.height);
    const threePixels = readThree(threeRenderer);
    const entry = {
      mode,
      aura: { publicPackageOnly: true, drawCalls: auraDiagnostics.drawCalls, pixelStats: pixelStats(auraPixels), hash: pixelHash(auraPixels) },
      three: { revision: THREE.REVISION, actualRenderer: threeRenderer instanceof THREE.WebGLRenderer, actualGLTFLoader: true, actualPhysicalMaterial: threeMaterialForMode instanceof THREE.MeshPhysicalMaterial, drawCalls: threeRenderer.info.render.calls, triangles: threeRenderer.info.render.triangles, pixelStats: pixelStats(threePixels), hash: pixelHash(threePixels) },
      material: materialContract(mode),
      ...(retainCapture ? { dataUrls: { aura: auraCanvas.toDataURL("image/png"), three: threeCanvas.toDataURL("image/png") } } : {})
    };
    state.selectedMode = mode;
    state.modes[mode] = entry;
    publish();
    return entry;
  };

  for (const mode of MODES) await renderMode(mode, true);
  await renderMode("satin", true);
  state.ready = true;
  publish();

  document.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      const mode = button.dataset.mode as MaterialMode;
      document.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((candidate) => candidate.setAttribute("aria-pressed", String(candidate === button)));
      void renderMode(mode, true);
    });
  });

  window.__AURA_THREE_HEAD_TO_HEAD_MATERIAL_LAB_DISPOSE__ = () => {
    for (const material of auraMaterials.values()) material.dispose();
    for (const material of threeMaterials.values()) material.dispose();
    for (const material of originalThreeMaterials) material.dispose();
    gltf.scene.traverse((object) => { if (object instanceof THREE.Mesh) object.geometry.dispose(); });
    pipeline.resources.dispose();
    auraEnvironment.dispose();
    auraRenderer.dispose();
    threeHdr.dispose();
    environmentTarget.dispose();
    pmrem.dispose();
    threeRenderer.dispose();
    state.lifecycle = { auraMaterialsDisposed: [...auraMaterials.values()].every((material) => material.disposed), auraPipelineDisposed: true, auraEnvironmentDisposed: true, auraRendererDisposed: auraRenderer.device.disposed, threeMaterialsDisposed: true, threeGeometryDisposed: true, threeEnvironmentDisposed: true, threeRendererDisposed: true };
    publish();
    return state.lifecycle;
  };
}

function auraMaterial(mode: MaterialMode): PBRMaterial {
  const spec = materialContract(mode);
  return new PBRMaterial({
    name: `same-asset-${mode}`,
    baseColor: [...linearRgb(spec.color), 1],
    metallic: spec.metallic,
    roughness: spec.roughness,
    clearcoatFactor: spec.clearcoat,
    clearcoatRoughnessFactor: spec.clearcoatRoughness,
    emissiveColor: linearRgb(spec.emissive),
    emissiveStrength: spec.emissiveStrength
  });
}

function threeMaterial(mode: MaterialMode): THREE.MeshPhysicalMaterial {
  const spec = materialContract(mode);
  return new THREE.MeshPhysicalMaterial({ color: spec.color, metalness: spec.metallic, roughness: spec.roughness, clearcoat: spec.clearcoat, clearcoatRoughness: spec.clearcoatRoughness, emissive: spec.emissive, emissiveIntensity: spec.emissiveStrength });
}

function materialContract(mode: MaterialMode) {
  const contracts = {
    satin: { color: 0x3f86d9, metallic: 0, roughness: 0.56, clearcoat: 0, clearcoatRoughness: 0, emissive: 0x000000, emissiveStrength: 0 },
    chrome: { color: 0xe8edf2, metallic: 1, roughness: 0.1, clearcoat: 0, clearcoatRoughness: 0, emissive: 0x000000, emissiveStrength: 0 },
    gold: { color: 0xd9a441, metallic: 1, roughness: 0.34, clearcoat: 0, clearcoatRoughness: 0, emissive: 0x000000, emissiveStrength: 0 },
    rubber: { color: 0x242b31, metallic: 0, roughness: 0.94, clearcoat: 0, clearcoatRoughness: 0, emissive: 0x000000, emissiveStrength: 0 },
    clearcoat: { color: 0xa32336, metallic: 0.08, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.07, emissive: 0x000000, emissiveStrength: 0 },
    emissive: { color: 0x123844, metallic: 0, roughness: 0.45, clearcoat: 0, clearcoatRoughness: 0, emissive: 0x20e0c0, emissiveStrength: 1.6 }
  } as const;
  return contracts[mode];
}

function requiredCanvas(id: string): HTMLCanvasElement { const value = document.getElementById(id); if (!(value instanceof HTMLCanvasElement)) throw new Error(`Missing ${id} canvas.`); return value; }
function nextFrame(): Promise<void> { return new Promise((resolve) => requestAnimationFrame(() => resolve())); }
function readThree(renderer: THREE.WebGLRenderer): Uint8Array { const gl = renderer.getContext(); const pixels = new Uint8Array(VIEWPORT.width * VIEWPORT.height * 4); gl.readPixels(0, 0, VIEWPORT.width, VIEWPORT.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels); return pixels; }
function pixelHash(pixels: Uint8Array): string { let hash = 2166136261; for (let index = 0; index < pixels.length; index += 97) { hash ^= pixels[index]!; hash = Math.imul(hash, 16777619); } return (hash >>> 0).toString(16).padStart(8, "0"); }
function pixelStats(pixels: Uint8Array) {
  let sum = 0;
  let subjectSum = 0;
  const subjectLuma: number[] = [];
  const buckets = new Set<number>();
  for (let index = 0; index < pixels.length; index += 4) {
    const luma = pixels[index]! * 0.2126 + pixels[index + 1]! * 0.7152 + pixels[index + 2]! * 0.0722;
    sum += luma;
    if (luma > 12) {
      subjectLuma.push(luma);
      subjectSum += luma;
    }
    buckets.add(((pixels[index]! >> 4) << 8) | ((pixels[index + 1]! >> 4) << 4) | (pixels[index + 2]! >> 4));
  }
  subjectLuma.sort((a, b) => a - b);
  const percentile = (fraction: number) => subjectLuma[Math.min(subjectLuma.length - 1, Math.floor(subjectLuma.length * fraction))] ?? 0;
  return {
    litPixels: subjectLuma.length,
    meanLuma: Number((sum / (pixels.length / 4)).toFixed(3)),
    subjectMeanLuma: Number((subjectSum / Math.max(subjectLuma.length, 1)).toFixed(3)),
    p10Luma: Number(percentile(0.1).toFixed(3)),
    p50Luma: Number(percentile(0.5).toFixed(3)),
    p90Luma: Number(percentile(0.9).toFixed(3)),
    p99Luma: Number(percentile(0.99).toFixed(3)),
    highlightRange: Number((percentile(0.99) - percentile(0.5)).toFixed(3)),
    uniqueColorBuckets: buckets.size
  };
}
function linearRgb(hex: number): [number, number, number] { return [16, 8, 0].map((shift) => { const value = ((hex >> shift) & 0xff) / 255; return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4; }) as [number, number, number]; }
function normalize3(value: readonly [number, number, number]): [number, number, number] { const length = Math.hypot(...value); return [value[0] / length, value[1] / length, value[2] / length]; }

export {};
