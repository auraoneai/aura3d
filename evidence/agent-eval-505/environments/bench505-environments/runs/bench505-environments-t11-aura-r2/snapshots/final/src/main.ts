import { camera, createAuraApp, effects, environments, group, lights, material, primitives, scene, sky } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

type Child = NonNullable<Parameters<typeof group>[1]>[number];
type Vec3 = [number, number, number];

// ---------- helpers ----------
let seedState = 20240611;
const rand = (): number => ((seedState = (Math.imul(seedState, 1664525) + 1013904223) >>> 0) / 4294967296);
const range = (a: number, b: number): number => a + (b - a) * rand();
const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

const rgb = (c: string): Vec3 => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
const hex = (v: Vec3): string => "#" + v.map((x) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, "0")).join("");
const mix = (a: string, b: string, t: number): string => {
  const A = rgb(a);
  const B = rgb(b);
  return hex([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]);
};

// ---------- scene constants ----------
const HAZE = "#aab6e2"; // pale blue haze used for fog and manual aerial perspective
const CAM_CENTER: Vec3 = [0, 9, 46];
const LOOP_SECONDS = 48;

const hazeAmount = (x: number, y: number, z: number): number => {
  const d = Math.hypot(x - CAM_CENTER[0], y - CAM_CENTER[1], z - CAM_CENTER[2]);
  return clamp01((d - 35) / 170) * 0.55;
};

// ---------- islands ----------
interface IslandSpec {
  x: number; y: number; z: number;
  R: number; depth: number;
  amp: number; speed: number; phase: number;
  crystal: string;
}

const islands: IslandSpec[] = [
  { x: -6, y: 0, z: -34, R: 12, depth: 21, amp: 0.3, speed: 0.42, phase: 0.0, crystal: "#5ff0ff" },
  { x: 21, y: 6, z: -16, R: 6.5, depth: 11, amp: 0.7, speed: 0.55, phase: 1.7, crystal: "#ff62c8" },
  { x: -31, y: 9, z: -12, R: 5, depth: 9, amp: 0.6, speed: 0.7, phase: 3.1, crystal: "#ffb95a" },
  { x: 35, y: -2, z: -52, R: 8, depth: 14, amp: 0.8, speed: 0.36, phase: 4.4, crystal: "#9d7bff" },
  { x: -39, y: 14, z: -62, R: 7, depth: 12, amp: 0.9, speed: 0.48, phase: 2.2, crystal: "#5ff0ff" },
  { x: 9, y: 17, z: -80, R: 5.5, depth: 9.5, amp: 1.0, speed: 0.62, phase: 5.3, crystal: "#ff62c8" },
  { x: -15, y: 23, z: -102, R: 9, depth: 15, amp: 0.8, speed: 0.3, phase: 0.9, crystal: "#ffb95a" },
  { x: 49, y: 19, z: -96, R: 4.5, depth: 8, amp: 1.1, speed: 0.75, phase: 3.9, crystal: "#9d7bff" },
  { x: -2, y: 31, z: -128, R: 3.6, depth: 6.5, amp: 0.9, speed: 0.58, phase: 1.2, crystal: "#5ff0ff" }
];

const WATERFALL_ANGLE = 0.95;

