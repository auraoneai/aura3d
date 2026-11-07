import * as THREE from 'three';
import { hash3, mulberry32 } from './rng';

export interface IslandSpec {
  x: number;
  y: number;
  z: number;
  radius: number;
  seed: number;
  speed: number;
  phase: number;
  amp: number;
  trees: number;
  crystals: number;
}

/** Radial outline variation shared by rock and grass so their edges line up. */
export function edgeFactor(a: number, seed: number): number {
  return 1 + 0.09 * Math.sin(3 * a + seed) + 0.06 * Math.sin(5 * a + seed * 2.3) + 0.03 * Math.sin(9 * a + seed * 1.7);
}

const GRASS_TOP = 0.06;

function grassHeight(x: number, z: number, seed: number, R: number): number {
  const rr = Math.min(1, Math.hypot(x, z) / R);
  const hill = 0.035 * R * Math.sin(x * 0.45 + seed) * Math.cos(z * 0.4 + seed * 1.3);
  return GRASS_TOP * R + hill * (1 - rr * rr * rr);
}

const rockMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
const grassMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
const pebbleMat = new THREE.MeshLambertMaterial({ color: '#7a6070', flatShading: true });
const trunkMat = new THREE.MeshLambertMaterial({ color: '#6b4630', flatShading: true });
const pineMats = [
  new THREE.MeshLambertMaterial({ color: '#2f8058', flatShading: true }),
  new THREE.MeshLambertMaterial({ color: '#4aa24c', flatShading: true }),
];
const leafMats = [
  new THREE.MeshLambertMaterial({ color: '#ff8aa8', flatShading: true }),
  new THREE.MeshLambertMaterial({ color: '#ffa850', flatShading: true }),
  new THREE.MeshLambertMaterial({ color: '#7ccf5c', flatShading: true }),
];
const crystalMats = [
  new THREE.MeshLambertMaterial({ color: '#58d8ff', emissive: '#2a9cc8', flatShading: true }),
  new THREE.MeshLambertMaterial({ color: '#ff74e0', emissive: '#b030a0', flatShading: true }),
  new THREE.MeshLambertMaterial({ color: '#b48cff', emissive: '#6a40c0', flatShading: true }),
];

const trunkGeo = new THREE.CylinderGeometry(0.12, 0.18, 1, 5);
trunkGeo.translate(0, 0.5, 0);
const coneGeo = new THREE.ConeGeometry(1, 1.6, 6);
coneGeo.translate(0, 0.8, 0);
const blobGeo = new THREE.IcosahedronGeometry(0.9, 0);
const crystalGeo = new THREE.OctahedronGeometry(1, 0);
crystalGeo.scale(0.3, 1.2, 0.3);
crystalGeo.translate(0, 1.0, 0);
const pebbleGeo = new THREE.DodecahedronGeometry(1, 0);

function makeTree(rng: () => number, scale: number): THREE.Group {
  const g = new THREE.Group();
  if (rng() < 0.55) {
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.scale.set(1, 0.8, 1);
    g.add(trunk);
    const m = pineMats[Math.floor(rng() * pineMats.length)];
    const c1 = new THREE.Mesh(coneGeo, m);
    c1.position.y = 0.6;
    c1.scale.set(0.9, 1, 0.9);
    const c2 = new THREE.Mesh(coneGeo, m);
    c2.position.y = 1.5;
    c2.scale.set(0.62, 0.85, 0.62);
    g.add(c1, c2);
  } else {
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.scale.set(1.1, 1.2, 1.1);
    g.add(trunk);
    const blob = new THREE.Mesh(blobGeo, leafMats[Math.floor(rng() * leafMats.length)]);
    blob.position.y = 1.5;
    blob.scale.set(1, 0.9, 1);
    g.add(blob);
  }
  g.scale.setScalar(scale * (0.8 + rng() * 0.5));
  g.rotation.y = rng() * Math.PI * 2;
  return g;
}

function makeCrystalCluster(rng: () => number, scale: number): THREE.Group {
  const g = new THREE.Group();
  const mat = crystalMats[Math.floor(rng() * crystalMats.length)];
  const n = 2 + Math.floor(rng() * 3);
  for (let i = 0; i < n; i++) {
    const c = new THREE.Mesh(crystalGeo, mat);
    const s = 0.5 + rng() * 0.7;
    c.scale.set(s, s * (0.9 + rng() * 0.8), s);
    c.position.set((rng() - 0.5) * 0.9, 0, (rng() - 0.5) * 0.9);
    c.rotation.set((rng() - 0.5) * 0.6, rng() * 3, (rng() - 0.5) * 0.6);
    g.add(c);
  }
  g.scale.setScalar(scale);
  return g;
}

function buildRock(R: number, H: number, seed: number): THREE.BufferGeometry {
  const profile: [number, number][] = [
    [0, -H],
    [0.1, -0.85 * H],
    [0.3, -0.6 * H],
    [0.58, -0.35 * H],
    [0.82, -0.15 * H],
    [0.95, -0.05 * H],
    [0.98, 0],
    [0.5, 0],
    [0, 0],
  ];
  const pts = profile.map(([r, y]) => new THREE.Vector2(r * R, y * R));
  const geo = new THREE.LatheGeometry(pts, 16);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const top = new THREE.Color('#9a7684');
  const bottom = new THREE.Color('#4a3c58');
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);
    const h1 = hash3(x, y, z, seed);
    const h2 = hash3(x, y, z, seed + 99);
    const g = edgeFactor(Math.atan2(x, z), seed);
    const rough = y < -0.02 * R ? 1 + (h1 - 0.5) * 0.26 : 1;
    x *= g * rough;
    z *= g * rough;
    if (y < -0.02 * R) y += (h2 - 0.5) * 0.1 * R;
    pos.setXYZ(i, x, y, z);
    const yn = Math.min(1, Math.max(0, -y / (H * R)));
    c.copy(top).lerp(bottom, Math.pow(yn, 0.8));
    const band = 0.9 + 0.1 * Math.sin((y / R) * 14 + seed) + (h1 - 0.5) * 0.12;
    colors[i * 3] = c.r * band;
    colors[i * 3 + 1] = c.g * band;
    colors[i * 3 + 2] = c.b * band;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}

