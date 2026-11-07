import { group, material, primitives } from "@aura3d/engine";
import { makeRng } from "./mesh";

type Pos = [number, number, number];

export interface Swimmer {
  id: string;
  /** Position and heading (yaw about +Y, radians) at time t. */
  pose: (t: number) => { p: Pos; yaw: number };
}

const fishMat = (color: string, extra: { metallic?: number; roughness?: number } = {}) =>
  material.pbr({ color, roughness: extra.roughness ?? 0.4, metallic: extra.metallic ?? 0.05 });

const dark = fishMat("#0a0f14", { roughness: 0.3 });
const white = fishMat("#f4f8fa", { roughness: 0.3 });

/** Vertical tail fin: wide in Y, thin in Z, apex toward the body (+X). */
const tailFin = (name: string, x: number, spanY: number, length: number, mat: ReturnType<typeof fishMat>, y = 0) =>
  primitives.cone({ name, size: [spanY, length, spanY * 0.14], material: mat }).rotate(0, 0, -Math.PI / 2).position(x, y, 0);

const eyePair = (prefix: string, x: number, y: number, z: number, r: number) => [
  primitives.sphere({ name: `${prefix}-eye-l`, size: r * 2, material: white }).position(x, y, z),
  primitives.sphere({ name: `${prefix}-eye-r`, size: r * 2, material: white }).position(x, y, -z),
  primitives.sphere({ name: `${prefix}-pupil-l`, size: r * 1.2, material: dark }).position(x + r * 0.25, y, z + r * 0.45),
  primitives.sphere({ name: `${prefix}-pupil-r`, size: r * 1.2, material: dark }).position(x + r * 0.25, y, -(z + r * 0.45))
];

/** Small school fish, length about `len` metres, heading +X. */
export const schoolFishNode = (id: string, color: string, len: number, start: Pos) =>
  group(
    id,
    [
      primitives.sphere({ name: `${id}-body`, size: [len, len * 0.42, len * 0.2], material: fishMat(color, { roughness: 0.3, metallic: 0.25 }) }),
      tailFin(`${id}-tail`, -len * 0.52, len * 0.36, len * 0.3, fishMat(color)),
      primitives.sphere({ name: `${id}-stripe`, size: [len * 0.12, len * 0.44, len * 0.21], material: fishMat("#143a66") }).position(len * 0.12, 0, 0)
    ],
    { position: start }
  ).runtime({ id, mutable: true });

export const angelFishNode = (id: string, start: Pos) => {
  const yellow = fishMat("#f5c431", { roughness: 0.35 });
  const blue = fishMat("#2467d1", { roughness: 0.35 });
  return group(
    id,
    [
      primitives.sphere({ name: `${id}-body`, size: [0.5, 0.58, 0.1], material: yellow }),
      primitives.sphere({ name: `${id}-band`, size: [0.1, 0.6, 0.108], material: blue }).position(0.06, 0, 0),
      primitives.sphere({ name: `${id}-band2`, size: [0.07, 0.5, 0.108], material: blue }).position(-0.12, 0, 0),
      primitives.cone({ name: `${id}-dorsal`, size: [0.2, 0.38, 0.03], material: yellow }).position(-0.08, 0.4, 0),
      primitives.cone({ name: `${id}-anal`, size: [0.2, 0.34, 0.03], material: yellow }).rotate(0, 0, Math.PI).position(-0.1, -0.38, 0),
      tailFin(`${id}-tail`, -0.33, 0.3, 0.2, blue),
      ...eyePair(id, 0.2, 0.06, 0.045, 0.03)
    ],
    { position: start }
  ).runtime({ id, mutable: true });
};

export const grouperNode = (id: string, start: Pos) => {
  const body = fishMat("#a1432c", { roughness: 0.55 });
  const belly = fishMat("#d9876a", { roughness: 0.55 });
  return group(
    id,
    [
      primitives.sphere({ name: `${id}-body`, size: [1.15, 0.5, 0.36], material: body }),
      primitives.sphere({ name: `${id}-belly`, size: [0.9, 0.22, 0.34], material: belly }).position(0.02, -0.14, 0),
      primitives.sphere({ name: `${id}-head`, size: [0.4, 0.4, 0.34], material: body }).position(0.5, 0.0, 0),
      primitives.sphere({ name: `${id}-lip`, size: [0.2, 0.1, 0.22], material: belly }).position(0.7, -0.07, 0),
      primitives.cone({ name: `${id}-dorsal`, size: [0.5, 0.2, 0.04], material: body }).position(-0.05, 0.3, 0),
      tailFin(`${id}-tail`, -0.76, 0.42, 0.3, body),
      primitives.cone({ name: `${id}-pec-l`, size: [0.16, 0.2, 0.03], material: belly }).rotate(0, 0, Math.PI / 2 + 0.4).position(0.3, -0.12, 0.2),
      primitives.cone({ name: `${id}-pec-r`, size: [0.16, 0.2, 0.03], material: belly }).rotate(0, 0, Math.PI / 2 + 0.4).position(0.3, -0.12, -0.2),
      ...eyePair(id, 0.6, 0.1, 0.13, 0.04)
    ],
    { position: start }
  ).runtime({ id, mutable: true });
};

