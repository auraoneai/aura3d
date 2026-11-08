// Stub-model solution (C1 dry run only): a fixed three.js lighthouse, not an agent output.
import * as THREE from "three";

const canvas = document.getElementById("app") as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(640, 360, false);
renderer.shadowMap.enabled = true;
const scene = new THREE.Scene();
scene.background = new THREE.Color("#9cc3e6");
const cam = new THREE.PerspectiveCamera(45, 640 / 360, 0.1, 200);
scene.add(new THREE.HemisphereLight("#dfefff", "#3a4a3a", 1.2));
const sun = new THREE.DirectionalLight("#ffffff", 2.5);
sun.position.set(6, 10, 5);
sun.castShadow = true;
scene.add(sun);

let parts = 0;
const add = (geo: THREE.BufferGeometry, color: string, x: number, y: number, z: number, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) => {
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...extra }));
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  scene.add(m);
  parts += 1;
  return m;
};
const sea = add(new THREE.PlaneGeometry(40, 40), "#2f6f8f", 0, 0, 0, { roughness: 0.3 });
sea.rotation.x = -Math.PI / 2;
for (let i = 0; i < 6; i += 1) {
  const a = (i / 6) * Math.PI * 2;
  add(new THREE.DodecahedronGeometry(0.7 + (i % 3) * 0.15), "#6b6660", Math.cos(a) * 1.6, 0.3, Math.sin(a) * 1.6, { roughness: 0.9 });
}
const BANDS = 4;
for (let b = 0; b < BANDS; b += 1) {
  const r = 0.9 - b * 0.1;
  add(new THREE.CylinderGeometry(r - 0.1, r, 1.2, 32), b % 2 ? "#ffffff" : "#c8302c", 0, 1.2 + b * 1.2, 0);
}
add(new THREE.CylinderGeometry(0.9, 0.9, 0.15, 32), "#333333", 0, 6.05, 0, { metalness: 0.6 });
add(new THREE.CylinderGeometry(0.5, 0.5, 0.9, 16), "#bfe6ff", 0, 6.6, 0, { transparent: true, opacity: 0.5, roughness: 0.05 });
const lamp = add(new THREE.SphereGeometry(0.22, 16, 12), "#fff2a8", 0, 6.6, 0, { emissive: "#ffd34d", emissiveIntensity: 4 });
add(new THREE.ConeGeometry(0.65, 0.8, 24), "#222222", 0, 7.45, 0);
add(new THREE.SphereGeometry(0.09, 12, 8), "#d4af37", 0, 7.95, 0, { metalness: 1, roughness: 0.3 });
add(new THREE.BoxGeometry(0.5, 0.8, 0.1), "#5a3a22", 0, 1.0, 0.9);
for (let w = 0; w < 4; w += 1) {
  const a = w * 1.3;
  add(new THREE.BoxGeometry(0.22, 0.3, 0.06), "#1d2733", Math.sin(a) * 0.8, 2.2 + w, Math.cos(a) * 0.8);
}
add(new THREE.BoxGeometry(1.6, 1.0, 1.2), "#efe6d2", 2.6, 0.9, 0.6);
add(new THREE.ConeGeometry(1.0, 0.7, 4), "#7a2f22", 2.6, 1.75, 0.6);
void lamp;

const w = window as unknown as { __TASK_STATE__?: unknown; __EVAL_READY__?: boolean };
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const t = clock.getElapsedTime();
  cam.position.set(Math.cos(t * 0.4) * 12.7, 5, Math.sin(t * 0.4) * 12.7);
  cam.lookAt(0, 3.6, 0);
  renderer.render(scene, cam);
  w.__TASK_STATE__ = { ready: true, partCount: parts, bandCount: BANDS };
  w.__EVAL_READY__ = true;
});
