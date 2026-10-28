// PRD-2 WP-6 attribution harness. One page load = one scene variant, chosen by `?v=<id>`:
//   bench:<scene>:<lib>   the bench scene source, unmodified (baseline | forest, aura | three)
//   cube:<...>            Aura3D one-cube scene with the default background / tone map toggled
//   pbr:<lib>:<sun>:<env>:<bloom>           PBR viewer with explicit nominal sun and environment intensities
//   forest:<lib>:<colors>:<shadows>:<fog>[:ground|:trunks|:canopies|:rocks][:cone7][:r09][:meshdims][:rough1][:plain][:sun0|:hemi0]   forest with the canopy and rock colour reading and the shadow / fog terms toggled;
//                                          ground = flat plane only, trunks / canopies / rocks = only that instanced node, sun0 / hemi0 = that light off, cone7 = Aura3D canopies with 7 radial segments like the three bench (Aura3D defaults to 32), r09 = Aura3D canopy size [0.9, 2.2, 0.9] (the cone mesh has radius 1, so the bench's [1.8, 2.2, 1.8] is radius 1.8 against three's 0.9), meshdims = Aura3D canopies built to three's dimensions in the mesh (params radius 0.9, height 2.2, 7 segments) with size [1, 1, 1], so the cone normals are the true ones, rough1 = canopy roughness 1 (bench 0.85), plain = canopies one flat colour instead of per-instance colours
// The scene bodies mirror tools/bench-vs-threejs/<scene>/{aura,three}/scene.ts line for line except for the named toggles.
// Output is `window.__BENCH__` from the bench glue (mean luma of the 640x360 frame) plus `window.__VARIANT__`.
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { camera, createAuraApp, createCountedRng, defineAuraAssets, defineModelAssets, effects, environments, instances, lights, material, model, primitives, scene } from "@aura3d/engine";
import { runBench, type SceneHandle } from "../../tools/bench-vs-threejs/shared/glue";
// Static imports: a dynamic import() makes the dev server's esbuild bundle wrap modules in a non-async __esm initializer and the bundle then fails to parse.
import { start as baselineAuraBench } from "../../tools/bench-vs-threejs/baseline/aura/scene";
import { start as baselineThreeBench } from "../../tools/bench-vs-threejs/baseline/three/scene";
import { start as forestAuraBench } from "../../tools/bench-vs-threejs/forest/aura/scene";
import { start as forestThreeBench } from "../../tools/bench-vs-threejs/forest/three/scene";

type V3 = [number, number, number];
const params = new URLSearchParams(location.search);
const id = params.get("v") ?? "";
const sha = params.get("sha") ?? "0".repeat(64);
const [kind, ...rest] = id.split(":");

/** Linear value -> sRGB hex, for handing the colour three computes in linear working space to Aura3D's sRGB colour strings. */
const toHex = (linear: V3): string => {
  const enc = (v: number): number => Math.round(255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055));
  return `#${linear.map((v) => Math.min(255, Math.max(0, enc(v))).toString(16).padStart(2, "0")).join("")}`;
};
const hslToRgb = (h: number, s: number, l: number): V3 => {
  const f = (n: number): number => {
    const k = (n + h * 12) % 12;
    return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0), f(8), f(4)];
};
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function cubeAura(canvas: HTMLCanvasElement, bg: string, tone: string): Promise<SceneHandle> {
  const base = scene()
    .camera(camera.perspective({ fov: 50, position: [2, 2, 4], target: [0, 0.5, 0] }))
    .add(lights.ambient({ intensity: 1 }))
    .add(primitives.box({ material: material.pbr({ color: "#d86a3a" }) }).runtime({ id: "cube" }));
  const s = bg === "default" ? base : base.background(bg);
  const app = createAuraApp(canvas, { autoStart: false, scene: s, ...(tone === "default" ? {} : { output: { toneMapping: tone as never } }) });
  await app.ready();
  const cube = app.nodes.require("cube");
  let yaw = 0;
  return { frame(dt) { yaw += dt; cube.setRotation(0, yaw, 0); app.step(dt); } };
}

