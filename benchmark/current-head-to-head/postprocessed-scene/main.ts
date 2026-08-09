import { loadProductionGLTFRenderPipeline } from "@aura3d/assets";
import { A3DRenderer } from "@aura3d/engine/advanced-runtime";
import { computePerspectiveCameraFrame, type RendererPostProcessOptions, type RenderSource } from "@aura3d/rendering";
import * as THREE from "three";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { KTX2Loader } from "three/addons/loaders/KTX2Loader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

const ASSET = { id: "showcaseHeadphones", url: "/aura-assets/showcaseHeadphones.40b1fdf7.glb", sha256: "40b1fdf7e0afdf0e5f950040f42608d3655561e61f32b9ad59690476abb15833", bytes: 1_589_596 } as const;
const VIEWPORT = { width: 1440, height: 900, dpr: 1 } as const;
const FRAME = { paddingRatio: 0.14, fovYRadians: 45 * Math.PI / 180, yawRadians: -0.34, pitchRadians: -0.12, nearPadding: 0.1, farPadding: 2.2 } as const;
const BLOOM = { threshold: 0.12, intensity: 0.8, radius: 16, threeStrength: 0.04, threeRadius: 0 } as const;
const EMISSIVE = { color: [0.02, 0.08, 0.4] as const, strength: 4 } as const;
const TONE_MAPPING = { exposure: 1, gamma: 1, operator: "aces", inputColorSpace: "linear", outputColorSpace: "srgb" } as const;
const SAMPLE_CONTRACT = { warmups: 3, samples: 11, cache: "warm-same-session" } as const;

declare global { interface Window { __AURA_THREE_HEAD_TO_HEAD_POSTPROCESS__?: any; __AURA_THREE_HEAD_TO_HEAD_POSTPROCESS_ERROR__?: string } }

const state: Record<string, any> = { ready: false, stage: "boot", workload: "postprocessed-scene", asset: ASSET, viewport: VIEWPORT, contract: { frame: FRAME, bloom: BLOOM, emissive: EMISSIVE, toneMapping: TONE_MAPPING, sampling: SAMPLE_CONTRACT }, baseline: null, enabled: null, lifecycle: null };
const publish = () => { state.ready = Boolean(state.baseline); window.__AURA_THREE_HEAD_TO_HEAD_POSTPROCESS__ = structuredClone(state); };
const mark = (stage: string) => { state.stage = stage; publish(); };
publish();
void run().catch((error) => { window.__AURA_THREE_HEAD_TO_HEAD_POSTPROCESS_ERROR__ = error instanceof Error ? error.stack ?? error.message : String(error); });

