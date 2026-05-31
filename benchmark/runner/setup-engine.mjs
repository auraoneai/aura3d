import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const repoRoot = resolve(new URL("../../", import.meta.url).pathname);
const roundId = parseRoundId(process.argv.slice(2));
const roundRoot = resolve(repoRoot, "benchmark/runs", roundId);
const engineRoot = join(roundRoot, "engine");
const auraTarball = join(roundRoot, "_packages/aura3d-engine-1.0.0.tgz");

const scenes = [
  "engine-01-material-grid",
  "engine-02-city-block",
  "engine-03-particles-vfx",
  "engine-04-physics-ramp",
  "engine-05-sneaker-product"
];

function parseRoundId(args) {
  const roundArg = args.find((arg) => arg.startsWith("--round="))?.slice("--round=".length) ?? args[0];
  if (!roundArg || !/^round-[a-zA-Z0-9._-]+$/.test(roundArg)) {
    console.error("Usage: node benchmark/runner/setup-engine.mjs --round=round-N");
    process.exit(2);
  }
  return roundArg;
}

function writeJson(file, value) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function packAura3d() {
  rmSync(auraTarball, { force: true });
  mkdirSync(dirname(auraTarball), { recursive: true });
  if (process.env.AURA3D_SKIP_PACKAGE_BUILD !== "1") {
    execFileSync("pnpm", ["build"], {
      cwd: repoRoot,
      stdio: "inherit"
    });
  }
  execFileSync("npm", ["pack", "--pack-destination", dirname(auraTarball)], {
    cwd: repoRoot,
    stdio: "inherit"
  });
}

function basePackage(scene, library) {
  const aura = library === "aura3d";
  return {
    name: `${roundId}-${scene}-${library}`,
    version: "1.0.0",
    private: true,
    type: "module",
    scripts: {
      dev: "vite --host 127.0.0.1",
      typecheck: "tsc --noEmit",
      build: "npm run typecheck && vite build",
      preview: "vite preview --host 127.0.0.1"
    },
    dependencies: aura
      ? { "@aura3d/engine": `file:${auraTarball}`, three: "0.165.0" }
      : { three: "0.165.0" },
    devDependencies: {
      "@types/three": "^0.165.0",
      typescript: "^5.8.3",
      vite: "^7.3.2"
    }
  };
}

function commonFiles(sourceDir, scene, library) {
  mkdirSync(join(sourceDir, "src"), { recursive: true });
  writeJson(join(sourceDir, "package.json"), basePackage(scene, library));
  writeJson(join(sourceDir, "tsconfig.json"), {
    compilerOptions: {
      target: "ES2022",
      useDefineForClassFields: true,
      module: "ESNext",
      lib: ["ES2022", "DOM", "DOM.Iterable"],
      skipLibCheck: true,
      moduleResolution: "Bundler",
      allowImportingTsExtensions: true,
      isolatedModules: true,
      moduleDetection: "force",
      noEmit: true,
      strict: true
    },
    include: ["src"]
  });
  writeFileSync(
    join(sourceDir, "index.html"),
    [
      "<!doctype html>",
      "<html lang=\"en\">",
      "  <head>",
      "    <meta charset=\"UTF-8\" />",
      "    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" />",
      `    <title>${roundId} ${scene} ${library}</title>`,
      "  </head>",
      "  <body>",
      "    <div id=\"app\"></div>",
      "    <script type=\"module\" src=\"/src/main.ts\"></script>",
      "  </body>",
      "</html>",
      ""
    ].join("\n")
  );
}

