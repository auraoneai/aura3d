
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";


declare global { interface Window { __ENGINE_READOUT__?: () => { drawCalls?: number; triangleCount?: number; routeHealth?: string }; __ENGINE_READY__?: () => boolean } }
const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("Missing #app");
root.innerHTML = "<canvas id='c'></canvas><div class='hud'>02 city block</div>";
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
animate();