import { camera, createAuraApp, effects, environments, group, lights, material, primitives, scene, sky } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

type Vec3 = [number, number, number];
type Kid = NonNullable<Parameters<typeof group>[1]>[number];

// ---------- deterministic random ----------
let seed = 20240611;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

// ---------- materials ----------
const grassMat = material.pbr({ color: "#6fae4a", roughness: 1 });
const rimMat = material.pbr({ color: "#7d6a60", roughness: 1 });
const rockMat = material.pbr({ color: "#6e5d5c", roughness: 0.95 });
const rockMat2 = material.pbr({ color: "#8a7068", roughness: 0.95 });
const trunkMat = material.pbr({ color: "#5a3d2a", roughness: 1 });
const leafMats = [
  material.pbr({ color: "#3f9150", roughness: 0.9 }),
  material.pbr({ color: "#e86f9a", roughness: 0.9 }),
  material.pbr({ color: "#d9a13d", roughness: 0.9 })
];
const crystalMats = [
  material.emissive({ color: "#7de3ff", emissive: "#4fd0ff", emissiveIntensity: 1.4 }),
  material.emissive({ color: "#ff7ad9", emissive: "#ff49c0", emissiveIntensity: 1.4 })
];
const cloudMat = material.emissive({ color: "#ffd8cc", emissive: "#ffb4b0", emissiveIntensity: 0.55, roughness: 1, opacity: 0.85 });
const dropMat = material.emissive({ color: "#e6f6ff", emissive: "#bfe6ff", emissiveIntensity: 1.0, opacity: 0.85 });

const sunCore = material.custom({
  glsl: {
    vertex: `out vec3 vN; out vec3 vW;
void main() {
  vW = (modelMatrix * vec4(position, 1.0)).xyz;
  vN = mat3(modelMatrix) * normal;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`,
    fragment: `in vec3 vN; in vec3 vW; out vec4 outColor;
void main() {
  float m = clamp(dot(normalize(vN), normalize(cameraPosition - vW)), 0.0, 1.0);
  float edge = smoothstep(0.0, 0.15, m);
  vec3 col = mix(vec3(2.6, 0.95, 0.4), vec3(3.2, 2.5, 1.5), smoothstep(0.0, 0.9, m));
  outColor = vec4(col, edge);
}`
  },
  transparent: true,
  depthWrite: false,
  fog: false
});

const sunGlow = material.custom({
  glsl: {
    vertex: `out vec3 vN; out vec3 vW;
void main() {
  vW = (modelMatrix * vec4(position, 1.0)).xyz;
  vN = mat3(modelMatrix) * normal;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`,
    fragment: `in vec3 vN; in vec3 vW; out vec4 outColor;
void main() {
  float m = clamp(dot(normalize(vN), normalize(cameraPosition - vW)), 0.0, 1.0);
  outColor = vec4(vec3(1.0, 0.45, 0.22) * pow(m, 2.2) * 0.85, 1.0);
}`
  },
  transparent: true,
  blending: "additive",
  depthWrite: false,
  fog: false
});

const fallMat = material.custom({
  glsl: {
    vertex: `out vec3 vL;
void main() {
  vL = position;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`,
    fragment: `in vec3 vL; out vec4 outColor;
void main() {
  float edge = 1.0 - smoothstep(0.2, 0.5, abs(vL.x));
  float phase = vL.y * 60.0 + clk * 8.0;
  float band = 0.5 + 0.5 * sin(phase + vL.x * 30.0 + sin(vL.x * 17.0 + clk) * 1.5);
  float a = edge * (0.3 + 0.45 * band) * smoothstep(-0.5, -0.12, vL.y);
  vec3 col = mix(vec3(0.55, 0.82, 1.0), vec3(1.4, 1.4, 1.5), band);
  outColor = vec4(col, a);
}`
  },
  uniforms: { clk: { type: "f32", value: 0 } },
  transparent: true,
  depthWrite: false,
  side: "double"
});

// ---------- islands ----------
interface IslandSpec {
  id: string;
  pos: Vec3;
  r: number;
  bobAmp: number;
  bobSpeed: number;
  phase: number;
  yaw: number;
}