const buildIsland = (s: IslandSpec, index: number): Child => {
  const { R, depth } = s;
  const k = hazeAmount(s.x, s.y, s.z);
  const tint = (c: string): string => mix(c, HAZE, k);
  const rockDark = material.pbr({ color: tint("#5c4a62"), roughness: 1 });
  const rockLight = material.pbr({ color: tint("#7d6676"), roughness: 1 });
  const grass = material.pbr({ color: tint("#6fa443"), roughness: 0.95 });
  const grassTop = material.pbr({ color: tint("#8cc455"), roughness: 0.95 });
  const trunk = material.pbr({ color: tint("#5a3c2a"), roughness: 1 });
  const leafA = material.pbr({ color: tint("#2f8450"), roughness: 0.9 });
  const leafB = material.pbr({ color: tint("#d98a3a"), roughness: 0.9 });
  const leafC = material.pbr({ color: tint("#4aa65a"), roughness: 0.9 });
  const leaves = [leafA, leafB, leafC];
  const crystalColor = mix(s.crystal, HAZE, k * 0.6);
  const crystalMat = material.emissive({ color: crystalColor, emissive: crystalColor, emissiveIntensity: 2.0 });

  const kids: Child[] = [];
  const n = `i${index}`;

  // rock underside: bulging lump on top of a tapering inverted cone, plus hanging chunks
  kids.push(primitives.sphere({ name: `${n}-lump`, size: [R * 2.0, R * 0.9, R * 2.0], material: rockLight, castShadow: false, receiveShadow: false }).position(0, -R * 0.55, 0));
  kids.push(primitives.cone({ name: `${n}-cone`, size: [R * 1.92, depth, R * 1.92], material: rockDark, params: { radialSegments: 7 }, castShadow: false, receiveShadow: false })
    .position(0, -R * 0.5 - depth / 2, 0).rotate(Math.PI, 0, 0));
  const chunks = 3;
  for (let c = 0; c < chunks; c += 1) {
    const a = (c / chunks) * Math.PI * 2 + range(0, 1);
    const d2 = depth * range(0.45, 0.65);
    const w = R * range(0.65, 0.9);
    kids.push(primitives.cone({ name: `${n}-chunk${c}`, size: [w, d2, w], material: c % 2 === 0 ? rockLight : rockDark, params: { radialSegments: 6 }, castShadow: false, receiveShadow: false })
      .position(Math.cos(a) * R * 0.5, -R * 0.62 - d2 / 2, Math.sin(a) * R * 0.5).rotate(Math.PI, a, 0));
  }

  // grassy surface
  kids.push(primitives.cylinder({ name: `${n}-grass`, size: [R * 2, 0.6, R * 2], material: grass, params: { radialSegments: 16 }, castShadow: false, receiveShadow: false }).position(0, -0.3, 0));
  kids.push(primitives.sphere({ name: `${n}-mound`, size: [R * 1.55, 1.0, R * 1.55], material: grassTop, castShadow: false, receiveShadow: false }).position(0, 0, 0));

  // trees
  const treeCount = Math.min(8, Math.round(R * 0.55) + 1);
  const scaleBase = 0.75 + R * 0.04;
  for (let t = 0; t < treeCount; t += 1) {
    let a = rand() * Math.PI * 2;
    if (index === 0 && Math.abs(Math.atan2(Math.sin(a - WATERFALL_ANGLE), Math.cos(a - WATERFALL_ANGLE))) < 0.45) a += 1.2;
    const r = Math.sqrt(rand()) * R * 0.72;
    const sc = scaleBase * range(0.8, 1.3);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const y0 = 0.3;
    const leaf = leaves[t % leaves.length] ?? leafA;
    kids.push(primitives.cylinder({ name: `${n}-t${t}-trunk`, size: [0.36 * sc, 1.3 * sc, 0.36 * sc], material: trunk, params: { radialSegments: 6 }, castShadow: false, receiveShadow: false }).position(x, y0 + 0.65 * sc, z));
    if (t % 3 === 2) {
      kids.push(primitives.sphere({ name: `${n}-t${t}-crown`, size: [2.3 * sc, 2.1 * sc, 2.3 * sc], material: leaf, castShadow: false, receiveShadow: false }).position(x, y0 + 2.1 * sc, z));
    } else {
      kids.push(primitives.cone({ name: `${n}-t${t}-low`, size: [2.4 * sc, 2.6 * sc, 2.4 * sc], material: leaf, params: { radialSegments: 8 }, castShadow: false, receiveShadow: false }).position(x, y0 + 1.8 * sc, z));
      kids.push(primitives.cone({ name: `${n}-t${t}-top`, size: [1.8 * sc, 2.0 * sc, 1.8 * sc], material: leaf, params: { radialSegments: 8 }, castShadow: false, receiveShadow: false }).position(x, y0 + 3.0 * sc, z));
    }
  }

  // crystal cluster
  const ca = rand() * Math.PI * 2 + (index === 0 ? 2.4 : 0);
  const cr = R * range(0.35, 0.55);
  const crystalCount = R > 8 ? 5 : 3;
  for (let c = 0; c < crystalCount; c += 1) {
    const sc = range(0.6, 1.25) * (0.7 + R * 0.04);
    const ox = Math.cos(ca) * cr + range(-1, 1) * (0.6 + R * 0.06);
    const oz = Math.sin(ca) * cr + range(-1, 1) * (0.6 + R * 0.06);
    kids.push(primitives.cone({ name: `${n}-crystal${c}`, size: [0.55 * sc, 2.4 * sc, 0.55 * sc], material: crystalMat, params: { radialSegments: 5 }, castShadow: false, receiveShadow: false })
      .position(ox, 0.3 + 1.1 * sc, oz).rotate(range(-0.3, 0.3), range(0, 3), range(-0.3, 0.3)));
  }

  return group(`island-${index}`, kids, { position: [s.x, s.y, s.z] }).runtime({ id: `island-${index}`, mutable: true });
};

