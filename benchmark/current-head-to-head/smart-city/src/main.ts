import {
  camera,
  city,
  createAuraApp,
  defineAuraAssets,
  lights,
  material,
  model,
  primitives,
  scene,
  type AuraSceneNode
} from "@aura3d/engine";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const VIEWPORT = { width: 1440, height: 900, dpr: 1 } as const;
const ASSET = {
  id: "showcaseCityVehicle",
  url: "/aura-assets/showcaseCityVehicle.15552b57.glb",
  sha256: "15552b57377570b1c9d9fe8fa9476856a6ee357e4c7d8be1c6dd191e1ef7d27e",
  bounds: [1.2, 0.52, 2.1]
} as const;
const CAMERA = { position: [8, 6, 12] as const, target: [0, 1, 0] as const, fov: 45, near: 0.1, far: 500 } as const;
const VEHICLE = { position: [-0.342, 2.7, 0.912] as const, rotation: [-0.04, 1.5708, 0] as const, targetMaxDimension: 1.12 } as const;
const STATES = {
  night: { id: "night-core-district", timeOfDay: "night", district: "core", background: "#050706", overlay: { position: [0, 0.05, 0] as const, scale: [4.104, 0.018, 3.534] as const, color: "#f4c35d" } },
  day: { id: "day-industrial-district", timeOfDay: "day", district: "industrial", background: "#c9ecff", overlay: { position: [3.99, 0.05, 3.99] as const, scale: [4.104, 0.018, 3.534] as const, color: "#ff7a59" } }
} as const;
type CityStateId = keyof typeof STATES;

const assets = defineAuraAssets({
  showcaseCityVehicle: {
    type: "model",
    format: "glb",
    url: ASSET.url,
    hash: `sha256-${ASSET.sha256}`,
    bounds: ASSET.bounds,
    sizeBytes: 450_860,
    metadata: { license: "CC-BY-4.0" }
  }
});

declare global {
  interface Window {
    __AURA_THREE_HEAD_TO_HEAD_SMART_CITY__?: any;
    __AURA_THREE_HEAD_TO_HEAD_SMART_CITY_ERROR__?: string;
  }
}

const runtime: Record<string, any> = {
  ready: false,
  workload: "smart-city",
  asset: ASSET,
  viewport: VIEWPORT,
  contract: { blocks: 8, camera: CAMERA, vehicle: VEHICLE, states: STATES, transition: "night/core to day/industrial" },
  aura: null,
  three: null,
  stages: { aura: "starting", three: "starting" },
  interaction: { applied: false }
};
const publish = () => {
  runtime.ready = Boolean(runtime.aura && runtime.three);
  window.__AURA_THREE_HEAD_TO_HEAD_SMART_CITY__ = structuredClone(runtime);
};
publish();

function cityNodes(stateId: CityStateId): readonly AuraSceneNode[] {
  return city.cityBlock({ blocks: 8, litWindows: true, timeOfDay: STATES[stateId].timeOfDay });
}

function buildAuraScene(stateId: CityStateId) {
  const state = STATES[stateId];
  const nodes = cityNodes(stateId);
  return scene()
    .background(state.background)
    .addMany(nodes)
    .add(primitives.box({
      name: `${state.district} district selection overlay`,
      material: material.emissive({ color: state.overlay.color, emissive: state.overlay.color, emissiveIntensity: 0.58, opacity: 0.22 })
    }).position(...state.overlay.position).scale(state.overlay.scale))
    .add(model(assets.showcaseCityVehicle, { name: "typed command vehicle", scaleMode: "fit", targetMaxDimension: VEHICLE.targetMaxDimension })
      .position(...VEHICLE.position).rotate(...VEHICLE.rotation))
    .add(lights.ambient({ intensity: 0.35, color: "#ffffff" }))
    .add(lights.directional({ position: [8, 14, 10], intensity: 2.6, color: "#fff4e6" }))
    .camera(camera.perspective(CAMERA));
}