async function run(): Promise<void> {
  mark("loading-aura-product");
  const auraCanvas = requiredCanvas("aura");
  const threeCanvas = requiredCanvas("three");
  const pipeline = await loadProductionGLTFRenderPipeline({
    url: ASSET.url,
    assetId: ASSET.id,
    assetName: "Aura3D Headphones",
    width: VIEWPORT.width,
    height: VIEWPORT.height,
    rendererInput: { qualityPreset: "studio-preview", cameraPolicy: "require", frame: FRAME, postprocess: false, frustumCulling: false }
  });
  for (const target of pipeline.resources.collectMaterialOverrideTargets()) {
    target.material.setParameter("u_emissiveTextureEnabled", 0);
    target.material.setParameter("u_emissiveColor", EMISSIVE.color);
    target.material.setParameter("u_emissiveStrength", EMISSIVE.strength);
  }
  mark("creating-aura-renderer");
  const auraRenderer = await A3DRenderer.create({ canvas: auraCanvas, width: VIEWPORT.width, height: VIEWPORT.height, backend: "webgl2", preserveDrawingBuffer: true, antialias: true, clearColor: [0.018, 0.024, 0.04, 1] });
  const auraInput = pipeline.resources.toRendererInput(VIEWPORT, { qualityPreset: "studio-preview", cameraPolicy: "require", frame: FRAME, postprocess: false, frustumCulling: false });

  mark("loading-three-product");
  const threeRenderer = new THREE.WebGLRenderer({ canvas: threeCanvas, antialias: true, preserveDrawingBuffer: true });
  threeRenderer.setPixelRatio(VIEWPORT.dpr);
  threeRenderer.setSize(VIEWPORT.width, VIEWPORT.height, false);
  threeRenderer.outputColorSpace = THREE.SRGBColorSpace;
  threeRenderer.toneMapping = THREE.ACESFilmicToneMapping;
  threeRenderer.toneMappingExposure = TONE_MAPPING.exposure;
  const draco = new DRACOLoader().setDecoderPath("/node_modules/three/examples/jsm/libs/draco/");
  const ktx2 = new KTX2Loader().setTranscoderPath("/node_modules/three/examples/jsm/libs/basis/").detectSupport(threeRenderer);
  const loader = new GLTFLoader().setDRACOLoader(draco).setKTX2Loader(ktx2).setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync(ASSET.url);
  mark("creating-three-composer");
  const threeScene = new THREE.Scene();
  threeScene.background = new THREE.Color().setRGB(0.018, 0.024, 0.04, THREE.LinearSRGBColorSpace);
  threeScene.add(gltf.scene, new THREE.AmbientLight(0xffffff, 0.35));
  const key = new THREE.DirectionalLight(0xfff4e6, 1.4); key.position.set(8, 14, 10); threeScene.add(key);
  gltf.scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (!(material instanceof THREE.MeshStandardMaterial)) continue;
      material.emissiveMap = null;
      material.emissive.setRGB(...EMISSIVE.color, THREE.LinearSRGBColorSpace);
      material.emissiveIntensity = EMISSIVE.strength;
      material.needsUpdate = true;
    }
  });
  const box = new THREE.Box3().setFromObject(gltf.scene);
  const bounds = { min: [box.min.x, box.min.y, box.min.z] as [number, number, number], max: [box.max.x, box.max.y, box.max.z] as [number, number, number] };
  const frame = computePerspectiveCameraFrame(bounds, VIEWPORT, FRAME);
  const camera = new THREE.PerspectiveCamera(frame.fovYRadians * 180 / Math.PI, frame.aspect, frame.near, frame.far);
  camera.position.set(...frame.cameraPosition); camera.lookAt(...frame.center); camera.updateProjectionMatrix();

  const composer = new EffectComposer(threeRenderer);
  composer.setPixelRatio(VIEWPORT.dpr); composer.setSize(VIEWPORT.width, VIEWPORT.height);
  const renderPass = new RenderPass(threeScene, camera);
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(VIEWPORT.width, VIEWPORT.height), BLOOM.threeStrength, BLOOM.threeRadius, BLOOM.threshold);
  const outputPass = new OutputPass();
  composer.addPass(renderPass); composer.addPass(bloomPass); composer.addPass(outputPass);

  const auraBaseline: RendererPostProcessOptions = { toneMapping: TONE_MAPPING };
  const auraEnabled: RendererPostProcessOptions = { bloom: { threshold: BLOOM.threshold, intensity: BLOOM.intensity, radius: BLOOM.radius }, toneMapping: TONE_MAPPING };
  const auraSource = (postprocess: RendererPostProcessOptions): RenderSource => ({ ...(auraInput.source as RenderSource), postprocess });
  const renderPair = (enabled: boolean) => {
    const auraDiagnostics = auraRenderer.render(auraSource(enabled ? auraEnabled : auraBaseline), auraInput.camera);
    const auraPixels = auraRenderer.device.readPixels(0, 0, VIEWPORT.width, VIEWPORT.height);
    bloomPass.enabled = enabled; composer.render();
    const threePixels = readThree(threeRenderer);
    return {
      aura: { pixels: auraPixels, hash: pixelHash(auraPixels), diagnostics: auraDiagnostics },
      three: { pixels: threePixels, hash: pixelHash(threePixels), drawCalls: threeRenderer.info.render.calls, triangles: threeRenderer.info.render.triangles }
    };
  };

  mark("rendering-baseline");
  const baseline = renderPair(false);
  state.stage = "baseline-ready";
  state.baseline = snapshot(false, baseline);
  publish();
  document.getElementById("enable")?.addEventListener("click", () => {
    const enabled = renderPair(true);
    const auraCost = measure(() => { auraRenderer.render(auraSource(auraEnabled), auraInput.camera); auraRenderer.device.readPixels(0, 0, VIEWPORT.width, VIEWPORT.height); });
    const threeCost = measure(() => { bloomPass.enabled = true; composer.render(); readThree(threeRenderer); });
    state.enabled = snapshot(true, enabled, baseline, auraCost, threeCost);
    publish();
  });

  Object.assign(window, { __AURA_THREE_HEAD_TO_HEAD_POSTPROCESS_DISPOSE__: () => {
    pipeline.resources.dispose(); auraRenderer.dispose();
    let threeGeometryDisposed = 0; let threeMaterialDisposed = 0; let threeComposerTargetsDisposed = 0;
    gltf.scene.traverse((object) => { if (!(object instanceof THREE.Mesh)) return; object.geometry.addEventListener("dispose", () => { threeGeometryDisposed += 1; }); object.geometry.dispose(); const materials = Array.isArray(object.material) ? object.material : [object.material]; for (const material of materials) { material.addEventListener("dispose", () => { threeMaterialDisposed += 1; }); material.dispose(); } });
    composer.renderTarget1.addEventListener("dispose", () => { threeComposerTargetsDisposed += 1; });
    composer.renderTarget2.addEventListener("dispose", () => { threeComposerTargetsDisposed += 1; });
    composer.dispose(); draco.dispose(); ktx2.dispose(); threeRenderer.dispose();
    state.lifecycle = { auraRendererDeviceDisposed: auraRenderer.device.disposed, threeGeometryDisposed: threeGeometryDisposed > 0, threeMaterialDisposed: threeMaterialDisposed > 0, threeComposerTargetsDisposed: threeComposerTargetsDisposed === 2 };
    publish(); return state.lifecycle;
  } });

  function snapshot(enabled: boolean, value: ReturnType<typeof renderPair>, before?: ReturnType<typeof renderPair>, auraCost?: FrameCost, threeCost?: FrameCost) {
    return {
      enabled,
      aura: { publicPackageOnly: true, backend: auraRenderer.device.kind, drawCalls: value.aura.diagnostics.drawCalls, hash: value.aura.hash, backgroundPixel: Array.from(value.aura.pixels.slice(0, 4)), postprocessPasses: value.aura.diagnostics.postprocessPasses, passNames: value.aura.diagnostics.postprocessPassNames, executionMode: value.aura.diagnostics.postprocessPlan.executionMode, renderTargets: value.aura.diagnostics.postprocessRenderTargets, metadata: pipeline.metadata, frameCost: auraCost },
      three: { revision: THREE.REVISION, actualRenderer: threeRenderer instanceof THREE.WebGLRenderer, actualEffectComposer: composer instanceof EffectComposer, actualRenderPass: renderPass instanceof RenderPass, actualUnrealBloomPass: bloomPass instanceof UnrealBloomPass, actualOutputPass: outputPass instanceof OutputPass, drawCalls: value.three.drawCalls, triangles: value.three.triangles, hash: value.three.hash, backgroundPixel: Array.from(value.three.pixels.slice(0, 4)), enabledPasses: composer.passes.filter((pass) => pass.enabled).map((pass) => pass.constructor.name), renderTargets: 3 + bloomPass.renderTargetsHorizontal.length + bloomPass.renderTargetsVertical.length, frameCost: threeCost },
      delta: before ? { aura: comparePixels(before.aura.pixels, value.aura.pixels), three: comparePixels(before.three.pixels, value.three.pixels) } : null
    };
  }
}

