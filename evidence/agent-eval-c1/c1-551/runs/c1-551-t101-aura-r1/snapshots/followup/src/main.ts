import { camera, createAuraApp, looks, material, primitives, scene } from "@aura3d/engine";

type V3 = [number, number, number];

const PERIOD = 2; // seconds per full gait cycle (every leg plants twice-per-cycle pattern repeats)
const LOOK = "product-studio" as const;

// ---- spider dimensions -------------------------------------------------
const BODY_Y = 1.0;
const UPPER = 1.1;
const LOWER = 1.7;
const STRIDE = 0.32; // half-length of foot travel along the walking direction (+z)
const LIFT = 0.55;
const SWING = 0.45; // fraction of the cycle spent in the air

const HIP_Z = [0.25, 0.08, -0.1, -0.28];
const FOOT_X = [1.65, 1.95, 1.95, 1.75];
const FOOT_DZ = [1.0, 0.45, -0.4, -1.1];
const HIP_X = 0.38;
const CENTER_Z = 0.35; // cephalothorax centre

const bodyMat = material.pbr({ color: "#3a2b27", roughness: 0.55 });
const abdomenMat = material.pbr({ color: "#8a4a22", roughness: 0.5 });
const legMat = material.pbr({ color: "#5b4033", roughness: 0.5 });
const jointMat = material.pbr({ color: "#2b201c", roughness: 0.4 });
const eyeMat = material.pbr({ color: "#0b0b0d", roughness: 0.15, metallic: 0.2 });
const markMat = material.pbr({ color: "#d9b36a", roughness: 0.5 });

const sph = (id: string, mat: typeof bodyMat) =>
  primitives.sphere({ name: id, size: 1, material: mat, castShadow: true }).runtime({ id, mutable: true });
const cyl = (id: string, mat: typeof bodyMat) =>
  primitives.cylinder({ name: id, size: [1, 1, 1], material: mat, castShadow: true }).runtime({ id, mutable: true });

const legs: { id: string; side: number; j: number; phase: number }[] = [];
for (const side of [1, -1]) {
  for (let j = 0; j < 4; j += 1) {
    // Diagonal gait: front-left, rear-left-ish pairs move with the opposite front-right pair.
    const groupA = (j % 2 === 0) === (side === 1);
    legs.push({ id: `${side > 0 ? "L" : "R"}${j}`, side, j, phase: groupA ? 0 : 0.5 });
  }
}

let sc = scene()
  .add(looks.preset(LOOK, { exposureEv: -0.8 }))
  .add(primitives.plane({ name: "floor", size: [16, 1, 16], material: material.pbr({ color: "#d4d6dc", roughness: 0.9 }), receiveShadow: true }))
  .add(sph("thorax", bodyMat))
  .add(sph("abdomen", abdomenMat))
  .add(sph("mark", markMat))
  .add(sph("eyeL", eyeMat))
  .add(sph("eyeR", eyeMat))
  .add(sph("eyeL2", eyeMat))
  .add(sph("eyeR2", eyeMat))
  .add(sph("palpL", jointMat))
  .add(sph("palpR", jointMat));
for (const l of legs) {
  sc = sc
    .add(cyl(`u${l.id}`, legMat))
    .add(cyl(`l${l.id}`, legMat))
    .add(sph(`h${l.id}`, jointMat))
    .add(sph(`k${l.id}`, jointMat))
    .add(sph(`f${l.id}`, jointMat));
}

const app = createAuraApp("#app", {
  scene: sc.camera(camera.perspective({ position: [3.9, 3.3, 4.6], target: [0, 0.6, -0.1], fov: 42 })),
  ...looks.appOptions(LOOK)
});

// ---- helpers -----------------------------------------------------------
const smooth = (x: number): number => {
  const c = Math.min(1, Math.max(0, x));
  return c * c * (3 - 2 * c);
};

type Handle = ReturnType<typeof app.nodes.require>;
const cache = new Map<string, Handle>();
const node = (id: string): Handle => {
  let h = cache.get(id);
  if (!h) {
    h = app.nodes.require(id);
    cache.set(id, h);
  }
  return h;
};

