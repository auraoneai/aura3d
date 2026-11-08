import { camera, createAuraApp, group, looks, material, primitives, scene } from "@aura3d/engine";

declare global {
  interface Window {
    __TASK_STATE__?: { ready: boolean; wheelCount: number; spokeCount: number; plankCount: number };
    __EVAL_READY__?: boolean;
  }
}

type V3 = [number, number, number];
type Mat = ReturnType<typeof material.pbr>;
type Kind = "box" | "cylinder" | "sphere" | "cone";

// ---------- helpers ----------
let seed = 20240611; // seeded RNG: identical layout on every load
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const between = (a: number, b: number): number => a + (b - a) * rand();

const hslHex = (h: number, s: number, l: number): string => {
  const sat = s / 100;
  const lig = l / 100;
  const k = (n: number): number => (n + h / 30) % 12;
  const a = sat * Math.min(lig, 1 - lig);
  const f = (n: number): number => lig - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const hex = (v: number): string => Math.round(v * 255).toString(16).padStart(2, "0");
  return `#${hex(f(0))}${hex(f(8))}${hex(f(4))}`;
};

let counter = 0;
const prim = (kind: Kind, label: string, size: V3, position: V3, mat: Mat, rotation: V3 = [0, 0, 0]) =>
  primitives[kind]({ name: `${label}-${counter++}`, size, position, rotation, material: mat, castShadow: true, receiveShadow: true });

const wood = (color: string): Mat => material.pbr({ color, roughness: 0.88, metallic: 0 });
const iron = material.pbr({ color: "#3b3e43", roughness: 0.5, metallic: 0.75 });
const ironDark = material.pbr({ color: "#2b2d31", roughness: 0.6, metallic: 0.7 });
const oak = wood("#7a5532");
const oakDark = wood("#5e4126");
const oakLight = wood("#93693d");

const PI = Math.PI;
const HALF_PI = Math.PI / 2;

// ---------- wheels ----------
const WHEEL_R = 0.55;
const SPOKES_PER_WHEEL = 12;
const AXLE_Y = WHEEL_R;
const WHEEL_X = 0.8;

const wheel = (side: "l" | "r", x: number) => {
  const parts = [];
  // hub with two iron bands and an iron cap
  parts.push(prim("cylinder", "hub", [0.17, 0.3, 0.17], [0, 0, 0], oakDark, [0, 0, HALF_PI]));
  parts.push(prim("cylinder", "hub-band", [0.205, 0.04, 0.205], [-0.1, 0, 0], iron, [0, 0, HALF_PI]));
  parts.push(prim("cylinder", "hub-band", [0.205, 0.04, 0.205], [0.1, 0, 0], iron, [0, 0, HALF_PI]));
  parts.push(prim("cylinder", "hub-cap", [0.1, 0.035, 0.1], [Math.sign(x) * 0.165, 0, 0], ironDark, [0, 0, HALF_PI]));
  // spokes: radial boxes in the YZ plane, rotated about X
  for (let i = 0; i < SPOKES_PER_WHEEL; i += 1) {
    const th = (i / SPOKES_PER_WHEEL) * PI * 2;
    const mid = 0.27;
    parts.push(prim("box", "spoke", [0.05, 0.4, 0.06], [0, mid * Math.cos(th), mid * Math.sin(th)], i % 2 === 0 ? oak : oakLight, [th, 0, 0]));
  }
  // wooden felloes (rim segments)
  const nf = 12;
  for (let i = 0; i < nf; i += 1) {
    const th = ((i + 0.5) / nf) * PI * 2;
    const r = 0.49;
    parts.push(prim("box", "felloe", [0.1, 0.09, 0.275], [0, r * Math.cos(th), r * Math.sin(th)], oakDark, [th, 0, 0]));
  }
  // iron tyre segments
  const nt = 16;
  for (let i = 0; i < nt; i += 1) {
    const th = (i / nt) * PI * 2;
    const r = 0.5375;
    parts.push(prim("box", "tyre", [0.118, 0.025, 0.225], [0, r * Math.cos(th), r * Math.sin(th)], iron, [th, 0, 0]));
  }
  return group(`wheel-${side}`, parts, { position: [x, AXLE_Y, 0] }).runtime({ id: `wheel-${side}`, mutable: true });
};

