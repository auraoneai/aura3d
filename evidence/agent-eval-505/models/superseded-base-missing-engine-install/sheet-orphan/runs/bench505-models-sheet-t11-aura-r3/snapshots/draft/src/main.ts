import { camera, createAuraApp, effects, environments, group, instances, lights, material, primitives, scene, type AuraTransformSpec } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
    __TASK_STATE__?: { ready: boolean; wheelCount: number; spokeCount: number; plankCount: number };
  }
}

type V3 = [number, number, number];
type Kids = Parameters<typeof group>[1];

let seed = 20240611;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const jitter = (a: number): number => (rand() * 2 - 1) * a;

let sc = scene({ background: "#d9cdb4" })
  .camera(camera.orbit({ position: [4.2, 2.6, 4.6], target: [0, 0.75, -0.4], fov: 40, near: 0.1, far: 100, autoRotate: 0.22 }))
  .add(environments.neutral({ intensity: 0.45, background: false }))
  .add(lights.hemisphere({ skyColor: "#ffe9c8", groundColor: "#6b4a2b", intensity: 0.9 }))
  .add(lights.directional({ name: "sun", position: [5, 7, 3.5], target: [0, 0.5, -0.4], intensity: 3.2, color: "#ffd9a6", shadow: true }))
  .add(lights.directional({ name: "fill", position: [-5, 3, -4], target: [0, 0.5, 0], intensity: 0.6, color: "#bcd0ff" }))
  .add(effects.fog({ color: "#d9cdb4", density: 0.012 }))
  .add(primitives.plane({ name: "ground", size: [60, 1, 60], material: material.pbr({ color: "#7a5a3a", roughness: 1 }) }));

const add = (n: Parameters<typeof sc.add>[0]): void => {
  sc = sc.add(n);
};

// ---------- materials ----------
const woodTones = ["#8a6035", "#7b5530", "#946a3d", "#6e4b2a", "#9a7444", "#80592f", "#8f6638"];
const wood = (i: number, rough = 0.85) => material.pbr({ color: woodTones[i % woodTones.length]!, roughness: rough });
const darkWood = material.pbr({ color: "#5a3c22", roughness: 0.9 });
const iron = material.pbr({ color: "#3a3d42", metallic: 0.8, roughness: 0.5 });

let counter = 0;
const nm = (p: string): string => `${p}-${counter++}`;

const box = (p: string, size: V3, pos: V3, mat: ReturnType<typeof material.pbr>, rot?: V3) => {
  const b = primitives.box({ name: nm(p), size, material: mat }).position(...pos);
  return rot ? b.rotate(...rot) : b;
};

// Cylinder whose axis goes between points a and b that share the same x.
const strut = (p: string, a: V3, b: V3, r: number, mat: ReturnType<typeof material.pbr>) => {
  const dy = b[1] - a[1], dz = b[2] - a[2];
  const len = Math.hypot(dy, dz);
  return primitives
    .cylinder({ name: nm(p), size: [r * 2, len, r * 2], material: mat })
    .position(a[0], (a[1] + b[1]) / 2, (a[2] + b[2]) / 2)
    .rotate(Math.atan2(dz, dy), 0, 0);
};

// ---------- bed ----------
const FLOOR_Y = 0.72;
const FLOOR_TOP = FLOOR_Y + 0.0175;
let plankCount = 0;
const plank = (size: V3, pos: V3, rot: V3, tone: number) => {
  plankCount += 1;
  return primitives.box({ name: `plank-${plankCount}`, size, material: wood(tone) }).position(...pos).rotate(...rot);
};

// floor planks, running front to back
const NF = 9;
for (let i = 0; i < NF; i += 1) {
  const w = 1.0 / NF;
  const len = 1.6 + jitter(0.05) + 0.04;
  add(plank([w - 0.006, 0.035, len], [-0.5 + w * (i + 0.5), FLOOR_Y + jitter(0.004), jitter(0.025)], [jitter(0.012), jitter(0.01), jitter(0.012)], Math.floor(rand() * 7)));
}
// side boards (outside of the posts)
for (const sx of [-1, 1]) {
  for (let k = 0; k < 3; k += 1) {
    add(plank([0.03, 0.065, 1.66 + jitter(0.03)], [sx * 0.545 + jitter(0.003), 0.78 + k * 0.07, jitter(0.015)], [jitter(0.01), 0, jitter(0.01)], Math.floor(rand() * 7)));
  }
}
// end boards
for (const sz of [-1, 1]) {
  for (let k = 0; k < 2; k += 1) {
    add(plank([1.02 + jitter(0.02), 0.065, 0.03], [jitter(0.01), 0.78 + k * 0.07, sz * 0.845], [0, jitter(0.015), jitter(0.01)], Math.floor(rand() * 7)));
  }
}