const auraShell = `
declare global {
  interface Window {
    __ENGINE_READOUT__?: () => { drawCalls?: number; triangleCount?: number; routeHealth?: string };
    __ENGINE_READY__?: () => boolean;
  }
}

function mountShell(title: string) {
  const root = document.querySelector<HTMLElement>("#app");
  if (!root) throw new Error("Missing #app");
  root.innerHTML = "<div id='stage'></div><div class='hud'>" + title + "</div>";
  const style = document.createElement("style");
  style.textContent = [
    "html,body,#app{margin:0;width:100%;height:100%;overflow:hidden;background:#071017;color:#f8fbff;font-family:Inter,Arial,sans-serif}",
    "#stage{position:fixed;inset:0}",
    ".hud{position:fixed;left:18px;top:18px;padding:9px 11px;border:1px solid rgba(255,255,255,.22);border-radius:6px;background:rgba(5,10,16,.75);font-weight:800}"
  ].join("");
  document.head.append(style);
}

function engineReadout(app: ReturnType<typeof createAuraApp>) {
  const d = app.diagnostics();
  return { routeHealth: d.errors.length ? "fail" : "pass", drawCalls: d.drawCalls, triangleCount: undefined };
}

function engineReady(readout: { drawCalls?: number; routeHealth?: string } | undefined) {
  return readout?.routeHealth === "pass" && Number.isFinite(readout.drawCalls) && (readout.drawCalls ?? 0) > 0;
}
`;

function auraSource(sceneName) {
  if (sceneName === "engine-01-material-grid") return auraMaterialSource();
  if (sceneName === "engine-02-city-block") return auraCitySource();
  if (sceneName === "engine-04-physics-ramp") return auraPhysicsSource();
  if (sceneName === "engine-05-sneaker-product") return auraSneakerSource();
  return auraParticlesSource();
}

function auraMaterialSource() {
  return `
import { camera, createAuraApp, interactions, lights, material, primitives, scene } from "@aura3d/engine";
${auraShell}
mountShell("01 material grid");

const nodes = [
  primitives.box({ name: "matte studio plinth", material: material.pbr({ color: "#5f6875", roughness: 0.46, metallic: 0.03 }) }).position(0, 0.04, -0.52).scale([8.2, 0.12, 1.92]).toJSON(),
  primitives.box({ name: "white softbox reflection strip", material: material.emissive({ color: "#ffffff", emissive: "#ffffff" }) }).position(0, 2.0, -1.34).scale([5.9, 0.14, 0.08]).toJSON(),
  primitives.sphere({ name: "metal swatch", material: material.pbr({ color: "#eef7ff", roughness: 0.08, metallic: 1 }) }).position(-2.8, 0.82, -0.52).scale(0.86).toJSON(),
  primitives.sphere({ name: "glass swatch", material: material.pbr({ color: "#a8ecff", opacity: 0.36, roughness: 0.08, metallic: 0 }) }).position(-1.4, 0.82, -0.52).scale(0.86).toJSON(),
  primitives.sphere({ name: "rubber swatch", material: material.rubber({ color: "#151820", roughness: 1 }) }).position(0, 0.82, -0.52).scale(0.86).toJSON(),
  primitives.sphere({ name: "emissive swatch", material: material.emissive({ color: "#ff42c8", emissive: "#ff42c8" }) }).position(1.4, 0.82, -0.52).scale(0.86).toJSON(),
  primitives.sphere({ name: "clearcoat swatch", material: material.pbr({ color: "#ef233c", roughness: 0.12, metallic: 0.05 }) }).position(2.8, 0.82, -0.52).scale(0.86).toJSON()
];

const app = createAuraApp("#stage", {
  diagnostics: { overlay: false, performancePanel: false },
  pixelRatio: 1,
  scene: scene()
    .background("#071017")
    .camera(camera.perspective({ position: [0, 2.0, 7.2], target: [0, 0.82, -0.52], fov: 42 }))
    .add(interactions.orbit())
    .add(lights.ambient({ intensity: 0.62, color: "#dcecff" }))
    .add(lights.directional({ position: [-3.4, 5.5, 4.4], intensity: 1.35, color: "#ffffff" }))
    .addMany(nodes)
});
window.__ENGINE_READOUT__ = () => engineReadout(app);
window.__ENGINE_READY__ = () => engineReady(window.__ENGINE_READOUT__?.());
`;
}