function buildGrass(R: number, seed: number): THREE.BufferGeometry {
  const gt = GRASS_TOP;
  const profile: [number, number][] = [
    [0, gt],
    [0.25, gt],
    [0.5, gt],
    [0.75, gt],
    [0.97, gt * 0.95],
    [1.04, 0],
    [1.0, -0.07],
    [0.9, -0.09],
    [0, -0.09],
  ];
  const pts = profile
    .map(([r, y]) => new THREE.Vector2(r * R, y * R))
    .reverse();
  const geo = new THREE.LatheGeometry(pts, 16);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const grass = new THREE.Color('#78c84a');
  const grassDark = new THREE.Color('#4f9a3c');
  const dirt = new THREE.Color('#6a4a3a');
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);
    const g = edgeFactor(Math.atan2(x, z), seed);
    x *= g;
    z *= g;
    const h = hash3(x, y, z, seed + 5);
    if (y > 0.03 * R) y = grassHeight(x, z, seed, R) * (y / (GRASS_TOP * R));
    pos.setXYZ(i, x, y, z);
    const k = Math.min(1, Math.max(0, (y / R + 0.01) / 0.05));
    c.copy(grassDark).lerp(grass, h);
    c.lerp(dirt, 1 - k);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}

interface Pebble {
  mesh: THREE.Mesh;
  baseY: number;
  speed: number;
  phase: number;
}

export class Island {
  readonly group = new THREE.Group();
  readonly spec: IslandSpec;
  private readonly rot0: number;
  private readonly pebbles: Pebble[] = [];

  constructor(spec: IslandSpec) {
    this.spec = spec;
    const R = spec.radius;
    const rng = mulberry32(spec.seed * 7919 + 13);
    const H = 1.2 + rng() * 0.6;

    this.group.add(new THREE.Mesh(buildRock(R, H, spec.seed), rockMat));
    this.group.add(new THREE.Mesh(buildGrass(R, spec.seed), grassMat));

    const treeScale = 0.5 + R * 0.055;
    const placed: THREE.Vector2[] = [];
    const place = (count: number, make: () => THREE.Group, minDist: number): void => {
      for (let n = 0; n < count; n++) {
        for (let tries = 0; tries < 20; tries++) {
          const a = rng() * Math.PI * 2;
          const r = Math.sqrt(rng()) * 0.72 * R;
          const g = edgeFactor(a, spec.seed);
          const x = Math.sin(a) * r * g;
          const z = Math.cos(a) * r * g;
          if (placed.some((p) => p.distanceTo(new THREE.Vector2(x, z)) < minDist)) continue;
          placed.push(new THREE.Vector2(x, z));
          const obj = make();
          obj.position.set(x, grassHeight(x, z, spec.seed, R) - 0.05, z);
          this.group.add(obj);
          break;
        }
      }
    };
    place(spec.trees, () => makeTree(rng, treeScale), 1.4 * treeScale + 0.4);
    place(spec.crystals, () => makeCrystalCluster(rng, treeScale * 0.8), 1.4 * treeScale + 0.4);

    const nPebbles = R > 5 ? 3 : 1;
    for (let i = 0; i < nPebbles; i++) {
      const a = rng() * Math.PI * 2;
      const d = (1.0 + rng() * 0.5) * R;
      const m = new THREE.Mesh(pebbleGeo, pebbleMat);
      const s = R * (0.05 + rng() * 0.07);
      m.scale.set(s, s * 0.8, s);
      const by = -R * (0.3 + rng() * 0.9);
      m.position.set(Math.sin(a) * d, by, Math.cos(a) * d);
      m.rotation.set(rng() * 3, rng() * 3, rng() * 3);
      this.group.add(m);
      this.pebbles.push({ mesh: m, baseY: by, speed: 0.6 + rng() * 0.8, phase: rng() * 6.28 });
    }

    this.rot0 = rng() * Math.PI * 2;
    this.group.position.set(spec.x, spec.y, spec.z);
    this.group.rotation.y = this.rot0;
  }

  /** Point on the grass rim at angle a, in local space. */
  rimPoint(a: number): THREE.Vector3 {
    const R = this.spec.radius;
    const g = edgeFactor(a, this.spec.seed);
    return new THREE.Vector3(Math.sin(a) * R * 1.0 * g, 0, Math.cos(a) * R * 1.0 * g);
  }

  update(t: number): void {
    const s = this.spec;
    this.group.position.y = s.y + Math.sin(t * s.speed + s.phase) * s.amp;
    this.group.rotation.y = this.rot0 + Math.sin(t * 0.07 + s.phase) * 0.08;
    this.group.rotation.z = Math.sin(t * s.speed * 0.7 + s.phase * 1.3) * 0.012;
    for (const p of this.pebbles) {
      p.mesh.position.y = p.baseY + Math.sin(t * p.speed + p.phase) * 0.5;
      p.mesh.rotation.y += 0.004;
    }
  }
}