export const barracudaNode = (id: string, start: Pos) => {
  const silver = fishMat("#b9cbd8", { roughness: 0.22, metallic: 0.65 });
  const back = fishMat("#4f6879", { roughness: 0.3, metallic: 0.4 });
  return group(
    id,
    [
      primitives.sphere({ name: `${id}-body`, size: [1.5, 0.26, 0.2], material: silver }),
      primitives.sphere({ name: `${id}-back`, size: [1.3, 0.14, 0.17], material: back }).position(-0.05, 0.08, 0),
      primitives.cone({ name: `${id}-snout`, size: [0.12, 0.3, 0.1], material: silver }).rotate(0, 0, -Math.PI / 2).position(0.85, -0.01, 0),
      primitives.cone({ name: `${id}-tail-a`, size: [0.2, 0.22, 0.03], material: back }).rotate(0, 0, -Math.PI / 2 - 0.35).position(-0.86, 0.07, 0),
      primitives.cone({ name: `${id}-tail-b`, size: [0.2, 0.22, 0.03], material: back }).rotate(0, 0, -Math.PI / 2 + 0.35).position(-0.86, -0.07, 0),
      primitives.cone({ name: `${id}-dorsal`, size: [0.1, 0.14, 0.02], material: back }).position(-0.3, 0.18, 0),
      ...eyePair(id, 0.62, 0.04, 0.08, 0.025)
    ],
    { position: start }
  ).runtime({ id, mutable: true });
};

export const parrotfishNode = (id: string, start: Pos) => {
  const teal = fishMat("#22b5a6", { roughness: 0.35 });
  const pink = fishMat("#ee6f95", { roughness: 0.35 });
  return group(
    id,
    [
      primitives.sphere({ name: `${id}-body`, size: [0.85, 0.38, 0.24], material: teal }),
      primitives.sphere({ name: `${id}-belly`, size: [0.6, 0.18, 0.235], material: pink }).position(0.0, -0.1, 0),
      primitives.sphere({ name: `${id}-beak`, size: [0.14, 0.14, 0.14], material: pink }).position(0.43, -0.03, 0),
      primitives.cone({ name: `${id}-dorsal`, size: [0.36, 0.16, 0.03], material: pink }).position(-0.05, 0.22, 0),
      tailFin(`${id}-tail`, -0.5, 0.3, 0.2, pink),
      ...eyePair(id, 0.3, 0.07, 0.1, 0.03)
    ],
    { position: start }
  ).runtime({ id, mutable: true });
};

const ellipsePath = (cx: number, cz: number, rx: number, rz: number, w: number, phase: number, y0: number, yAmp: number, yw: number, yPhase: number) =>
  (t: number): Pos => [cx + rx * Math.cos(w * t + phase), y0 + yAmp * Math.sin(yw * t + yPhase), cz + rz * Math.sin(w * t + phase)];

const yawOf = (a: Pos, b: Pos): number => Math.atan2(-(b[2] - a[2]), b[0] - a[0]);

const swimmerFromPath = (id: string, path: (t: number) => Pos, wobble = 0, wobbleRate = 6, wobblePhase = 0): Swimmer => ({
  id,
  pose: (t) => {
    const p = path(t);
    return { p, yaw: yawOf(p, path(t + 0.08)) + wobble * Math.sin(t * wobbleRate + wobblePhase) };
  }
});

/** Solitary fish: each follows its own loop. */
export const soloSwimmers = (): Swimmer[] => [
  swimmerFromPath("angel", ellipsePath(0.4, 0.4, 3.4, 2.6, 0.26, 0.4, 2.7, 0.35, 0.5, 1), 0.04, 2.5),
  swimmerFromPath("grouper", ellipsePath(-0.5, -0.3, 7.4, 6.2, -0.11, 2.0, 1.5, 0.2, 0.3, 0), 0.03, 2),
  swimmerFromPath("barracuda", ellipsePath(0.5, 0.0, 9.0, 5.5, 0.2, 4.0, 3.8, 0.5, 0.26, 2), 0.05, 4),
  swimmerFromPath("parrot", ellipsePath(1.0, 0.8, 4.8, 3.9, -0.21, 1.0, 1.9, 0.3, 0.41, 4), 0.05, 3.5)
];

/** Loose school: members follow the same loop a little apart in time and hold wandering offsets. */
export const schoolSwimmers = (count: number): Swimmer[] => {
  const r = makeRng(555);
  const centre = ellipsePath(0.0, 0.0, 6.6, 5.0, 0.19, 0.5, 2.9, 0.6, 0.33, 0);
  const out: Swimmer[] = [];
  for (let i = 0; i < count; i += 1) {
    const lag = r() * 2.2;
    const base: Pos = [(r() - 0.5) * 2.6, (r() - 0.5) * 1.2, (r() - 0.5) * 2.0];
    const f1 = 0.4 + r() * 0.5;
    const f2 = 0.3 + r() * 0.5;
    const ph = r() * 6.28;
    const amp = 0.25 + r() * 0.3;
    const wob = 0.1 + r() * 0.12;
    const wr = 7 + r() * 4;
    const path = (t: number): Pos => {
      const c = centre(t - lag);
      return [
        c[0] + base[0] + amp * Math.sin(t * f1 + ph),
        c[1] + base[1] + amp * 0.6 * Math.sin(t * f2 + ph * 1.7),
        c[2] + base[2] + amp * Math.cos(t * f1 * 0.8 + ph * 0.6)
      ];
    };
    out.push(swimmerFromPath(`school-${i}`, path, wob, wr, ph));
  }
  return out;
};
