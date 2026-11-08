import { camera, createAuraApp, effects, environments, geometry, lights, material, primitives, scene, sky } from "@aura3d/engine";

declare global {
  interface Window {
    __TASK_STATE__?: { ready: boolean; partCount: number; bandCount: number };
    __EVAL_READY__?: boolean;
  }
}

const HORIZON = "#cfe0ee";
let sc = scene({ background: HORIZON })
  .camera(camera.orbit({ position: [0, 15, 56], target: [4, 9.5, 0], fov: 45, near: 1, far: 600, autoRotate: 0.15 }))
  .add(sky.gradient({ zenith: "#4f86c2", horizon: HORIZON }))
  .add(environments.neutral({ intensity: 0.45, background: false }))
  .add(lights.hemisphere({ skyColor: "#d6e6f5", groundColor: "#5b6a78", intensity: 0.9 }))
  .add(lights.directional({ name: "key", position: [45, 60, 35], target: [0, 6, 0], intensity: 3.2, color: "#fff2dc", shadow: true }))
  .add(lights.directional({ name: "fill", position: [-40, 20, -25], target: [0, 8, 0], intensity: 0.9, color: "#9db8ff" }))
  .add(effects.fog({ color: HORIZON, density: 0.0035 }));

let partCount = 0;
const part = (n: Parameters<typeof sc.add>[0]): void => {
  sc = sc.add(n);
  partCount += 1;
};

let seed = 4242;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

// Materials
const red = material.pbr({ color: "#c42a2a", roughness: 0.65 });
const white = material.pbr({ color: "#f3f0e8", roughness: 0.65 });
const darkMetal = material.pbr({ color: "#23272e", metallic: 0.5, roughness: 0.45 });
const glassMat = material.pbr({ color: "#bfe6f5", roughness: 0.05, opacity: 0.28 });
const windowMat = material.pbr({ color: "#16222f", roughness: 0.2, metallic: 0.2 });
const doorMat = material.pbr({ color: "#4a2c16", roughness: 0.8 });
const lampMat = material.emissive({ color: "#fff1b0", emissive: "#ffd870", emissiveIntensity: 3 });
const roofMat = material.pbr({ color: "#2f3a4a", roughness: 0.6 });
const seaMat = material.pbr({ color: "#1f6590", roughness: 0.12, metallic: 0.1 });

// Sea
part(primitives.plane({ name: "sea", size: [700, 1, 700], material: seaMat, castShadow: false }));

// Rocky base
const rockTones = ["#5d5b58", "#6e6a64", "#4c4a48", "#7a756d", "#55524f"];
part(primitives.cylinder({ name: "rock-mound", size: [8.4, 2.4, 8.4], material: material.pbr({ color: "#58554f", roughness: 1 }) }).position(0, 0.2, 0));
for (let i = 0; i < 14; i += 1) {
  const a = (i / 14) * Math.PI * 2 + rand() * 0.3;
  const r = 3.6 + rand() * 2.6;
  const sx = 1.6 + rand() * 2.0, sy = 1.0 + rand() * 1.6, sz = 1.4 + rand() * 1.8;
  part(
    primitives
      .sphere({ name: `rock${i}`, size: [sx, sy, sz], material: material.pbr({ color: rockTones[i % rockTones.length]!, roughness: 1 }) })
      .position(Math.cos(a) * r, sy * 0.25 - 0.2, Math.sin(a) * r)
      .rotate(rand() * 0.6, rand() * 6, rand() * 0.6)
  );
}
for (let i = 0; i < 6; i += 1) {
  const a = rand() * Math.PI * 2, r = 5.5 + rand() * 2;
  const s = 0.9 + rand() * 1.1;
  part(
    primitives
      .box({ name: `boulder${i}`, size: [s * 1.3, s, s], material: material.pbr({ color: rockTones[(i + 2) % rockTones.length]!, roughness: 1 }) })
      .position(Math.cos(a) * r, s * 0.3 - 0.2, Math.sin(a) * r)
      .rotate(rand(), rand() * 6, rand())
  );
}

// Tapered tower: one frustum per painted band
const Y0 = 1.2, BAND_H = 2.6, BANDS = 6, TOP = Y0 + BAND_H * BANDS;
const R_BOT = 3.0, R_TOP = 1.9;
const radiusAt = (y: number): number => R_BOT + ((y - Y0) / (TOP - Y0)) * (R_TOP - R_BOT);

