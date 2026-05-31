
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { PhysicsWorld, Shape, type RigidBody } from "@aura3d/engine/physics";

declare global { interface Window { __ENGINE_READOUT__?: () => { drawCalls?: number; triangleCount?: number; routeHealth?: string }; __ENGINE_READY__?: () => boolean } }
const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("Missing #app");
root.innerHTML = "<canvas id='c'></canvas><div class='hud'>Aura3D physics ramp</div>";
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
window.__ENGINE_READY__ = () => renderer.info.render.calls > 0;

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