async function startAura(): Promise<(stateId: CityStateId) => Promise<void>> {
  const canvas = requiredCanvas("aura");
  const app = createAuraApp(canvas, { scene: buildAuraScene("night"), autoStart: false, resize: false, pixelRatio: 1, diagnostics: { overlay: false } });
  return async (stateId: CityStateId) => {
    runtime.stages.aura = `mounting-${stateId}`;
    publish();
    if (stateId !== "night") app.setScene(buildAuraScene(stateId));
    await app.ready();
    app.step(1 / 60);
    await nextPaint();
    const diagnostics = app.diagnostics();
    if (diagnostics.errors.length > 0) throw new Error(`Aura city failed: ${diagnostics.errors.join(" | ")}`);
    const state = STATES[stateId];
    runtime.aura = {
      publicPackageOnly: true,
      publicApi: "city.cityBlock + typed model + primitives + createAuraApp",
      backend: app.backend,
      state: state.id,
      timeOfDay: state.timeOfDay,
      district: state.district,
      cityNodeCount: cityNodes(stateId).length,
      drawCalls: diagnostics.drawCalls,
      nativeInstancedSubmissions: diagnostics.renderer?.runtime.nativeInstancedSubmissions,
      assetState: diagnostics.assets.find((entry) => entry.id === ASSET.id),
      backgroundPixel: readBackgroundPixel(canvas),
      pixelHash: hashString(canvas.toDataURL("image/png"))
    };
    runtime.stages.aura = `rendered-${stateId}`;
    publish();
  };
}

async function startThree(): Promise<(stateId: CityStateId) => void> {
  const canvas = requiredCanvas("three");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(VIEWPORT.width, VIEWPORT.height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  const threeCamera = new THREE.PerspectiveCamera(CAMERA.fov, VIEWPORT.width / VIEWPORT.height, CAMERA.near, CAMERA.far);
  threeCamera.position.set(...CAMERA.position);
  threeCamera.lookAt(...CAMERA.target);
  threeCamera.updateProjectionMatrix();
  const gltf = await new GLTFLoader().loadAsync(ASSET.url);
  let activeWorld: THREE.Scene | undefined;
  return (stateId: CityStateId) => {
    runtime.stages.three = `rendering-${stateId}`;
    publish();
    if (activeWorld) disposeWorld(activeWorld);
    const state = STATES[stateId];
    const nodes = cityNodes(stateId);
    const world = new THREE.Scene();
    activeWorld = world;
    world.background = new THREE.Color(state.background);
    for (const node of nodes) world.add(primitiveMesh(node));
    world.add(overlayMesh(state));
    const vehicle = gltf.scene.clone(true);
    fitObject(vehicle, VEHICLE.targetMaxDimension, VEHICLE.position);
    vehicle.rotation.set(...VEHICLE.rotation);
    world.add(vehicle);
    world.add(new THREE.AmbientLight("#ffffff", 0.35));
    const key = new THREE.DirectionalLight("#fff4e6", 2.6);
    key.position.set(8, 14, 10);
    world.add(key);
    renderer.render(world, threeCamera);
    const pixels = readPixels(renderer);
    runtime.three = {
      revision: THREE.REVISION,
      actualRenderer: renderer instanceof THREE.WebGLRenderer,
      actualGLTFLoader: true,
      state: state.id,
      timeOfDay: state.timeOfDay,
      district: state.district,
      cityNodeCount: nodes.length,
      drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      assetNodeCount: countNodes(vehicle),
      backgroundPixel: topLeftPixel(pixels),
      pixelHash: hash(pixels)
    };
    runtime.stages.three = `rendered-${stateId}`;
    publish();
  };
}

function primitiveMesh(node: AuraSceneNode): THREE.Mesh {
  if (node.kind !== "primitive") throw new Error(`Expected primitive city node, received ${node.kind}`);
  const geometry = node.primitive === "box"
    ? new THREE.BoxGeometry(1, 1, 1)
    : node.primitive === "sphere"
      ? new THREE.SphereGeometry(0.5, 20, 12)
      : node.primitive === "cylinder"
        ? new THREE.CylinderGeometry(0.5, 0.5, 1, 20)
        : new THREE.PlaneGeometry(1, 1);
  const spec = node.material ?? {};
  const material = new THREE.MeshStandardMaterial({
    color: spec.color ?? "#ffffff",
    roughness: spec.roughness ?? 0.5,
    metalness: spec.metalness ?? spec.metallic ?? 0,
    emissive: spec.emissive ?? "#000000",
    emissiveIntensity: spec.emissiveIntensity ?? (spec.emissive ? 1 : 0),
    transparent: (spec.opacity ?? 1) < 1,
    opacity: spec.opacity ?? 1
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = node.name;
  mesh.userData.benchmarkOwned = true;
  mesh.position.set(...(node.position ?? [0, 0, 0]));
  mesh.rotation.set(...(node.rotation ?? [0, 0, 0]));
  if (node.primitive === "plane") mesh.rotation.x -= Math.PI / 2;
  const scale = node.scale ?? 1;
  if (typeof scale === "number") mesh.scale.setScalar(scale);
  else if (node.primitive === "plane") mesh.scale.set(scale[0], scale[2], scale[1]);
  else mesh.scale.set(...scale);
  return mesh;
}

function overlayMesh(state: typeof STATES[CityStateId]): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: state.overlay.color, emissive: state.overlay.color, emissiveIntensity: 0.58, transparent: true, opacity: 0.22 })
  );
  mesh.name = `${state.district} district selection overlay`;
  mesh.userData.benchmarkOwned = true;
  mesh.position.set(...state.overlay.position);
  mesh.scale.set(...state.overlay.scale);
  return mesh;
}