// ---------- clouds ----------
interface CloudSpec {
  id: string; x: number; y: number; z: number; speed: number; limit: number;
}
const clouds: CloudSpec[] = [];

const buildCloud = (index: number): Child => {
  const z = -6 - index * 9.6 + range(-3, 3);
  const dist = CAM_CENTER[2] - z;
  const low = index % 4 === 0;
  const y = low ? range(-30, -20) : range(-6, 34);
  const w = (low ? 52 : 16) + dist * 0.26 + range(0, 10);
  const limit = dist * 0.95 + 35 + w;
  const x = range(-limit, limit);
  const k = hazeAmount(x, y, z) * 0.9;
  const base = low ? "#d79ac0" : index % 3 === 0 ? "#ffd0bd" : index % 3 === 1 ? "#ffc3cf" : "#ffe1c9";
  const c = mix(base, HAZE, k);
  const mat = material.emissive({ color: c, emissive: c, emissiveIntensity: 0.4 });
  const puffs = 8 + (index % 3);
  const kids: Child[] = [];
  for (let p = 0; p < puffs; p += 1) {
    const u = p / (puffs - 1);
    const bulge = Math.sin(u * Math.PI);
    const d = w * range(0.16, 0.26) * (0.55 + 0.6 * bulge);
    kids.push(primitives.sphere({ name: `c${index}-p${p}`, size: [d, d * 0.62, d * 0.9], material: mat, castShadow: false, receiveShadow: false })
      .position((u - 0.5) * w + range(-1, 1), bulge * d * 0.28 + range(-0.5, 0.5), range(-w * 0.07, w * 0.07)));
  }
  const id = `cloud-${index}`;
  clouds.push({ id, x, y, z, speed: range(0.5, 1.4) * (0.6 + dist / 120), limit });
  return group(id, kids, { position: [x, y, z] }).runtime({ id, mutable: true });
};

// ---------- sun (a rendered body with fog disabled, so haze does not swallow it) ----------
const sunMaterial = (halo: boolean) => material.custom({
  glsl: {
    vertex: /* glsl */ `
out vec3 vN;
out vec3 vW;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`,
    fragment: halo
      ? /* glsl */ `
in vec3 vN;
in vec3 vW;
out vec4 outColor;
void main() {
  vec3 V = normalize(cameraPosition - vW);
  float f = clamp(dot(normalize(vN), V), 0.0, 1.0);
  float a = pow(f, 2.2) * 0.6;
  outColor = vec4(vec3(1.0, 0.55, 0.3) * a, a);
}`
      : /* glsl */ `
in vec3 vN;
in vec3 vW;
out vec4 outColor;
void main() {
  vec3 V = normalize(cameraPosition - vW);
  float f = clamp(dot(normalize(vN), V), 0.0, 1.0);
  vec3 col = mix(vec3(1.0, 0.5, 0.24), vec3(1.0, 0.94, 0.75), pow(f, 0.5));
  outColor = vec4(col * 1.5, 1.0);
}`
  },
  fog: false,
  transparent: halo,
  blending: halo ? "additive" : "normal",
  depthWrite: !halo
});

const SUN_AZ = (160 * Math.PI) / 180;
const SUN_EL = (8 * Math.PI) / 180;
const SUN_DIST = 380;
const sunPos: Vec3 = [
  Math.sin(SUN_AZ) * Math.cos(SUN_EL) * SUN_DIST,
  Math.sin(SUN_EL) * SUN_DIST,
  Math.cos(SUN_AZ) * Math.cos(SUN_EL) * SUN_DIST
];

