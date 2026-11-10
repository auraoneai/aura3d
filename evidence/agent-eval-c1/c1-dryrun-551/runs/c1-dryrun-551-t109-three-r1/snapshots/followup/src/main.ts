// Stub-model follow-up (C1 dry run only): paint buttons on the three.js product viewer.
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

const canvas = document.getElementById("app") as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(640, 360, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
const scene = new THREE.Scene();
scene.background = new THREE.Color("#0c0d11");
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
const camera = new THREE.PerspectiveCamera(38, 640 / 360, 0.1, 100);
camera.position.set(4.2, 1.6, 5.2);
camera.lookAt(0, 0.7, 0);

const body = new THREE.MeshPhysicalMaterial({ color: "#b0121b", metalness: 0.55, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.04 });
const car = new THREE.Group();
const shell = new THREE.Mesh(new THREE.CapsuleGeometry(0.62, 2.0, 8, 32), body);
shell.rotation.x = Math.PI / 2;
shell.scale.set(1.2, 1, 0.75);
shell.position.y = 0.72;
shell.castShadow = true;
car.add(shell);
const cabin = new THREE.Mesh(new THREE.SphereGeometry(0.6, 32, 16), new THREE.MeshPhysicalMaterial({ color: "#0d0f14", roughness: 0.05, metalness: 0.2 }));
cabin.scale.set(0.9, 0.5, 1.2);
cabin.position.set(0, 1.12, -0.15);
car.add(cabin);
const trim = new THREE.Mesh(new THREE.TorusGeometry(0.78, 0.03, 12, 64), new THREE.MeshStandardMaterial({ color: "#e8e8ec", metalness: 1, roughness: 0.08 }));
trim.rotation.x = Math.PI / 2;
trim.position.y = 0.7;
car.add(trim);
for (const [x, z] of [[-0.78, 1], [0.78, 1], [-0.78, -1], [0.78, -1]] as const) {
  const w = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.3, 32), new THREE.MeshStandardMaterial({ color: "#16171a", roughness: 0.9 }));
  w.rotation.z = Math.PI / 2;
  w.position.set(x, 0.31, z);
  car.add(w);
}
scene.add(car);
const table = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.5, 0.12, 64), new THREE.MeshStandardMaterial({ color: "#202228", roughness: 0.25, metalness: 0.3 }));
table.position.y = -0.06;
table.receiveShadow = true;
scene.add(table);
const key = new THREE.DirectionalLight("#ffffff", 2.2);
key.position.set(3, 6, 2);
key.castShadow = true;
scene.add(key);
const rim = new THREE.DirectionalLight("#9fc4ff", 0.8);
rim.position.set(-4, 2, -4);
scene.add(rim);

const w = window as unknown as { __TASK_STATE__?: unknown; __EVAL_READY__?: boolean };
const COLORS = { red: "#b0121b", blue: "#123c9c", black: "#0b0b0d" } as const;
let paintColor: keyof typeof COLORS = "red";
const bar = document.createElement("div");
for (const k of Object.keys(COLORS) as (keyof typeof COLORS)[]) {
  const b = document.createElement("button");
  b.textContent = k[0]!.toUpperCase() + k.slice(1);
  b.onclick = () => {
    paintColor = k;
    body.color.set(COLORS[k]);
  };
  bar.append(b);
}
document.body.append(bar);
const clock = new THREE.Clock();
let angle = 0;
renderer.setAnimationLoop(() => {
  angle += 20 * clock.getDelta();
  car.rotation.y = (angle * Math.PI) / 180;
  w.__TASK_STATE__ = { turntableAngleDeg: angle, paintFinish: "clearcoat", paintColor };
  renderer.render(scene, camera);
  w.__EVAL_READY__ = true;
});