const frustum = (name: string, y0: number, y1: number, mat: ReturnType<typeof material.pbr>) => {
  const SEG = 32;
  const r0 = radiusAt(y0), r1 = radiusAt(y1);
  const positions = new Float32Array(2 * (SEG + 1) * 3);
  const normals = new Float32Array(positions.length);
  const indices: number[] = [];
  const ny = (r0 - r1) / (y1 - y0);
  const nl = Math.hypot(1, ny);
  for (let i = 0; i <= SEG; i += 1) {
    const th = (i / SEG) * Math.PI * 2, c = Math.cos(th), s = Math.sin(th);
    for (let k = 0; k < 2; k += 1) {
      const v = i * 2 + k;
      const r = k === 0 ? r0 : r1, y = k === 0 ? y0 : y1;
      positions.set([r * c, y, r * s], v * 3);
      normals.set([c / nl, ny / nl, s / nl], v * 3);
    }
    if (i < SEG) {
      const a = i * 2, b = a + 1, cc = a + 2, d = a + 3;
      indices.push(a, b, cc, cc, b, d);
    }
  }
  return geometry.custom(
    geometry.define({ positions, normals, indices, bounds: { min: [-r0, y0, -r0], max: [r0, y1, r0] } }),
    { name, material: mat }
  );
};
for (let i = 0; i < BANDS; i += 1) {
  part(frustum(`band${i}`, Y0 + i * BAND_H, Y0 + (i + 1) * BAND_H, i % 2 === 0 ? red : white));
}

// Door and windows (placed on the tapered surface, facing outward)
const onWall = (name: string, angle: number, y: number, size: [number, number, number], mat: ReturnType<typeof material.pbr>, push = 0) => {
  const r = radiusAt(y) + push;
  part(
    primitives
      .box({ name, size, material: mat })
      .position(Math.cos(angle) * r, y, Math.sin(angle) * r)
      .rotate(0, Math.PI / 2 - angle, 0)
  );
};
onWall("door", Math.PI / 2, Y0 + 0.95, [1.1, 1.9, 0.3], doorMat);
onWall("door-arch", Math.PI / 2, Y0 + 1.95, [1.1, 0.25, 0.3], white);
for (let i = 0; i < BANDS; i += 1) {
  const y = Y0 + BAND_H * (i + 0.5) + 0.2;
  onWall(`window${i}`, 0.4 + i * 1.15, y, [0.55, 0.9, 0.3], windowMat);
  onWall(`sill${i}`, 0.4 + i * 1.15, y - 0.5, [0.8, 0.1, 0.42], darkMetal);
}

// Gallery balcony with railing
const G_Y = TOP;
part(primitives.cylinder({ name: "gallery-floor", size: [5.8, 0.3, 5.8], material: darkMetal }).position(0, G_Y + 0.05, 0));
part(primitives.cylinder({ name: "gallery-collar", size: [4.4, 0.35, 4.4], material: darkMetal }).position(0, G_Y - 0.2, 0));
const RAIL_R = 2.75, POSTS = 24;
for (let i = 0; i < POSTS; i += 1) {
  const a = (i / POSTS) * Math.PI * 2;
  part(primitives.cylinder({ name: `post${i}`, size: [0.08, 1.0, 0.08], material: darkMetal }).position(Math.cos(a) * RAIL_R, G_Y + 0.7, Math.sin(a) * RAIL_R));
  const m = a + Math.PI / POSTS;
  const rr = RAIL_R * Math.cos(Math.PI / POSTS);
  const len = 2 * RAIL_R * Math.sin(Math.PI / POSTS) + 0.04;
  part(primitives.box({ name: `rail${i}`, size: [len, 0.08, 0.1], material: darkMetal }).position(Math.cos(m) * rr, G_Y + 1.2, Math.sin(m) * rr).rotate(0, -m - Math.PI / 2, 0));
  part(primitives.box({ name: `midrail${i}`, size: [len, 0.05, 0.05], material: darkMetal }).position(Math.cos(m) * rr, G_Y + 0.7, Math.sin(m) * rr).rotate(0, -m - Math.PI / 2, 0));
}

