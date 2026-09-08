import { captureWaterPair301 } from "./muse3jsparity-301-water-pair";
import { mountParticles, mountThree } from "./muse3jsparity-301-engine-perf-harness";
import { createSdfFontAtlas, layoutSdfText, rasterizeSdfTextLabelImage, createSdfTextQuadMesh } from "@aura3d/rendering";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { assets } from "../../src/aura-assets";
import { VISUAL_SETTINGS_301 as SETTINGS, captureSettings301, type VisualCapture301 } from "./muse3jsparity-301-visual-cases";
import type { VisualFamily } from "../../tools/muse3jsparity-readiness/visual-acceptance";
import * as THREE from "three";
import { camera, createAuraApp, instances, material, scene, model, primitives, lights, effects, decals, text3D } from "@aura3d/engine";

/**
 * PART K1 fresh same-scene head-to-head (muse3jsparity-PRD task 1, lane 1).
 *
 * A NEW capture, not a copy of the D1 shootout: 96 emissive boxes on a
 * deterministic 12 x 4 x 2 grid, identical placement/math both sides, same
 * background, same camera framing, same canvas size. Aura renders through
 * the root `createAuraApp` path only; the opponent is the repository-locked
 * `three@0.185.1` `WebGLRenderer`. No similarity claim is made (different
 * renderers shade differently by construction); the receipt records both
 * captures plus the disclosed per-pixel delta.
 */

const INSTANCE_COUNT = 96;
const COLS = 12;
const ROWS = 4;
const LAYERS = 2;
const SPACING = 0.62;
const BOX_SIZE = 0.44;
const BOX_COLOR = "#e08a3c";
const BACKGROUND = "#0d1520";
const CAMERA_POSITION: readonly [number, number, number] = [0, 2.6, 8.0];
const CAMERA_TARGET: readonly [number, number, number] = [0, 0.8, 0];

interface HeadToHeadPixels {
  readonly nonDarkPixels: number;
  readonly foregroundPixels: number;
  readonly checksum: number;
}

interface GameVisualSuperiorityResult {
  readonly status: "ready" | "error" | "waiting";
  readonly threeRevision?: string;
  readonly instanceCount?: number;
  readonly aura?: {
    readonly errors: readonly string[];
    readonly pixels: HeadToHeadPixels;
  };
  readonly three?: {
    readonly calls: number;
    readonly triangles: number;
    readonly pixels: HeadToHeadPixels;
  };
  readonly error?: string;
}

declare global {
  interface Window {
    __AURA3D_GAME_VISUAL_SUPERIORITY__?: GameVisualSuperiorityResult;
  }
}

window.__AURA3D_GAME_VISUAL_SUPERIORITY__ = { status: "waiting" };

function gridPosition(index: number): readonly [number, number, number] {
  const col = index % COLS;
  const row = Math.floor(index / COLS) % ROWS;
  const layer = Math.floor(index / (COLS * ROWS));
  return [
    (col - (COLS - 1) / 2) * SPACING,
    0.3 + row * SPACING,
    (layer - (LAYERS - 1) / 2) * SPACING,
  ];
}

function waitForFrames(count: number): Promise<void> {
  return new Promise((resolve) => {
    const step = (remaining: number): void => {
      if (remaining <= 0) {
        resolve();
        return;
      }
      requestAnimationFrame(() => step(remaining - 1));
    };
    step(count);
  });
}

async function analyzePixels(dataUrl: string): Promise<HeadToHeadPixels> {
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("2d pixel analysis context is unavailable.");
  context.drawImage(image, 0, 0);
  const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
  let nonDark = 0;
  let foreground = 0;
  let hash = 0x811c9dc5;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    if (r + g + b > 24) nonDark += 1;
    // Background is #0d1520 (13, 21, 32): boxes must stand far clear of it.
    if (Math.abs(r - 13) + Math.abs(g - 21) + Math.abs(b - 32) > 60) foreground += 1;
    hash ^= data[i]!;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return { nonDarkPixels: nonDark, foregroundPixels: foreground, checksum: hash >>> 0 };
}