const islands: IslandSpec[] = [
  { id: "isle-main", pos: [-6, 10, -70], r: 17, bobAmp: 1.4, bobSpeed: 0.42, phase: 0.0, yaw: 0.3 },
  { id: "isle-b", pos: [32, 17, -42], r: 10, bobAmp: 1.1, bobSpeed: 0.63, phase: 1.7, yaw: 1.1 },
  { id: "isle-c", pos: [-38, 22, -32], r: 8, bobAmp: 1.0, bobSpeed: 0.55, phase: 3.1, yaw: 2.0 },
  { id: "isle-d", pos: [16, 34, -112], r: 7, bobAmp: 1.3, bobSpeed: 0.71, phase: 4.4, yaw: 0.7 },
  { id: "isle-e", pos: [-58, 8, -125], r: 12, bobAmp: 1.6, bobSpeed: 0.36, phase: 2.2, yaw: 2.6 },
  { id: "isle-f", pos: [54, 3, -82], r: 6, bobAmp: 0.9, bobSpeed: 0.8, phase: 5.0, yaw: 1.5 },
  { id: "isle-g", pos: [74, 30, -172], r: 9, bobAmp: 1.5, bobSpeed: 0.48, phase: 0.9, yaw: 3.4 },
  { id: "isle-h", pos: [-16, 2, -26], r: 5, bobAmp: 0.8, bobSpeed: 0.9, phase: 2.8, yaw: 0.2 },
  { id: "isle-i", pos: [26, 14, -195], r: 14, bobAmp: 1.8, bobSpeed: 0.3, phase: 3.9, yaw: 4.1 }
];

const MAIN_R = 17;
const FALL_X = 0.7 * MAIN_R;
const FALL_Z = 0.7 * MAIN_R;
const FALL_LEN = 60;
const DROPS = 40;

