import {
  camera,
  createAuraApp,
  effects,
  environments,
  lights,
  material,
  primitives,
  scene,
  sky,
  type AuraPrimitiveOptions
} from "@aura3d/engine";

// Procedural coastal lighthouse: every mesh is a unit primitive placed from code.
let seed = 4242;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const between = (a: number, b: number): number => a + (b - a) * rand();

type Vec3 = [number, number, number];
type Kind = "box" | "sphere" | "cylinder";

const parts: ReturnType<typeof primitives.box>[] = [];
const part = (kind: Kind, options: AuraPrimitiveOptions): void => {
  parts.push(primitives[kind](options));
};
const pbr = (color: string, roughness = 0.8, metallic = 0) => material.pbr({ color, roughness, metallic });
const polar = (r: number, a: number, y: number): Vec3 => [r * Math.sin(a), y, r * Math.cos(a)];

// Tower dimensions.
const Y0 = 1.5; // top of the stone plinth, base of the tower
const H = 12;
const R0 = 1.9;
const R1 = 1.25;
const rAt = (y: number): number => R0 + ((R1 - R0) * (y - Y0)) / H;

// Truncated cone between two heights and radii (cylinder with radiusTop/radiusBottom ratios).
const frustum = (
  name: string, yBot: number, yTop: number, rBot: number, rTop: number, mat: ReturnType<typeof pbr>,
  extra: Partial<AuraPrimitiveOptions> = {}, segments = 48
): void =>
  part("cylinder", {
    name,
    size: [rBot * 2, yTop - yBot, rBot * 2],
    position: [0, (yBot + yTop) / 2, 0],
    params: { radiusTop: (0.5 * rTop) / rBot, radiusBottom: 0.5, radialSegments: segments },
    material: mat,
    ...extra
  });

// ---------- Sea and ground ----------
part("plane", { name: "sea", size: [600, 1, 600], material: material.pbr({ color: "#1f6a93", roughness: 0.22, metallic: 0.05 }), castShadow: false });
part("cylinder", { name: "shallows", size: [30, 0.1, 30], position: [3.5, 0.06, 1], material: pbr("#4aa9b8", 0.3), castShadow: false, params: { radialSegments: 64 } });
part("cylinder", { name: "island-grass", size: [15, 0.7, 14], position: [4.5, 0.05, 1], material: pbr("#6f9150", 1), params: { radialSegments: 48 } });
part("cylinder", { name: "island-rock-top", size: [9.5, 0.8, 9.5], position: [0, 0.1, 0], material: pbr("#8a8578", 0.95), params: { radialSegments: 40 } });

// ---------- Rocky base ----------
const rockTones = ["#6f6a62", "#5f5b55", "#807a6f", "#74695c", "#57534d", "#8a8479"];
const rock = (name: string, x: number, z: number, w: number, h: number, d: number, baseY = 0.2): void =>
  part("sphere", {
    name,
    size: [w, h, d],
    position: [x, baseY + h * 0.3, z],
    rotation: [between(-0.25, 0.25), between(0, Math.PI * 2), between(-0.25, 0.25)],
    material: pbr(rockTones[Math.floor(rand() * rockTones.length)] ?? "#6f6a62", 0.97),
    params: { widthSegments: 9, heightSegments: 6 }
  });
for (let i = 0; i < 16; i += 1) { // boulders hugging the foot of the plinth
  const a = (i / 16) * Math.PI * 2 + between(-0.12, 0.12);
  const r = between(3.4, 4.6);
  rock(`base-rock-${i}`, Math.sin(a) * r, Math.cos(a) * r, between(1.3, 2.4), between(0.9, 1.7), between(1.2, 2.2), 0.1);
}
for (let i = 0; i < 12; i += 1) { // outer rocks scattered along the shore, partly in the water
  const a = (i / 12) * Math.PI * 2 + between(-0.2, 0.2);
  const rx = between(7, 9.5), rz = between(6.3, 8);
  rock(`shore-rock-${i}`, 4 + Math.sin(a) * rx, 1 + Math.cos(a) * rz, between(0.9, 2), between(0.5, 1.3), between(0.9, 1.8), -0.1);
}

// Stone plinth the tower stands on.
frustum("plinth", -0.1, Y0, 3.6, 2.8, pbr("#77726a", 0.95), {}, 40);
frustum("plinth-cap", Y0 - 0.02, Y0 + 0.08, 2.75, 2.75, pbr("#a29d92", 0.9), { castShadow: false }, 40);

