import {
  camera, createAuraApp, effects, environments, geometry, group, instances, lights, material, primitives, scene, sky,
  type AuraTransformSpec
} from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
    __TASK_STATE__?: { portalActive: boolean; particleCount: number; time: number };
  }
}

// ---------------------------------------------------------------------------------------------
// Magic portal in a dusk ruin. World layout: portal ring in the XY plane at the origin of the
// "world" group, facing +z (toward the camera). The whole group is slowly yawed, which reads as
// a gentle camera orbit while the sky, key lights and camera stay fixed.
// ---------------------------------------------------------------------------------------------

let seed = 2024;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const range = (a: number, b: number): number => a + (b - a) * rand();

const PORTAL_Y = 3.25; // ring centre height
const RING_R = 2.3; // ring centre-line radius
const DISC_R = 2.0; // swirling disc radius

// --- stone ring -------------------------------------------------------------------------------
const RING_BLOCKS = 20;
const ringBlocks: AuraTransformSpec[] = [];
const ringColors: string[] = [];
const runes: AuraTransformSpec[] = [];
for (let i = 0; i < RING_BLOCKS; i += 1) {
  const a = (i / RING_BLOCKS) * Math.PI * 2;
  const jitter = range(-0.03, 0.03);
  const rr = RING_R + range(-0.04, 0.04);
  ringBlocks.push({
    position: [Math.cos(a) * rr, PORTAL_Y + Math.sin(a) * rr, range(-0.04, 0.04)],
    rotation: [0, 0, a + Math.PI / 2 + jitter],
    scale: [0.82, 0.56 + range(-0.04, 0.05), 0.62 + range(-0.05, 0.05)]
  });
  ringColors.push(`hsl(${28 + Math.floor(range(-6, 10))}, ${5 + Math.floor(range(0, 6))}%, ${24 + Math.floor(range(0, 11))}%)`);
  if (i % 2 === 0) {
    runes.push({
      position: [Math.cos(a) * RING_R, PORTAL_Y + Math.sin(a) * RING_R, 0.325],
      rotation: [0, 0, a + Math.PI / 2],
      scale: [0.1, 0.34, 0.03]
    });
  }
}

// --- platform ---------------------------------------------------------------------------------
const platformRunes: AuraTransformSpec[] = [];
for (let i = 0; i < 28; i += 1) {
  const a = (i / 28) * Math.PI * 2;
  const r = 3.45;
  platformRunes.push({
    position: [Math.cos(a) * r, 0.61, Math.sin(a) * r],
    rotation: [0, -a - Math.PI / 2, 0],
    scale: [i % 2 === 0 ? 0.5 : 0.22, 0.02, 0.09]
  });
}

// --- ruined pillars and rubble ----------------------------------------------------------------
const pillarSpecs: Array<[number, number, number]> = [
  [-6.8, -3.4, 6.2], [6.6, -4.2, 4.3], [-5.7, 4.3, 2.4], [6.1, 3.6, 1.5],
  [-11.5, -10, 7.4], [10.5, -12, 5.2], [-2.5, -15, 6.4], [13, -2, 3.2]
];
const shafts: AuraTransformSpec[] = [];
const shaftColors: string[] = [];
const bases: AuraTransformSpec[] = [];
const capitals: AuraTransformSpec[] = [];
const brokenTops: AuraTransformSpec[] = [];
for (const [x, z, h] of pillarSpecs) {
  shafts.push({ position: [x, h / 2, z], scale: [1.05, h, 1.05] });
  shaftColors.push(`hsl(${30 + Math.floor(range(-8, 20))}, ${4 + Math.floor(range(0, 8))}%, ${30 + Math.floor(range(0, 10))}%)`);
  bases.push({ position: [x, 0.17, z], scale: [1.5, 0.34, 1.5] });
  if (h > 4) capitals.push({ position: [x, h + 0.16, z], scale: [1.45, 0.32, 1.45] });
  else brokenTops.push({ position: [x + 0.12, h + 0.08, z], rotation: [range(-0.3, 0.3), range(0, 3), range(-0.35, 0.35)], scale: [0.9, 0.35, 0.8] });
}
const drums: AuraTransformSpec[] = [
  { position: [-3.4, 0.52, 6.6], rotation: [0, 0.7, Math.PI / 2], scale: [1.0, 1.1, 1.0] },
  { position: [4.3, 0.5, -7.2], rotation: [0, -0.4, Math.PI / 2], scale: [0.95, 1.5, 0.95] },
  { position: [-8.6, 0.5, 1.2], rotation: [0, 1.4, Math.PI / 2], scale: [1.0, 1.9, 1.0] }
];
const rubble: AuraTransformSpec[] = [];
const rubbleColors: string[] = [];
for (let i = 0; i < 42; i += 1) {
  const a = rand() * Math.PI * 2;
  const r = range(5.6, 14);
  const s = range(0.18, 0.7);
  rubble.push({
    position: [Math.cos(a) * r, s * 0.3, Math.sin(a) * r - 1],
    rotation: [range(-0.4, 0.4), rand() * 3, range(-0.4, 0.4)],
    scale: [s * range(0.8, 1.6), s * range(0.5, 1), s * range(0.8, 1.4)]
  });
  rubbleColors.push(`hsl(${28 + Math.floor(range(-6, 14))}, ${4 + Math.floor(range(0, 6))}%, ${22 + Math.floor(range(0, 12))}%)`);
}

