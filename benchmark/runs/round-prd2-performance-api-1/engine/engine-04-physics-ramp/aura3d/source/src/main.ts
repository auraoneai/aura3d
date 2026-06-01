
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { PhysicsWorld, Shape, type RigidBody } from "@aura3d/engine/physics";

declare global { interface Window { __ENGINE_READOUT__?: () => { drawCalls?: number; triangleCount?: number; routeHealth?: string }; __ENGINE_READY__?: () => boolean } }
const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("Missing #app");
root.innerHTML = "<canvas id='c'></canvas><div class='hud'>04 Aura3D physics ramp</div>";
const style = document.createElement("style");
style.textContent = "html,body,#app{margin:0;width:100%;height:100%;overflow:hidden;background:#071017;color:#fff;font-family:Inter,Arial,sans-serif}canvas{display:block;width:100%;height:100%}.hud{position:fixed;left:18px;top:18px;padding:9px 11px;border:1px solid rgba(255,255,255,.22);border-radius:6px;background:rgba(5,10,16,.75);font-weight:800}";
document.head.append(style);
const canvas = document.querySelector<HTMLCanvasElement>("#c")!;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
renderer.setPixelRatio(1);
renderer.shadowMap.enabled = false;
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
key.position.set(-5, 8, 6); key.castShadow = false; scene.add(key);
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

const world = new PhysicsWorld({ gravity: [0, -10, 0], fixedDelta: 1 / 60, solverIterations: 1 });
const bodyGround = world.createRigidBody({ type: "static", position: [0, 0, 0], friction: 0.7 });
world.createCollider(bodyGround, { shape: Shape.plane([0, 1, 0], 0), material: { friction: 0.7, restitution: 0.05 } });
const rampBody = world.createRigidBody({ type: "static", position: [0, 0, 0], friction: 0.55 });
world.createCollider(rampBody, { shape: Shape.plane([0.34, 0.94, 0], -1.3), material: { friction: 0.55, restitution: 0.08 } });
const ramp = new THREE.Mesh(new THREE.BoxGeometry(8, 0.32, 3.4), new THREE.MeshStandardMaterial({ color: "#486a91", roughness: 0.55 }));
ramp.rotation.z = -0.35; ramp.position.set(-0.06, 1.1, 0); scene.add(ramp);
const cubeGeo = new THREE.BoxGeometry(0.55, 0.55, 0.55);
const cubes: { body: RigidBody; mesh: THREE.Mesh }[] = [];
for (let i = 0; i < 12; i += 1) {
  const body = world.createRigidBody({ type: "dynamic", position: [-1.65 + (i % 4) * 0.65, 2.55 + Math.floor(i / 4) * 0.58, -1.0 + (i % 4) * 0.55], mass: 1, friction: 0.45, restitution: 0.08 });
  world.createCollider(body, { shape: Shape.box(0.275, 0.275, 0.275), material: { friction: 0.45, restitution: 0.08 } });
  const mesh = new THREE.Mesh(cubeGeo, new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(i / 12, 0.58, 0.58), roughness: 0.48 }));
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