// longitudinal beams (carrying the bed) and cross beams
for (const sx of [-1, 1]) add(box("beam", [0.07, 0.08, 1.7], [sx * 0.45, 0.645, -0.0], darkWood));
add(box("crossbeam", [1.0, 0.06, 0.08], [0, 0.66, 0.8], darkWood));
add(box("crossbeam", [1.0, 0.06, 0.08], [0, 0.66, -0.8], darkWood));

// corner posts, rails
const POST_H = 0.62;
for (const sx of [-1, 1]) {
  for (const sz of [-1, 1]) {
    add(box("post", [0.06, POST_H, 0.06], [sx * 0.5, 0.7 + POST_H / 2, sz * 0.8], material.pbr({ color: "#6f4b29", roughness: 0.9 })));
    add(primitives.sphere({ name: nm("postcap"), size: 0.07, material: wood(sx + sz + 3) }).position(sx * 0.5, 0.7 + POST_H + 0.01, sz * 0.8));
  }
}
for (const sx of [-1, 1]) {
  for (const ry of [1.04, 1.22]) add(box("siderail", [0.04, 0.05, 1.66], [sx * 0.5, ry, 0], wood(Math.floor(rand() * 7)), [0, 0, jitter(0.01)]));
}
for (const sz of [-1, 1]) {
  for (const ry of [1.04, 1.22]) add(box("endrail", [1.0, 0.05, 0.04], [0, ry, sz * 0.8], wood(Math.floor(rand() * 7)), [0, 0, jitter(0.01)]));
}

// iron straps and bolts on the sides
for (const sx of [-1, 1]) {
  for (const z of [-0.6, 0, 0.6]) {
    add(box("strap", [0.012, 0.23, 0.05], [sx * 0.566, 0.85, z], iron));
    for (const by of [0.77, 0.93]) add(primitives.sphere({ name: nm("bolt"), size: 0.03, material: iron }).position(sx * 0.572, by, z));
  }
  for (const rz of [-0.8, 0.8]) {
    add(primitives.sphere({ name: nm("bolt"), size: 0.028, material: iron }).position(sx * 0.53, 1.04, rz * 1.0));
    add(primitives.sphere({ name: nm("bolt"), size: 0.028, material: iron }).position(sx * 0.53, 1.22, rz * 1.0));
  }
}

// ---------- axle, wheels ----------
const AXLE_Y = 0.55, WHEEL_X = 0.66;
add(primitives.cylinder({ name: "axle", size: [0.07, 1.74, 0.07], material: darkWood }).position(0, AXLE_Y, 0).rotate(0, 0, Math.PI / 2));
for (const sx of [-1, 1]) {
  add(primitives.cylinder({ name: nm("linchpin"), size: [0.02, 0.09, 0.02], material: iron }).position(sx * 0.83, AXLE_Y, 0));
  add(box("axlebracket", [0.09, 0.05, 0.14], [sx * 0.45, 0.595, 0], iron));
}

const SPOKES = 12, FELLOES = 10, TYRES = 20;
const wheelKids = (): Kids => {
  const kids: Kids[number][] = [];
  kids.push(primitives.cylinder({ name: nm("hub"), size: [0.15, 0.2, 0.15], material: material.pbr({ color: "#6a4524", roughness: 0.85 }) }).rotate(Math.PI / 2, 0, 0));
  for (const hz of [-0.085, 0.085]) {
    kids.push(primitives.cylinder({ name: nm("hubband"), size: [0.17, 0.03, 0.17], material: iron }).position(0, 0, hz).rotate(Math.PI / 2, 0, 0));
  }
  kids.push(primitives.cylinder({ name: nm("hubcap"), size: [0.07, 0.24, 0.07], material: iron }).rotate(Math.PI / 2, 0, 0));
  for (let i = 0; i < SPOKES; i += 1) {
    const a = (i / SPOKES) * Math.PI * 2, r = 0.26;
    kids.push(primitives.box({ name: nm("spoke"), size: [0.045, 0.42, 0.05], material: wood(i) }).position(Math.cos(a) * r, Math.sin(a) * r, 0).rotate(0, 0, a - Math.PI / 2));
  }
  const rr = 0.49;
  for (let i = 0; i < FELLOES; i += 1) {
    const a = ((i + 0.5) / FELLOES) * Math.PI * 2;
    kids.push(primitives.box({ name: nm("felloe"), size: [((2 * Math.PI * rr) / FELLOES) * 1.04, 0.07, 0.09], material: wood(i + 2) }).position(Math.cos(a) * rr, Math.sin(a) * rr, 0).rotate(0, 0, a - Math.PI / 2));
  }
  const tr = 0.535;
  for (let i = 0; i < TYRES; i += 1) {
    const a = (i / TYRES) * Math.PI * 2;
    kids.push(primitives.box({ name: nm("tyre"), size: [((2 * Math.PI * tr) / TYRES) * 1.05, 0.022, 0.1], material: iron }).position(Math.cos(a) * tr, Math.sin(a) * tr, 0).rotate(0, 0, a - Math.PI / 2));
  }
  // iron nails on the tyre
  for (let i = 0; i < 10; i += 1) {
    const a = ((i + 0.25) / 10) * Math.PI * 2;
    kids.push(primitives.sphere({ name: nm("nail"), size: 0.03, material: iron }).position(Math.cos(a) * 0.55, Math.sin(a) * 0.55, 0.0));
  }
  return kids;
};