if (!new URL(location.href).searchParams.has('matrix301')) void runHeadToHead().catch((error: unknown) => {
  window.__AURA3D_GAME_VISUAL_SUPERIORITY__ = {
    status: "error",
    error: error instanceof Error ? (error.stack ?? error.message) : String(error),
  };
});

async function runHeadToHead(): Promise<void> {
  const auraCanvas = document.querySelector<HTMLCanvasElement>("#aura");
  const threeCanvas = document.querySelector<HTMLCanvasElement>("#three");
  if (!auraCanvas || !threeCanvas) throw new Error("Head-to-head canvases are missing.");

  const app = createAuraApp(auraCanvas, {
    scene: scene()
      .background(BACKGROUND)
      .add(
        instances.box({
          name: "k1 head-to-head instanced boxes",
          transforms: Array.from({ length: INSTANCE_COUNT }, (_, index) => {
            const [x, y, z] = gridPosition(index);
            return {
              position: [x, y, z] as [number, number, number],
              rotation: [0, 0, 0] as [number, number, number],
              scale: [BOX_SIZE, BOX_SIZE, BOX_SIZE] as [number, number, number],
            };
          }),
          material: material.emissive({
            name: "k1 head-to-head boxes",
            color: BOX_COLOR,
            emissive: BOX_COLOR,
            emissiveIntensity: 1,
          }),
        })
      )
      .camera(camera.perspective({ position: [...CAMERA_POSITION], target: [...CAMERA_TARGET], fov: 50 })),
    pixelRatio: 1,
    resize: false,
  });
  await waitForFrames(6);
  const auraDiagnostics = app.diagnostics();
  if (auraDiagnostics.errors.length > 0) throw new Error(auraDiagnostics.errors.join("\n"));
  const auraPixels = await analyzePixels(app.screenshot().dataUrl);

  const renderer = new THREE.WebGLRenderer({ canvas: threeCanvas, antialias: false, preserveDrawingBuffer: true });
  renderer.setSize(threeCanvas.width, threeCanvas.height, false);
  renderer.setPixelRatio(1);
  const threeScene = new THREE.Scene();
  threeScene.background = new THREE.Color(BACKGROUND);
  const threeCamera = new THREE.PerspectiveCamera(
    50,
    threeCanvas.width / threeCanvas.height,
    0.1,
    100
  );
  threeCamera.position.set(...CAMERA_POSITION);
  threeCamera.lookAt(...CAMERA_TARGET);

  const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  const boxMaterial = new THREE.MeshBasicMaterial({ color: BOX_COLOR });
  for (let index = 0; index < INSTANCE_COUNT; index += 1) {
    const [x, y, z] = gridPosition(index);
    const mesh = new THREE.Mesh(boxGeometry, boxMaterial);
    mesh.matrixAutoUpdate = false;
    mesh.matrix.compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion(),
      new THREE.Vector3(BOX_SIZE, BOX_SIZE, BOX_SIZE)
    );
    threeScene.add(mesh);
  }
  renderer.render(threeScene, threeCamera);
  const calls = renderer.info.render.calls;
  const triangles = renderer.info.render.triangles;
  const threePixels = await analyzePixels(threeCanvas.toDataURL("image/png"));

  // Fail-closed framing guard: the root app must not resize the canvas away
  // from the shared 600x380 geometry (a resize would break same-scene framing).
  if (auraCanvas.clientWidth !== 600 || auraCanvas.clientHeight !== 380) {
    throw new Error(
      `Aura canvas resized away from shared framing: client ${auraCanvas.clientWidth}x${auraCanvas.clientHeight}.`
    );
  }
  window.__AURA3D_GAME_VISUAL_SUPERIORITY__ = {
    status: "ready",
    threeRevision: THREE.REVISION,
    instanceCount: INSTANCE_COUNT,
    aura: { errors: [], pixels: auraPixels },
    three: { calls, triangles, pixels: threePixels },
  };
}