function buildIsland(spec: IslandSpec): Kid {
  const { id, r } = spec;
  const kids: Kid[] = [];
  const topY = -0.8 - 0.2 * r;

  kids.push(primitives.cylinder({ name: `${id}-grass`, size: [1.96 * r, 0.8, 1.96 * r], material: grassMat, castShadow: false }).position(0, -0.4, 0));
  kids.push(primitives.cylinder({ name: `${id}-rim`, size: [2 * r, 1.2, 2 * r], material: rimMat, castShadow: false }).position(0, -1.4, 0));
  kids.push(primitives.sphere({ name: `${id}-lump`, size: [1.9 * r, 0.5 * r, 1.9 * r], material: rockMat2, castShadow: false }).position(0, -0.8 - 0.225 * r, 0));
  kids.push(primitives.cone({ name: `${id}-under`, size: [1.85 * r, 1.5 * r, 1.85 * r], material: rockMat, castShadow: false }).position(0, topY - 0.75 * r, 0).rotate(Math.PI, 0, 0));
  kids.push(primitives.cone({ name: `${id}-stal-a`, size: [0.7 * r, 0.9 * r, 0.7 * r], material: rockMat2, castShadow: false }).position(0.38 * r, topY - 0.1 * r - 0.45 * r, 0.2 * r).rotate(Math.PI, 0, 0));
  kids.push(primitives.cone({ name: `${id}-stal-b`, size: [0.6 * r, 0.8 * r, 0.6 * r], material: rockMat2, castShadow: false }).position(-0.3 * r, topY - 0.1 * r - 0.4 * r, -0.3 * r).rotate(Math.PI, 0, 0));

  const s0 = Math.min(1.2, Math.max(0.6, r / 10));
  const trees = 3 + Math.round(r / 3);
  for (let i = 0; i < trees; i += 1) {
    const a = rand() * Math.PI * 2;
    let d = Math.sqrt(rand()) * 0.78 * r;
    if (id === "isle-main" && a > 0.2 && a < 1.4) d = Math.min(d, 0.45 * r); // keep clear of the waterfall edge
    const x = Math.cos(a) * d, z = Math.sin(a) * d, s = s0 * (0.8 + rand() * 0.6);
    const leaf = leafMats[i % leafMats.length]!;
    kids.push(primitives.cylinder({ name: `${id}-t${i}-trunk`, size: [0.5 * s, 2.4 * s, 0.5 * s], material: trunkMat, castShadow: false }).position(x, 1.2 * s, z));
    kids.push(primitives.cone({ name: `${id}-t${i}-c1`, size: [3.2 * s, 3.4 * s, 3.2 * s], material: leaf, castShadow: false }).position(x, 3.4 * s, z));
    kids.push(primitives.cone({ name: `${id}-t${i}-c2`, size: [2.3 * s, 2.6 * s, 2.3 * s], material: leaf, castShadow: false }).position(x, 5.1 * s, z));
  }

  const crystals = 2 + Math.floor(r / 8);
  for (let i = 0; i < crystals; i += 1) {
    const a = rand() * Math.PI * 2, d = (0.3 + rand() * 0.45) * r;
    const c = s0 * (0.8 + rand() * 0.6), x = Math.cos(a) * d, z = Math.sin(a) * d;
    const mat = crystalMats[i % crystalMats.length]!;
    kids.push(primitives.cone({ name: `${id}-k${i}-a`, size: [0.9 * c, 3.6 * c, 0.9 * c], material: mat, castShadow: false }).position(x, 1.6 * c, z).rotate(0.15, 0, (rand() - 0.5) * 0.4));
    kids.push(primitives.cone({ name: `${id}-k${i}-b`, size: [0.6 * c, 2.2 * c, 0.6 * c], material: mat, castShadow: false }).position(x + 0.8 * c, 1.0 * c, z + 0.3 * c).rotate(-0.1, 0, -0.35));
  }

  if (id === "isle-main") {
    kids.push(
      primitives.box({ name: "fall-ribbon", size: [2.4, FALL_LEN, 0.5], material: fallMat, castShadow: false })
        .position(FALL_X, -FALL_LEN / 2 - 0.4, FALL_Z)
        .rotate(0, 0.78, 0)
        .runtime({ id: "fall", mutable: true })
    );
    for (let i = 0; i < DROPS; i += 1) {
      kids.push(
        primitives.sphere({ name: `drop-${i}`, size: 0.5 + rand() * 0.5, material: dropMat, castShadow: false })
          .position(FALL_X, -10, FALL_Z)
          .runtime({ id: `drop-${i}`, mutable: true })
      );
    }
  }

  return group(id, kids, { position: spec.pos }).runtime({ id, mutable: true });
}

// ---------- clouds ----------
interface CloudSpec {
  id: string;
  x: number;
  y: number;
  z: number;
  speed: number;
  w: number;
}

const clouds: CloudSpec[] = [];
const cloudDefs: Array<[number, number, number]> = [
  // y, z, width
  [-14, -8, 26], [4, -20, 30], [38, -40, 34], [-6, -55, 40], [26, -75, 44], [-20, -95, 50],
  [48, -110, 48], [8, -135, 56], [30, -160, 60], [-10, -180, 64], [52, -210, 70], [-24, -230, 70]
];
cloudDefs.forEach(([y, z, w], i) => {
  const d = 40 - z, bound = 0.9 * d + 50;
  clouds.push({ id: `cloud-${i}`, x: (rand() * 2 - 1) * bound, y, z, speed: 0.6 + rand() * 1.6 + d * 0.01, w });
});

function buildCloud(c: CloudSpec): Kid {
  const kids: Kid[] = [];
  const puffs = 5;
  for (let i = 0; i < puffs; i += 1) {
    const u = i / (puffs - 1) - 0.5;
    const pw = c.w * (0.35 + rand() * 0.2), ph = c.w * (0.08 + rand() * 0.07), pd = c.w * (0.22 + rand() * 0.1);
    kids.push(
      primitives.sphere({ name: `${c.id}-p${i}`, size: [pw, ph, pd], material: cloudMat, castShadow: false })
        .position(u * c.w * 0.8, (rand() - 0.3) * ph * 0.6 + (1 - Math.abs(u) * 2) * ph * 0.3, (rand() - 0.5) * pd * 0.5)
    );
  }
  return group(c.id, kids, { position: [c.x, c.y, c.z] }).runtime({ id: c.id, mutable: true });
}

