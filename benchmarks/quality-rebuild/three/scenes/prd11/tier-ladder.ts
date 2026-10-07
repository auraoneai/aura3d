/**
 * Lane 11 three.js adapter for `prd11-tier-ladder` (C-30).
 *
 * Mirrors the lane's Aura adapter (same camera/lights/materials/positions as
 * base scene 18) using three@0.185.1 with its documented quality settings.
 * The soldier GLB stand-in is a capsule — lane scenes measure frame cost, so
 * the approximation is recorded in the capability log instead of hidden.
 *
 * `?aura3d-quality=` is ignored here (it is an Aura-side request).
 * `?loadMs=<n>` burns `n` ms of CPU inside every rAF, matching the Aura side.
 */

import * as THREE from "three";
import type { ReadyPayload } from "../../../shared/types";

declare const __THREE_VERSION__: string;

function queryNumber(name: string): number | null {
  const raw = new URLSearchParams(window.location.search).get(name);
  if (raw === null || raw === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function busyLoop(ms: number): void {
  const deadline = performance.now() + ms;
  let acc = 0;
  while (performance.now() < deadline) {
    acc += Math.sqrt(acc + 1);
  }
  void acc;
}

export default async function run(host: HTMLElement): Promise<ReadyPayload> {
  const started = performance.now();
  const loadMs = queryNumber("loadMs") ?? 0;

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(host.clientWidth || 800, host.clientHeight || 600);
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#8fa3b8");
  scene.fog = new THREE.FogExp2("#8fa3b8", 0.03);

  const camera = new THREE.PerspectiveCamera(55, (host.clientWidth || 800) / (host.clientHeight || 600), 0.1, 200);
  camera.position.set(1.2, 2.4, 4.2);
  camera.lookAt(0, 1.2, -3);

  const sun = new THREE.DirectionalLight("#fff1d6", 3);
  sun.position.set(-6, 10, 4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  scene.add(sun);
  scene.add(new THREE.AmbientLight("#ffffff", 0.3));

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 60),
    new THREE.MeshStandardMaterial({ color: "#5d6b45", roughness: 0.95, metalness: 0 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Stand-in for the skinned soldier (approximation: same silhouette volume).
  const soldier = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.35, 1.1, 8, 16),
    new THREE.MeshStandardMaterial({ color: "#4a5a6a", roughness: 0.7, metalness: 0.1 })
  );
  soldier.position.y = 0.9;
  soldier.castShadow = true;
  soldier.receiveShadow = true;
  scene.add(soldier);

  const crateMaterial = new THREE.MeshStandardMaterial({ color: "#8a6f4d", roughness: 0.85, metalness: 0 });
  const crate = (x: number, y: number, z: number, ry = 0): void => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), crateMaterial);
    mesh.position.set(x, y + 0.5, z);
    mesh.rotation.y = ry;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
  };
  crate(-1.8, 0, -3);
  crate(-1.8, 1, -3, 0.5);
  crate(2.2, 0, -5, -0.3);

  const rockMaterial = new THREE.MeshStandardMaterial({ color: "#77726c", roughness: 0.9, metalness: 0 });
  const rock = (x: number, y: number, z: number, scale: number, ry = 0): void => {
    const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), rockMaterial);
    mesh.position.set(x, y, z);
    mesh.scale.setScalar(scale);
    mesh.rotation.y = ry;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
  };
  rock(3, 0.4, -9, 0.4);
  rock(-4, 0.4, -12, 0.5, 2);
  rock(1.5, 0, -2.5, 4);

  const pillarMaterial = new THREE.MeshStandardMaterial({ color: "#9c9a92", roughness: 0.8, metalness: 0 });
  for (const x of [-3, 3.2]) {
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 3, 24), pillarMaterial);
    pillar.position.set(x, 1.5, x < 0 ? -7 : -13);
    pillar.castShadow = true;
    pillar.receiveShadow = true;
    scene.add(pillar);
  }

  const pickupMaterial = new THREE.MeshStandardMaterial({
    color: "#062a33",
    roughness: 0.3,
    metalness: 0,
    emissive: new THREE.Color("#36e0ff"),
    emissiveIntensity: 4
  });
  const pickupPositions: [number, number, number][] = [[0.6, 0.6, -4], [-0.8, 0.6, -7], [1.4, 0.6, -10]];
  for (const [x, y, z] of pickupPositions) {
    const pickup = new THREE.Mesh(new THREE.SphereGeometry(0.35, 64, 32), pickupMaterial);
    pickup.position.set(x, y, z);
    scene.add(pickup);
  }

  let frames = 0;
  const loop = (): void => {
    if (loadMs > 0) busyLoop(loadMs);
    renderer.render(scene, camera);
    frames += 1;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  const deadline = performance.now() + 30_000;
  while (frames < 3 && performance.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  return {
    engine: "three",
    scene: "prd11-tier-ladder",
    engineVersion: typeof __THREE_VERSION__ === "string" ? __THREE_VERSION__ : THREE.REVISION,
    capabilityLog: [
      {
        feature: "model:soldier",
        status: "partial",
        detail: "Skinnded soldier GLB approximated by a capsule stand-in; lane scenes measure frame cost, not asset fidelity."
      }
    ],
    drawCalls: renderer.info.render.calls,
    warnings: [],
    errors: [],
    loadMs: Math.round(performance.now() - started),
    extra: { simulatedLoadMs: loadMs }
  };
}