function auraCitySource() {
  return `
import { camera, createAuraApp, interactions, lights, material, primitives, scene } from "@aura3d/engine";
${auraShell}
mountShell("02 city block");

const nodes: any[] = [
  primitives.plane({ name: "city ground", material: material.pbr({ color: "#9fb49b", roughness: 0.86 }) }).position(0, -0.02, 0).scale([18, 1, 18]).toJSON(),
  primitives.box({ name: "north street", material: material.pbr({ color: "#202528", roughness: 0.8 }) }).position(0, 0.02, -2.2).scale([14, 0.04, 0.32]).toJSON(),
  primitives.box({ name: "south street", material: material.pbr({ color: "#202528", roughness: 0.8 }) }).position(0, 0.02, 2.2).scale([14, 0.04, 0.32]).toJSON(),
  primitives.box({ name: "center avenue", material: material.pbr({ color: "#171b1d", roughness: 0.78 }) }).position(0, 0.03, 0).scale([0.34, 0.04, 14]).toJSON()
];
const buildingColors = ["#52636b", "#7a6b58", "#415665", "#687983"];
for (let i = 0; i < 20; i += 1) {
  const h = 0.95 + ((i * 7) % 6) * 0.34;
  const x = (i % 5 - 2) * 1.55;
  const z = (Math.floor(i / 5) - 1.5) * 1.55;
  nodes.push(primitives.box({ name: \`building \${i + 1}\`, material: material.pbr({ color: buildingColors[i % buildingColors.length], roughness: 0.72, metallic: 0.04 }) }).position(x, h / 2, z).scale([0.48, h, 0.48]).toJSON());
  for (let y = 0.42; y < h; y += 0.42) {
    nodes.push(primitives.box({ name: \`lit window band \${i + 1} \${y.toFixed(1)}\`, material: material.emissive({ color: "#dff8ff", emissive: "#dff8ff" }) }).position(x, y, z + 0.5).scale([0.34, 0.052, 0.025]).toJSON());
  }
}
for (const [index, x, z] of [[1, -3.5, -3.4], [2, 3.5, -3.4], [3, -3.5, 3.4], [4, 3.5, 3.4]] as const) {
  nodes.push(primitives.cylinder({ name: \`street light pole \${index}\`, material: material.metal({ color: "#6f7d86", roughness: 0.34 }) }).position(x, 0.34, z).scale([0.035, 0.68, 0.035]).toJSON());
  nodes.push(primitives.sphere({ name: \`street light glow \${index}\`, material: material.emissive({ color: "#ffd98a", emissive: "#ffd98a" }) }).position(x, 0.74, z).scale(0.09).toJSON());
}
nodes.push(primitives.box({ name: "day night state marker", material: material.emissive({ color: "#93c5fd", emissive: "#93c5fd" }) }).position(-4.25, 0.32, 4.45).scale([0.68, 0.16, 0.18]).toJSON());

const app = createAuraApp("#stage", {
  diagnostics: { overlay: false, performancePanel: false },
  pixelRatio: 1,
  scene: scene()
    .background("#8dcaf0")
    .camera(camera.perspective({ position: [4.8, 4.4, 6.6], target: [0, 0.85, 0], fov: 52 }))
    .add(interactions.orbit())
    .add(lights.ambient({ intensity: 0.65, color: "#dcecff" }))
    .add(lights.directional({ position: [-4, 7, 5], intensity: 1.28, color: "#ffffff" }))
    .addMany(nodes)
});
window.__ENGINE_READOUT__ = () => engineReadout(app);
window.__ENGINE_READY__ = () => engineReady(window.__ENGINE_READOUT__?.());
`;
}