// ---------- scene ----------
const SUN_POS: Vec3 = [-50, 30, -375];

let sc = scene({ background: "#e08a78" })
  .camera(camera.perspective({ position: [0, 18, 40], target: [0, 12, -70], fov: 50, near: 1, far: 900 }))
  .add(sky.gradient({
    zenith: "#7a3a9a",
    horizon: "#ffb070",
    ground: "#e8708a",
    exponent: 1,
    horizonGlow: 0.6,
    bands: [{ elevationDeg: 10, widthDeg: 9, color: "#ff5fa0", intensity: 0.5 }]
  }))
  .add(environments.neutral({ intensity: 0.45, background: false }))
  .add(lights.hemisphere({ skyColor: "#ffb08a", groundColor: "#8b6fb0", intensity: 0.9 }))
  .add(lights.directional({ position: SUN_POS, target: [0, 0, -70], intensity: 2.2, color: "#ff9d5c" }))
  .add(lights.directional({ position: [40, 40, 150], target: [0, 0, -70], intensity: 1.6, color: "#ffc0d0" }))
  .add(effects.fog({ color: "#b8b0e0", density: 0.0055 }))
  .add(primitives.sphere({ name: "sun-glow", size: 190, material: sunGlow, castShadow: false }).position(...SUN_POS))
  .add(primitives.sphere({ name: "sun-core", size: 80, material: sunCore, castShadow: false }).position(...SUN_POS));

for (const c of clouds) sc = sc.add(buildCloud(c));
for (const isl of islands) sc = sc.add(buildIsland(isl));

const app = createAuraApp("#app", { scene: sc });

// ---------- animation ----------
const LOOP = 50; // seconds for one full camera arc cycle
const ARC = 0.32; // radians, peak swing of the camera arc
const CENTER_Z = -70;
let t = 0;
let clk = 0;

app.onFrame((f) => {
  const dt = Math.min(f.dt, 0.1);
  t += dt;
  clk += dt;

  // The camera arc is applied as the inverse rotation of the world about a vertical axis at CENTER_Z.
  const th = ARC * Math.sin((t / LOOP) * Math.PI * 2);
  const cs = Math.cos(th), sn = Math.sin(th);
  const place = (x: number, z: number): [number, number] => {
    const rz = z - CENTER_Z;
    return [x * cs + rz * sn, -x * sn + rz * cs + CENTER_Z];
  };

  for (const isl of islands) {
    const bob = isl.bobAmp * Math.sin(t * isl.bobSpeed + isl.phase);
    const [x, z] = place(isl.pos[0], isl.pos[2]);
    const node = app.nodes.require(isl.id);
    node.setPosition(x, isl.pos[1] + bob, z);
    node.setRotation(0.025 * Math.sin(t * isl.bobSpeed * 0.8 + isl.phase), th, 0.025 * Math.cos(t * isl.bobSpeed * 0.7 + isl.phase));
  }

  for (const c of clouds) {
    const d = 40 - c.z, bound = 0.9 * d + 50;
    c.x += c.speed * dt;
    if (c.x > bound) c.x = -bound;
    const [x, z] = place(c.x, c.z);
    const node = app.nodes.require(c.id);
    node.setPosition(x, c.y, z);
    node.setRotation(0, th, 0);
  }

  app.nodes.require("fall").setUniform?.("clk", clk);
  for (let i = 0; i < DROPS; i += 1) {
    const speed = 12 + ((i * 37) % 11);
    const off = (i / DROPS) * FALL_LEN;
    const fall = (t * speed + off) % FALL_LEN;
    const spread = 0.25 + fall * 0.012;
    const jx = Math.sin(i * 12.9 + fall * 0.3) * spread, jz = Math.cos(i * 7.7 + fall * 0.2) * spread;
    app.nodes.require(`drop-${i}`).setPosition(FALL_X + jx * 0.7 + jz * 0.7, -0.6 - fall, FALL_Z + jz * 0.7 - jx * 0.7);
  }
});

await app.ready();
window.__EVAL_READY__ = true;