for (const [id, sx] of [["wheel-l", -1], ["wheel-r", 1]] as const) {
  add(
    group(`${id}-orient`, [group(`${id}-spin`, wheelKids(), { position: [0, 0, 0] }).runtime({ id: `${id}-spin`, mutable: true })], {
      position: [sx * WHEEL_X, AXLE_Y, 0],
      rotation: [0, Math.PI / 2, 0]
    })
  );
}

// ---------- handles, prop stand ----------
for (const sx of [-1, 1]) {
  const x = sx * 0.45;
  add(strut("handle", [x, 0.65, -0.8], [x, 0.93, -2.15], 0.032, material.pbr({ color: "#7d5632", roughness: 0.8 })));
  add(primitives.sphere({ name: nm("handleend"), size: 0.07, material: wood(2) }).position(x, 0.93, -2.15));
  add(primitives.cylinder({ name: nm("gripband"), size: [0.075, 0.03, 0.075], material: iron }).position(x, 0.9, -1.98).rotate(Math.atan2(-1.35, 0.28), 0, 0));
}
add(box("handlebrace", [0.9, 0.05, 0.05], [0, 0.78, -1.45], darkWood));
add(box("handlebrace", [0.9, 0.05, 0.05], [0, 0.69, -0.95], darkWood));

for (const sx of [-1, 1]) {
  add(strut("leg", [sx * 0.35, 0.64, 0.82], [sx * 0.35, 0.04, 1.2], 0.03, darkWood));
  add(box("legbolt", [0.04, 0.04, 0.04], [sx * 0.35, 0.66, 0.84], iron));
}
add(box("legfoot", [0.85, 0.05, 0.1], [0, 0.025, 1.2], darkWood));
add(box("legbrace", [0.7, 0.04, 0.04], [0, 0.34, 1.02], darkWood));

// ---------- cargo ----------
const burlap = ["#b59c6a", "#a98f5c", "#bda877"];
const sack = (pos: V3, size: V3, yaw: number, tone: number) => {
  const m = material.pbr({ color: burlap[tone % 3]!, roughness: 1 });
  add(primitives.sphere({ name: nm("sack"), size, material: m }).position(...pos).rotate(0, yaw, 0));
  add(primitives.sphere({ name: nm("sackneck"), size: [size[0] * 0.42, size[1] * 0.4, size[2] * 0.36], material: m }).position(pos[0], pos[1] + size[1] * 0.45, pos[2]).rotate(0, yaw, 0));
  add(primitives.cylinder({ name: nm("sacktie"), size: [size[0] * 0.26, 0.03, size[2] * 0.22], material: darkWood }).position(pos[0], pos[1] + size[1] * 0.4, pos[2]).rotate(0, yaw, 0));
};
sack([-0.24, FLOOR_TOP + 0.19, -0.5], [0.42, 0.38, 0.5], 0.3, 0);
sack([0.22, FLOOR_TOP + 0.18, -0.52], [0.4, 0.36, 0.48], -0.4, 1);
sack([0.0, FLOOR_TOP + 0.38 + 0.12, -0.46], [0.4, 0.3, 0.46], 1.4, 2);