function auraParticlesSource() {
  return `
import { camera, createAuraApp, effects, interactions, lights, material, prefabs, primitives, scene } from "@aura3d/engine";
${auraShell}
mountShell("03 particles vfx");
const app = createAuraApp("#stage", {
  diagnostics: { overlay: false, performancePanel: false },
  pixelRatio: 1,
  scene: scene()
    .background("#071017")
    .camera(camera.perspective({ position: [4.4, 3.0, 5.8], target: [0, 1.2, 0], fov: 48 }))
    .add(interactions.orbit())
    .add(lights.ambient({ intensity: 0.54, color: "#dcecff" }))
    .addMany(prefabs.particleFountain({ count: 1800 }))
    .add(effects.bloom({ intensity: 1.0 }))
    .add(effects.fog({ density: 0.38, color: "#08111a" }))
    .add(primitives.plane({ name: "dark floor", material: material.pbr({ color: "#101822", roughness: 0.82 }) }).rotate(-Math.PI / 2, 0, 0).scale([8, 1, 8]))
});
window.__ENGINE_READOUT__ = () => engineReadout(app);
window.__ENGINE_READY__ = () => engineReady(window.__ENGINE_READOUT__?.());
`;
}

function auraSneakerSource() {
  return `
import { assets } from "./aura-assets";
import { camera, createAuraApp, interactions, lights, model, prefabs, scene } from "@aura3d/engine";
${auraShell}
mountShell("05 sneaker product");
const app = createAuraApp("#stage", {
  diagnostics: { overlay: false, performancePanel: false },
  pixelRatio: 1,
  scene: scene()
    .background("#f8fafc")
    .camera(camera.perspective({ position: [1.65, 1.18, 4.0], target: [0, 0.72, -0.65], fov: 38 }))
    .add(interactions.orbit())
    .add(lights.ambient({ intensity: 0.52, color: "#ffffff" }))
    .add(lights.directional({ position: [-3.5, 5.2, 4.0], intensity: 1.4, color: "#ffffff" }))
    .addMany(prefabs.productStage())
    .add(model(assets.sneaker).position(0, 0.54, -0.65).rotate(0, -0.38, 0))
});
window.__ENGINE_READOUT__ = () => engineReadout(app);
window.__ENGINE_READY__ = () => engineReady(window.__ENGINE_READOUT__?.());
`;
}

function auraPhysicsSource() {
  return `
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { PhysicsWorld, Shape, type RigidBody } from "@aura3d/engine/physics";
${threePrelude("04 Aura3D physics ramp", { shadows: false })}
const world = new PhysicsWorld({ gravity: [0, -10, 0], fixedDelta: 1 / 60, solverIterations: 2 });
const bodyGround = world.createRigidBody({ type: "static", position: [0, 0, 0], friction: 0.7 });
world.createCollider(bodyGround, { shape: Shape.plane([0, 1, 0], 0), material: { friction: 0.7, restitution: 0.05 } });
const rampBody = world.createRigidBody({ type: "static", position: [0, 0, 0], friction: 0.55 });
world.createCollider(rampBody, { shape: Shape.plane([0.34, 0.94, 0], -1.3), material: { friction: 0.55, restitution: 0.08 } });
const ramp = new THREE.Mesh(new THREE.BoxGeometry(8, 0.32, 3.4), new THREE.MeshStandardMaterial({ color: "#486a91", roughness: 0.55 }));
ramp.rotation.z = -0.35; ramp.position.set(-0.06, 1.1, 0); scene.add(ramp);
const cubeGeo = new THREE.BoxGeometry(0.55, 0.55, 0.55);
const cubes: { body: RigidBody; mesh: THREE.Mesh }[] = [];
for (let i = 0; i < 16; i += 1) {
  const body = world.createRigidBody({ type: "dynamic", position: [-1.65 + (i % 4) * 0.65, 2.55 + Math.floor(i / 4) * 0.58, -1.0 + (i % 4) * 0.55], mass: 1, friction: 0.45, restitution: 0.08 });
  world.createCollider(body, { shape: Shape.box(0.275, 0.275, 0.275), material: { friction: 0.45, restitution: 0.08 } });
  const mesh = new THREE.Mesh(cubeGeo, new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(i / 16, 0.58, 0.58), roughness: 0.48 }));
  scene.add(mesh); cubes.push({ body, mesh });
}
function sync() {
  world.step(1 / 60);
  for (const cube of cubes) {
    const p = cube.body.position;
    cube.mesh.position.set(p[0], p[1], p[2]);
  }
}
animate(sync);
`;
}