// ---------- Tower: 6 painted bands ----------
const BAND_COUNT = 6;
const bandH = H / BAND_COUNT;
for (let i = 0; i < BAND_COUNT; i += 1) {
  const yb = Y0 + i * bandH, yt = yb + bandH;
  frustum(`band-${i}`, yb, yt, rAt(yb), rAt(yt), pbr(i % 2 === 0 ? "#f3efe6" : "#c4302b", 0.62));
}

// Windows spiral up the tower (6 windows, 65 degrees apart).
for (let i = 0; i < 6; i += 1) {
  const y = 3.7 + i * 1.75;
  const a = (200 + i * 65) * (Math.PI / 180);
  const r = rAt(y);
  part("box", { name: `window-sill-${i}`, size: [0.74, 0.08, 0.3], position: polar(r + 0.02, a, y - 0.47), rotation: [0, a, 0], material: pbr("#cfcabd", 0.8) });
  part("box", { name: `window-frame-${i}`, size: [0.62, 0.9, 0.16], position: polar(r, a, y), rotation: [0, a, 0], material: pbr("#2a2e36", 0.7) });
  part("box", { name: `window-pane-${i}`, size: [0.4, 0.68, 0.2], position: polar(r, a, y), rotation: [0, a, 0], material: material.pbr({ color: "#2a3f58", roughness: 0.15, emissive: "#ffcf70", emissiveIntensity: 0.25 }), castShadow: false });
}

// Door, frame, steps.
const doorA = Math.PI / 2;
const doorR = rAt(Y0 + 0.9);
const sideOf = (a: number, r: number, y: number, along: number): Vec3 => [r * Math.sin(a) + along * Math.cos(a), y, r * Math.cos(a) - along * Math.sin(a)];
part("box", { name: "door-frame", size: [1.3, 2.05, 0.26], position: polar(doorR, doorA, Y0 + 1.02), rotation: [0, doorA, 0], material: pbr("#2a2e36", 0.7) });
part("box", { name: "door", size: [1.0, 1.8, 0.34], position: polar(doorR, doorA, Y0 + 0.9), rotation: [0, doorA, 0], material: pbr("#5b3a22", 0.7) });
part("sphere", { name: "door-knob", size: 0.12, position: sideOf(doorA, doorR + 0.19, Y0 + 0.9, 0.33), material: pbr("#d9b24a", 0.3, 0.9), castShadow: false });
part("box", { name: "door-step", size: [1.9, 0.22, 1.1], position: polar(doorR + 0.45, doorA, Y0 + 0.1), rotation: [0, doorA, 0], material: pbr("#a29d92", 0.9) });

// ---------- Gallery balcony ----------
const Ytop = Y0 + H; // 13.5
frustum("gallery-corbel", Ytop - 0.32, Ytop, rAt(Ytop - 0.32) + 0.02, 2.0, pbr("#2f333b", 0.7));
frustum("gallery-floor", Ytop, Ytop + 0.18, 2.2, 2.2, pbr("#3a3f47", 0.75));
const GY = Ytop + 0.18; // gallery floor surface
const RAIL_R = 2.05;
const POSTS = 16;
for (let i = 0; i < POSTS; i += 1) {
  const a = (i / POSTS) * Math.PI * 2;
  part("cylinder", { name: `rail-post-${i}`, size: [0.08, 0.95, 0.08], position: polar(RAIL_R, a, GY + 0.475), material: pbr("#23262d", 0.6, 0.3), params: { radialSegments: 8 } });
  const m = a + Math.PI / POSTS;
  const chord = 2 * RAIL_R * Math.sin(Math.PI / POSTS);
  part("box", { name: `rail-top-${i}`, size: [chord, 0.07, 0.07], position: polar(RAIL_R * Math.cos(Math.PI / POSTS), m, GY + 0.95), rotation: [0, m, 0], material: pbr("#23262d", 0.6, 0.3) });
  part("box", { name: `rail-mid-${i}`, size: [chord, 0.04, 0.04], position: polar(RAIL_R * Math.cos(Math.PI / POSTS), m, GY + 0.5), rotation: [0, m, 0], material: pbr("#23262d", 0.6, 0.3) });
}

