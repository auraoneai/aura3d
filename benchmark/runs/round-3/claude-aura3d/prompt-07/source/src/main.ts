/**
 * Prompt 07 — Material Lab
 *
 * Five spheres (metal, glass, rubber, emissive, clearcoat) under controlled
 * studio lighting with an environment map and orbit controls.
 *
 * The *scene* (sphere layout, material definitions, studio light, camera) is
 * authored with the public `@aura3d/engine` agent API. The agent-api browser
 * renderer, however, does not attach an environment map or interactive orbit
 * controls, both of which this prompt explicitly requires. So we consume the
 * engine's `AuraSceneSnapshot` and render it with the engine's own rendering
 * stack (three.js, a direct dependency of `@aura3d/engine`), adding the PMREM
 * environment map, soft studio shadows, and real `OrbitControls`.
 */
import {
  scene,
  primitives,
  material,
  lights,
  camera,
  interactions,
  type AuraSceneSnapshot,
  type AuraMaterialSpec,
  type AuraVec3,
} from "@aura3d/engine";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

/* ------------------------------------------------------------------ */
/* 1. Author the material-lab scene with the public @aura3d/engine API */
/* ------------------------------------------------------------------ */

const SPACING = 1.45;
const RADIUS = 0.5; // engine SphereGeometry radius
const REST_Y = RADIUS + 0.06; // rest spheres just above the studio floor

type Swatch = { name: string; x: number; mat: AuraMaterialSpec };

const swatches: Swatch[] = [
  { name: "Metal", x: -2 * SPACING, mat: material.metal({ color: "#dfe7ee" }) },
  { name: "Glass", x: -1 * SPACING, mat: material.glass({ color: "#bfeaff" }) },
  { name: "Rubber", x: 0, mat: material.rubber({ color: "#16181d" }) },
  {
    name: "Emissive",
    x: 1 * SPACING,
    mat: material.emissive({ color: "#181014", emissive: "#ff5a2c" }),
  },
  {
    name: "Clearcoat",
    x: 2 * SPACING,
    mat: material.clearcoat({ color: "#b21f2d" }),
  },
];

const cameraTarget: AuraVec3 = [0, REST_Y, 0];

let labScene = scene().background("#0c0f14");
for (const s of swatches) {
  labScene = labScene.add(
    primitives.sphere({ name: s.name, material: s.mat }).position(s.x, REST_Y, 0),
  );
}
labScene = labScene
  .add(lights.studio({ intensity: 1.25 }))
  .add(interactions.orbit())
  .camera(camera.orbit({ distance: 7.2, target: cameraTarget }));

const snapshot: AuraSceneSnapshot = labScene.toJSON();

/* ------------------------------------------------------------------ */
/* 2. Enhanced three.js renderer for the snapshot                      */
/* ------------------------------------------------------------------ */

const host = document.querySelector<HTMLElement>("#app");
if (!host) throw new Error("Missing #app host element.");
host.innerHTML = "";

const canvas = document.createElement("canvas");
canvas.style.display = "block";
canvas.style.width = "100%";
canvas.style.height = "100%";
host.appendChild(canvas);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  preserveDrawingBuffer: true, // allow screenshots
  powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const threeScene = new THREE.Scene();
threeScene.background = makeStudioBackdrop(snapshot.background);

/* --- Environment map (image-based lighting + reflections) --- */
const pmrem = new THREE.PMREMGenerator(renderer);
pmrem.compileEquirectangularShader();
const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
threeScene.environment = envTexture;

/* --- Studio floor that receives soft shadows --- */
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(60, 60),
  new THREE.MeshStandardMaterial({
    color: new THREE.Color("#0e1218"),
    roughness: 0.62,
    metalness: 0.0,
    envMapIntensity: 0.6,
  }),
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
threeScene.add(floor);

/* --- Spheres + materials, derived from the engine snapshot --- */
const sphereGeometry = new THREE.SphereGeometry(RADIUS, 96, 64);
for (const node of snapshot.nodes) {
  if (node.kind !== "primitive" || node.primitive !== "sphere") continue;
  const mesh = new THREE.Mesh(sphereGeometry, makeMaterial(node.material));
  const p = node.position ?? [0, 0, 0];
  mesh.position.set(p[0], p[1], p[2]);
  mesh.castShadow = !node.material?.emissive; // emissive sphere reads as a light source
  mesh.receiveShadow = true;
  threeScene.add(mesh);
}

/* --- Controlled studio lighting (3-point rig) --- */
addStudioLighting(threeScene, studioIntensity(snapshot));

/* --- Camera + interactive orbit controls --- */
const cam = new THREE.PerspectiveCamera(
  snapshot.camera.fov ?? 45,
  aspect(),
  0.05,
  200,
);
const eye = snapshot.camera.position ?? [4.5, 3.4, 5.6];
cam.position.set(eye[0], eye[1], eye[2]);