async function pbrAura(canvas: HTMLCanvasElement, sun: number, env: number, bloom: boolean, groundRough: number, hdriRef: boolean): Promise<SceneHandle> {
  const assets = defineModelAssets({ truck: { url: "/model.glb", sha256: sha } }, { license: "CC-BY 4.0, Cesium" });
  // The bench writes a bare { type, format, url } object here; an asset ref (kind "aura-asset-ref") is what the HDRI upgrade and the C-09 probe read.
  const hdriAssets = defineAuraAssets({ env: { type: "texture", format: "hdr", url: "/env.hdr" } as never });
  let s = scene()
    .background("#1a1d24")
    .camera(camera.orbit({ fov: 40, near: 0.1, far: 100, position: [4.5, 2.2, 5.5], target: [0, 0.8, 0] }))
    .add(environments.hdri({ name: "env", intensity: env, background: false, texture: (hdriRef ? hdriAssets.env : { type: "texture", format: "hdr", url: "/env.hdr" }) as never }))
    .add(lights.directional({ color: "#fff4e0", intensity: sun, position: [5, 8, 4], shadow: true }))
    .add(primitives.plane({ name: "ground", size: [30, 1, 30], material: material.pbr({ color: "#2b2f38", roughness: groundRough }) }))
    .add(model(assets.refs.truck, { name: "truck", targetHeight: 2, castShadow: true }));
  if (bloom) s = s.add(effects.bloom({ intensity: 0.35, threshold: 0.85, radius: 0.6 }));
  const app = createAuraApp(canvas, { autoStart: false, resize: false, pixelRatio: 1, output: { toneMapping: "aces" }, scene: s });
  await app.ready();
  return {
    frame(dt) { app.step(dt); },
    state() {
      const d = app.diagnostics() as unknown as { renderer?: { environment?: unknown }; environment?: unknown; renderPath?: unknown };
      return { environment: d.renderer?.environment ?? d.environment, renderPath: d.renderPath };
    }
  };
}