function threePrelude(title, options = {}) {
  const shadows = options.shadows === true;
  return `
declare global { interface Window { __ENGINE_READOUT__?: () => { drawCalls?: number; triangleCount?: number; routeHealth?: string }; __ENGINE_READY__?: () => boolean } }
const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("Missing #app");
root.innerHTML = "<canvas id='c'></canvas><div class='hud'>${title}</div>";
const style = document.createElement("style");
style.textContent = "html,body,#app{margin:0;width:100%;height:100%;overflow:hidden;background:#071017;color:#fff;font-family:Inter,Arial,sans-serif}canvas{display:block;width:100%;height:100%}.hud{position:fixed;left:18px;top:18px;padding:9px 11px;border:1px solid rgba(255,255,255,.22);border-radius:6px;background:rgba(5,10,16,.75);font-weight:800}";
document.head.append(style);
const canvas = document.querySelector<HTMLCanvasElement>("#c")!;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
renderer.setPixelRatio(1);
renderer.shadowMap.enabled = ${shadows ? "true" : "false"};
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
const scene = new THREE.Scene();
scene.background = new THREE.Color("#071017");
const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 400);
camera.position.set(6, 4.2, 7);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1, 0); controls.enableDamping = true;
scene.add(new THREE.HemisphereLight("#b9d8ff", "#18212c", 0.7));
const key = new THREE.DirectionalLight("#ffffff", 1.8);
key.position.set(-5, 8, 6); key.castShadow = ${shadows ? "true" : "false"}; scene.add(key);
const fill = new THREE.PointLight("#87ceff", 0.9); fill.position.set(4, 3, -4); scene.add(fill);
function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
addEventListener("resize", resize); resize();
function animate(step?: () => void) {
  function frame() {
    step?.();
    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  frame();
}
window.__ENGINE_READOUT__ = () => ({ routeHealth: "pass", drawCalls: renderer.info.render.calls, triangleCount: renderer.info.render.triangles });
window.__ENGINE_READY__ = () => renderer.info.render.calls > 0;
`;
}

