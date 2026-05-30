
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";


declare global { interface Window { __ENGINE_READOUT__?: () => { drawCalls?: number; triangleCount?: number; routeHealth?: string } } }
const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("Missing #app");
root.innerHTML = "<canvas id='c'></canvas><div class='hud'>03 particles vfx</div>";
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

scene.fog = new THREE.Fog("#071017", 5, 18);
const group=new THREE.Group(); scene.add(group);
const geo=new THREE.SphereGeometry(.045,12,8);
for(let i=0;i<450;i++){ const a=i*.37, r=.25+(i%90)*.025, y=(i%160)*.022; const mat=new THREE.MeshBasicMaterial({color:new THREE.Color().setHSL((i%80)/80,.9,.62)}); const p=new THREE.Mesh(geo,mat); p.position.set(Math.cos(a)*r,y,Math.sin(a)*r); group.add(p); }
const emitter=new THREE.Mesh(new THREE.ConeGeometry(.32,.7,32),new THREE.MeshStandardMaterial({color:"#50e6ff",emissive:"#0db7ff",emissiveIntensity:.9})); emitter.position.y=.35; scene.add(emitter);
const floor=new THREE.Mesh(new THREE.PlaneGeometry(10,10),new THREE.MeshStandardMaterial({color:"#101822",roughness:.85})); floor.rotation.x=-Math.PI/2; scene.add(floor);
animate(()=>{group.rotation.y+=.006;});