// --- materials --------------------------------------------------------------------------------
const stone = material.pbr({ color: "#ffffff", roughness: 0.95, metallic: 0 });
const darkStone = material.pbr({ color: "#4b4741", roughness: 0.97, metallic: 0 });
const cyanGlow = material.emissive({ color: "#bff6ff", emissive: "#2fd8ff", emissiveIntensity: 3.2 });
const violetGlow = material.emissive({ color: "#e0cfff", emissive: "#9a5cff", emissiveIntensity: 3.2 });
const paleGlow = material.emissive({ color: "#ffffff", emissive: "#b9ecff", emissiveIntensity: 3.6 });
const runeGlow = material.emissive({ color: "#bff6ff", emissive: "#27c9ff", emissiveIntensity: 2.4 });

// --- the vortex disc --------------------------------------------------------------------------
const SEGS = 72;
const RINGS = 24;
const discPositions = new Float32Array((SEGS + 1) * (RINGS + 1) * 3);
const discNormals = new Float32Array(discPositions.length);
const discUvs = new Float32Array((SEGS + 1) * (RINGS + 1) * 2);
const discIndices: number[] = [];
for (let j = 0; j <= RINGS; j += 1) {
  for (let i = 0; i <= SEGS; i += 1) {
    const v = j * (SEGS + 1) + i;
    const a = (i / SEGS) * Math.PI * 2;
    const r = (j / RINGS) * DISC_R;
    discPositions.set([Math.cos(a) * r, Math.sin(a) * r, 0], v * 3);
    discNormals[v * 3 + 2] = 1;
    discUvs.set([(Math.cos(a) * r) / DISC_R * 0.5 + 0.5, (Math.sin(a) * r) / DISC_R * 0.5 + 0.5], v * 2);
    if (i < SEGS && j < RINGS) {
      const v10 = v + SEGS + 1;
      discIndices.push(v, v10, v + 1, v + 1, v10, v10 + 1);
    }
  }
}