interface FrameCost { readonly samples: number; readonly medianMs: number; readonly p95Ms: number }
function measure(render: () => void): FrameCost { for (let index = 0; index < SAMPLE_CONTRACT.warmups; index += 1) render(); const values: number[] = []; for (let index = 0; index < SAMPLE_CONTRACT.samples; index += 1) { const started = performance.now(); render(); values.push(performance.now() - started); } values.sort((a, b) => a - b); return { samples: values.length, medianMs: round(values[Math.floor(values.length / 2)] ?? 0), p95Ms: round(values[Math.floor(values.length * 0.95)] ?? 0) }; }
function comparePixels(before: Uint8Array, after: Uint8Array) { let changedPixels = 0; let delta = 0; for (let index = 0; index < before.length; index += 4) { const pixelDelta = Math.abs(before[index]! - after[index]!) + Math.abs(before[index + 1]! - after[index + 1]!) + Math.abs(before[index + 2]! - after[index + 2]!); if (pixelDelta > 6) changedPixels += 1; delta += pixelDelta / 3; } return { changedPixels, meanRgbDelta: round(delta / (before.length / 4)) }; }
function requiredCanvas(id: string): HTMLCanvasElement { const element = document.getElementById(id); if (!(element instanceof HTMLCanvasElement)) throw new Error(`Missing canvas #${id}.`); return element; }
function readThree(renderer: THREE.WebGLRenderer): Uint8Array { const gl = renderer.getContext(); const pixels = new Uint8Array(VIEWPORT.width * VIEWPORT.height * 4); gl.readPixels(0, 0, VIEWPORT.width, VIEWPORT.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels); return pixels; }
function pixelHash(pixels: Uint8Array): string { let value = 2166136261; for (let index = 0; index < pixels.length; index += 97) { value ^= pixels[index]!; value = Math.imul(value, 16777619); } return (value >>> 0).toString(16).padStart(8, "0"); }
function round(value: number): number { return Number(value.toFixed(4)); }
