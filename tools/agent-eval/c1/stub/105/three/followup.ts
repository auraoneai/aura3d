// Stub-model solution (C1 dry run only): a fixed three.js click-to-plant garden, not an agent output.
import * as THREE from "three";

const canvas = document.getElementById("app") as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(640, 360, false);
renderer.shadowMap.enabled = true;
const scene = new THREE.Scene();
scene.background = new THREE.Color("#a9d4f5");
const cam = new THREE.PerspectiveCamera(45, 640 / 360, 0.1, 100);
cam.position.set(0, 7, 9);
cam.lookAt(0, 0, 0);
scene.add(new THREE.HemisphereLight("#eaf6ff", "#4a3a20", 1.1));
const sun = new THREE.DirectionalLight("#ffffff", 2.4);
sun.position.set(4, 8, 3);
sun.castShadow = true;
scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.MeshStandardMaterial({ color: "#4f7f2f", roughness: 0.95 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

type Plant = { x: number; z: number; born: number; group: THREE.Group; growth: number };
const plants: Plant[] = [];
const stemMat = new THREE.MeshStandardMaterial({ color: "#3e8e3a" });
const clock = new THREE.Clock();
function plantAt(x: number, z: number): void {
  const group = new THREE.Group();
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 1, 8), stemMat);
  stem.position.y = 0.5;
  const hue = (plants.length * 0.13) % 1;
  const flower = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(hue, 0.7, 0.55) }));
  flower.position.y = 1.05;
  stem.castShadow = flower.castShadow = true;
  group.add(stem, flower);
  group.position.set(x, 0, z);
  group.scale.setScalar(0.05);
  scene.add(group);
  plants.push({ x, z, born: clock.getElapsedTime(), group, growth: 0 });
}
function clearAll(): void {
  for (const p of plants) scene.remove(p.group);
  plants.length = 0;
}

const overlay = document.createElement("div");
overlay.style.cssText = "position:fixed;left:8px;top:8px;display:flex;gap:8px;align-items:center";
const label = document.createElement("span");
const clear = document.createElement("button");
clear.textContent = "Clear";
clear.onclick = clearAll;
const undo = document.createElement("button");
undo.textContent = "Undo";
undo.onclick = () => {
  const last = plants.pop();
  if (last) scene.remove(last.group);
};
overlay.append(label, clear, undo);
document.body.append(overlay);

const ray = new THREE.Raycaster();
canvas.addEventListener("click", (e) => {
  const r = canvas.getBoundingClientRect();
  ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), cam);
  const hit = ray.intersectObject(ground)[0];
  if (hit) plantAt(hit.point.x, hit.point.z);
});

const w = window as unknown as { __TASK_STATE__?: unknown; __plantAt?: (x: number, z: number) => void; __EVAL_READY__?: boolean };
w.__plantAt = plantAt;
renderer.setAnimationLoop(() => {
  const t = clock.getElapsedTime();
  for (const p of plants) {
    p.growth = Math.min(1, (t - p.born) / 8);
    p.group.scale.setScalar(0.05 + 0.95 * p.growth);
  }
  label.textContent = `Plants: ${plants.length}`;
  renderer.render(scene, cam);
  w.__TASK_STATE__ = { plantCount: plants.length, plants: plants.map((p) => ({ x: p.x, z: p.z, growth: p.growth })), ready: true };
  w.__EVAL_READY__ = true;
});
