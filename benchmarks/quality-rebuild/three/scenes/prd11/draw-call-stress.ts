/**
 * three.js r185 adapter for `prd11-draw-call-stress` (C-30) — the V3
 * `BatchedMesh` twin: identical seeded composition to the Aura adapter
 * (5,000 items, 6 shapes × 12 colours × 4 roughness, one sun, no shadows),
 * packed into 24 BatchedMeshes keyed by (shape, roughness) with per-instance
 * colour, the same split the Aura batching planner produces.
 */

import * as THREE from "three";
import type { ReadyPayload } from "../../../shared/types";

type Vec3 = [number, number, number];
const SHAPES = ["box", "sphere", "cylinder", "capsule", "torus", "plane"] as const;
const ROUGHNESS = [0.25, 0.5, 0.75, 0.95] as const;
const PALETTE = [
  "#e74c3c", "#e67e22", "#f1c40f", "#2ecc71", "#1abc9c", "#3498db",
  "#9b59b6", "#e91e63", "#ecf0f1", "#95a5a6", "#7f8c8d", "#34495e"
] as const;
const ITEMS = 5000;

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

function shapeGeometry(shape: (typeof SHAPES)[number], size: Vec3): THREE.BufferGeometry {
  switch (shape) {
    case "box": return new THREE.BoxGeometry(size[0], size[1], size[2]);
    case "sphere": return new THREE.SphereGeometry(size[1] / 2, 16, 12);
    case "cylinder": return new THREE.CylinderGeometry(size[0] / 2, size[0] / 2, size[1], 16);
    case "capsule": return new THREE.CapsuleGeometry(size[0] / 2, size[1] * 0.6, 8, 16);
    case "torus": return new THREE.TorusGeometry(size[0] / 2, size[0] / 6, 8, 16);
    case "plane": return new THREE.PlaneGeometry(size[0], size[2]).rotateX(-Math.PI / 2);
  }
}

export default async function run(host: HTMLElement): Promise<ReadyPayload> {
  const started = performance.now();
  const rng = mulberry32(0xa3d11);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(host.clientWidth || 800, host.clientHeight || 600);
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  host.appendChild(renderer.domElement);

  const three = new THREE.Scene();
  three.background = new THREE.Color("#20262e");
  three.fog = new THREE.FogExp2("#20262e", 0.004);

  const camera = new THREE.PerspectiveCamera(50, (host.clientWidth || 800) / (host.clientHeight || 600), 0.1, 300);
  camera.position.set(0, 26, 34);
  camera.lookAt(0, 0, -4);

  const sun = new THREE.DirectionalLight("#fff4e0", 2.6);
  sun.position.set(-8, 14, 6);
  three.add(sun);
  three.add(new THREE.AmbientLight("#bcd2e8", 0.35));

  // Same item stream as the Aura adapter: shape cycles fastest, colour next,
  // roughness slowest — then group by (shape, roughness) into BatchedMeshes.
  const groups = new Map<string, { geometry: THREE.BufferGeometry; matrices: THREE.Matrix4[]; colors: THREE.Color[] }>();
  const side = Math.ceil(Math.sqrt(ITEMS));
  const spacing = 0.9;
  const half = ((side - 1) * spacing) / 2;
  for (let i = 0; i < ITEMS; i += 1) {
    const shape = SHAPES[i % SHAPES.length];
    const color = PALETTE[Math.floor(i / SHAPES.length) % PALETTE.length];
    const roughness = ROUGHNESS[Math.floor(i / (SHAPES.length * PALETTE.length)) % ROUGHNESS.length];
    const ix = i % side;
    const iz = Math.floor(i / side);
    const yaw = rng() * Math.PI * 2;
    const size: Vec3 = shape === "plane" ? [0.5, 0.02, 0.5] : [0.42 + rng() * 0.2, 0.42 + rng() * 0.2, 0.42 + rng() * 0.2];
    const position = new THREE.Vector3(ix * spacing - half + (rng() - 0.5) * 0.1, size[1] / 2, iz * spacing - half + (rng() - 0.5) * 0.1);
    const matrix = new THREE.Matrix4().compose(position, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)), new THREE.Vector3(1, 1, 1));
    const key = `${shape}/${roughness}`;
    let group = groups.get(key);
    if (!group) {
      group = { geometry: shapeGeometry(shape, [0.5, 0.5, 0.5]), matrices: [], colors: [] };
      groups.set(key, group);
    }
    const scaled = matrix.clone().multiply(new THREE.Matrix4().makeScale(size[0] / 0.5, size[1] / 0.5, size[2] / 0.5));
    group.matrices.push(scaled);
    group.colors.push(new THREE.Color(color));
  }

  const scratch = new THREE.Color();
  for (const [key, group] of groups) {
    const roughness = Number(key.split("/")[1]);
    const maxVerts = group.geometry.attributes.position.count;
    const maxIndices = group.geometry.index?.count ?? maxVerts;
    const batch = new THREE.BatchedMesh(group.matrices.length, maxVerts * group.matrices.length, maxIndices * group.matrices.length, new THREE.MeshStandardMaterial({ color: "#ffffff", roughness, metalness: 0 }));
    const geoId = batch.addGeometry(group.geometry);
    for (const [index, matrix] of group.matrices.entries()) {
      const instanceId = batch.addInstance(geoId);
      batch.setMatrixAt(instanceId, matrix);
      batch.setColorAt(instanceId, scratch.copy(group.colors[index]));
    }
    three.add(batch);
  }

  const render = (): void => renderer.render(three, camera);
  render();
  for (let i = 0; i < 4; i += 1) await new Promise(requestAnimationFrame).then(render);

  return {
    engine: "three",
    scene: "prd11-draw-call-stress",
    engineVersion: THREE.REVISION,
    capabilityLog: [],
    drawCalls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
    warnings: [],
    errors: [],
    loadMs: Math.round(performance.now() - started),
    extra: { items: ITEMS, batchedMeshes: groups.size }
  };
}
