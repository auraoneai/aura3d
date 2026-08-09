import {
  camera,
  createAuraApp,
  defineAuraAssets,
  distanceLod,
  instances,
  lights,
  material,
  model,
  scene,
  selectAuraRootLodLevel,
  type AuraTransformSpec
} from "@aura3d/engine";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import Stats from "stats.js";

const VIEWPORT = { width: 1440, height: 900, dpr: 1 } as const;
const COUNT = 2_500;
const ASSET = {
  id: "showcaseHeadphones",
  url: "/aura-assets/showcaseHeadphones.40b1fdf7.glb",
  sha256: "40b1fdf7e0afdf0e5f950040f42608d3655561e61f32b9ad59690476abb15833",
  bounds: [2.399, 2.017, 2.559]
} as const;
const GRID = { columns: 50, rows: 50, spacing: 0.28 } as const;
const CAMERA = {
  near: { position: [8, 6, 12] as const, target: [0, 1, 0] as const },
  far: { position: [40, 30, 60] as const, target: [0, 1, 0] as const },
  fov: 45,
  nearClip: 0.1,
  farClip: 500
} as const;
const LOD_LEVELS = [
  { name: "near-sphere", maxDistance: 20, primitive: "sphere" as const, material: material.pbr({ color: "#f8c94c", roughness: 0.25, metallic: 0.08 }) },
  { name: "far-box", primitive: "box" as const, material: material.pbr({ color: "#ff7a52", roughness: 0.62, metallic: 0.03 }) }
] as const;
const PRODUCT_POSITION = [-1.2, 0.15, 0] as const;
const LOD_POSITION = [1.2, 0.55, 0] as const;
const assets = defineAuraAssets({
  showcaseHeadphones: {
    type: "model",
    format: "glb",
    url: ASSET.url,
    hash: `sha256-${ASSET.sha256}`,
    bounds: ASSET.bounds,
    sizeBytes: 1_589_596
  }
});

declare global {
  interface Window {
    __AURA_THREE_HEAD_TO_HEAD_INSTANCING_LOD__?: any;
    __AURA_THREE_HEAD_TO_HEAD_INSTANCING_LOD_ERROR__?: string;
  }
}

const stats = new Stats();
stats.showPanel(0);
stats.dom.id = "stats-js-panel";
document.getElementById("stats")?.append(stats.dom);

const transforms = createTransforms();
const colors = transforms.map((_, index) => index % 3 === 0 ? "#ffba38" : index % 3 === 1 ? "#34d8ff" : "#a77bff");
const runtime: Record<string, any> = {
  ready: false,
  workload: "instancing-lod",
  asset: ASSET,
  viewport: VIEWPORT,
  contract: { count: COUNT, grid: GRID, camera: CAMERA, lodThreshold: 20 },
  aura: null,
  three: null,
  stages: { aura: "starting", three: "starting" },
  interaction: { applied: false }
};
const publish = () => {
  runtime.ready = Boolean(runtime.aura && runtime.three);
  window.__AURA_THREE_HEAD_TO_HEAD_INSTANCING_LOD__ = structuredClone(runtime);
};
publish();

function auraScene(far: boolean) {
  const shot = far ? CAMERA.far : CAMERA.near;
  return scene()
    .background("#05070b")
    .add(lights.ambient({ intensity: 0.35, color: "#ffffff" }))
    .add(lights.directional({ position: [8, 14, 10], intensity: 2.6, color: "#fff4e6" }))
    .add(instances.box({
      name: "large instanced field",
      transforms,
      colors,
      material: material.pbr({ color: "#ffffff", roughness: 0.35, metallic: 0.08 }),
      castShadow: false,
      receiveShadow: false
    }))
    .add(model(assets.showcaseHeadphones, { name: "typed frozen product asset", scaleMode: "fit", targetMaxDimension: 1, castShadow: false, receiveShadow: false }).position(...PRODUCT_POSITION))
    .add(distanceLod({ name: "distance-selected hero", levels: LOD_LEVELS, hysteresis: 0.5, position: LOD_POSITION, scale: 0.8, castShadow: false, receiveShadow: false }))
    .camera(camera.perspective({ position: shot.position, target: shot.target, fov: CAMERA.fov }));
}

