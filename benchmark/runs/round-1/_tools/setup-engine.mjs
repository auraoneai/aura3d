import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const repoRoot = resolve(new URL("../../../../", import.meta.url).pathname);
const roundRoot = resolve(repoRoot, "benchmark/runs/round-1");
const engineRoot = join(roundRoot, "engine");
const auraTarball = join(roundRoot, "_packages/aura3d-engine-1.0.0.tgz");

const scenes = [
  "engine-01-material-grid",
  "engine-02-city-block",
  "engine-03-particles-vfx",
  "engine-04-physics-ramp",
  "engine-05-sneaker-product"
];

function writeJson(file, value) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function basePackage(scene, library) {
  const aura = library === "aura3d";
  return {
    name: `round1-${scene}-${library}`,
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
      "    <title>Round 1 Engine Benchmark</title>",
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

const auraCommon = `
declare global {
  interface Window {
    __ENGINE_READOUT__?: () => { drawCalls?: number; triangleCount?: number; routeHealth?: string };
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
    ".hud{position:fixed;left:18px;top:18px;padding:10px 12px;border:1px solid rgba(255,255,255,.22);border-radius:8px;background:rgba(5,10,16,.75);font-weight:800;letter-spacing:.02em}"
  ].join("");
  document.head.append(style);
}
`;

function auraSource(scene) {
  if (scene === "engine-04-physics-ramp") return auraPhysicsSource();
  const title = scene.replace("engine-", "").replaceAll("-", " ");
  const nodes = {
    "engine-01-material-grid": `
      .add(primitives.sphere({ name: "metal", material: material.pbr({ color: "#bfc7d5", metallic: 1, roughness: 0.18 }) }).position(-4, 1.2, 0).scale(1.1))
      .add(primitives.sphere({ name: "glass", material: material.pbr({ color: "#d9f6ff", metallic: 0, roughness: 0.02 }) }).position(-2, 1.2, 0).scale(1.1))
      .add(primitives.sphere({ name: "rubber", material: material.pbr({ color: "#19191b", metallic: 0, roughness: 0.9 }) }).position(0, 1.2, 0).scale(1.1))
      .add(primitives.sphere({ name: "emissive", material: material.emissive({ color: "#ff45c8", emissive: "#ff45c8", roughness: 0.25 }) }).position(2, 1.2, 0).scale(1.1))
      .add(primitives.sphere({ name: "clearcoat", material: material.pbr({ color: "#ffdf9b", metallic: 0, roughness: 0.1 }) }).position(4, 1.2, 0).scale(1.1))
      .add(primitives.box({ name: "studio-shelf", size: [10.5, 0.18, 2.2], material: material.pbr({ color: "#444b55", roughness: 0.35 }) }).position(0, -0.12, 0))`,
    "engine-02-city-block": Array.from({ length: 20 }, (_, i) => {
      const x = (i % 5 - 2) * 2.2;
      const z = (Math.floor(i / 5) - 1.5) * 2.2;
      const h = 1.2 + ((i * 7) % 6) * 0.45;
      return `.add(primitives.box({ name: "building-${i}", size: [1.25, ${h.toFixed(2)}, 1.25], material: material.pbr({ color: "${i % 3 === 0 ? "#6c7a7e" : i % 3 === 1 ? "#8a7558" : "#415665"}", roughness: 0.75 }) }).position(${x.toFixed(2)}, ${(h / 2).toFixed(2)}, ${z.toFixed(2)}))`;
    }).join("\n      ") + `
      .add(primitives.plane({ name: "streets", size: [14, 14, 1], material: material.pbr({ color: "#202629", roughness: 0.85 }) }).rotate(-Math.PI / 2, 0, 0))`,
    "engine-03-particles-vfx": Array.from({ length: 80 }, (_, i) => {
      const a = i * 0.47;
      const r = 0.25 + (i % 17) * 0.08;
      const y = 0.2 + (i % 23) * 0.11;
      return `.add(primitives.sphere({ name: "spark-${i}", material: material.emissive({ color: "${i % 3 === 0 ? "#66e6ff" : i % 3 === 1 ? "#ffd166" : "#ff5ac8"}", emissive: "${i % 3 === 0 ? "#66e6ff" : i % 3 === 1 ? "#ffd166" : "#ff5ac8"}" }) }).position(${(Math.cos(a) * r).toFixed(2)}, ${y.toFixed(2)}, ${(Math.sin(a) * r).toFixed(2)}).scale(0.08))`;
    }).join("\n      ") + `
      .add(effects.bloom({ intensity: 1.2 }))
      .add(effects.fog({ density: 0.45, color: "#08111a" }))
      .add(primitives.plane({ name: "dark-floor", size: [10, 10, 1], material: material.pbr({ color: "#101822", roughness: 0.82 }) }).rotate(-Math.PI / 2, 0, 0))`,
    "engine-05-sneaker-product": `
      .add(model(assets.sneaker, { name: "sneaker", scale: 2.8, position: [0, 1.05, 0], castShadow: true, receiveShadow: true }))
      .add(primitives.sphere({ name: "soft-plinth", material: material.pbr({ color: "#d9dde5", roughness: 0.35 }) }).position(0, 0.25, 0).scale([2.8, 0.28, 2.8]))`
  }[scene];

  const assetImport = scene === "engine-05-sneaker-product"
    ? `const assets = defineAuraAssets({ sneaker: { type: "model", format: "glb", url: "/benchmark/assets/sneaker.glb" } });`
    : "";
  const imports = scene === "engine-05-sneaker-product"
    ? "camera, createAuraApp, defineAuraAssets, effects, interactions, lights, material, model, primitives, scene"
    : "camera, createAuraApp, effects, interactions, lights, material, primitives, scene";
  return `
import { ${imports} } from "@aura3d/engine";
${auraCommon}
mountShell("${title}");
${assetImport}
const app = createAuraApp("#stage", {
  diagnostics: { overlay: false, performancePanel: false },
  pixelRatio: Math.min(devicePixelRatio, 2),
  scene: scene()
    .background("${scene === "engine-02-city-block" ? "#8dcaf0" : "#071017"}")
    .camera(camera.orbit({ position: [6, 4.2, 7], target: [0, 1, 0], distance: 8.5, fov: 48 }))
    .add(interactions.orbit())
    .add(lights.ambient({ intensity: 0.55, color: "#dcecff" }))
    .add(lights.directional({ position: [-4, 7, 5], intensity: 1.4, color: "#ffffff" }))
    .add(lights.point({ position: [4, 3.5, -3], intensity: 0.9, color: "#8bd6ff" }))
    ${nodes}
});
window.__ENGINE_READOUT__ = () => {
  const d = app.diagnostics();
  return { routeHealth: d.errors.length ? "fail" : "pass", drawCalls: d.drawCalls, triangleCount: undefined };
};
`;
}

function auraPhysicsSource() {
  return `
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { PhysicsWorld, Shape, type RigidBody } from "@aura3d/engine/physics";
${threePrelude("Aura3D physics ramp")}
const world = new PhysicsWorld({ gravity: [0, -10, 0], fixedDelta: 1 / 90, solverIterations: 8 });
const bodyGround = world.createRigidBody({ type: "static", position: [0, 0, 0], friction: 0.7 });
world.createCollider(bodyGround, { shape: Shape.plane([0, 1, 0], 0), material: { friction: 0.7, restitution: 0.05 } });
const rampBody = world.createRigidBody({ type: "static", position: [0, 0, 0], friction: 0.55 });
world.createCollider(rampBody, { shape: Shape.plane([0.34, 0.94, 0], -1.3), material: { friction: 0.55, restitution: 0.08 } });
const ramp = new THREE.Mesh(new THREE.BoxGeometry(9, 0.35, 4), new THREE.MeshStandardMaterial({ color: "#486a91", roughness: 0.55 }));
ramp.rotation.z = -0.35; ramp.position.set(-0.06, 1.13, 0); ramp.castShadow = true; ramp.receiveShadow = true; scene.add(ramp);
const cubeGeo = new THREE.BoxGeometry(0.55, 0.55, 0.55);
const cubes: { body: RigidBody; mesh: THREE.Mesh }[] = [];
for (let i = 0; i < 60; i++) {
  const body = world.createRigidBody({ type: "dynamic", position: [-3 + (i % 8) * 0.55, 4 + Math.floor(i / 8) * 0.65, -1.5 + (i % 5) * 0.6], mass: 1, friction: 0.45, restitution: 0.08 });
  world.createCollider(body, { shape: Shape.box(0.275, 0.275, 0.275), material: { friction: 0.45, restitution: 0.08 } });
  const mesh = new THREE.Mesh(cubeGeo, new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(i / 60, 0.58, 0.58), roughness: 0.48 }));
  mesh.castShadow = true; mesh.receiveShadow = true; scene.add(mesh); cubes.push({ body, mesh });
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

function threePrelude(title) {
  return `
declare global { interface Window { __ENGINE_READOUT__?: () => { drawCalls?: number; triangleCount?: number; routeHealth?: string } } }
const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("Missing #app");
root.innerHTML = "<canvas id='c'></canvas><div class='hud'>${title}</div>";
const style = document.createElement("style");
style.textContent = "html,body,#app{margin:0;width:100%;height:100%;overflow:hidden;background:#071017;color:#fff;font-family:Inter,Arial,sans-serif}canvas{display:block;width:100%;height:100%}.hud{position:fixed;left:18px;top:18px;padding:10px 12px;border:1px solid rgba(255,255,255,.22);border-radius:8px;background:rgba(5,10,16,.75);font-weight:800}";
document.head.append(style);
const canvas = document.querySelector<HTMLCanvasElement>("#c")!;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
const scene = new THREE.Scene();
scene.background = new THREE.Color("#071017");
const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 400);
camera.position.set(7, 5, 8);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1, 0); controls.enableDamping = true;
scene.add(new THREE.HemisphereLight("#b9d8ff", "#18212c", 0.7));
const key = new THREE.DirectionalLight("#ffffff", 2.0);
key.position.set(-5, 8, 6); key.castShadow = true; scene.add(key);
const fill = new THREE.PointLight("#87ceff", 1.1); fill.position.set(4, 3, -4); scene.add(fill);
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
`;
}

function threeSource(sceneName) {
  const title = sceneName.replace("engine-", "").replaceAll("-", " ");
  const imports = `
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
${sceneName === "engine-05-sneaker-product" ? 'import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";' : ""}
`;
  let body = "";
  if (sceneName === "engine-01-material-grid") {
    body = `
const mats = [
  new THREE.MeshPhysicalMaterial({ color: "#cbd5e1", metalness: 1, roughness: 0.18 }),
  new THREE.MeshPhysicalMaterial({ color: "#d9f7ff", transmission: 0.65, opacity: 0.45, transparent: true, roughness: 0.02 }),
  new THREE.MeshPhysicalMaterial({ color: "#111114", roughness: 0.92 }),
  new THREE.MeshStandardMaterial({ color: "#ff4bd8", emissive: "#ff4bd8", emissiveIntensity: 1.8 }),
  new THREE.MeshPhysicalMaterial({ color: "#ffcf91", clearcoat: 1, clearcoatRoughness: 0.05, roughness: 0.18 })
];
for (let i=0;i<5;i++){ const s=new THREE.Mesh(new THREE.SphereGeometry(0.82,64,32),mats[i]); s.position.set((i-2)*1.85,1,0); s.castShadow=true; s.receiveShadow=true; scene.add(s); }
const shelf=new THREE.Mesh(new THREE.BoxGeometry(10.5,.18,2.3),new THREE.MeshStandardMaterial({color:"#4a525d",roughness:.45})); shelf.receiveShadow=true; scene.add(shelf);
animate();`;
  } else if (sceneName === "engine-02-city-block") {
    body = `
scene.background = new THREE.Color("#8dcaf0");
const ground=new THREE.Mesh(new THREE.PlaneGeometry(20,20),new THREE.MeshStandardMaterial({color:"#a7b09d",roughness:.9})); ground.rotation.x=-Math.PI/2; ground.receiveShadow=true; scene.add(ground);
for(let i=0;i<20;i++){ const h=1.2+((i*7)%6)*.45; const b=new THREE.Mesh(new THREE.BoxGeometry(1.25,h,1.25),new THREE.MeshStandardMaterial({color:i%3===0?"#6c7a7e":i%3===1?"#8a7558":"#415665",roughness:.72})); b.position.set((i%5-2)*2.2,h/2,(Math.floor(i/5)-1.5)*2.2); b.castShadow=true; b.receiveShadow=true; scene.add(b); for(let y=.45;y<h-.15;y+=.45){for(const side of [-.64,.64]){const w=new THREE.Mesh(new THREE.PlaneGeometry(.18,.18),new THREE.MeshBasicMaterial({color:"#dff8ff"})); w.position.set(b.position.x+side,y,b.position.z+.66); scene.add(w);}} }
for(let i=-3;i<=3;i++){ const road=new THREE.Mesh(new THREE.BoxGeometry(.18,.02,16),new THREE.MeshBasicMaterial({color:"#171b1d"})); road.position.set(i*2.2,.03,0); scene.add(road); }
animate();`;
  } else if (sceneName === "engine-03-particles-vfx") {
    body = `
scene.fog = new THREE.Fog("#071017", 5, 18);
const group=new THREE.Group(); scene.add(group);
const geo=new THREE.SphereGeometry(.045,12,8);
for(let i=0;i<450;i++){ const a=i*.37, r=.25+(i%90)*.025, y=(i%160)*.022; const mat=new THREE.MeshBasicMaterial({color:new THREE.Color().setHSL((i%80)/80,.9,.62)}); const p=new THREE.Mesh(geo,mat); p.position.set(Math.cos(a)*r,y,Math.sin(a)*r); group.add(p); }
const emitter=new THREE.Mesh(new THREE.ConeGeometry(.32,.7,32),new THREE.MeshStandardMaterial({color:"#50e6ff",emissive:"#0db7ff",emissiveIntensity:.9})); emitter.position.y=.35; scene.add(emitter);
const floor=new THREE.Mesh(new THREE.PlaneGeometry(10,10),new THREE.MeshStandardMaterial({color:"#101822",roughness:.85})); floor.rotation.x=-Math.PI/2; scene.add(floor);
animate(()=>{group.rotation.y+=.006;});`;
  } else if (sceneName === "engine-04-physics-ramp") {
    body = `
const ramp=new THREE.Mesh(new THREE.BoxGeometry(9,.35,4),new THREE.MeshStandardMaterial({color:"#486a91",roughness:.55})); ramp.rotation.z=-.35; ramp.position.set(-.06,1.13,0); ramp.castShadow=true; ramp.receiveShadow=true; scene.add(ramp);
const floor=new THREE.Mesh(new THREE.PlaneGeometry(14,10),new THREE.MeshStandardMaterial({color:"#17202c",roughness:.85})); floor.rotation.x=-Math.PI/2; scene.add(floor);
const cubes: THREE.Mesh[]=[]; const geo=new THREE.BoxGeometry(.55,.55,.55);
for(let i=0;i<60;i++){ const m=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({color:new THREE.Color().setHSL(i/60,.58,.58),roughness:.48})); m.position.set(-3+(i%8)*.55,1.1+Math.floor(i/8)*.46,-1.5+(i%5)*.6); m.castShadow=true; scene.add(m); cubes.push(m); }
animate(()=>{ for(let i=0;i<cubes.length;i++){ const m=cubes[i]; m.rotation.x+=.01; m.rotation.y+=.006; m.position.y=Math.max(.4, m.position.y-.012+(i%3)*.002); } });`;
  } else {
    body = `