function fitObject(object: THREE.Object3D, targetMaxDimension: number, position: readonly [number, number, number]): void {
  const box = new THREE.Box3().setFromObject(object);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const scale = targetMaxDimension / Math.max(size.x, size.y, size.z);
  object.scale.setScalar(scale);
  object.position.set(position[0] - center.x * scale, position[1] - box.min.y * scale, position[2] - center.z * scale);
}

let renderAura: ((stateId: CityStateId) => Promise<void>) | undefined;
let renderThree: ((stateId: CityStateId) => void) | undefined;
Promise.all([startAura(), startThree()]).then(async ([aura, three]) => {
  renderAura = aura;
  renderThree = three;
  three("night");
  await aura("night");
}).catch(reportError);

document.getElementById("change-city-state")?.addEventListener("click", () => {
  runtime.interaction = { applied: true, from: STATES.night.id, to: STATES.day.id, actions: ["toggle-day", "select-industrial-district"] };
  renderThree?.("day");
  void renderAura?.("day").catch(reportError);
});

function disposeWorld(world: THREE.Scene): void {
  world.traverse((entry) => {
    if (!(entry instanceof THREE.Mesh) || entry.userData.benchmarkOwned !== true) return;
    entry.geometry.dispose();
    const materials = Array.isArray(entry.material) ? entry.material : [entry.material];
    materials.forEach((value) => value.dispose());
  });
}
function requiredCanvas(id: string): HTMLCanvasElement { const canvas = document.querySelector<HTMLCanvasElement>(`#${id}`); if (!canvas) throw new Error(`Missing ${id} canvas`); return canvas; }
function nextPaint(): Promise<void> { return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))); }
function readBackgroundPixel(canvas: HTMLCanvasElement): readonly [number, number, number, number] { const gl = canvas.getContext("webgl2"); if (!gl) throw new Error("Aura city proof requires WebGL2"); const pixel = new Uint8Array(4); gl.readPixels(0, VIEWPORT.height - 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel); return [pixel[0]!, pixel[1]!, pixel[2]!, pixel[3]!]; }
function readPixels(renderer: THREE.WebGLRenderer): Uint8Array { const gl = renderer.getContext(); const pixels = new Uint8Array(VIEWPORT.width * VIEWPORT.height * 4); gl.readPixels(0, 0, VIEWPORT.width, VIEWPORT.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels); return pixels; }
function topLeftPixel(pixels: Uint8Array): readonly [number, number, number, number] { const index = (VIEWPORT.height - 1) * VIEWPORT.width * 4; return [pixels[index]!, pixels[index + 1]!, pixels[index + 2]!, pixels[index + 3]!]; }
function hash(pixels: Uint8Array): string { let value = 2166136261; for (let index = 0; index < pixels.length; index += 97) { value ^= pixels[index]!; value = Math.imul(value, 16777619); } return (value >>> 0).toString(16).padStart(8, "0"); }
function hashString(value: string): string { let result = 2166136261; for (let index = 0; index < value.length; index += 17) { result ^= value.charCodeAt(index); result = Math.imul(result, 16777619); } return (result >>> 0).toString(16).padStart(8, "0"); }
function countNodes(root: THREE.Object3D): number { let count = 0; root.traverse(() => count++); return count; }
function reportError(error: unknown): void { window.__AURA_THREE_HEAD_TO_HEAD_SMART_CITY_ERROR__ = error instanceof Error ? error.stack ?? error.message : String(error); }