async function startAura(): Promise<(far: boolean) => Promise<void>> {
  const canvas = requiredCanvas("aura");
  const app = createAuraApp(canvas, { scene: auraScene(false), autoStart: false, resize: false, pixelRatio: 1, diagnostics: { overlay: false } });
  return async (far: boolean) => {
    runtime.stages.aura = far ? "mounting-far" : "mounting-near";
    publish();
    if (far) app.setScene(auraScene(true));
    await app.ready();
    app.step(1 / 60);
    await nextPaint();
    const diagnostics = app.diagnostics();
    if (diagnostics.errors.length > 0) throw new Error(`Aura instancing/LOD failed: ${diagnostics.errors.join(" | ")}`);
    const shot = far ? CAMERA.far : CAMERA.near;
    const distance = vectorDistance(shot.position, LOD_POSITION);
    runtime.aura = {
      publicPackageOnly: true,
      publicApi: "instances.box + distanceLod + createAuraApp",
      backend: app.backend,
      instanceCount: COUNT,
      drawCalls: diagnostics.drawCalls,
      nativeInstancedSubmissions: diagnostics.renderer?.runtime.nativeInstancedSubmissions,
      assetState: diagnostics.assets.find((asset) => asset.id === ASSET.id),
      lodLevel: selectAuraRootLodLevel(distance, LOD_LEVELS, undefined, 0.5).levelIndex,
      cameraDistance: Number(distance.toFixed(3)),
      backgroundPixel: readBackgroundPixel(canvas),
      pixelHash: hashString(canvas.toDataURL("image/png"))
    };
    runtime.stages.aura = far ? "rendered-far" : "rendered-near";
    publish();
  };
}

async function createThree(): Promise<(far: boolean) => void> {
  const canvas = requiredCanvas("three");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(VIEWPORT.width, VIEWPORT.height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  const world = new THREE.Scene();
  world.background = new THREE.Color("#05070b");
  world.add(new THREE.AmbientLight("#ffffff", 0.35));
  const key = new THREE.DirectionalLight("#fff4e6", 2.6);
  key.position.set(8, 14, 10);
  world.add(key);
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const field = new THREE.InstancedMesh(geometry, new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.35, metalness: 0.08 }), COUNT);
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  transforms.forEach((transform, index) => {
    const rotation = transform.rotation ?? [0, 0, 0];
    quaternion.setFromEuler(new THREE.Euler(...rotation));
    const scalar = typeof transform.scale === "number" ? transform.scale : 1;
    scale.setScalar(scalar);
    matrix.compose(new THREE.Vector3(...(transform.position ?? [0, 0, 0])), quaternion, scale);
    field.setMatrixAt(index, matrix);
    field.setColorAt(index, new THREE.Color(colors[index]!));
  });
  field.instanceMatrix.needsUpdate = true;
  if (field.instanceColor) field.instanceColor.needsUpdate = true;
  world.add(field);
  const gltf = await new GLTFLoader().loadAsync(ASSET.url);
  const product = gltf.scene.clone(true);
  const productBounds = new THREE.Box3().setFromObject(product);
  const productCenter = productBounds.getCenter(new THREE.Vector3());
  const productSize = productBounds.getSize(new THREE.Vector3());
  const productScale = 1 / Math.max(productSize.x, productSize.y, productSize.z);
  product.scale.setScalar(productScale);
  product.position.set(
    PRODUCT_POSITION[0] - productCenter.x * productScale,
    PRODUCT_POSITION[1] - productBounds.min.y * productScale,
    PRODUCT_POSITION[2] - productCenter.z * productScale
  );
  world.add(product);
  const lod = new THREE.LOD();
  lod.position.set(...LOD_POSITION);
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.4, 32, 16), new THREE.MeshStandardMaterial({ color: "#f8c94c", roughness: 0.25, metalness: 0.08 }));
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), new THREE.MeshStandardMaterial({ color: "#ff7a52", roughness: 0.62, metalness: 0.03 }));
  lod.addLevel(sphere, 0);
  lod.addLevel(box, 20);
  world.add(lod);
  const camera = new THREE.PerspectiveCamera(CAMERA.fov, VIEWPORT.width / VIEWPORT.height, CAMERA.nearClip, CAMERA.farClip);
  return (far: boolean) => {
    runtime.stages.three = far ? "rendering-far" : "rendering-near";
    publish();
    const shot = far ? CAMERA.far : CAMERA.near;
    camera.position.set(...shot.position);
    camera.lookAt(...shot.target);
    camera.updateMatrixWorld();
    lod.update(camera);
    stats.begin();
    renderer.render(world, camera);
    stats.end();
    const pixels = new Uint8Array(VIEWPORT.width * VIEWPORT.height * 4);
    const gl = renderer.getContext();
    gl.readPixels(0, 0, VIEWPORT.width, VIEWPORT.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    runtime.three = {
      revision: THREE.REVISION,
      actualRenderer: true,
      actualInstancedMesh: field instanceof THREE.InstancedMesh,
      actualLod: lod instanceof THREE.LOD,
      actualStatsJs: stats.dom instanceof HTMLElement,
      actualGLTFLoader: true,
      assetNodeCount: countNodes(product),
      instanceCount: field.count,
      drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      lodLevel: lod.getCurrentLevel(),
      cameraDistance: Number(camera.position.distanceTo(lod.position).toFixed(3)),
      backgroundPixel: [pixels[0]!, pixels[1]!, pixels[2]!, pixels[3]!],
      pixelHash: hash(pixels)
    };
    runtime.stages.three = far ? "rendered-far" : "rendered-near";
    publish();
  };
}