const controls = new OrbitControls(cam, renderer.domElement);
const t = snapshot.camera.target ?? cameraTarget;
controls.target.set(t[0], t[1], t[2]);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 3;
controls.maxDistance = 18;
controls.maxPolarAngle = Math.PI * 0.495; // stay above the floor
controls.autoRotate = true; // gentle drift; user drag overrides instantly
controls.autoRotateSpeed = 0.6;
controls.update();

addLegend(host, swatches);

/* --- Resize + render loop --- */
function aspect(): number {
  return host!.clientWidth / Math.max(1, host!.clientHeight);
}
function resize(): void {
  const w = host!.clientWidth || window.innerWidth;
  const h = host!.clientHeight || window.innerHeight;
  renderer.setSize(w, h, false);
  cam.aspect = w / Math.max(1, h);
  cam.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
resize();

renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(threeScene, cam);
});

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Mirror the engine's `createThreeMaterial` mapping for snapshot specs. */
function makeMaterial(spec?: AuraMaterialSpec): THREE.Material {
  const s = spec ?? material.pbr();
  const color = new THREE.Color(s.color ?? "#d7dee8");
  const physical =
    s.transmission !== undefined ||
    s.clearcoat !== undefined ||
    s.opacity !== undefined;

  let mat: THREE.MeshStandardMaterial;
  if (physical) {
    const pm = new THREE.MeshPhysicalMaterial({
      color,
      roughness: s.roughness ?? 0.54,
      metalness: s.metallic ?? 0,
      transparent: s.opacity !== undefined && s.opacity < 1,
      opacity: s.opacity ?? 1,
      transmission: s.transmission ?? 0,
      clearcoat: s.clearcoat ?? 0,
      clearcoatRoughness: s.clearcoatRoughness ?? 0.18,
      ior: 1.5,
      thickness: s.transmission ? 0.8 : 0,
    });
    pm.depthWrite = s.opacity === undefined || s.opacity >= 0.96;
    mat = pm;
  } else {
    mat = new THREE.MeshStandardMaterial({
      color,
      roughness: s.roughness ?? 0.54,
      metalness: s.metallic ?? 0,
    });
  }
  mat.envMapIntensity = 1.0;
  if (s.emissive) {
    mat.emissive = new THREE.Color(s.emissive);
    mat.emissiveIntensity = 1.6;
  }
  return mat;
}

function studioIntensity(snap: AuraSceneSnapshot): number {
  for (const n of snap.nodes) {
    if (n.kind === "light" && n.light === "studio") return n.intensity ?? 1.2;
  }
  return 1.2;
}

/** A controlled 3-point studio rig + hemisphere base fill. */
function addStudioLighting(target: THREE.Scene, intensity: number): void {
  target.add(new THREE.HemisphereLight("#e8f1ff", "#0a0c10", 0.35 * intensity));

  const key = new THREE.DirectionalLight("#ffffff", 2.7 * intensity);
  key.position.set(4.5, 7.5, 5.0);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 30;
  key.shadow.camera.left = -8;
  key.shadow.camera.right = 8;
  key.shadow.camera.top = 8;
  key.shadow.camera.bottom = -8;
  key.shadow.bias = -0.0004;
  key.shadow.radius = 6; // softness
  target.add(key);

  const fill = new THREE.DirectionalLight("#cfe0ff", 0.9 * intensity);
  fill.position.set(-6.5, 3.5, 4.0);
  target.add(fill);

  const rim = new THREE.DirectionalLight("#fff2e6", 1.5 * intensity);
  rim.position.set(-3.0, 5.0, -6.5);
  target.add(rim);
}

/** Vertical studio gradient backdrop so reflections read against context. */
function makeStudioBackdrop(base: string): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = 16;
  c.height = 256;
  const ctx = c.getContext("2d")!;
  const top = new THREE.Color(base).clone().multiplyScalar(2.1);
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, `#${top.getHexString()}`);
  grad.addColorStop(1, base);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 16, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Small on-screen legend naming each material so distinctness is legible. */
function addLegend(mount: HTMLElement, items: Swatch[]): void {
  mount.style.position = "relative";
  const el = document.createElement("div");
  el.style.cssText =
    "position:absolute;left:16px;bottom:14px;display:flex;gap:14px;" +
    "font:600 13px/1.4 system-ui,sans-serif;color:#e9eef5;letter-spacing:.02em;" +
    "padding:10px 14px;background:rgba(8,11,16,.55);border:1px solid rgba(255,255,255,.08);" +
    "border-radius:10px;backdrop-filter:blur(6px);pointer-events:none;user-select:none";
  const title = document.createElement("span");
  title.textContent = "Material Lab —";
  title.style.opacity = "0.7";
  el.appendChild(title);
  for (const it of items) {
    const span = document.createElement("span");
    span.textContent = it.name;
    el.appendChild(span);
  }
  const hint = document.createElement("span");
  hint.textContent = "· drag to orbit";
  hint.style.opacity = "0.55";
  el.appendChild(hint);
  mount.appendChild(el);
}