// ---------- Lantern room ----------
const LH = 1.7;
frustum("lantern-base", GY, GY + 0.22, 1.25, 1.12, pbr("#23262d", 0.6, 0.3));
const LY0 = GY + 0.22;
part("cylinder", {
  name: "lantern-glass", size: [2, LH, 2], position: [0, LY0 + LH / 2, 0],
  material: material.pbr({ color: "#bfe8f7", roughness: 0.05, opacity: 0.22 }), castShadow: false, receiveShadow: false,
  params: { radialSegments: 32, openEnded: true }
});
for (let i = 0; i < 8; i += 1) {
  const a = ((i + 0.5) / 8) * Math.PI * 2;
  part("cylinder", { name: `mullion-${i}`, size: [0.07, LH, 0.07], position: polar(1.0, a, LY0 + LH / 2), material: pbr("#23262d", 0.6, 0.3), params: { radialSegments: 6 } });
}
frustum("lantern-ring", LY0 + LH, LY0 + LH + 0.14, 1.12, 1.18, pbr("#23262d", 0.6, 0.3));
part("cylinder", { name: "lamp-pedestal", size: [0.5, 0.55, 0.5], position: [0, LY0 + 0.275, 0], material: pbr("#7a6a3a", 0.4, 0.8), params: { radialSegments: 16 } });
const LAMP_Y = LY0 + 0.55 + 0.4;
part("sphere", { name: "lamp", size: 0.75, position: [0, LAMP_Y, 0], material: material.pbr({ color: "#fff2c4", roughness: 0.3, emissive: "#ffdf8a", emissiveIntensity: 3.2 }), castShadow: false });
part("cylinder", { name: "lamp-lens", size: [0.95, 0.9, 0.95], position: [0, LAMP_Y, 0], material: material.pbr({ color: "#ffe9a8", roughness: 0.1, opacity: 0.35, emissive: "#ffd36a", emissiveIntensity: 1.2 }), castShadow: false, params: { radialSegments: 24 } });

// ---------- Roof and finial ----------
const RY0 = LY0 + LH + 0.14;
frustum("roof-eave", RY0, RY0 + 0.12, 1.5, 1.5, pbr("#23262d", 0.6, 0.3));
frustum("roof-cone", RY0 + 0.12, RY0 + 1.5, 1.45, 0.03, pbr("#2d3a4f", 0.55, 0.2), {}, 32);
const FY = RY0 + 1.5;
part("cylinder", { name: "finial-rod", size: [0.06, 0.5, 0.06], position: [0, FY + 0.15, 0], material: pbr("#d9b24a", 0.3, 0.9), params: { radialSegments: 8 } });
part("sphere", { name: "finial-ball", size: 0.3, position: [0, FY + 0.3, 0], material: pbr("#d9b24a", 0.25, 0.9) });

// ---------- Keeper's cottage ----------
const CX = 8.6, CZ = 2.2, CY = 0.4;
const cYaw = Math.atan2(3.2 - CX, 0.3 - CZ); // front (+z local) faces the lighthouse door
const cp = (lx: number, ly: number, lz: number): Vec3 => [
  CX + lx * Math.cos(cYaw) + lz * Math.sin(cYaw),
  CY + ly,
  CZ - lx * Math.sin(cYaw) + lz * Math.cos(cYaw)
];
const cottage = (name: string, kind: Kind, size: Vec3, local: Vec3, mat: ReturnType<typeof pbr>, extraYaw = 0, extra: Partial<AuraPrimitiveOptions> = {}): void =>
  part(kind, { name: `cottage-${name}`, size, position: cp(...local), rotation: [0, cYaw + extraYaw, 0], material: mat, ...extra });