// ---------- cart body ----------
const FLOOR_Y = 0.78;
const FLOOR_T = 0.045;
const FLOOR_TOP = FLOOR_Y + FLOOR_T / 2;
const PLANK_COUNT = 10;

const body = [];

// bed floor planks
for (let i = 0; i < PLANK_COUNT; i += 1) {
  const w = 1.2 / PLANK_COUNT;
  const len = 1.62 + between(-0.05, 0.05);
  const tone = hslHex(between(25, 34), between(32, 42), between(31, 46));
  body.push(
    prim("box", "plank", [w - 0.004, FLOOR_T, len], [-0.6 + w / 2 + i * w, FLOOR_Y + between(-0.004, 0.004), between(-0.02, 0.02)], wood(tone), [
      between(-0.006, 0.006),
      between(-0.012, 0.012),
      between(-0.006, 0.006)
    ])
  );
}

// under-frame: sills, cross beams, axle, bearing blocks
for (const s of [-1, 1]) {
  body.push(prim("box", "sill", [0.09, 0.09, 1.9], [s * 0.5, 0.71, 0], oakDark));
  body.push(prim("box", "bearing", [0.12, 0.08, 0.2], [s * 0.5, 0.625, 0], oakDark));
  body.push(prim("sphere", "linchpin", [0.07, 0.07, 0.07], [s * 1.06, AXLE_Y, 0], ironDark));
}
for (const z of [-0.6, 0.0, 0.6, 0.88]) body.push(prim("box", "crossbeam", [1.0, 0.07, 0.09], [0, 0.71, z], oakDark));
body.push(prim("cylinder", "axle", [0.07, 2.1, 0.07], [0, AXLE_Y, 0], oak, [0, 0, HALF_PI]));

// corner posts, iron straps and bolts
for (const sx of [-1, 1]) {
  for (const sz of [-1, 1]) {
    const px = sx * 0.6;
    const pz = sz * 0.8;
    body.push(prim("box", "post", [0.07, 0.6, 0.07], [px, 1.04, pz], oak));
    body.push(prim("box", "post-strap", [0.082, 0.2, 0.082], [px, 0.93, pz], iron));
    for (const by of [0.89, 0.97]) {
      body.push(prim("sphere", "bolt", [0.03, 0.03, 0.03], [px + sx * 0.043, by, pz], ironDark));
      body.push(prim("sphere", "bolt", [0.03, 0.03, 0.03], [px, by, pz + sz * 0.043], ironDark));
    }
  }
}

// side boards and two cross rails per side
for (const s of [-1, 1]) {
  body.push(prim("box", "side-board", [0.035, 0.16, 1.5], [s * 0.6, 0.9, 0], wood(hslHex(between(25, 33), 36, between(34, 44))), [0, 0, between(-0.01, 0.01)]));
  body.push(prim("box", "end-board", [1.1, 0.16, 0.035], [0, 0.9, s * 0.8], wood(hslHex(between(25, 33), 36, between(34, 44)))));
  for (const ry of [1.1, 1.3]) {
    body.push(prim("box", "side-rail", [0.04, 0.05, 1.5 + between(-0.02, 0.02)], [s * 0.6, ry, 0], oakLight));
    body.push(prim("box", "end-rail", [1.1 + between(-0.02, 0.02), 0.05, 0.04], [0, ry, s * 0.8], oakLight));
  }
}

// iron straps over the sill/handle joint
for (const s of [-1, 1]) {
  body.push(prim("box", "joint-strap", [0.115, 0.115, 0.07], [s * 0.5, 0.71, -0.86], iron));
  body.push(prim("sphere", "bolt", [0.03, 0.03, 0.03], [s * 0.5, 0.775, -0.86], ironDark));
}

// push handles (rear) rising towards the grips, with a tie bar
const HANDLE_TILT = 0.2;
for (const s of [-1, 1]) {
  const len = 1.58;
  body.push(prim("box", "handle", [0.07, 0.07, len], [s * 0.5, 0.71 + 0.5 * len * Math.sin(HANDLE_TILT), -0.8 - 0.5 * len * Math.cos(HANDLE_TILT)], oakLight, [HANDLE_TILT, 0, 0]));
  body.push(prim("sphere", "grip", [0.085, 0.085, 0.085], [s * 0.5, 0.71 + len * Math.sin(HANDLE_TILT), -0.8 - len * Math.cos(HANDLE_TILT)], oak));
}
body.push(prim("box", "handle-tie", [1.0, 0.05, 0.05], [0, 0.71 + 1.2 * Math.tan(HANDLE_TILT) + 0.02, -2.0], oak));