async function pbrThree(canvas: HTMLCanvasElement, sunI: number, env: number, bloom: boolean, groundRough: number): Promise<SceneHandle> {
  const renderer = new THREE.WebGLRenderer({ canvas });
  renderer.setPixelRatio(1);
  renderer.setSize(640, 360, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const sc = new THREE.Scene();
  sc.background = new THREE.Color("#1a1d24");
  const cam = new THREE.PerspectiveCamera(40, 640 / 360, 0.1, 100);
  cam.position.set(4.5, 2.2, 5.5);
  cam.lookAt(0, 0.8, 0);
  const hdr = await new RGBELoader().loadAsync("env.hdr");
  sc.environment = new THREE.PMREMGenerator(renderer).fromEquirectangular(hdr).texture;
  hdr.dispose();
  sc.environmentIntensity = env;
  const sun = new THREE.DirectionalLight("#fff4e0", sunI);
  sun.position.set(5, 8, 4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 30 });
  sc.add(sun);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshStandardMaterial({ color: "#2b2f38", roughness: groundRough }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  sc.add(ground);
  const truck = (await new GLTFLoader().loadAsync("model.glb")).scene;
  const box = new THREE.Box3().setFromObject(truck);
  truck.scale.setScalar(2 / (box.max.y - box.min.y));
  truck.position.y = -box.min.y * truck.scale.y;
  truck.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  sc.add(truck);
  const composer = new EffectComposer(renderer);
  composer.setSize(640, 360);
  composer.addPass(new RenderPass(sc, cam));
  if (bloom) composer.addPass(new UnrealBloomPass(new THREE.Vector2(640, 360), 0.35, 0.6, 1));
  composer.addPass(new OutputPass());
  return { frame(dt) { composer.render(dt); } };
}

/** `parts` is the set of instanced nodes kept (trunks, canopies, rocks; empty = flat ground only); `sun` and `hemi` scale the nominal 2.4 and 1.1, so a term can be switched off alone. */
interface ForestOpts { colors: "css" | "linear"; shadows: boolean; fog: boolean; parts: ReadonlySet<string>; cone7: boolean; r09: boolean; meshdims: boolean; rough1: boolean; plain: boolean; sun: number; hemi: number }

async function forestAura(canvas: HTMLCanvasElement, o: ForestOpts): Promise<SceneHandle> {
  const rng = createCountedRng(7);
  const TREES = 8000, ROCKS = 2000;
  const trunks: { position: V3; rotation: V3; scale: number }[] = [];
  const canopies: typeof trunks = [];
  const canopyColors: string[] = [];
  const rocks: typeof trunks = [];
  const rockColors: string[] = [];
  const css = (h: number, s: number, l: number): string => (o.colors === "css" ? `hsl(${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%)` : toHex(hslToRgb(h, s, l)));
  for (let i = 0; i < TREES; i++) {
    const x = (rng.next() - 0.5) * 160, z = (rng.next() - 0.5) * 160, s = 0.7 + rng.next() * 0.9, yaw = rng.next() * Math.PI * 2;
    trunks.push({ position: [x, 0.6 * s, z], rotation: [0, yaw, 0], scale: s });
    canopies.push({ position: [x, 2.1 * s, z], rotation: [0, yaw, 0], scale: s });
    // The bench writes hsl(97..126 45% 20..32%); the same numbers as hue fraction / lightness fraction here.
    const hue = Math.round(97 + rng.next() * 29) / 360;
    const light = Math.round(20 + rng.next() * 12) / 100;
    canopyColors.push(css(hue, 0.45, light));
  }
  for (let i = 0; i < ROCKS; i++) {
    const s = 0.3 + rng.next() * 0.8;
    rocks.push({ position: [(rng.next() - 0.5) * 160, 0.25 * s, (rng.next() - 0.5) * 160], rotation: [0, rng.next() * Math.PI * 2, 0], scale: s });
    rockColors.push(css(29 / 360, 0.05, Math.round(30 + rng.next() * 20) / 100));
  }
  let sc = scene()
    .background("#aab8c4")
    .camera(camera.perspective({ fov: 50, near: 0.1, far: 400, position: [0, 9, 34], target: [0, 3, 0] }))
    .add(lights.hemisphere({ skyColor: "#dce8f2", groundColor: "#4d6358", intensity: 1.1 * o.hemi }))
    .add(lights.directional({ color: "#fff4e0", intensity: 2.4 * o.sun, position: [30, 50, 20], shadow: o.shadows }));
  if (o.fog) sc = sc.add(effects.fog({ color: "#aab8c4", density: 0.012 }));
  sc = sc.add(primitives.plane({ name: "ground", size: [400, 1, 400], material: material.pbr({ color: "#566b4a", roughness: 1 }) }));
  if (o.parts.has("trunks")) sc = sc
    .add(instances.cylinder({ name: "trunks", size: [0.36, 1.2, 0.36], transforms: trunks, castShadow: o.shadows, material: material.pbr({ color: "#6b4a32", roughness: 0.95 }) }));
  if (o.parts.has("canopies")) sc = sc
    .add(instances.cone({ name: "canopies", size: o.meshdims ? [1, 1, 1] : o.r09 ? [0.9, 2.2, 0.9] : [1.8, 2.2, 1.8], transforms: canopies, ...(o.plain ? {} : { colors: canopyColors }), castShadow: o.shadows, ...(o.meshdims ? { params: { radius: 0.9, height: 2.2, radialSegments: 7 } } : o.cone7 ? { params: { radialSegments: 7 } } : {}), material: material.pbr({ color: o.plain ? toHex(hslToRgb(110 / 360, 0.45, 0.26)) : "#ffffff", roughness: o.rough1 ? 1 : 0.85 }) }));
  if (o.parts.has("rocks")) sc = sc
    .add(instances.sphere({ name: "rocks", size: [1, 1, 1], transforms: rocks, colors: rockColors, castShadow: o.shadows, material: material.pbr({ color: "#ffffff", roughness: 0.9 }) }));
  const app = createAuraApp(canvas, { autoStart: false, resize: false, pixelRatio: 1, output: { toneMapping: "aces" }, scene: sc });
  await app.ready();
  let t = 0;
  return {
    frame(dt) {
      t += dt;
      app.camera?.setPose({ position: [Math.sin(t * 0.15) * 12, 9, 34], target: [0, 3, 0], fov: 50 });
      app.step(dt);
    }
  };
}

async function forestThree(canvas: HTMLCanvasElement, o: ForestOpts): Promise<SceneHandle> {
  const renderer = new THREE.WebGLRenderer({ canvas });
  renderer.setPixelRatio(1);
  renderer.setSize(640, 360, false);
  renderer.shadowMap.enabled = o.shadows;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const sc = new THREE.Scene();
  sc.background = new THREE.Color("#aab8c4");
  if (o.fog) sc.fog = new THREE.FogExp2("#aab8c4", 0.012);
  const cam = new THREE.PerspectiveCamera(50, 640 / 360, 0.1, 400);
  cam.position.set(0, 9, 34);
  cam.lookAt(0, 3, 0);
  sc.add(new THREE.HemisphereLight("#dce8f2", "#4d6358", 1.1 * o.hemi));
  const sun = new THREE.DirectionalLight("#fff4e0", 2.4 * o.sun);
  sun.position.set(30, 50, 20);
  sun.castShadow = o.shadows;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 140 });
  sc.add(sun);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: "#566b4a", roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  sc.add(ground);
  const TREES = 8000, ROCKS = 2000;
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18, 0.18, 1.2, 6), new THREE.MeshStandardMaterial({ color: "#6b4a32", roughness: 0.95 }), TREES);
  const canopies = new THREE.InstancedMesh(new THREE.ConeGeometry(0.9, 2.2, 7), new THREE.MeshStandardMaterial({ color: o.plain ? new THREE.Color().setHSL(110 / 360, 0.45, 0.26, THREE.LinearSRGBColorSpace) : "#ffffff", roughness: o.rough1 ? 1 : 0.85 }), TREES);
  const rocks = new THREE.InstancedMesh(new THREE.SphereGeometry(0.5, 10, 8), new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.9 }), ROCKS);
  for (const [name, mesh] of [["trunks", trunks], ["canopies", canopies], ["rocks", rocks]] as const) { mesh.castShadow = o.shadows; mesh.receiveShadow = true; sc.add(mesh); if (!o.parts.has(name)) mesh.count = 0; }
  const rng = mulberry32(7);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const tint = new THREE.Color();
  // The bench calls tint.setHSL(h, s, l) with no colour space, which reads the numbers in three's linear working space.
  const space = o.colors === "css" ? THREE.SRGBColorSpace : THREE.LinearSRGBColorSpace;
  const put = (mesh: THREE.InstancedMesh, i: number, x: number, y: number, z: number, s: number, yaw: number) => {
    m.compose(new THREE.Vector3(x, y, z), q.setFromAxisAngle(up, yaw), new THREE.Vector3(s, s, s));
    mesh.setMatrixAt(i, m);
  };
  for (let i = 0; i < TREES; i++) {
    const x = (rng() - 0.5) * 160, z = (rng() - 0.5) * 160, s = 0.7 + rng() * 0.9, yaw = rng() * Math.PI * 2;
    put(trunks, i, x, 0.6 * s, z, s, yaw);
    put(canopies, i, x, 2.1 * s, z, s, yaw);
    tint.setHSL(0.27 + rng() * 0.08, 0.45, 0.2 + rng() * 0.12, space);
    if (!o.plain) canopies.setColorAt(i, tint);
  }
  for (let i = 0; i < ROCKS; i++) {
    const s = 0.3 + rng() * 0.8;
    put(rocks, i, (rng() - 0.5) * 160, 0.25 * s, (rng() - 0.5) * 160, s, rng() * Math.PI * 2);
    rocks.setColorAt(i, tint.setHSL(0.08, 0.05, 0.3 + rng() * 0.2, space));
  }
  for (const mesh of [trunks, canopies, rocks]) mesh.computeBoundingSphere();
  let t = 0;
  return {
    frame(dt) {
      t += dt;
      cam.position.x = Math.sin(t * 0.15) * 12;
      cam.lookAt(0, 3, 0);
      renderer.render(sc, cam);
    }
  };
}

