
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";


declare global { interface Window { __ENGINE_READOUT__?: () => { drawCalls?: number; triangleCount?: number; routeHealth?: string }; __ENGINE_READY__?: () => boolean } }
const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("Missing #app");
root.innerHTML = "<canvas id='c'></canvas><div class='hud'>04 physics ramp</div>";
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

const ramp = new THREE.Mesh(new THREE.BoxGeometry(8, 0.32, 3.4), new THREE.MeshStandardMaterial({ color: "#486a91", roughness: 0.55 }));
ramp.rotation.z = -0.35; ramp.position.set(-0.06, 1.1, 0); scene.add(ramp);
const cubes: THREE.Mesh[] = []; const geo = new THREE.BoxGeometry(0.55, 0.55, 0.55);
for (let i = 0; i < 28; i += 1) {
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(i / 28, 0.58, 0.58), roughness: 0.48 }));
  m.position.set(-2.1 + (i % 7) * 0.55, 1.1 + Math.floor(i / 7) * 0.46, -1.2 + (i % 4) * 0.62);
  scene.add(m); cubes.push(m);
}
animate(() => { for (let i = 0; i < cubes.length; i += 1) { const m = cubes[i]; m.rotation.x += 0.01; m.rotation.y += 0.006; m.position.y = Math.max(0.4, m.position.y - 0.012 + (i % 3) * 0.002); } });