// Lantern room: glass, mullions, lamp
const L_R = 1.5, L_BASE = G_Y + 0.2, L_H = 2.2;
part(primitives.cylinder({ name: "lantern-base", size: [3.3, 0.3, 3.3], material: darkMetal }).position(0, L_BASE + 0.05, 0));
part(primitives.cylinder({ name: "lantern-glass", size: [L_R * 2, L_H, L_R * 2], material: glassMat, castShadow: false }).position(0, L_BASE + 0.2 + L_H / 2, 0));
for (let i = 0; i < 8; i += 1) {
  const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
  part(primitives.cylinder({ name: `mullion${i}`, size: [0.1, L_H, 0.1], material: darkMetal }).position(Math.cos(a) * L_R, L_BASE + 0.2 + L_H / 2, Math.sin(a) * L_R));
}
const L_TOP = L_BASE + 0.2 + L_H;
part(primitives.cylinder({ name: "lantern-top-ring", size: [3.4, 0.25, 3.4], material: darkMetal }).position(0, L_TOP + 0.1, 0));
part(primitives.cylinder({ name: "lamp-pedestal", size: [0.45, 0.8, 0.45], material: darkMetal }).position(0, L_BASE + 0.6, 0));
part(primitives.sphere({ name: "lamp", size: 0.9, material: lampMat, castShadow: false }).position(0, L_BASE + 1.5, 0));
part(primitives.cylinder({ name: "lens-ring", size: [1.3, 0.1, 1.3], material: darkMetal }).position(0, L_BASE + 2.1, 0));
sc = sc.add(lights.point({ name: "lamp-light", position: [0, L_BASE + 1.5, 0], intensity: 14, color: "#ffd98a" }));

// Roof and finial
const ROOF_BASE = L_TOP + 0.25;
part(primitives.cone({ name: "roof", size: [3.9, 1.9, 3.9], material: roofMat }).position(0, ROOF_BASE + 0.95, 0));
part(primitives.sphere({ name: "finial-ball", size: 0.42, material: darkMetal }).position(0, ROOF_BASE + 2.0, 0));
part(primitives.cylinder({ name: "finial-spike", size: [0.08, 0.7, 0.08], material: darkMetal }).position(0, ROOF_BASE + 2.35, 0));

// Keeper's cottage on a grassy patch
const CX = 12, CZ = 4;
part(primitives.cylinder({ name: "grass-patch", size: [11, 0.9, 11], material: material.pbr({ color: "#5f7a3c", roughness: 1 }) }).position(CX, 0.05, CZ));
part(primitives.cylinder({ name: "patch-rim", size: [12, 0.6, 12], material: material.pbr({ color: "#5d5b58", roughness: 1 }) }).position(CX, -0.1, CZ));
const WALL_Y = 0.5 + 1.3;
part(primitives.box({ name: "cottage-walls", size: [5.2, 2.6, 3.6], material: material.pbr({ color: "#efe6d2", roughness: 0.8 }) }).position(CX, WALL_Y, CZ));
const slate = material.pbr({ color: "#7a3a2c", roughness: 0.7 });
const ALPHA = 0.55;
for (const s of [1, -1]) {
  part(
    primitives
      .box({ name: `cottage-roof${s}`, size: [5.8, 0.2, 2.45], material: slate })
      .position(CX, WALL_Y + 1.3 + 0.65, CZ + s * 1.02)
      .rotate(s * ALPHA, 0, 0)
  );
}
part(primitives.box({ name: "gable-front", size: [0.05, 1.0, 0.05], material: slate }).position(CX + 2.6, WALL_Y + 1.3 + 0.1, CZ).scale([1, 0.2, 1]));
part(primitives.box({ name: "chimney", size: [0.6, 1.4, 0.6], material: material.pbr({ color: "#6b4a3a", roughness: 0.9 }) }).position(CX + 1.7, WALL_Y + 2.0, CZ - 0.7));
part(primitives.box({ name: "cottage-door", size: [0.9, 1.7, 0.1], material: doorMat }).position(CX - 1.0, 0.5 + 0.85, CZ + 1.83));
part(primitives.box({ name: "cottage-window", size: [1.0, 0.8, 0.1], material: windowMat }).position(CX + 1.1, WALL_Y + 0.1, CZ + 1.83));
part(primitives.box({ name: "cottage-window-frame", size: [1.2, 0.1, 0.14], material: white }).position(CX + 1.1, WALL_Y - 0.35, CZ + 1.84));
part(primitives.box({ name: "cottage-window-side", size: [0.1, 0.8, 1.0], material: windowMat }).position(CX + 2.62, WALL_Y + 0.1, CZ));

const app = createAuraApp("#app", { scene: sc });
await app.ready();
await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
window.__TASK_STATE__ = { ready: true, partCount, bandCount: BANDS };
window.__EVAL_READY__ = true;