const vortex = material.custom({
  glsl: {
    vertex: /* glsl */ `
out vec3 vPos;
void main() {
  vPos = position;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`,
    fragment: /* glsl */ `
in vec3 vPos;
out vec4 outColor;
void main() {
  vec2 p = vPos.xy / ${DISC_R.toFixed(2)};
  float r = clamp(length(p), 0.0, 1.0);
  float a = atan(p.y, p.x + 0.00001);
  float t = portalClock;

  // spiral arms that twist harder toward the centre and rotate over time
  float tw = a + (1.0 - r) * 6.5 - t * 0.85;
  float arms = 0.5 + 0.5 * sin(tw * 3.0 + sin(r * 9.0 - t * 1.4) * 1.3);
  float fine = 0.5 + 0.5 * sin(a * 7.0 - r * 24.0 + t * 2.7 + sin(a * 3.0 + t * 0.7) * 1.6);
  float flow = 0.5 + 0.5 * sin(r * 30.0 + t * 3.2 + arms * 2.0);

  vec3 deep = vec3(0.03, 0.01, 0.16);
  vec3 violet = vec3(0.50, 0.14, 1.20);
  vec3 cyan = vec3(0.10, 0.95, 1.25);

  vec3 col = mix(deep, violet, smoothstep(0.15, 0.85, arms));
  col = mix(col, cyan, smoothstep(0.5, 1.0, arms * 0.55 + fine * 0.5 + (1.0 - r) * 0.2));
  col += cyan * pow(fine, 7.0) * 0.55;
  col += violet * pow(flow, 5.0) * 0.25 * r;

  // bright core
  float core = exp(-r * r * 22.0);
  float halo = exp(-r * r * 4.0);
  col += vec3(0.35, 0.55, 1.0) * halo * 0.35;
  col = mix(col, vec3(1.0), clamp(core * 0.85, 0.0, 1.0)) + vec3(0.7, 0.95, 1.4) * core * 1.2;

  // glowing rim where the energy meets the stone
  float rim = smoothstep(0.76, 1.0, r);
  col += cyan * rim * (0.7 + 0.3 * sin(t * 2.0 + a * 4.0)) * 1.1;

  col *= 0.92 + 0.08 * sin(t * 1.3);
  outColor = vec4(col, 1.0);
}`
  },
  uniforms: { portalClock: { type: "f32", value: 0 } },
  side: "double",
  fog: false,
  castShadow: false,
  receiveShadow: false
});

// --- particles --------------------------------------------------------------------------------
const SPIRAL_COUNT = 72;
const MOTE_COUNT = 32;
const glowMats = [cyanGlow, violetGlow, paleGlow];

const spiralNodes = Array.from({ length: SPIRAL_COUNT }, (_, i) =>
  primitives.sphere({ name: `spiral-${i}`, size: 1, material: glowMats[i % 3], castShadow: false, receiveShadow: false })
    .position(0, -20, 0).scale(0.0001).runtime({ id: `spiral-${i}`, mutable: true })
);
const moteNodes = Array.from({ length: MOTE_COUNT }, (_, i) =>
  primitives.sphere({ name: `mote-${i}`, size: 1, material: glowMats[(i + 1) % 3], castShadow: false, receiveShadow: false })
    .position(0, -20, 0).scale(0.0001).runtime({ id: `mote-${i}`, mutable: true })
);

// --- scene ------------------------------------------------------------------------------------
const world = group("world", [
  // platform: two stone tiers
  primitives.cylinder({ name: "platform-lower", size: [10.6, 0.3, 10.6], material: darkStone, params: { radialSegments: 48 } }).position(0, 0.15, 0),
  primitives.cylinder({ name: "platform-upper", size: [8.4, 0.3, 8.4], material: darkStone, params: { radialSegments: 48 } }).position(0, 0.45, 0),
  instances.box({ name: "platform-runes", transforms: platformRunes, material: runeGlow }),
  // pedestal under the ring
  primitives.box({ name: "pedestal", size: [2.6, 0.5, 1.1], material: darkStone }).position(0, 0.85, 0),
  primitives.box({ name: "buttress-l", size: [0.7, 1.3, 0.9], material: darkStone }).position(-1.85, 1.25, -0.1).rotate(0, 0, 0.1),
  primitives.box({ name: "buttress-r", size: [0.7, 0.9, 0.9], material: darkStone }).position(1.9, 1.05, 0.05).rotate(0, 0, -0.14),
  // the ring
  instances.box({ name: "portal-ring", transforms: ringBlocks, colors: ringColors, material: stone }),
  instances.box({ name: "portal-runes", transforms: runes, material: runeGlow }),
  // the swirling disc
  geometry.custom(
    geometry.define({
      positions: discPositions, normals: discNormals, uvs: discUvs, indices: discIndices,
      bounds: { min: [-DISC_R, -DISC_R, -0.01], max: [DISC_R, DISC_R, 0.01] }
    }),
    { name: "portal-disc", material: vortex, castShadow: false, receiveShadow: false }
  ).position(0, PORTAL_Y, 0).runtime({ id: "portal-disc", mutable: true }),
  // ruins
  instances.cylinder({ name: "pillar-shafts", transforms: shafts, colors: shaftColors, material: stone, params: { radialSegments: 10 } }),
  instances.cylinder({ name: "pillar-bases", transforms: bases, material: darkStone, params: { radialSegments: 10 } }),
  instances.cylinder({ name: "pillar-capitals", transforms: capitals, material: darkStone, params: { radialSegments: 10 } }),
  instances.box({ name: "pillar-broken", transforms: brokenTops, material: darkStone }),
  instances.cylinder({ name: "fallen-drums", transforms: drums, material: darkStone, params: { radialSegments: 10 } }),
  instances.box({ name: "rubble", transforms: rubble, colors: rubbleColors, material: stone }),
  // portal light, pulsed in onFrame
  lights.point({ name: "portal-cyan", position: [0, PORTAL_Y, 2.4], intensity: 38, distance: 18, decay: 2, color: "#35d8ff", shadow: false })
    .runtime({ id: "portal-cyan", mutable: true }),
  lights.point({ name: "portal-violet", position: [0, 1.3, 1.8], intensity: 24, distance: 14, decay: 2, color: "#8f55ff", shadow: false })
    .runtime({ id: "portal-violet", mutable: true }),
  lights.point({ name: "portal-back", position: [0, PORTAL_Y, -2.6], intensity: 26, distance: 16, decay: 2, color: "#8f55ff", shadow: false })
    .runtime({ id: "portal-back", mutable: true }),
  ...spiralNodes,
  ...moteNodes
]).runtime({ id: "world", mutable: true });