// front prop stand: two splayed legs and a foot bar
for (const s of [-1, 1]) {
  body.push(prim("box", "prop-leg", [0.07, 0.73, 0.07], [s * 0.42, 0.355, 0.955], oakDark, [-0.2, 0, 0]));
  body.push(prim("box", "prop-strap", [0.09, 0.08, 0.09], [s * 0.42, 0.66, 0.9], iron));
}
body.push(prim("box", "prop-foot", [0.95, 0.05, 0.07], [0, 0.03, 1.03], oak));

// ---------- cargo ----------
const burlap = [wood("#b8996a"), wood("#a98a5c"), wood("#c2a673")];
const sack = (label: string, x: number, z: number, size: V3, yaw: number, mat: Mat, tilt = 0) => [
  prim("sphere", label, size, [x, FLOOR_TOP + size[1] / 2 - 0.01, z], mat, [tilt, yaw, 0]),
  prim("cone", `${label}-neck`, [0.16, 0.14, 0.16], [x, FLOOR_TOP + size[1] - 0.04, z], mat, [tilt, yaw, 0]),
  prim("sphere", `${label}-knot`, [0.075, 0.075, 0.075], [x, FLOOR_TOP + size[1] + 0.03, z], oakDark)
];
const cargo = [
  ...sack("sack", -0.28, -0.5, [0.5, 0.42, 0.4], 0.3, burlap[0]),
  ...sack("sack", 0.28, -0.52, [0.46, 0.46, 0.4], -0.4, burlap[1], 0.04),
  ...sack("sack", -0.3, -0.02, [0.5, 0.38, 0.38], 0.15, burlap[2])
];

const barrel = (label: string, x: number, z: number) => {
  const staves = wood("#6b4524");
  const parts = [
    prim("cylinder", `${label}-body`, [0.4, 0.58, 0.4], [0, 0, 0], staves),
    prim("sphere", `${label}-belly`, [0.43, 0.42, 0.43], [0, 0, 0], staves),
    prim("cylinder", `${label}-lid`, [0.37, 0.02, 0.37], [0, 0.29, 0], oakDark),
    prim("cylinder", `${label}-hoop`, [0.408, 0.028, 0.408], [0, 0.23, 0], iron),
    prim("cylinder", `${label}-hoop`, [0.408, 0.028, 0.408], [0, -0.23, 0], iron),
    prim("cylinder", `${label}-hoop`, [0.44, 0.03, 0.44], [0, 0.0, 0], iron)
  ];
  return group(label, parts, { position: [x, FLOOR_TOP + 0.29, z] });
};
cargo.push(barrel("barrel-a", 0.3, 0.45) as never, barrel("barrel-b", 0.3, -0.04) as never);

const crate = (label: string, w: number, h: number, d: number, tone: string, pos: V3, yaw: number) => {
  const m = wood(tone);
  const slat = wood(hslHex(between(28, 34), 38, between(36, 48)));
  const parts = [prim("box", `${label}-body`, [w, h, d], [0, 0, 0], m)];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) parts.push(prim("box", `${label}-batten`, [0.05, h + 0.012, 0.05], [sx * (w / 2), 0, sz * (d / 2)], slat));
  }
  for (let i = -1; i <= 1; i += 1) parts.push(prim("box", `${label}-lid-slat`, [w * 0.98, 0.014, d * 0.3], [0, h / 2 + 0.004, i * d * 0.32], wood(hslHex(between(27, 35), 36, between(34, 46)))));
  parts.push(prim("box", `${label}-band`, [w + 0.01, 0.04, d + 0.01], [0, -h * 0.05, 0], slat));
  return group(label, parts, { position: pos, rotation: [0, yaw, 0] });
};
cargo.push(
  crate("crate-a", 0.42, 0.32, 0.42, "#8a6a42", [-0.3, FLOOR_TOP + 0.16, 0.5], 0.1) as never,
  crate("crate-b", 0.3, 0.26, 0.3, "#7d5e3a", [-0.28, FLOOR_TOP + 0.32 + 0.13, 0.48], 0.55) as never
);

