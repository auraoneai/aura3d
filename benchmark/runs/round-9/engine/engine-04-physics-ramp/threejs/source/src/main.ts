
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";


declare global { interface Window { __ENGINE_READOUT__?: () => { drawCalls?: number; triangleCount?: number; routeHealth?: string }; __ENGINE_READY__?: () => boolean } }
const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("Missing #app");
root.innerHTML = "<canvas id='c'></canvas><div class='hud'>04 physics ramp</div>";
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

const ramp=new THREE.Mesh(new THREE.BoxGeometry(9,.35,4),new THREE.MeshStandardMaterial({color:"#486a91",roughness:.55})); ramp.rotation.z=-.35; ramp.position.set(-.06,1.13,0); ramp.castShadow=true; ramp.receiveShadow=true; scene.add(ramp);
const floor=new THREE.Mesh(new THREE.PlaneGeometry(14,10),new THREE.MeshStandardMaterial({color:"#17202c",roughness:.85})); floor.rotation.x=-Math.PI/2; scene.add(floor);
const cubes: THREE.Mesh[]=[]; const geo=new THREE.BoxGeometry(.55,.55,.55);
for(let i=0;i<60;i++){ const m=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({color:new THREE.Color().setHSL(i/60,.58,.58),roughness:.48})); m.position.set(-3+(i%8)*.55,1.1+Math.floor(i/8)*.46,-1.5+(i%5)*.6); m.castShadow=true; scene.add(m); cubes.push(m); }
animate(()=>{ for(let i=0;i<cubes.length;i++){ const m=cubes[i]; m.rotation.x+=.01; m.rotation.y+=.006; m.position.y=Math.max(.4, m.position.y-.012+(i%3)*.002); } });