const loader = new GLTFLoader();
const plinth = new THREE.Mesh(new THREE.CylinderGeometry(2.5,2.65,.55,96), new THREE.MeshStandardMaterial({color:"#d8dde6",roughness:.35}));
plinth.position.y=.28; plinth.receiveShadow=true; scene.add(plinth);
loader.load("/benchmark/assets/sneaker.glb", (gltf) => {
  const obj = gltf.scene; obj.traverse((child) => { if (child instanceof THREE.Mesh) { child.castShadow = true; child.receiveShadow = true; } });
  const box = new THREE.Box3().setFromObject(obj); const size = new THREE.Vector3(); box.getSize(size); const center = new THREE.Vector3(); box.getCenter(center);
  obj.position.sub(center); obj.scale.setScalar(2.6 / Math.max(size.x, size.y, size.z)); obj.position.y = .65; scene.add(obj);
});
animate(()=>{ scene.rotation.y += .002; });`;
  }
  return `${imports}${threePrelude(title)}${body}`;
}

for (const sceneName of scenes) {
  for (const library of ["aura3d", "threejs"]) {
    const dir = join(engineRoot, sceneName, library);
    rmSync(dir, { recursive: true, force: true });
    const sourceDir = join(dir, "source");
    commonFiles(sourceDir, sceneName, library);
    writeFileSync(join(sourceDir, "src/main.ts"), library === "aura3d" ? auraSource(sceneName) : threeSource(sceneName));
    if (sceneName === "engine-05-sneaker-product") {
      const assetDir = join(sourceDir, "public/benchmark/assets");
      mkdirSync(assetDir, { recursive: true });
      cpSync(resolve(repoRoot, "benchmark/assets/sneaker.glb"), join(assetDir, "sneaker.glb"));
    }
    writeFileSync(
      join(dir, "notes.md"),
      [
        `scene: ${sceneName}`,
        `library: ${library === "aura3d" ? "Aura3D" : "Three.js"}`,
        "install command: npm install",
        "build command: npm run build",
        "run command: npm run dev -- --port <assigned-port>",
        ""
      ].join("\n")
    );
  }
}

console.log(`Prepared ${scenes.length * 2} engine scene implementations under ${engineRoot}`);
