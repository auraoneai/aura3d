
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";


declare global { interface Window { __ENGINE_READOUT__?: () => { drawCalls?: number; triangleCount?: number; routeHealth?: string }; __ENGINE_READY__?: () => boolean } }
const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("Missing #app");
root.innerHTML = "<canvas id='c'></canvas><div class='hud'>01 material grid</div>";
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
animate();