/** V01 captures are explicitly callable and isolated from the legacy 96-box lane. */
declare global { interface Window {
  __AURA3D_VISUAL_MATRIX_301__?: { capture: typeof captureVisual301 };
} }
window.__AURA3D_VISUAL_MATRIX_301__ = { capture: captureVisual301 };

async function captureVisual301(family: VisualFamily, engine: 'aura' | 'three', enabled: boolean, frame = 0, broken = false): Promise<VisualCapture301> {
  if (!Number.isInteger(frame) || frame < 0 || frame > 60) throw new Error('Invalid frozen sequence frame');
  if (family === 'particles') return captureParticles301(engine, enabled, frame, broken);
  if (family === 'water-reflections') return captureWaterPair301(engine, enabled, frame, broken);
  const canvas = document.createElement('canvas');
  canvas.width = SETTINGS.width; canvas.height = SETTINGS.height;
  canvas.style.cssText = `width:${SETTINGS.width}px;height:${SETTINGS.height}px;position:fixed;left:0;top:0;z-index:100`;
  document.body.append(canvas);
  const shake = camera.shake({ seed: 301, decay: 1.4, maxOffset: 0.22, maxRoll: 0 });
  if (family === 'camera-game-feel' && enabled) shake.addTrauma(1);
  for (let i = 0; i < frame; i++) shake.update(1 / 60);
  if (broken && family === 'camera-game-feel') shake.addTrauma(1);
  const offset = shake.snapshot().offset;
  const position: [number, number, number] = [offset[0], 2.9 + offset[1], 4.6 + offset[2]];
  let dispose: (() => void | Promise<void>) | undefined;
  try {
    let passes: string[] = []; let errors: string[] = [];
    if (engine === 'aura') {
      const subject = model(assets.robotcand, { name: 'V01 identical typed subject', targetMaxDimension: 2.4, castShadow: family !== 'night-lighting' || enabled }).position(0, 0, 0);
      const builder = scene().background(SETTINGS.background)
        .camera(camera.perspective({ position, target: [0, 0.55, 0], fov: 40, near: 0.1, far: 100 }))
        .add(subject)
        .add(primitives.plane({ name: 'V01 receiver', material: material.pbr({ color: '#889099', roughness: 0.85, metallic: 0 }) }).scale([10, 1, 10]))
        .add(lights.directional({ name: 'V01 shared key', position: [broken && family === 'night-lighting' ? (frame % 2 ? -2.6 : 2.6) : 2.6, 4.4, 2.2], intensity: 2.1, shadow: family === 'night-lighting' }))
        .add(primitives.box({ name: 'V01 emitter', material: material.emissive({ color: '#0b1220', emissive: '#63f5ff', emissiveIntensity: 6 }) }).position(0, 1.6, -1).scale([2.6, 0.18, 0.18]));
      if (family === 'bloom' && enabled) builder.add(effects.bloom({ ...SETTINGS.bloom, ...(broken ? { intensity: 20, threshold: 0, antiBlowout: false } : {}), quality: 'cinematic' }));
      if (family === 'decals' && enabled) builder.add(decals.project({ name: 'V01 decal', color: '#ff2a1a', size: 0.8, position: [broken ? 0.8 : 0, 0.012, 1], normal: [0, 1, 0], opacity: 0.85 }));
      if (family === 'sdf-text' && enabled) builder.add(text3D(broken ? 'A R ' : SETTINGS.sdfText.text, { backend: 'sdf', size: SETTINGS.sdfText.size, material: material.pbr({ color: '#ffffff' }) }).position(SETTINGS.sdfText.position[0], SETTINGS.sdfText.position[1], SETTINGS.sdfText.position[2]));
      const app = createAuraApp(canvas, { scene: builder, pixelRatio: 1, resize: false, autoStart: false, frameMode: 'async', renderer: { mode: 'production', fallback: 'safe-basic', qualityProfile: 'production' } });
      dispose = () => app.disposeAsync();
      for (let i = 0; i < 12; i++) await app.stepAsync(1 / 60);
      const diagnostics = app.diagnostics();
      errors = [...diagnostics.errors];
      passes = [...(diagnostics.renderer?.postprocess?.actualPasses ?? [])];
      if (!diagnostics.renderer?.runtime.mounted || diagnostics.renderer.runtime.backend !== 'production-runtime') throw new Error('V01 requires native production runtime; fallback cannot prove visual quality');
      if (errors.length || diagnostics.drawCalls === 0) throw new Error(`V01 Aura failed: ${errors.join('; ')}`);
      if (family === 'bloom' && enabled && !passes.some(pass => /bloom/i.test(pass))) throw new Error('V01 bloom was requested but not executed');
    } else {
      if (THREE.REVISION !== '185') throw new Error(`Frozen r185 required, got ${THREE.REVISION}`);
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true });
      dispose = () => renderer.dispose();
      renderer.setPixelRatio(1); renderer.setSize(SETTINGS.width, SETTINGS.height, false);
      renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      const world = new THREE.Scene(); world.background = new THREE.Color(SETTINGS.background);
      const view = new THREE.PerspectiveCamera(40, SETTINGS.width / SETTINGS.height, 0.1, 100);
      view.position.set(...position); view.lookAt(0, 0.55, 0);
      const asset = await new GLTFLoader().loadAsync(assets.robotcand.url);
      const bounds = new THREE.Box3().setFromObject(asset.scene); const size = bounds.getSize(new THREE.Vector3());
      const scale = 2.4 / Math.max(size.x, size.y, size.z);
      const center = bounds.getCenter(new THREE.Vector3());
      // Apply the Aura-equivalent fit outside the loaded hierarchy. GLTF roots
      // can carry authored scale/rotation; overwriting root.scale destroyed that
      // transform and reduced this subject to a tiny head in the paired image.
      const fittedSubject = new THREE.Group();
      fittedSubject.scale.setScalar(scale);
      fittedSubject.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
      fittedSubject.add(asset.scene);
      asset.scene.traverse(o => { if (o instanceof THREE.Mesh) { o.castShadow = family !== 'night-lighting' || enabled; o.receiveShadow = true; } });
      world.add(fittedSubject);
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshStandardMaterial({ color: '#889099', roughness: 0.85, metalness: 0 }));
      floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; world.add(floor);
      const key = new THREE.DirectionalLight(0xffffff, 2.1); key.position.set(broken && family === 'night-lighting' ? (frame % 2 ? -2.6 : 2.6) : 2.6, 4.4, 2.2); key.castShadow = true; key.shadow.mapSize.set(2048, 2048); world.add(key);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.18, 0.18), new THREE.MeshStandardMaterial({ color: '#0b1220', emissive: '#63f5ff', emissiveIntensity: 6 })); bar.position.set(0, 1.6, -1); world.add(bar);
      if (family === 'decals' && enabled) {
        const decal = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.8), new THREE.MeshStandardMaterial({ color: '#ff2a1a', transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }));
        decal.rotation.x = -Math.PI / 2; decal.position.set(broken ? 0.8 : 0, 0.012, 1); world.add(decal);
      }
      if (family === 'sdf-text' && enabled) {
        // Shared immutable atlas/glyph layout; only the opponent GPU draw uses Three.
        const atlas = createSdfFontAtlas(); const layout = layoutSdfText(broken ? 'A R ' : SETTINGS.sdfText.text, atlas, { size: SETTINGS.sdfText.size });
        const raster = rasterizeSdfTextLabelImage(layout, atlas, { texelsPerWorldUnit: 64 });
        const quads = createSdfTextQuadMesh(layout, raster);
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(quads.positions, 3));
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(quads.uvs, 2)); geometry.setIndex(Array.from(quads.indices)); geometry.computeVertexNormals();
        const texture = new THREE.DataTexture(new Uint8Array(raster.data), raster.width, raster.height, THREE.RGBAFormat);
        // DataTexture rows already use the same top-origin bake consumed by
        // Aura's raw upload. Flipping here inverted the opponent glyphs and
        // made the paired workload compare different world-text orientation.
        texture.flipY = false; texture.colorSpace = THREE.SRGBColorSpace; texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearFilter; texture.needsUpdate = true;
        const text = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ map: texture, emissiveMap: texture, emissive: new THREE.Color(0.92, 0.92, 0.92), emissiveIntensity: 0.9, roughness: 0.9, metalness: 0, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
        text.position.set(SETTINGS.sdfText.position[0], SETTINGS.sdfText.position[1], SETTINGS.sdfText.position[2]); world.add(text);
      }
      let composer: EffectComposer | undefined;
      if (family === 'bloom' && enabled) {
        composer = new EffectComposer(renderer); composer.addPass(new RenderPass(world, view));
        composer.addPass(new UnrealBloomPass(new THREE.Vector2(SETTINGS.width, SETTINGS.height), broken ? 20 : SETTINGS.bloom.intensity, SETTINGS.bloom.radius, broken ? 0 : SETTINGS.bloom.threshold)); composer.addPass(new OutputPass()); composer.render(); passes = ['UnrealBloomPass'];
      } else renderer.render(world, view);
      dispose = () => { composer?.passes.forEach(pass => pass.dispose()); composer?.dispose(); world.traverse(o => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); const mats = Array.isArray(o.material) ? o.material : [o.material]; mats.forEach(m => { for (const value of Object.values(m)) if (value instanceof THREE.Texture) value.dispose(); m.dispose(); }); } }); renderer.dispose(); };
    }
    const dataUrl = canvas.toDataURL('image/png');
    const image = new Image(); image.src = dataUrl; await image.decode();
    const copy = document.createElement('canvas'); copy.width = canvas.width; copy.height = canvas.height;
    const ctx = copy.getContext('2d'); if (!ctx) throw new Error('Pixel decode unavailable'); ctx.drawImage(image, 0, 0);
    return { family, engine, enabled, frame, width: canvas.width, height: canvas.height, pixels: Array.from(ctx.getImageData(0, 0, canvas.width, canvas.height).data), actualSettings: { ...captureSettings301(family), width: canvas.width, height: canvas.height }, dataUrl, passes, errors, settings: SETTINGS, claimSurface: engine === 'aura' ? 'createAuraApp root safe API' : 'three@0.185.1 WebGLRenderer' };
  } finally { await dispose?.(); canvas.remove(); }
}

async function captureParticles301(engine: 'aura' | 'three', enabled: boolean, frame: number, broken = false): Promise<VisualCapture301> {
  const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 360; document.body.append(canvas);
  const mounted = engine === 'aura' ? await mountParticles(canvas, enabled, broken ? 1 : 0) : await mountThree(canvas, 'particle10k', enabled, broken ? 1 : 0);
  try {
    for (let i = 0; i <= frame; i++) await mounted.render();
    const dataUrl = canvas.toDataURL('image/png'); const image = new Image(); image.src = dataUrl; await image.decode();
    const copy = document.createElement('canvas'); copy.width = canvas.width; copy.height = canvas.height;
    const ctx = copy.getContext('2d'); if (!ctx) throw new Error('Particle pixel readback unavailable'); ctx.drawImage(image, 0, 0);
    return { family: 'particles', engine, enabled, frame, width: canvas.width, height: canvas.height, pixels: Array.from(ctx.getImageData(0,0,canvas.width,canvas.height).data), actualSettings: { ...captureSettings301('particles'), width: canvas.width, height: canvas.height }, dataUrl, passes: [], errors: [], settings: SETTINGS, claimSurface: mounted.entryPoint };
  } finally { await mounted.dispose(); canvas.remove(); }
}