const barrel = (x: number, z: number, h: number, d: number) => {
  const m = material.pbr({ color: "#7a4f2a", roughness: 0.85 });
  const y = FLOOR_TOP + h / 2;
  add(primitives.cylinder({ name: nm("barrel"), size: [d, h, d], material: m }).position(x, y, z));
  add(primitives.cylinder({ name: nm("barrelbulge"), size: [d * 1.06, h * 0.5, d * 1.06], material: m }).position(x, y, z));
  add(primitives.cylinder({ name: nm("barrellid"), size: [d * 0.92, 0.012, d * 0.92], material: wood(4) }).position(x, FLOOR_TOP + h + 0.002, z));
  for (const by of [-0.36, -0.17, 0.17, 0.36]) {
    const rs = Math.abs(by) < 0.2 ? 1.1 : 1.03;
    add(primitives.cylinder({ name: nm("barrelhoop"), size: [d * rs, 0.025, d * rs], material: iron }).position(x, y + by * h, z));
  }
};
barrel(0.24, 0.02, 0.5, 0.36);
barrel(-0.24, 0.05, 0.46, 0.34);

const crate = (x: number, y0: number, z: number, s: V3, yaw: number, tone: number) => {
  const y = y0 + s[1] / 2;
  add(primitives.box({ name: nm("crate"), size: s, material: wood(tone, 0.9) }).position(x, y, z).rotate(0, yaw, 0));
  for (const by of [-1, 1]) {
    add(primitives.box({ name: nm("crateband"), size: [s[0] + 0.012, 0.05, s[2] + 0.012], material: darkWood }).position(x, y + by * (s[1] / 2 - 0.03), z).rotate(0, yaw, 0));
  }
  for (const cx of [-1, 1]) {
    for (const cz of [-1, 1]) {
      const c = Math.cos(yaw), sn = Math.sin(yaw), lx = cx * s[0] / 2, lz = cz * s[2] / 2;
      add(primitives.box({ name: nm("cratepost"), size: [0.045, s[1] + 0.006, 0.045], material: darkWood }).position(x + lx * c + lz * sn, y, z - lx * sn + lz * c).rotate(0, yaw, 0));
    }
  }
};
crate(-0.25, FLOOR_TOP, 0.5, [0.42, 0.4, 0.42], 0.1, 1);
crate(0.26, FLOOR_TOP, 0.52, [0.36, 0.32, 0.38], -0.15, 5);
crate(-0.24, FLOOR_TOP + 0.4, 0.5, [0.3, 0.26, 0.3], 0.5, 3);

// ---------- dirt ground details ----------
const mounds: AuraTransformSpec[] = [], moundColors: string[] = [];
for (let i = 0; i < 28; i += 1) {
  const a = rand() * 6.283, r = 1 + 11 * Math.sqrt(rand());
  mounds.push({ position: [Math.cos(a) * r, 0, Math.sin(a) * r], rotation: [0, rand() * 6, 0], scale: [0.8 + rand() * 1.8, 0.07, 0.6 + rand() * 1.2] });
  moundColors.push(`hsl(${26 + Math.floor(rand() * 8)}, ${30 + Math.floor(rand() * 15)}%, ${28 + Math.floor(rand() * 16)}%)`);
}
const stones: AuraTransformSpec[] = [], stoneColors: string[] = [];
let tries = 0;
while (stones.length < 16 && tries < 500) {
  tries += 1;
  const a = rand() * 6.283, r = 1.2 + 6 * Math.sqrt(rand());
  const x = Math.cos(a) * r, z = Math.sin(a) * r;
  if (Math.abs(x) < 1.1 && z > -2.5 && z < 1.6) continue;
  const s = 0.1 + rand() * 0.22;
  stones.push({ position: [x, s * 0.25, z], rotation: [rand() * 0.4, rand() * 6, rand() * 0.4], scale: [s * 1.3, s * 0.8, s] });
  stoneColors.push(`hsl(${28 + Math.floor(rand() * 10)}, 6%, ${36 + Math.floor(rand() * 24)}%)`);
}
const white = material.pbr({ color: "#ffffff", roughness: 0.95 });
add(instances.sphere({ name: "mounds", transforms: mounds, colors: moundColors, material: white, castShadow: false }));
add(instances.sphere({ name: "stones", transforms: stones, colors: stoneColors, material: white }));

// ---------- run ----------
const app = createAuraApp("#app", { scene: sc });
let spin = 0;
app.onFrame((f) => {
  spin += f.dt * 0.6;
  app.nodes.require("wheel-l-spin").setRotation(0, 0, spin);
  app.nodes.require("wheel-r-spin").setRotation(0, 0, spin);
});
await app.ready();
window.__TASK_STATE__ = { ready: true, wheelCount: 2, spokeCount: SPOKES * 2, plankCount };
window.__EVAL_READY__ = true;
