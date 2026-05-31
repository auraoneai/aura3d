
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";


declare global { interface Window { __ENGINE_READOUT__?: () => { drawCalls?: number; triangleCount?: number; routeHealth?: string }; __ENGINE_READY__?: () => boolean } }
const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("Missing #app");
root.innerHTML = "<canvas id='c'></canvas><div class='hud'>02 city block</div>";
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

scene.background = new THREE.Color("#8dcaf0");
const ground=new THREE.Mesh(new THREE.PlaneGeometry(20,20),new THREE.MeshStandardMaterial({color:"#a7b09d",roughness:.9})); ground.rotation.x=-Math.PI/2; ground.receiveShadow=true; scene.add(ground);
for(let i=0;i<20;i++){ const h=1.2+((i*7)%6)*.45; const b=new THREE.Mesh(new THREE.BoxGeometry(1.25,h,1.25),new THREE.MeshStandardMaterial({color:i%3===0?"#6c7a7e":i%3===1?"#8a7558":"#415665",roughness:.72})); b.position.set((i%5-2)*2.2,h/2,(Math.floor(i/5)-1.5)*2.2); b.castShadow=true; b.receiveShadow=true; scene.add(b); for(let y=.45;y<h-.15;y+=.45){for(const side of [-.64,.64]){const w=new THREE.Mesh(new THREE.PlaneGeometry(.18,.18),new THREE.MeshBasicMaterial({color:"#dff8ff"})); w.position.set(b.position.x+side,y,b.position.z+.66); scene.add(w);}} }
for(let i=-3;i<=3;i++){ const road=new THREE.Mesh(new THREE.BoxGeometry(.18,.02,16),new THREE.MeshBasicMaterial({color:"#171b1d"})); road.position.set(i*2.2,.03,0); scene.add(road); }
animate();