async function baselineThree(canvas: HTMLCanvasElement, tone: boolean): Promise<SceneHandle> {
  const renderer = new THREE.WebGLRenderer({ canvas });
  renderer.setPixelRatio(1);
  renderer.setSize(640, 360, false);
  if (tone) renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const sc = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(50, 640 / 360, 0.1, 100);
  cam.position.set(2, 2, 4);
  cam.lookAt(0, 0.5, 0);
  sc.add(new THREE.AmbientLight("#ffffff", 1));
  const cube = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: "#d86a3a" }));
  sc.add(cube);
  return { frame(dt) { cube.rotation.y += dt; renderer.render(sc, cam); } };
}

async function start(canvas: HTMLCanvasElement): Promise<SceneHandle> {
  const [a, b, c, d] = rest;
  switch (kind) {
    case "bench": {
      const lib = b as "aura" | "three";
      if (a === "baseline") return (lib === "aura" ? baselineAuraBench : baselineThreeBench)(canvas);
      return (lib === "aura" ? forestAuraBench : forestThreeBench)(canvas);
    }
    case "cube":
      if (a === "three-aces") return baselineThree(canvas, true);
      return cubeAura(canvas, a ?? "default", b ?? "default");
    case "pbr": {
      // Optional tokens after the bloom flag: "uniform" (the spec serves a constant-radiance env.hdr), "g<roughness>" (ground roughness, default 0.9).
      const g = rest.slice(4).find((t) => /^g[0-9.]+$/.test(t));
      const groundRough = g ? Number(g.slice(1)) : 0.9;
      return a === "aura" ? pbrAura(canvas, Number(b), Number(c), d === "bloom", groundRough, rest.slice(4).includes("ref")) : pbrThree(canvas, Number(b), Number(c), d === "bloom", groundRough);
    }
    case "forest": {
      const flags = rest.slice(4);
      const o: ForestOpts = { colors: b as ForestOpts["colors"], shadows: c !== "noshadow", fog: d !== "nofog", parts: new Set(flags.includes("ground") ? [] : ["trunks", "canopies", "rocks"].filter((n) => !flags.some((f) => ["trunks", "canopies", "rocks"].includes(f)) || flags.includes(n))), cone7: flags.includes("cone7"), r09: flags.includes("r09"), meshdims: flags.includes("meshdims"), rough1: flags.includes("rough1"), plain: flags.includes("plain"), sun: flags.includes("sun0") ? 0 : 1, hemi: flags.includes("hemi0") ? 0 : 1 };
      return a === "aura" ? forestAura(canvas, o) : forestThree(canvas, o);
    }
    default:
      throw new Error(`unknown variant ${id}`);
  }
}

(window as unknown as { __VARIANT__: string }).__VARIANT__ = id;
void runBench(id, start);
