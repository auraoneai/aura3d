// Stub-model bridge factory (C1 dry run only): the lighthouse body as a three.js scene, exported by bridge_export.
import * as THREE from "three";

export default function create({ seed }: { seed: number }): { scene: THREE.Object3D } {
  let s = seed >>> 0;
  const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const root = new THREE.Group();
  const add = (name: string, geo: THREE.BufferGeometry, color: string, x: number, y: number, z: number, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) => {
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...extra }));
    m.name = name;
    m.position.set(x, y, z);
    root.add(m);
  };
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2;
    add(`rock${i}`, new THREE.DodecahedronGeometry(0.6 + rand() * 0.4), "#6b6660", Math.cos(a) * 1.6, 0.3, Math.sin(a) * 1.6, { roughness: 0.9 });
  }
  for (let b = 0; b < 4; b += 1) {
    const r = 0.9 - b * 0.1;
    add(`band${b}`, new THREE.CylinderGeometry(r - 0.1, r, 1.2, 32), b % 2 ? "#ffffff" : "#c8302c", 0, 1.2 + b * 1.2, 0);
  }
  add("gallery", new THREE.CylinderGeometry(0.9, 0.9, 0.15, 32), "#333333", 0, 6.05, 0, { metalness: 0.6 });
  for (let p = 0; p < 12; p += 1) {
    const a = (p / 12) * Math.PI * 2;
    add(`rail${p}`, new THREE.CylinderGeometry(0.02, 0.02, 0.35, 6), "#222222", Math.cos(a) * 0.85, 6.3, Math.sin(a) * 0.85, { metalness: 0.8 });
  }
  add("lantern", new THREE.CylinderGeometry(0.5, 0.5, 0.9, 16), "#bfe6ff", 0, 6.6, 0, { transparent: true, opacity: 0.45, roughness: 0.05 });
  add("roof", new THREE.ConeGeometry(0.65, 0.8, 24), "#222222", 0, 7.45, 0);
  add("finial", new THREE.SphereGeometry(0.09, 12, 8), "#d4af37", 0, 7.95, 0, { metalness: 1, roughness: 0.3 });
  add("door", new THREE.BoxGeometry(0.5, 0.8, 0.1), "#5a3a22", 0, 1.0, 0.9);
  for (let w = 0; w < 4; w += 1) {
    const a = w * 1.3;
    add(`window${w}`, new THREE.BoxGeometry(0.22, 0.3, 0.06), "#1d2733", Math.sin(a) * 0.8, 2.2 + w, Math.cos(a) * 0.8);
  }
  add("cottage", new THREE.BoxGeometry(1.6, 1.0, 1.2), "#efe6d2", 2.6, 0.9, 0.6);
  add("cottageRoof", new THREE.ConeGeometry(1.0, 0.7, 4), "#7a2f22", 2.6, 1.75, 0.6);
  return { scene: root };
}