let renderAura: ((far: boolean) => Promise<void>) | undefined;
let renderThree: ((far: boolean) => void) | undefined;
Promise.all([startAura(), createThree()]).then(async ([aura, three]) => {
  renderAura = aura;
  renderThree = three;
  three(false);
  await aura(false);
}).catch(reportError);
document.getElementById("move-far")?.addEventListener("click", () => {
  runtime.interaction = { applied: true, action: "cross-lod-threshold", from: "near-sphere", to: "far-box" };
  renderThree?.(true);
  void renderAura?.(true).catch(reportError);
});

function createTransforms(): AuraTransformSpec[] {
  const result: AuraTransformSpec[] = [];
  for (let row = 0; row < GRID.rows; row += 1) for (let column = 0; column < GRID.columns; column += 1) result.push({ position: [(column - (GRID.columns - 1) / 2) * GRID.spacing, Math.sin(column * 0.43 + row * 0.31) * 0.08, (row - (GRID.rows - 1) / 2) * GRID.spacing], rotation: [0, column * 0.07, 0], scale: (0.72 + (row % 3) * 0.08) * 0.12 });
  return result;
}
function requiredCanvas(id: string): HTMLCanvasElement { const canvas = document.querySelector<HTMLCanvasElement>(`#${id}`); if (!canvas) throw new Error(`Missing ${id} canvas.`); return canvas; }
function readBackgroundPixel(canvas: HTMLCanvasElement): readonly [number, number, number, number] { const gl = canvas.getContext("webgl2"); if (!gl) throw new Error("Aura background proof requires the mounted WebGL2 context."); const pixel = new Uint8Array(4); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel); return [pixel[0]!, pixel[1]!, pixel[2]!, pixel[3]!]; }
function nextPaint(): Promise<void> { return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))); }
function vectorDistance(a: readonly number[], b: readonly number[]): number { return Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!); }
function reportError(error: unknown): void { window.__AURA_THREE_HEAD_TO_HEAD_INSTANCING_LOD_ERROR__ = error instanceof Error ? error.stack ?? error.message : String(error); }
function hash(pixels: Uint8Array): string { let value = 2166136261; for (let index = 0; index < pixels.length; index += 97) { value ^= pixels[index]!; value = Math.imul(value, 16777619); } return (value >>> 0).toString(16).padStart(8, "0"); }
function hashString(value: string): string { let result = 2166136261; for (let index = 0; index < value.length; index += 17) { result ^= value.charCodeAt(index); result = Math.imul(result, 16777619); } return (result >>> 0).toString(16).padStart(8, "0"); }
function countNodes(root: THREE.Object3D): number { let count = 0; root.traverse(() => count++); return count; }
