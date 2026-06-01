
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";


declare global { interface Window { __ENGINE_READOUT__?: () => { drawCalls?: number; triangleCount?: number; routeHealth?: string }; __ENGINE_READY__?: () => boolean } }
const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("Missing #app");
root.innerHTML = "<canvas id='c'></canvas><div class='hud'>03 particles vfx</div>";
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
animate(() => { group.rotation.y += 0.006; });