/**
 * three.js r185 adapter for `prd11-instancing-100k` (C-30) — the V2
 * `InstancedMesh` twin: identical seeded grid to the Aura adapter (100,000
 * boxes, non-uniform `[0.3, 0.6, 0.3]`, yaw rotation, `instancingGrid`
 * palette domain colours).
 */

import * as THREE from "three";
import type { ReadyPayload } from "../../../shared/types";

const ITEMS = 100_000;

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hslToHex(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l);
  const channel = (n: number): string => {
    const k = (n + h * 12) % 12;
    const value = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(value * 255).toString(16).padStart(2, "0");
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}

export default async function run(host: HTMLElement): Promise<ReadyPayload> {
  const started = performance.now();
  const rng = mulberry32(0xa3d12);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(host.clientWidth || 800, host.clientHeight || 600);
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  host.appendChild(renderer.domElement);

  const three = new THREE.Scene();
  three.background = new THREE.Color("#1a2027");

  const camera = new THREE.PerspectiveCamera(45, (host.clientWidth || 800) / (host.clientHeight || 600), 0.1, 400);
  camera.position.set(0, 52, 68);
  camera.lookAt(0, 0, 0);

  const sun = new THREE.DirectionalLight("#fff4e0", 2.4);
  sun.position.set(-40, 60, 30);
  three.add(sun);
  three.add(new THREE.AmbientLight("#bcd2e8", 0.4));

  const mesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.3, 0.6, 0.3),
    new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.8, metalness: 0 }),
    ITEMS
  );

  const side = Math.ceil(Math.sqrt(ITEMS));
  const spacing = 0.42;
  const half = ((side - 1) * spacing) / 2;
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const matrix = new THREE.Matrix4();
  const color = new THREE.Color();
  for (let i = 0; i < ITEMS; i += 1) {
    const ix = i % side;
    const iz = Math.floor(i / side);
    const height = 0.15 + rng() * 0.9;
    position.set(ix * spacing - half + (rng() - 0.5) * 0.08, height / 2, iz * spacing - half + (rng() - 0.5) * 0.08);
    quaternion.setFromEuler(new THREE.Euler(0, rng() * Math.PI, 0));
    scale.set(1, height / 0.6, 1);
    mesh.setMatrixAt(i, matrix.compose(position, quaternion, scale));
    mesh.setColorAt(i, color.set(hslToHex(0.52 + rng() * 0.18, 0.55, 0.38 + rng() * 0.22)));
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  three.add(mesh);

  renderer.render(three, camera);
  for (let i = 0; i < 4; i += 1) await new Promise(requestAnimationFrame).then(() => renderer.render(three, camera));

  return {
    engine: "three",
    scene: "prd11-instancing-100k",
    engineVersion: THREE.REVISION,
    capabilityLog: [],
    drawCalls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
    warnings: [],
    errors: [],
    loadMs: Math.round(performance.now() - started),
    extra: { items: ITEMS }
  };
}