const stage = scene({ background: "#0a0716" })
  .add(sky.gradient({ zenith: "#070516", horizon: "#4a2150", ground: "#06040b", exponent: 0.55, horizonGlow: 0.35 }))
  .add(environments.neutral({ intensity: 0.18, background: false }))
  .add(lights.directional({ name: "dusk-key", position: [6, 9, 8], target: [0, 1.5, 0], intensity: 0.8, color: "#6a72c8", shadow: true }))
  .add(lights.directional({ name: "dusk-rim", position: [-10, 5, -9], target: [0, 2, 0], intensity: 1.3, color: "#ff7a50" }))
  .add(primitives.plane({ name: "ground", size: [90, 1, 90], material: material.pbr({ color: "#1c1a22", roughness: 1, metallic: 0 }) }))
  .add(world)
  .add(effects.fog({ color: "#2a1640", density: 0.02 }))
  .add(effects.bloom({ intensity: 1.15, threshold: 0.6, radius: 0.75 }))
  .add(effects.vignette({ intensity: 0.3 }))
  .camera(camera.perspective({ position: [0, 3.7, 12.5], target: [0, 2.9, 0], fov: 42, near: 0.2, far: 160 }));

const app = createAuraApp("#app", { scene: stage });

// --- simulation -------------------------------------------------------------------------------
interface Particle {
  kind: "spiral" | "mote";
  age: number;
  life: number;
  wait: number; // > 0 while dead, waiting to respawn
  r0: number; th0: number; z0: number; spin: number; size: number; phase: number;
}

const spawn = (p: Particle, initial: boolean): void => {
  p.wait = 0;
  p.phase = rand() * Math.PI * 2;
  if (p.kind === "spiral") {
    p.life = range(3.2, 6.0);
    p.r0 = range(3.4, 6.8);
    p.th0 = rand() * Math.PI * 2;
    p.z0 = range(-1.5, 3.6);
    p.spin = range(5, 8.5) * (rand() < 0.1 ? -1 : 1);
    p.size = range(0.07, 0.17);
  } else {
    p.life = range(5, 8.5);
    p.r0 = range(0.4, 4.0);
    p.th0 = rand() * Math.PI * 2;
    p.z0 = range(0.45, 1.0); // rise speed
    p.spin = range(0.15, 0.4); // sway amplitude
    p.size = range(0.045, 0.1);
  }
  p.age = initial ? rand() * p.life : 0;
};

const makeParticles = (kind: Particle["kind"], count: number): Particle[] =>
  Array.from({ length: count }, () => {
    const p: Particle = { kind, age: 0, life: 1, wait: 0, r0: 0, th0: 0, z0: 0, spin: 0, size: 0.1, phase: 0 };
    spawn(p, true);
    return p;
  });

