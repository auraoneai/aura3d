/** Scenario 3 — game runtime, Three.js: three + Rapier + hand-written input and loop. */
import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";

await RAPIER.init();

const canvas = document.querySelector("canvas") as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
const sceneGraph = new THREE.Scene();
const cameraObject = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
cameraObject.position.set(0, 6, 10);
cameraObject.lookAt(0, 1, 0);
sceneGraph.add(new THREE.DirectionalLight(0xffffff, 2.2));

const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
const groundBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
world.createCollider(RAPIER.ColliderDesc.cuboid(10, 0.05, 10).setTranslation(0, -0.05, 0), groundBody);
const playerBody = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 2, 0).setCcdEnabled(true));
world.createCollider(RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5), playerBody);

const groundMesh = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshStandardMaterial({ color: "#1d2530" }));
groundMesh.rotation.x = -Math.PI / 2;
sceneGraph.add(groundMesh);
const playerMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: "#4fd1c5" }));
sceneGraph.add(playerMesh);
const keys = new Set<string>();
const pressed = new Set<string>();
window.addEventListener("keydown", (event) => { if (!keys.has(event.code)) pressed.add(event.code); keys.add(event.code); });
window.addEventListener("keyup", (event) => keys.delete(event.code));
let last = 0;
const loop = (time: number) => {
  const delta = last > 0 ? Math.min(0.05, (time - last) / 1000) : 1 / 60;
  last = time;
  if (pressed.has("Space")) playerBody.applyImpulse({ x: 0, y: 5, z: 0 }, true);
  if (keys.has("ArrowLeft")) playerBody.addForce({ x: -8, y: 0, z: 0 }, true);
  if (keys.has("ArrowRight")) playerBody.addForce({ x: 8, y: 0, z: 0 }, true);
  pressed.clear();
  world.timestep = delta;
  world.step();
  const position = playerBody.translation();
  const rotation = playerBody.rotation();
  playerMesh.position.set(position.x, position.y, position.z);
  playerMesh.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
  renderer.render(sceneGraph, cameraObject);
  requestAnimationFrame(loop);
};
requestAnimationFrame(loop);
(globalThis as { __app?: unknown }).__app = renderer;
