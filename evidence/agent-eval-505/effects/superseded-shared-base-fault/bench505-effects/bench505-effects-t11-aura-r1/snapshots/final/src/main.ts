import {
  camera, createAuraApp, effects, environments, geometry, group, instances, lights, material, primitives, scene, sky,
  type AuraTransformSpec
} from "@aura3d/engine";

declare global {
  interface Window {
    __TASK_STATE__?: { portalActive: boolean; particleCount: number; time: number };
    __EVAL_READY__?: boolean;
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Magic portal in a dusk ruin. Everything is procedural: stone ring from instanced blocks, a GLSL vortex disc, and two
// GPU-driven billboard particle systems (spiralling energy sparks and rising motes) whose motion is a pure function of
// one time uniform. The whole ruin sits in one group that sways slowly so the camera appears to drift.
// ---------------------------------------------------------------------------------------------------------------------

let seed = 20240611;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const range = (a: number, b: number): number => a + (b - a) * rand();

const TAU = Math.PI * 2;
const PLATFORM_TOP = 0.8;
const RING_R = 1.95; // centre line radius of the stone ring
const RING_C = 3.2; // height of the portal centre
const DISC_R = 1.74;

// --- stone ring -------------------------------------------------------------------------------------------------------
const stonePalette = ["#6d6c76", "#5b5a66", "#797782", "#4f4e5a", "#66646d", "#85828a"];
const ringBlocks: AuraTransformSpec[] = [];
const ringColors: string[] = [];
const runesCyan: AuraTransformSpec[] = [];
const runesViolet: AuraTransformSpec[] = [];
const RING_N = 24;
for (let i = 0; i < RING_N; i += 1) {
  const a = (i / RING_N) * TAU + Math.PI / 2;
  const r = RING_R + range(-0.02, 0.02);
  const depth = range(0.64, 0.8);
  ringBlocks.push({
    position: [Math.cos(a) * r, RING_C + Math.sin(a) * r, 0],
    rotation: [0, 0, a],
    scale: [0.5, ((TAU * RING_R) / RING_N) * 1.04, depth]
  });
  ringColors.push(stonePalette[Math.floor(rand() * stonePalette.length)] ?? "#66646d");
  if (i % 2 === 0) {
    const rune: AuraTransformSpec = {
      position: [Math.cos(a) * RING_R, RING_C + Math.sin(a) * RING_R, depth / 2 + 0.005],
      rotation: [0, 0, a],
      scale: [0.2, 0.26, 0.03]
    };
    (i % 4 === 0 ? runesCyan : runesViolet).push(rune);
  }
}
const innerGlow: AuraTransformSpec[] = [];
for (let i = 0; i < 48; i += 1) {
  const a = (i / 48) * TAU;
  innerGlow.push({
    position: [Math.cos(a) * 1.7, RING_C + Math.sin(a) * 1.7, 0],
    rotation: [0, 0, a],
    scale: [0.06, 0.25, 0.2]
  });
}

// --- floor runes on the platform --------------------------------------------------------------------------------------
const floorRunes: AuraTransformSpec[] = [];
for (let i = 0; i < 28; i += 1) {
  const a = (i / 28) * TAU;
  // box x axis is rotated about Y so that it follows the circle tangent
  floorRunes.push({
    position: [Math.cos(a) * 3.1, PLATFORM_TOP + 0.012, Math.sin(a) * 3.1],
    rotation: [0, -a + Math.PI / 2, 0],
    scale: [i % 2 === 0 ? 0.42 : 0.18, 0.02, 0.07]
  });
}

// --- pillars ------------------------------------------------------------------------------------------------------------
type Pillar = { x: number; z: number; h: number; capital: boolean };
const pillars: Pillar[] = [
  { x: -6.0, z: -3.4, h: 5.2, capital: true },
  { x: -6.0, z: -0.4, h: 5.2, capital: true },
  { x: 6.3, z: -3.0, h: 4.4, capital: true },
  { x: 6.6, z: 1.6, h: 2.3, capital: false },
  { x: -5.2, z: 4.6, h: 3.1, capital: false },
  { x: 3.0, z: -7.2, h: 5.8, capital: true },
  { x: -2.8, z: -8.0, h: 2.6, capital: false },
  { x: 9.0, z: -6.0, h: 3.6, capital: false },
  { x: -9.5, z: -6.5, h: 4.2, capital: true }
];
const shafts: AuraTransformSpec[] = [];
const shaftColors: string[] = [];
const caps: AuraTransformSpec[] = [];
const capColors: string[] = [];
for (const p of pillars) {
  shafts.push({ position: [p.x, p.h / 2, p.z], scale: [0.95, p.h, 0.95] });
  shaftColors.push(stonePalette[Math.floor(rand() * stonePalette.length)] ?? "#66646d");
  caps.push({ position: [p.x, 0.17, p.z], scale: [1.35, 0.34, 1.35] });
  capColors.push("#5d5c68");
  if (p.capital) {
    caps.push({ position: [p.x, p.h + 0.14, p.z], scale: [1.3, 0.28, 1.3] });
    capColors.push("#6a6874");
  } else {
    // broken, jagged top
    caps.push({ position: [p.x + 0.12, p.h + 0.02, p.z - 0.05], rotation: [0.25, 0.4, 0.3], scale: [0.7, 0.3, 0.6] });
    capColors.push("#58575f");
  }
}
// fallen drums and a toppled shaft
const fallen: AuraTransformSpec[] = [
  { position: [3.6, 0.46, 5.6], rotation: [0, 0, Math.PI / 2], scale: [0.92, 1.3, 0.92] },
  { position: [-7.5, 0.46, 3.2], rotation: [Math.PI / 2, 0, 0], scale: [0.92, 2.8, 0.92] },
  { position: [7.8, 0.46, -0.8], rotation: [0, 0, Math.PI / 2], scale: [0.92, 1.0, 0.92] }
];
// rubble
const rubble: AuraTransformSpec[] = [];
const rubbleColors: string[] = [];
for (let i = 0; i < 46; i += 1) {
  const a = rand() * TAU;
  const r = range(4.9, 10.5);
  const s = range(0.18, 0.62);
  rubble.push({
    position: [Math.cos(a) * r, s * 0.35, Math.sin(a) * r - 1.0],
    rotation: [range(-0.3, 0.3), rand() * TAU, range(-0.3, 0.3)],
    scale: [s * range(0.8, 1.6), s * range(0.6, 1.0), s * range(0.8, 1.4)]
  });
  rubbleColors.push(stonePalette[Math.floor(rand() * stonePalette.length)] ?? "#66646d");
}

// --- materials ----------------------------------------------------------------------------------------------------------
const stone = material.pbr({ color: "#ffffff", roughness: 0.93, metallic: 0.02 });
const greyStone = material.pbr({ color: "#625f6b", roughness: 0.93 });
const platformStone = material.pbr({ color: "#4b4a55", roughness: 0.95 });
const platformTop = material.pbr({ color: "#5a5964", roughness: 0.9 });
const groundMat = material.pbr({ color: "#17161f", roughness: 1 });
const glowCyan = material.emissive({ color: "#bff6ff", emissive: "#38dcff", emissiveIntensity: 2.6 });
const glowViolet = material.emissive({ color: "#e0c8ff", emissive: "#9b5cff", emissiveIntensity: 2.4 });

// --- vortex disc (facing +Z, centred on origin, positioned by the node) ------------------------------------------------
function buildDisc(rings: number, segments: number) {
  const vertexCount = 1 + rings * segments;
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const indices: number[] = [];
  normals[2] = 1;
  uvs[0] = 0.5;
  uvs[1] = 0.5;
  for (let r = 1; r <= rings; r += 1) {
    for (let s = 0; s < segments; s += 1) {
      const v = 1 + (r - 1) * segments + s;
      const a = (s / segments) * TAU;
      const rad = (r / rings) * DISC_R;
      positions.set([Math.cos(a) * rad, Math.sin(a) * rad, 0], v * 3);
      normals[v * 3 + 2] = 1;
      uvs.set([0.5 + (Math.cos(a) * r) / rings / 2, 0.5 + (Math.sin(a) * r) / rings / 2], v * 2);
    }
  }
  for (let s = 0; s < segments; s += 1) indices.push(0, 1 + s, 1 + ((s + 1) % segments));
  for (let r = 1; r < rings; r += 1) {
    for (let s = 0; s < segments; s += 1) {
      const a = 1 + (r - 1) * segments + s;
      const b = 1 + (r - 1) * segments + ((s + 1) % segments);
      const c = 1 + r * segments + s;
      const d = 1 + r * segments + ((s + 1) % segments);
      indices.push(a, c, b, b, c, d);
    }
  }
  return geometry.define({ positions, normals, uvs, indices, bounds: { min: [-DISC_R, -DISC_R, -0.01], max: [DISC_R, DISC_R, 0.01] } });
}

const vortexMaterial = material.custom({
  glsl: {
    vertex: /* glsl */ `
out vec3 vLocal;
void main() {
  vLocal = position;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`,
    fragment: /* glsl */ `
in vec3 vLocal;
out vec4 outColor;
void main() {
  vec2 p = vLocal.xy / ${DISC_R.toFixed(3)};
  float r = length(p);
  float a = atan(p.y, p.x);
  float t = portalClock;
  float lr = log(r + 0.06);

  float armsA = 0.5 + 0.5 * sin(3.0 * a + 6.0 * lr + t * 2.2);
  float armsB = 0.5 + 0.5 * sin(5.0 * a - 11.0 * lr - t * 1.5 + 1.7);
  float warp = sin(p.x * 7.0 + t * 1.1) * sin(p.y * 6.0 - t * 0.9);
  float arms = clamp(armsA * 0.68 + armsB * 0.32 + warp * 0.08, 0.0, 1.0);
  arms = smoothstep(0.12, 0.95, arms);

  vec3 deep = vec3(0.03, 0.01, 0.16);
  vec3 violet = vec3(0.55, 0.14, 1.0);
  vec3 cyan = vec3(0.04, 0.86, 1.0);
  float hue = clamp(armsB * 0.55 + arms * 0.45 + 0.2 * sin(t * 0.7 + r * 3.0), 0.0, 1.0);
  vec3 body = mix(violet, cyan, smoothstep(0.25, 0.8, hue));
  vec3 col = mix(deep, body, 0.12 + 0.88 * arms);

  float inner = 1.0 - r;
  col *= 0.75 + 1.5 * inner * inner;

  float core = exp(-r * r * 16.0) * (1.7 + 0.35 * sin(t * 2.0));
  col += vec3(0.85, 0.95, 1.0) * core;
  float halo = exp(-r * r * 4.0) * 0.35;
  col += mix(violet, cyan, 0.5 + 0.5 * sin(t * 0.8)) * halo;

  float rim = smoothstep(0.78, 1.0, r);
  col = mix(col, cyan * 1.9 + vec3(0.25), rim * 0.5);

  col *= 1.0 + 0.12 * sin(t * 1.3);
  outColor = vec4(col, 1.0);
}`
  },
  uniforms: { portalClock: { type: "f32", value: 0 } },
  side: "double",
  fog: false
});

// --- GPU particles --------------------------------------------------------------------------------------------------------
type Seeds = Array<[number, number, number]>;
function buildParticles(count: number) {
  const positions = new Float32Array(count * 4 * 3);
  const normals = new Float32Array(count * 4 * 3);
  const uvs = new Float32Array(count * 4 * 2);
  const indices: number[] = [];
  const seeds: Seeds = [];
  const corners: Array<[number, number]> = [[0, 0], [1, 0], [1, 1], [0, 1]];
  for (let i = 0; i < count; i += 1) {
    const s: [number, number, number] = [range(0.02, 0.98), range(0.02, 0.98), range(0.02, 0.98)];
    seeds.push(s);
    for (let k = 0; k < 4; k += 1) {
      const v = i * 4 + k;
      positions.set(s, v * 3);
      normals.set([0, 0, 1], v * 3);
      uvs.set(corners[k] ?? [0, 0], v * 2);
    }
    const b = i * 4;
    indices.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const spec = geometry.define({ positions, normals, uvs, indices, bounds: { min: [-14, -2, -14], max: [14, 14, 14] } });
  return { spec, seeds };
}

const particleVertexHead = /* glsl */ `
out vec2 vC;
out vec3 vCol;
out float vA;
float hh(float x) { return fract(sin(x * 127.1 + 311.7) * 43758.5453); }
void main() {
  float s1 = position.x;
  float s2 = position.y;
  float s3 = position.z;
  vec2 c = uv * 2.0 - 1.0;
  vec3 center = vec3(0.0);
  float size = 0.05;
  float alpha = 0.0;
  vec3 col = vec3(1.0);
`;
const particleVertexTail = /* glsl */ `
  vec3 toCam = normalize(cameraPosition - center);
  vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), toCam));
  vec3 up = cross(toCam, right);
  vec3 p = center + (right * c.x + up * c.y) * size;
  vC = c;
  vCol = col;
  vA = alpha;
  gl_Position = modelViewProjectionMatrix * vec4(p, 1.0);
}`;
const particleFragment = /* glsl */ `
in vec2 vC;
in vec3 vCol;
in float vA;
out vec4 outColor;
void main() {
  float d = length(vC);
  float f = exp(-d * d * 5.0) * (1.0 - smoothstep(0.85, 1.0, d));
  float core = exp(-d * d * 28.0);
  vec3 rgb = (vCol * f + vec3(1.0) * core * 0.6) * vA;
  outColor = vec4(rgb, 1.0);
}`;

const SPIRAL_MOTION = /* glsl */ `
  float life = 4.5 + 3.5 * s2;
  float u = fract(portalClock / life + s1);
  float r0 = 1.9 + 2.0 * hh(s3 * 7.0 + 1.0);
  float r = mix(r0, 0.1, pow(u, 1.3));
  float a0 = 6.2831853 * hh(s1 * 13.0 + 2.0);
  float turns = 0.9 + 0.8 * hh(s2 * 5.0 + 3.0);
  float ang = a0 + 6.2831853 * turns * u;
  float zOff = (hh(s3 * 3.0 + 5.0) - 0.5) * 2.6 * (1.0 - u) * (1.0 - u);
  center = vec3(r * cos(ang), ${RING_C.toFixed(2)} + r * sin(ang) * 0.95, zOff);
  size = (0.05 + 0.06 * hh(s1 * 9.0 + 4.0)) * (0.7 + 0.9 * u);
  alpha = smoothstep(0.0, 0.1, u) * (1.0 - smoothstep(0.9, 1.0, u)) * smoothstep(0.9, 1.5, center.y);
  vec3 cyan = vec3(0.15, 0.85, 1.0);
  vec3 vio = vec3(0.65, 0.3, 1.0);
  col = mix(cyan, vio, hh(s3 * 11.0 + 6.0));
  col = mix(col, vec3(1.0), u * u * 0.5);
  col *= 0.7 + 1.6 * u;
`;
const MOTE_MOTION = /* glsl */ `
  float life = 5.0 + 4.0 * s2;
  float u = fract(portalClock / life + s1);
  float a = 6.2831853 * hh(s1 * 17.0 + 1.0);
  float rr = 0.4 + 3.3 * sqrt(hh(s3 * 5.0 + 2.0));
  float sway = 0.25 * sin(portalClock * 0.8 + s2 * 40.0) * u;
  center = vec3(rr * cos(a) + sway,
                ${(PLATFORM_TOP + 0.1).toFixed(2)} + u * (2.2 + 2.5 * hh(s2 * 3.0 + 7.0)),
                rr * sin(a) + 0.2 * cos(portalClock * 0.6 + s3 * 30.0) * u);
  size = 0.03 + 0.035 * hh(s1 * 3.0 + 9.0);
  alpha = smoothstep(0.0, 0.08, u) * pow(1.0 - u, 1.5) * (0.65 + 0.35 * sin(portalClock * 4.0 + s3 * 60.0));
  col = mix(vec3(0.3, 0.9, 1.0), vec3(0.8, 0.5, 1.0), hh(s2 * 9.0 + 3.0)) * 1.8;
`;

const particleMaterial = (motion: string) =>
  material.custom({
    glsl: { vertex: particleVertexHead + motion + particleVertexTail, fragment: particleFragment },
    uniforms: { portalClock: { type: "f32", value: 0 } },
    transparent: true,
    depthWrite: false,
    blending: "additive",
    side: "double",
    fog: false,
    castShadow: false,
    receiveShadow: false
  });

const SPIRAL_COUNT = 240;
const MOTE_COUNT = 110;
const spiral = buildParticles(SPIRAL_COUNT);
const motes = buildParticles(MOTE_COUNT);

// --- scene ----------------------------------------------------------------------------------------------------------------
const app = createAuraApp("#app", {
  scene: scene({ background: "#120c24" })
    .add(sky.gradient({ zenith: "#070614", horizon: "#8a3a5c", horizonGlow: 0.6, stars: { count: 160 } }))
    .add(environments.neutral({ intensity: 0.2, background: false }))
    .add(
      group("world", [
        lights.directional({ name: "moon", position: [-9, 13, 6], target: [0, 1.5, 0], intensity: 0.85, color: "#6f82d8", shadow: true }),
        lights.directional({ name: "dusk-rim", position: [10, 3, -10], target: [0, 1.5, 0], intensity: 0.7, color: "#ff7a4f" }),
        lights.point({ name: "portal-front", position: [0, RING_C, 2.2], intensity: 34, color: "#3fd8ff", distance: 15, decay: 2, shadow: false }).runtime({ id: "light-front", mutable: true }),
        lights.point({ name: "portal-floor", position: [0, 1.5, 3.0], intensity: 26, color: "#9b5cff", distance: 13, decay: 2, shadow: false }).runtime({ id: "light-floor", mutable: true }),
        lights.point({ name: "portal-back", position: [0, RING_C, -2.4], intensity: 28, color: "#7a6cff", distance: 15, decay: 2, shadow: false }).runtime({ id: "light-back", mutable: true }),
        primitives.plane({ name: "ground", size: [70, 1, 70], material: groundMat }),
        primitives.cylinder({ name: "platform-base", size: [9, 0.5, 9], material: platformStone, params: { radialSegments: 48 } }).position(0, 0.25, 0),
        primitives.cylinder({ name: "platform-top", size: [7.4, 0.3, 7.4], material: platformTop, params: { radialSegments: 48 } }).position(0, 0.65, 0),
        primitives.box({ name: "step", size: [3.4, 0.28, 0.9], material: platformStone }).position(0, 0.14, 4.85),
        primitives.box({ name: "ring-foot", size: [2.7, 0.5, 1.0], material: platformStone }).position(0, 0.98, 0),
        instances.box({ name: "ring-blocks", transforms: ringBlocks, colors: ringColors, material: stone }),
        instances.box({ name: "runes-cyan", transforms: runesCyan, material: glowCyan }),
        instances.box({ name: "runes-violet", transforms: runesViolet, material: glowViolet }),
        instances.box({ name: "ring-inner-glow", transforms: innerGlow, material: glowCyan }),
        instances.box({ name: "floor-runes", transforms: floorRunes, material: glowViolet }),
        instances.cylinder({ name: "pillar-shafts", transforms: shafts, colors: shaftColors, material: stone, params: { radialSegments: 14 } }),
        instances.box({ name: "pillar-caps", transforms: caps, colors: capColors, material: stone }),
        primitives.box({ name: "lintel", size: [1.1, 0.55, 3.9], material: greyStone }).position(-6.0, 5.48, -1.9),
        instances.cylinder({ name: "fallen", transforms: fallen, material: greyStone, params: { radialSegments: 14 } }),
        instances.box({ name: "rubble", transforms: rubble, colors: rubbleColors, material: stone }),
        geometry.custom(buildDisc(24, 96), { name: "vortex", material: vortexMaterial, castShadow: false, receiveShadow: false })
          .position(0, RING_C, 0)
          .runtime({ id: "vortex", mutable: true }),
        geometry.custom(spiral.spec, { name: "spiral-sparks", material: particleMaterial(SPIRAL_MOTION), castShadow: false, receiveShadow: false })
          .runtime({ id: "spiral", mutable: true }),
        geometry.custom(motes.spec, { name: "motes", material: particleMaterial(MOTE_MOTION), castShadow: false, receiveShadow: false })
          .runtime({ id: "motes", mutable: true })
      ]).runtime({ id: "world", mutable: true })
    )
    .add(effects.fog({ color: "#241636", density: 0.034 }))
    .add(effects.bloom({ intensity: 1.35, threshold: 0.55, radius: 0.75 }))
    .add(effects.vignette({ intensity: 0.28 }))
    .camera(camera.perspective({ position: [0, 3.5, 11.8], target: [0, 2.7, 0], fov: 42, near: 0.2, far: 120 }))
});

// --- animation ----------------------------------------------------------------------------------------------------------------
type Settable = {
  setUniform?: (name: string, value: number) => void;
  setPosition?: (x: number, y: number, z: number) => void;
  setRotation?: (x: number, y: number, z: number) => void;
  setIntensity?: (value: number) => void;
};
const handle = (id: string): Settable => app.nodes.require(id) as unknown as Settable;

const startMs = performance.now();
const smooth = (e0: number, e1: number, x: number): number => {
  const k = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return k * k * (3 - 2 * k);
};
const fract = (x: number): number => x - Math.floor(x);

function liveCount(t: number): number {
  let n = 0;
  for (const [s1, s2] of spiral.seeds) {
    const u = fract(t / (4.5 + 3.5 * s2) + s1);
    if (smooth(0, 0.1, u) * (1 - smooth(0.9, 1, u)) > 0.02) n += 1;
  }
  for (const [s1, s2] of motes.seeds) {
    const u = fract(t / (5 + 4 * s2) + s1);
    if (smooth(0, 0.08, u) * Math.pow(1 - u, 1.5) > 0.02) n += 1;
  }
  return n;
}

function publishState(t: number): void {
  window.__TASK_STATE__ = { portalActive: true, particleCount: liveCount(t), time: t };
}

function update(): void {
  const t = (performance.now() - startMs) / 1000;

  handle("vortex").setUniform?.("portalClock", t);
  handle("spiral").setUniform?.("portalClock", t);
  handle("motes").setUniform?.("portalClock", t);

  // slow camera drift: the whole ruin yaws a little around the world origin
  handle("world").setRotation?.(0, 0.4 * Math.sin(t * 0.16), 0);

  // slow light pulse: the lights breathe in and out (position always, intensity when the handle supports it)
  const p1 = 0.5 + 0.5 * Math.sin(t * 1.05);
  const p2 = 0.5 + 0.5 * Math.sin(t * 1.05 + 2.1);
  const front = handle("light-front");
  front.setPosition?.(0, RING_C, 2.9 - 1.5 * p1);
  front.setIntensity?.(26 + 16 * p1);
  const floor = handle("light-floor");
  floor.setPosition?.(0, 1.5, 3.6 - 1.4 * p2);
  floor.setIntensity?.(20 + 14 * p2);
  const back = handle("light-back");
  back.setPosition?.(0, RING_C, -3.0 + 1.2 * p2);
  back.setIntensity?.(22 + 12 * p2);

  publishState(t);
}

app.onFrame(update);
publishState(0);

// state keeps updating even if the engine callback is delayed
const stateLoop = (): void => {
  publishState((performance.now() - startMs) / 1000);
  requestAnimationFrame(stateLoop);
};
requestAnimationFrame(stateLoop);

void app.ready().then(() => {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    window.__EVAL_READY__ = true;
  }));
});