const spirals = makeParticles("spiral", SPIRAL_COUNT);
const motes = makeParticles("mote", MOTE_COUNT);

window.__TASK_STATE__ = { portalActive: true, particleCount: SPIRAL_COUNT + MOTE_COUNT, time: 0 };

await app.ready();

const worldNode = app.nodes.require("world");
const discNode = app.nodes.require("portal-disc");
const cyanLight = app.nodes.require("portal-cyan");
const violetLight = app.nodes.require("portal-violet");
const backLight = app.nodes.require("portal-back");
const spiralHandles = spirals.map((_, i) => app.nodes.require(`spiral-${i}`));
const moteHandles = motes.map((_, i) => app.nodes.require(`mote-${i}`));

// Light intensity setters are not part of the documented handle surface, so probe for them and
// always also pulse the light positions, which is documented and changes the lit stone brightness.
type IntensityHandle = { setIntensity?: (value: number) => void };
const asIntensity = (h: unknown): IntensityHandle => h as IntensityHandle;

const start = performance.now();
let last = start;

const stepParticle = (p: Particle, dt: number, handle: (typeof spiralHandles)[number]): boolean => {
  if (p.wait > 0) {
    p.wait -= dt;
    if (p.wait <= 0) spawn(p, false);
    else return false;
  }
  p.age += dt;
  if (p.age >= p.life) {
    p.wait = range(0.05, 0.6);
    handle.setScale(0.0001);
    return false;
  }
  const u = p.age / p.life;
  const env = Math.pow(Math.sin(Math.PI * u), 0.6);
  if (p.kind === "spiral") {
    const k = 1 - u;
    const r = p.r0 * Math.pow(k, 1.5) + 0.12;
    const th = p.th0 + p.spin * (u + 1.4 * u * u);
    handle.setPosition(
      Math.cos(th) * r,
      PORTAL_Y + Math.sin(th) * r,
      p.z0 * Math.pow(k, 2.4) + 0.06 * Math.sin(p.phase + p.age * 3)
    );
  } else {
    const sway = p.spin * Math.sin(p.phase + p.age * 0.9);
    handle.setPosition(
      Math.cos(p.th0) * p.r0 + sway,
      0.7 + p.age * p.z0 + 0.3 * u,
      Math.sin(p.th0) * p.r0 + p.spin * Math.cos(p.phase * 1.3 + p.age * 0.7)
    );
  }
  handle.setScale(Math.max(0.0001, p.size * env));
  return true;
};

app.onFrame(() => {
  const now = performance.now();
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const t = (now - start) / 1000;

  // slow camera-like sway: yaw the world around the portal
  worldNode.setRotation(0, 0.34 * Math.sin(t * 0.17) + 0.05 * Math.sin(t * 0.41), 0);

  // vortex clock and slow light pulse
  discNode.setUniform?.("portalClock", t);
  const pulse = 0.5 + 0.5 * Math.sin(t * 0.9);
  const flick = 0.04 * Math.sin(t * 7.3) * pulse;
  cyanLight.setPosition(0, PORTAL_Y, 3.1 - 1.5 * pulse + flick);
  violetLight.setPosition(0, 1.3, 2.3 - 0.9 * pulse);
  backLight.setPosition(0, PORTAL_Y, -3.2 + 1.0 * pulse);
  asIntensity(cyanLight).setIntensity?.(26 + 24 * pulse);
  asIntensity(violetLight).setIntensity?.(16 + 18 * pulse);
  asIntensity(backLight).setIntensity?.(18 + 18 * pulse);

  let live = 0;
  for (let i = 0; i < spirals.length; i += 1) if (stepParticle(spirals[i], dt, spiralHandles[i])) live += 1;
  for (let i = 0; i < motes.length; i += 1) if (stepParticle(motes[i], dt, moteHandles[i])) live += 1;

  window.__TASK_STATE__ = { portalActive: true, particleCount: live, time: t };
});

// first frame: let the engine present at least two frames before flagging readiness
requestAnimationFrame(() => requestAnimationFrame(() => { window.__EVAL_READY__ = true; }));