// ---------- camera path (closed loop) ----------
const cameraPose = (time: number): { position: Vec3; target: Vec3 } => {
  const phi = (time / LOOP_SECONDS) * Math.PI * 2;
  return {
    position: [26 * Math.sin(phi), 9 + 3 * Math.sin(phi + 1), 46 + 8 * Math.cos(phi)],
    target: [-2 + 8 * Math.sin(phi + 0.8), 12 + 1.5 * Math.cos(phi), -50]
  };
};

// ---------- compose ----------
const first = cameraPose(0);
const wf = islands[0] as IslandSpec;
const waterfallPos: Vec3 = [wf.x + Math.cos(WATERFALL_ANGLE) * wf.R * 1.0, wf.y + 0.05, wf.z + Math.sin(WATERFALL_ANGLE) * wf.R * 1.0];

let stage = scene({ background: "#ff9a5a" })
  .add(sky.gradient({ zenith: "#4a3a88", horizon: "#ff9a5a", ground: "#d4708c", exponent: 0.9, horizonGlow: 0.6 }))
  .add(environments.neutral({ intensity: 0.45, background: false }))
  .add(lights.hemisphere({ skyColor: "#ffb48a", groundColor: "#7a5aa0", intensity: 0.9 }))
  .add(lights.directional({ name: "sun-light", position: [70, 24, -190], target: [0, 5, -40], intensity: 3.2, color: "#ffb070" }))
  .add(lights.directional({ name: "fill-light", position: [-40, 30, 90], target: [0, 5, -40], intensity: 1.3, color: "#ffb6c8" }))
  .add(primitives.sphere({ name: "sun-halo", size: 150, material: sunMaterial(true), castShadow: false, receiveShadow: false }).position(sunPos[0], sunPos[1], sunPos[2]))
  .add(primitives.sphere({ name: "sun-core", size: 42, material: sunMaterial(false), castShadow: false, receiveShadow: false }).position(sunPos[0], sunPos[1], sunPos[2]))
  .add(effects.fog({ color: HAZE, density: 0.0085, affectsBackground: false }));

for (let i = 0; i < 14; i += 1) stage = stage.add(buildCloud(i));
islands.forEach((s, i) => {
  stage = stage.add(buildIsland(s, i));
});

stage = stage
  .add(effects.particles({
    name: "waterfall", position: waterfallPos, shape: "box", shapeSize: [0.9, 0.05, 0.3],
    rate: 170, maxParticles: 700, lifetime: [3.2, 3.8], speed: [0.1, 0.5], size: [0.28, 0.5],
    gravity: 9, drag: 0.02, blend: "alpha", seed: 21, color: "#d6f1ff",
    sizeOverLife: [0.8, 1, 1.5], alphaOverLife: [0.9, 0.8, 0.5, 0]
  }))
  .add(effects.bloom({ intensity: 0.5, threshold: 0.85, radius: 0.5 }))
  .camera(camera.perspective({ position: first.position, target: first.target, fov: 55, near: 0.5, far: 700 }));

const app = createAuraApp("#app", { scene: stage });

let clock = 0;
app.onFrame((frame) => {
  const dt = Math.min(frame.dt, 0.1);
  clock += dt;

  islands.forEach((s, i) => {
    const w = s.speed * clock + s.phase;
    app.nodes.require(`island-${i}`)
      .setPosition(s.x, s.y + s.amp * Math.sin(w), s.z)
      .setRotation(0.018 * Math.sin(w * 0.7 + 1), 0.04 * Math.sin(w * 0.3), 0.018 * Math.cos(w * 0.8));
  });

  for (const c of clouds) {
    c.x += c.speed * dt;
    if (c.x > c.limit) c.x = -c.limit;
    app.nodes.require(c.id).setPosition(c.x, c.y, c.z);
  }

  const pose = cameraPose(clock);
  app.camera?.setPose({ position: pose.position, target: pose.target });
});

void app.ready().then(() => {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.__EVAL_READY__ = true;
    });
  });
});