function threeSource(sceneName) {
  const title = sceneName.replace("engine-", "").replaceAll("-", " ");
  const imports = `
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
${sceneName === "engine-05-sneaker-product" ? 'import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";' : ""}
`;
  if (sceneName === "engine-01-material-grid") {
    return `${imports}${threePrelude(title)}
const mats = [
  new THREE.MeshStandardMaterial({ color: "#d9e6ef", metalness: 1, roughness: 0.18 }),
  new THREE.MeshStandardMaterial({ color: "#99e8ff", transparent: true, opacity: 0.42, roughness: 0.04 }),
  new THREE.MeshStandardMaterial({ color: "#111114", roughness: 0.92 }),
  new THREE.MeshBasicMaterial({ color: "#ff4bd8" }),
  new THREE.MeshStandardMaterial({ color: "#ef233c", metalness: 0.05, roughness: 0.18 })
];
for (let i = 0; i < 5; i += 1) {
  const s = new THREE.Mesh(new THREE.SphereGeometry(0.72, 24, 12), mats[i]);
  s.position.set((i - 2) * 1.45, 0.82, -0.52); scene.add(s);
}
const shelf = new THREE.Mesh(new THREE.BoxGeometry(8.2, 0.12, 1.92), new THREE.MeshStandardMaterial({ color: "#5f6875", roughness: 0.46 }));
shelf.position.set(0, 0.04, -0.52); scene.add(shelf);
animate();`;
  }
  if (sceneName === "engine-02-city-block") {
    return `${imports}${threePrelude(title)}
scene.background = new THREE.Color("#8dcaf0");
const ground = new THREE.Mesh(new THREE.PlaneGeometry(18, 18), new THREE.MeshStandardMaterial({ color: "#9fb49b", roughness: 0.86 }));
ground.rotation.x = -Math.PI / 2; scene.add(ground);
const buildingGeo = new THREE.BoxGeometry(1, 1, 1);
const windowGeo = new THREE.BoxGeometry(1, 1, 1);
for (let i = 0; i < 20; i += 1) {
  const h = 0.95 + ((i * 7) % 6) * 0.34;
  const x = (i % 5 - 2) * 1.55;
  const z = (Math.floor(i / 5) - 1.5) * 1.55;
  const b = new THREE.Mesh(buildingGeo, new THREE.MeshStandardMaterial({ color: ["#52636b", "#7a6b58", "#415665", "#687983"][i % 4], roughness: 0.72 }));
  b.position.set(x, h / 2, z); b.scale.set(0.48, h, 0.48); scene.add(b);
  for (let y = 0.42; y < h; y += 0.42) {
    const w = new THREE.Mesh(windowGeo, new THREE.MeshBasicMaterial({ color: "#dff8ff" }));
    w.position.set(x, y, z + 0.5); w.scale.set(0.34, 0.052, 0.025); scene.add(w);
  }
}
for (const [x, z] of [[-3.5,-3.4],[3.5,-3.4],[-3.5,3.4],[3.5,3.4]]) {
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.68, 8), new THREE.MeshStandardMaterial({ color: "#6f7d86" }));
  pole.position.set(x, 0.34, z); scene.add(pole);
  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8), new THREE.MeshBasicMaterial({ color: "#ffd98a" }));
  glow.position.set(x, 0.74, z); scene.add(glow);
}
animate();`;
  }
  if (sceneName === "engine-03-particles-vfx") {
    return `${imports}${threePrelude(title)}
scene.fog = new THREE.Fog("#071017", 5, 18);
const group = new THREE.Group(); scene.add(group);
const geo = new THREE.SphereGeometry(0.04, 8, 6);
for (let i = 0; i < 260; i += 1) {
  const a = i * 0.37, r = 0.25 + (i % 80) * 0.025, y = (i % 145) * 0.022;
  const p = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL((i % 80) / 80, 0.9, 0.62) }));
  p.position.set(Math.cos(a) * r, y, Math.sin(a) * r); group.add(p);
}
const emitter = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.7, 24), new THREE.MeshBasicMaterial({ color: "#50e6ff" }));
emitter.position.y = 0.35; scene.add(emitter);
animate(() => { group.rotation.y += 0.006; });`;
  }
  if (sceneName === "engine-04-physics-ramp") {
    return `${imports}${threePrelude(title)}
const ramp = new THREE.Mesh(new THREE.BoxGeometry(8, 0.32, 3.4), new THREE.MeshStandardMaterial({ color: "#486a91", roughness: 0.55 }));
ramp.rotation.z = -0.35; ramp.position.set(-0.06, 1.1, 0); scene.add(ramp);
const cubes: THREE.Mesh[] = []; const geo = new THREE.BoxGeometry(0.55, 0.55, 0.55);
for (let i = 0; i < 28; i += 1) {
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(i / 28, 0.58, 0.58), roughness: 0.48 }));
  m.position.set(-2.1 + (i % 7) * 0.55, 1.1 + Math.floor(i / 7) * 0.46, -1.2 + (i % 4) * 0.62);
  scene.add(m); cubes.push(m);
}
animate(() => { for (let i = 0; i < cubes.length; i += 1) { const m = cubes[i]; m.rotation.x += 0.01; m.rotation.y += 0.006; m.position.y = Math.max(0.4, m.position.y - 0.012 + (i % 3) * 0.002); } });`;
  }
  return `${imports}${threePrelude(title)}
let sneakerReady = false;
let sneakerError: string | null = null;
const loader = new GLTFLoader();
const plinth = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.65, 0.55, 48), new THREE.MeshStandardMaterial({ color: "#d8dde6", roughness: 0.35 }));
plinth.position.y = 0.28; scene.add(plinth);
loader.load("/benchmark/assets/sneaker.glb", (gltf) => {
  const obj = gltf.scene;
  const box = new THREE.Box3().setFromObject(obj); const size = new THREE.Vector3(); box.getSize(size); const center = new THREE.Vector3(); box.getCenter(center);
  obj.position.sub(center); obj.scale.setScalar(2.6 / Math.max(size.x, size.y, size.z)); obj.position.y = 0.65; scene.add(obj); sneakerReady = true;
}, undefined, (error) => { sneakerError = error instanceof Error ? error.message : String(error); });
window.__ENGINE_READOUT__ = () => ({ routeHealth: sneakerError ? "fail" : "pass", drawCalls: renderer.info.render.calls, triangleCount: renderer.info.render.triangles });
window.__ENGINE_READY__ = () => sneakerReady && renderer.info.render.calls > 0;
animate(() => { scene.rotation.y += 0.002; });`;
}