cottage("foundation", "box", [3.2, 0.3, 3.2], [0, 0.15, 0], pbr("#7d7a70", 0.95));
cottage("walls", "box", [3, 1.8, 3], [0, 1.05, 0], pbr("#eadfc6", 0.85));
cottage("roof", "cylinder", [5.3, 1.5, 5.3], [0, 1.95 + 0.75, 0], pbr("#8f3b2e", 0.7), Math.PI / 4, { params: { radiusTop: 0.01, radiusBottom: 0.5, radialSegments: 4 } });
cottage("chimney", "box", [0.5, 1.3, 0.5], [0.8, 3.0, -0.6], pbr("#7a4a3a", 0.9));
cottage("chimney-cap", "box", [0.65, 0.1, 0.65], [0.8, 3.7, -0.6], pbr("#4a4a4a", 0.8));
cottage("door-frame", "box", [0.92, 1.45, 0.1], [0, 0.3 + 0.725, 1.5], pbr("#f2ecdc", 0.8));
cottage("door", "box", [0.72, 1.3, 0.14], [0, 0.3 + 0.65, 1.5], pbr("#5b3a22", 0.7));
cottage("step", "box", [1.1, 0.12, 0.5], [0, 0.34, 1.78], pbr("#a29d92", 0.9));
const glowWin = material.pbr({ color: "#2a3f58", roughness: 0.15, emissive: "#ffcf70", emissiveIntensity: 0.5 });
for (const sx of [-1, 1]) {
  cottage(`window-frame-${sx}`, "box", [0.72, 0.72, 0.08], [sx * 0.95, 1.2, 1.5], pbr("#f2ecdc", 0.8));
  cottage(`window-${sx}`, "box", [0.54, 0.54, 0.12], [sx * 0.95, 1.2, 1.5], glowWin, 0, { castShadow: false });
}
cottage("side-window-frame", "box", [0.08, 0.72, 0.72], [1.5, 1.2, 0], pbr("#f2ecdc", 0.8));
cottage("side-window", "box", [0.12, 0.54, 0.54], [1.5, 1.2, 0], glowWin, 0, { castShadow: false });

// Stepping stones from the lighthouse door to the cottage.
for (let i = 0; i < 5; i += 1) {
  const t = 0.12 + i * 0.17;
  const x = 3.9 + (cp(0, 0, 1.9)[0] - 3.9) * t + between(-0.15, 0.15);
  const z = 0.1 + (cp(0, 0, 1.9)[2] - 0.1) * t + between(-0.15, 0.15);
  part("cylinder", { name: `stone-${i}`, size: [0.75, 0.1, 0.6], position: [x, 0.43, z], rotation: [0, between(0, 3), 0], material: pbr("#9d988c", 0.95), params: { radialSegments: 10 } });
}

const partCount = parts.length;

// ---------- Light, sky, camera ----------
const lightAt = (elevationDeg: number, azimuthDeg: number, distance = 60): Vec3 => {
  const e = (elevationDeg * Math.PI) / 180, a = (azimuthDeg * Math.PI) / 180;
  return [Math.sin(a) * Math.cos(e) * distance, Math.sin(e) * distance, -Math.cos(a) * Math.cos(e) * distance];
};
const SUN = { elevationDeg: 38, azimuthDeg: 125 };
const TARGET: Vec3 = [1.8, 7.6, 0.6];
const ORBIT_R = 33;
const ORBIT_Y = 9;
const camAt = (angle: number): Vec3 => [TARGET[0] + Math.sin(angle) * ORBIT_R, ORBIT_Y, TARGET[2] + Math.cos(angle) * ORBIT_R];

const app = createAuraApp("#app", {
  scene: scene({ background: "#9cc3e6" })
    .add(sky.preetham({ sun: { ...SUN, intensity: 1 } }))
    .add(environments.neutral({ intensity: 0.4, background: false }))
    .add(lights.hemisphere({ skyColor: "#cfe4ff", groundColor: "#4a5a48", intensity: 0.55 }))
    .add(lights.directional({
      name: "key", position: lightAt(SUN.elevationDeg, SUN.azimuthDeg), target: [2, 6, 0], intensity: 3.4, color: "#fff1da",
      shadow: { mapSize: 2048, cascades: 1, filter: "pcf", fit: { center: [3, 6, 1], extent: 22, depth: 90 } }
    }))
    .add(lights.directional({ name: "fill", position: lightAt(25, 300, 40), target: [0, 6, 0], intensity: 0.9, color: "#bcd4ff" }))
    .add(lights.point({ name: "lamp-light", position: [0, LAMP_Y, 0], intensity: 25, distance: 14, color: "#ffd88a" }))
    .add(effects.fog({ color: "#b6d0e6", density: 0.0035 }))
    .addMany(parts)
    .camera(camera.perspective({ position: camAt(0.6), target: TARGET, fov: 40, near: 0.5, far: 700 }))
});

let t = 0;
app.onFrame((frame) => {
  t += frame.dt;
  app.camera?.setPose({ position: camAt(0.6 + t * 0.12), target: TARGET }, { cut: true });
});

await app.ready();
const w = window as unknown as Record<string, unknown>;
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    w.__TASK_STATE__ = { ready: true, partCount, bandCount: BAND_COUNT };
    w.__EVAL_READY__ = true;
  });
});