// Orient a unit cylinder (axis +Y) from a to b. Euler XYZ (R = Rx*Ry*Rz) mapping +Y to the direction.
const place = (id: string, a: V3, b: V3, diameter: number): void => {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const len = Math.max(0.001, Math.hypot(dx, dy, dz));
  const ux = dx / len, uy = dy / len, uz = dz / len;
  // Runtime Euler order is ZYX (R = Rz*Ry*Rx): +Y maps to (-sin rz cos rx, cos rz cos rx, sin rx).
  const rx = Math.asin(Math.max(-1, Math.min(1, uz)));
  const rz = Math.atan2(-ux, uy);
  node(id)
    .setPosition((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2)
    .setRotation(rx, 0, rz)
    .setScale([diameter, len, diameter]);
};

const ball = (id: string, p: V3, d: number): void => {
  node(id).setPosition(p[0], p[1], p[2]).setScale([d, d, d]);
};

// Two-bone IK: knee position between hip and foot, bending upwards and slightly outwards.
const knee = (hip: V3, foot: V3, side: number): V3 => {
  let dx = foot[0] - hip[0], dy = foot[1] - hip[1], dz = foot[2] - hip[2];
  let d = Math.hypot(dx, dy, dz);
  const dMax = UPPER + LOWER - 0.02, dMin = Math.abs(LOWER - UPPER) + 0.02;
  const dc = Math.min(dMax, Math.max(dMin, d));
  dx /= d; dy /= d; dz /= d;
  d = dc;
  const along = (UPPER * UPPER - LOWER * LOWER + d * d) / (2 * d);
  const bend = Math.sqrt(Math.max(0, UPPER * UPPER - along * along));
  // pole vector: up, with a bit of outward lean, made perpendicular to the leg direction
  let px = side * 0.25, py = 1, pz = 0;
  const dot = px * dx + py * dy + pz * dz;
  px -= dx * dot; py -= dy * dot; pz -= dz * dot;
  const pl = Math.hypot(px, py, pz) || 1;
  return [hip[0] + dx * along + (px / pl) * bend, hip[1] + dy * along + (py / pl) * bend, hip[2] + dz * along + (pz / pl) * bend];
};

// Foot offset along the walking direction and height for gait phase p in [0,1).
const footCycle = (p: number): { dz: number; lift: number } => {
  if (p < SWING) {
    const u = p / SWING; // swing: lift, move forward, plant
    return { dz: -STRIDE + 2 * STRIDE * smooth(u), lift: LIFT * Math.sin(Math.PI * u) };
  }
  const u = (p - SWING) / (1 - SWING); // stance: foot planted, body moves forward over it
  return { dz: STRIDE - 2 * STRIDE * u, lift: 0 };
};

let ready = false;
let clock = 0; // gait clock; only advances while walking
const taskState = { walking: true };
(window as unknown as { __TASK_STATE__?: { walking: boolean } }).__TASK_STATE__ = taskState;
window.addEventListener("keydown", (e) => {
  if (e.code === "Space" || e.key === " ") {
    e.preventDefault();
    if (!e.repeat) taskState.walking = !taskState.walking;
  }
});

app.onFrame((f) => {
  if (taskState.walking) clock += f.dt;
  const t = clock;
  const cyc = (t / PERIOD) % 1;
  // Two steps per cycle (one per diagonal group): bob and sway at twice the cycle rate.
  const bob = Math.cos(4 * Math.PI * cyc);
  const by = BODY_Y + 0.05 * bob;
  const roll = 0.025 * Math.sin(2 * Math.PI * cyc);
  const pitch = 0.015 * Math.sin(4 * Math.PI * cyc);

  // body
  ball("thorax", [0, by, CENTER_Z], 1);
  node("thorax").setScale([0.85, 0.7, 0.95]).setRotation(pitch, 0, roll);
  node("abdomen").setPosition(0, by + 0.12, CENTER_Z - 1.0).setScale([1.15, 1.0, 1.5]).setRotation(0.12 + pitch, 0, roll);
  node("mark").setPosition(0, by + 0.58, CENTER_Z - 1.0).setScale([0.42, 0.12, 0.7]).setRotation(0.12 + pitch, 0, roll);
  ball("eyeL", [0.14, by + 0.13, CENTER_Z + 0.43], 0.17);
  ball("eyeR", [-0.14, by + 0.13, CENTER_Z + 0.43], 0.17);
  ball("eyeL2", [0.26, by + 0.2, CENTER_Z + 0.3], 0.12);
  ball("eyeR2", [-0.26, by + 0.2, CENTER_Z + 0.3], 0.12);
  ball("palpL", [0.17, by - 0.14, CENTER_Z + 0.43], 0.2);
  ball("palpR", [-0.17, by - 0.14, CENTER_Z + 0.43], 0.2);

  for (const l of legs) {
    const hip: V3 = [l.side * HIP_X, by - 0.05, CENTER_Z + HIP_Z[l.j]!];
    const p = (cyc + l.phase) % 1;
    const { dz, lift } = footCycle(p);
    const foot: V3 = [l.side * FOOT_X[l.j]!, 0.07 + lift, CENTER_Z + HIP_Z[l.j]! + FOOT_DZ[l.j]! + dz];
    const kn = knee(hip, foot, l.side);
    place(`u${l.id}`, hip, kn, 0.18);
    place(`l${l.id}`, kn, foot, 0.12);
    ball(`h${l.id}`, hip, 0.22);
    ball(`k${l.id}`, kn, 0.22);
    ball(`f${l.id}`, foot, 0.13);
  }

  if (!ready) {
    ready = true;
    // Flag after the frame that applies this first pose has been drawn.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      (window as unknown as { __EVAL_READY__?: boolean }).__EVAL_READY__ = true;
    }));
  }
});

void app.ready();
