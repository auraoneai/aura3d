// Product viewer for the provided sneaker.glb.
//
// Requirements satisfied here:
//   - sneaker loaded & visible            -> GLTFLoader on the Aura3D typed asset
//   - centered & auto-scaled              -> Box3 measure + fit-to-target + recenter
//   - plinth / product base visible       -> cylinder plinth on a studio floor
//   - studio lighting (readable material) -> 3-point lights + RoomEnvironment IBL
//   - orbit controls                      -> OrbitControls (drag / zoom / pan)
//   - rotating turntable                  -> product group spun every frame
//
// Asset discipline: the ONLY model path comes from the Aura3D typed asset
// module (`assets.sneaker.url`). No invented paths.

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

import { assets } from "./aura-assets";
import { compilePromptPlan, definePromptPlan } from "@aura3d/engine";

// ---------------------------------------------------------------------------
// Aura3D scene intent (authoring layer). We describe the product-viewer plan
// with the public Aura3D API and surface its acceptance criteria / repair
// hints in the console. The live render below is driven by three.js so the
// orbit + turntable interaction the prompt requires actually works.
// ---------------------------------------------------------------------------
try {
  const plan = definePromptPlan({
    sceneType: "product-viewer",
    subject: { asset: assets.sneaker, label: "studio sneaker" },
    style: "premium studio product inspection",
    environment: "neutral studio sweep, plinth base, soft contact shadow",
    camera: { preset: "product-orbit" },
    lighting: { preset: "studio-softbox" },
    effects: ["bloom"],
    interaction: "orbit",
    acceptanceCriteria: [
      "sneaker is centered, auto-scaled, and recognizable",
      "studio key/fill/rim lighting keeps the material readable",
      "the sneaker rests on a visible plinth with a turntable spin",
    ],
    negativeCriteria: ["floating asset", "flat unlit material", "off-center framing"],
  } as const);
  const compiled = compilePromptPlan(plan);
  console.info("[Aura3D] visual systems:", compiled.report.visualSystems);
  if (compiled.report.repairHints.length > 0) {
    console.info("[Aura3D] repair hints:", compiled.report.repairHints);
  }
} catch (err) {
  console.warn("[Aura3D] prompt plan compile skipped:", err);
}

// ---------------------------------------------------------------------------
// DOM scaffold
// ---------------------------------------------------------------------------
const root = document.querySelector<HTMLDivElement>("#app");
if (!root) throw new Error("Missing #app container");

const style = document.createElement("style");
style.textContent = `
  :root { color-scheme: dark; }
  html, body { margin: 0; height: 100%; background: #0c0f14; overflow: hidden; }
  #app { position: fixed; inset: 0; }
  #viewer { display: block; width: 100%; height: 100%; }
  .hud {
    position: fixed; left: 20px; bottom: 18px; z-index: 5;
    font: 13px/1.45 -apple-system, system-ui, "Segoe UI", Roboto, sans-serif;
    color: #e7ecf3; pointer-events: none; text-shadow: 0 1px 3px rgba(0,0,0,.6);
  }
  .hud h1 { margin: 0 0 2px; font-size: 15px; font-weight: 600; letter-spacing: .2px; }
  .hud p { margin: 0; opacity: .72; }
  .panel {
    position: fixed; right: 18px; top: 18px; z-index: 5; display: flex; gap: 8px;
  }
  .panel button {
    pointer-events: auto; cursor: pointer; border: 1px solid rgba(255,255,255,.16);
    background: rgba(22,27,35,.78); color: #e7ecf3; backdrop-filter: blur(6px);
    border-radius: 8px; padding: 7px 12px; font: 12px system-ui, sans-serif;
  }
  .panel button:hover { background: rgba(40,48,60,.9); }
  .loader {
    position: fixed; inset: 0; z-index: 10; display: grid; place-items: center;
    color: #aab4c2; font: 14px system-ui, sans-serif; background: #0c0f14;
    transition: opacity .5s ease; pointer-events: none;
  }
  .loader.hidden { opacity: 0; }
  .loader .err { color: #ff8d7a; max-width: 60ch; text-align: center; padding: 0 24px; }
`;
document.head.appendChild(style);

const canvas = document.createElement("canvas");
canvas.id = "viewer";
root.appendChild(canvas);

const hud = document.createElement("div");
hud.className = "hud";
hud.innerHTML =
  "<h1>Studio Sneaker</h1><p>Drag to orbit &middot; scroll to zoom &middot; right-drag to pan</p>";
root.appendChild(hud);

const panel = document.createElement("div");
panel.className = "panel";
const spinBtn = document.createElement("button");
spinBtn.textContent = "Pause turntable";
const frameBtn = document.createElement("button");
frameBtn.textContent = "Reset view";
panel.append(spinBtn, frameBtn);
root.appendChild(panel);

const loaderEl = document.createElement("div");
loaderEl.className = "loader";
loaderEl.textContent = "Loading sneaker…";
root.appendChild(loaderEl);

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();

// Studio sweep backdrop (vertical gradient).
scene.background = makeGradientBackground();

// Image-based lighting so the PBR materials read cleanly.
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

// ---------------------------------------------------------------------------
// Camera + orbit controls
// ---------------------------------------------------------------------------
const camera = new THREE.PerspectiveCamera(
  42,
  window.innerWidth / window.innerHeight,
  0.1,
  100,
);
const HOME = new THREE.Vector3(2.6, 1.8, 3.4);
camera.position.copy(HOME);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.075;
controls.minDistance = 2.2;
controls.maxDistance = 9;
controls.maxPolarAngle = Math.PI * 0.5; // stay above the floor
controls.target.set(0, 1.05, 0);
controls.update();