function writeScene(sceneName) {
  const sceneDir = join(engineRoot, sceneName);
  mkdirSync(sceneDir, { recursive: true });
  writeFileSync(
    join(sceneDir, "notes.md"),
    [
      `scene: ${sceneName}`,
      "visual target: match benchmark/engine/README.md with production-preview runtime capture",
      "performance setup: lean equivalent scene geometry; no benchmark-result data copied from prior rounds",
      sceneName === "engine-05-sneaker-product" ? "allowed asset: benchmark/assets/sneaker.glb" : "allowed asset: none",
      ""
    ].join("\n")
  );
  for (const library of ["aura3d", "threejs"]) {
    const dir = join(sceneDir, library);
    rmSync(dir, { recursive: true, force: true });
    const sourceDir = join(dir, "source");
    commonFiles(sourceDir, sceneName, library);
    writeFileSync(join(sourceDir, "src/main.ts"), library === "aura3d" ? auraSource(sceneName) : threeSource(sceneName));
    if (sceneName === "engine-05-sneaker-product") {
      const assetDir = join(sourceDir, "public/benchmark/assets");
      mkdirSync(assetDir, { recursive: true });
      cpSync(resolve(repoRoot, "benchmark/assets/sneaker.glb"), join(assetDir, "sneaker.glb"));
      if (library === "aura3d") {
        writeFileSync(
          join(sourceDir, "src/aura-assets.ts"),
          [
            "import { defineAuraAssets } from \"@aura3d/engine\";",
            "",
            "export const assets = defineAuraAssets({",
            "  sneaker: { type: \"model\", format: \"glb\", url: \"/benchmark/assets/sneaker.glb\" }",
            "});",
            ""
          ].join("\n")
        );
      }
    }
    writeFileSync(
      join(dir, "notes.md"),
      [
        `scene: ${sceneName}`,
        `library: ${library === "aura3d" ? "Aura3D" : "Three.js"}`,
        "install command: npm install",
        "build command: npm run build",
        "run command: npm run preview -- --port <assigned-port> --strictPort",
        "capture mode: production preview after Vite build",
        ""
      ].join("\n")
    );
  }
}

if (existsSync(engineRoot)) {
  console.error(`${engineRoot} already exists. Remove it explicitly before preparing a new engine round.`);
  process.exit(1);
}
packAura3d();
for (const sceneName of scenes) writeScene(sceneName);
console.log(`Prepared ${scenes.length * 2} engine scene implementations under ${engineRoot}`);