// ---------- cart assembly ----------
const cart = group("cart", [wheel("l", -WHEEL_X), wheel("r", WHEEL_X), ...body, ...cargo], { position: [0, 0, 0.65] });
const turntable = group("turntable", [cart], { rotation: [0, 0.6, 0] }).runtime({ id: "turntable", mutable: true });

// ---------- ground ----------
const dirt = material.pbr({ color: "#7a5b3a", roughness: 1, metallic: 0 });
const dirtDark = material.pbr({ color: "#6a4d30", roughness: 1, metallic: 0 });
const dirtLight = material.pbr({ color: "#8c6c47", roughness: 1, metallic: 0 });
const ground = [
  primitives.plane({ name: "ground", size: [60, 1, 60], material: dirt, receiveShadow: true }),
  primitives.sphere({ name: "mound-1", size: [3.4, 0.16, 2.6], position: [-4.2, 0, -2.2], material: dirtDark, receiveShadow: true, rotation: [0, 0.5, 0] }),
  primitives.sphere({ name: "mound-2", size: [2.8, 0.14, 2.2], position: [3.8, 0, -3.6], material: dirtLight, receiveShadow: true, rotation: [0, -0.4, 0] }),
  primitives.sphere({ name: "mound-3", size: [2.4, 0.12, 1.8], position: [-2.4, 0, 3.8], material: dirtLight, receiveShadow: true, rotation: [0, 1.1, 0] }),
  primitives.sphere({ name: "mound-4", size: [2.6, 0.12, 2.0], position: [5.2, 0, 2.4], material: dirtDark, receiveShadow: true, rotation: [0, 0.2, 0] })
];
const stoneSpots: Array<[number, number]> = [[2.0, 1.6], [-2.1, 1.3], [1.4, -2.3], [-1.9, -2.0], [3.3, 0.2], [-3.4, 0.4], [0.3, 3.1]];
for (let i = 0; i < 9; i += 1) {
  const a = rand() * PI * 2;
  const r = between(2.6, 6.2);
  stoneSpots.push([Math.cos(a) * r, Math.sin(a) * r]);
}
stoneSpots.forEach(([x, z], i) => {
  const s = between(0.14, 0.4);
  const tone = hslHex(between(25, 40), between(4, 12), between(34, 56));
  ground.push(
    primitives.sphere({
      name: `stone-${i}`,
      size: [s * between(1.1, 1.7), s * between(0.6, 0.9), s * between(0.9, 1.4)],
      position: [x, s * 0.2, z],
      rotation: [between(-0.2, 0.2), rand() * PI, between(-0.2, 0.2)],
      material: material.pbr({ color: tone, roughness: 0.95, metallic: 0 }),
      castShadow: true,
      receiveShadow: true
    })
  );
});

// ---------- app ----------
const lookId = "golden-hour" as const;
const app = createAuraApp("#app", {
  scene: scene()
    .add(
      looks.preset(lookId, {
        sun: { azimuthDeg: 40, elevationDeg: 38 },
        key: { color: "#ffd9a6", shadow: { filter: "pcf", softness: 1.5, mapSize: 2048 } }
      })
    )
    .addMany(ground)
    .add(turntable)
    .camera(camera.perspective({ position: [3.9, 2.7, 4.7], target: [0, 0.75, 0], fov: 36, near: 0.1, far: 200 })),
  ...looks.appOptions(lookId)
});

await app.ready();

let t = 0;
app.onFrame((frame) => {
  t += frame.dt;
  app.nodes.require("turntable").setRotation(0, 0.6 + t * 0.22, 0);
  app.nodes.require("wheel-l").setRotation(t * 0.9, 0, 0);
  app.nodes.require("wheel-r").setRotation(t * 0.9, 0, 0);
});

requestAnimationFrame(() =>
  requestAnimationFrame(() => {
    window.__TASK_STATE__ = { ready: true, wheelCount: 2, spokeCount: 2 * SPOKES_PER_WHEEL, plankCount: PLANK_COUNT };
    window.__EVAL_READY__ = true;
  })
);