// ---------------------------------------------------------------------------
// Studio lighting (key / fill / rim + ambient)
// ---------------------------------------------------------------------------
scene.add(new THREE.HemisphereLight(0xdfe8f5, 0x202833, 0.55));

const key = new THREE.DirectionalLight(0xffffff, 3.0);
key.position.set(4, 6.5, 4);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.near = 1;
key.shadow.camera.far = 24;
key.shadow.camera.left = -5;
key.shadow.camera.right = 5;
key.shadow.camera.top = 5;
key.shadow.camera.bottom = -5;
key.shadow.bias = -0.0002;
key.shadow.normalBias = 0.02;
scene.add(key);

const fill = new THREE.DirectionalLight(0xbcd2ff, 1.1);
fill.position.set(-5, 3, 2.5);
scene.add(fill);

const rim = new THREE.DirectionalLight(0xffffff, 2.0);
rim.position.set(-2.5, 4, -5);
scene.add(rim);

// ---------------------------------------------------------------------------
// Floor + plinth (product base)
// ---------------------------------------------------------------------------
const floor = new THREE.Mesh(
  new THREE.CircleGeometry(14, 64),
  new THREE.MeshStandardMaterial({ color: 0x14181f, roughness: 0.95, metalness: 0 }),
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const PLINTH_HEIGHT = 0.45;
const PLINTH_RADIUS = 1.25;
const plinth = new THREE.Group();
const plinthBody = new THREE.Mesh(
  new THREE.CylinderGeometry(PLINTH_RADIUS, PLINTH_RADIUS * 1.06, PLINTH_HEIGHT, 72),
  new THREE.MeshStandardMaterial({ color: 0x2b3340, roughness: 0.55, metalness: 0.1 }),
);
plinthBody.position.y = PLINTH_HEIGHT / 2;
plinthBody.castShadow = true;
plinthBody.receiveShadow = true;
const plinthTop = new THREE.Mesh(
  new THREE.CylinderGeometry(PLINTH_RADIUS * 0.99, PLINTH_RADIUS * 0.99, 0.04, 72),
  new THREE.MeshStandardMaterial({ color: 0x3a4554, roughness: 0.35, metalness: 0.25 }),
);
plinthTop.position.y = PLINTH_HEIGHT + 0.02;
plinthTop.receiveShadow = true;
plinth.add(plinthBody, plinthTop);
scene.add(plinth);

const PLINTH_TOP_Y = PLINTH_HEIGHT + 0.04;

// ---------------------------------------------------------------------------
// Turntable + model
// ---------------------------------------------------------------------------
const turntable = new THREE.Group(); // the product spins on top of the plinth
turntable.position.y = PLINTH_TOP_Y;
scene.add(turntable);

let spinning = true;
const SPIN_SPEED = 0.45; // radians / second

const gltfLoader = new GLTFLoader();
gltfLoader.load(
  // The only asset path in the app — from the Aura3D typed asset module.
  assets.sneaker.url,
  (gltf) => {
    const model = gltf.scene;

    model.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });

    // --- Auto-scale: fit the longest dimension to a target size. ---
    const preBox = new THREE.Box3().setFromObject(model);
    const size = preBox.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const TARGET = 2.1;
    model.scale.multiplyScalar(TARGET / maxDim);

    // --- Center on X/Z and rest the model on the plinth top (Y). ---
    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    model.position.x -= center.x;
    model.position.z -= center.z;
    model.position.y -= box.min.y; // bottom sits at turntable origin (plinth top)

    turntable.add(model);

    // Aim the camera/orbit pivot at the model's middle.
    const fittedHeight = box.max.y - box.min.y;
    controls.target.set(0, PLINTH_TOP_Y + fittedHeight * 0.5, 0);
    controls.update();

    loaderEl.classList.add("hidden");
    setTimeout(() => loaderEl.remove(), 600);
  },
  undefined,
  (err) => {
    console.error("Failed to load sneaker.glb", err);
    loaderEl.classList.remove("hidden");
    loaderEl.innerHTML =
      `<div class="err">Could not load the sneaker model from ` +
      `<code>${assets.sneaker.url}</code>.<br/>Make sure the dev server is ` +
      `serving <code>public/benchmark/assets/sneaker.glb</code>.</div>`;
  },
);

// ---------------------------------------------------------------------------
// UI handlers
// ---------------------------------------------------------------------------
spinBtn.addEventListener("click", () => {
  spinning = !spinning;
  spinBtn.textContent = spinning ? "Pause turntable" : "Resume turntable";
});
frameBtn.addEventListener("click", () => {
  camera.position.copy(HOME);
  controls.update();
});

// ---------------------------------------------------------------------------
// Resize + render loop
// ---------------------------------------------------------------------------
function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
}
window.addEventListener("resize", resize);
resize();

const clock = new THREE.Clock();
function tick() {
  const dt = clock.getDelta();
  if (spinning) turntable.rotation.y += SPIN_SPEED * dt;
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
tick();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeGradientBackground(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = 16;
  c.height = 256;
  const ctx = c.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, "#384757");
  g.addColorStop(0.55, "#1b222c");
  g.addColorStop(1, "#0a0d12");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 16, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
