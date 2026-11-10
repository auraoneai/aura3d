import {
  camera,
  createAuraApp,
  environments,
  geometry,
  groups,
  lights,
  material,
  primitives,
  scene,
  surfaces,
  texture
} from "@aura3d/engine";

declare global {
  interface Window {
    __TASK_STATE__?: { turntableAngleDeg: number; paintFinish: string };
    __EVAL_READY__?: boolean;
  }
}

// ---------- procedural geometry: lofted super-elliptic body ----------
interface LoftOptions {
  halfLength: number;
  halfWidth: number;
  top: number;
  bottom: number;
  cx: number;
  cy: number;
  cz: number;
  sectionExp: number; // 2 = ellipse, higher = boxier section
  endExp: number; // roundness of the nose / tail in side view
  segU?: number;
  segA?: number;
  uvRepeat?: number;
}

function sgnPow(v: number, e: number): number {
  return Math.sign(v) * Math.pow(Math.abs(v), e);
}

function loft(o: LoftOptions) {
  const SU = o.segU ?? 72;
  const SA = o.segA ?? 56;
  const positions = new Float32Array((SU + 1) * (SA + 1) * 3);
  const uvs = new Float32Array((SU + 1) * (SA + 1) * 2);
  const indices: number[] = [];
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let j = 0; j <= SU; j += 1) {
    const t = -1 + (2 * j) / SU;
    const f = Math.pow(Math.max(0, 1 - Math.pow(Math.abs(t), o.endExp)), 1 / o.endExp);
    // roof sags a little toward the ends so the hood and tail slope down
    const roof = f * (1 - 0.18 * t * t);
    for (let i = 0; i <= SA; i += 1) {
      const a = (i / SA) * Math.PI * 2;
      const s = sgnPow(Math.sin(a), 2 / o.sectionExp);
      const c = sgnPow(Math.cos(a), 2 / o.sectionExp);
      const x = o.cx + t * o.halfLength;
      const y = o.cy + (s >= 0 ? o.top * roof : o.bottom * f) * s;
      const z = o.cz + o.halfWidth * f * c;
      const k = j * (SA + 1) + i;
      positions.set([x, y, z], k * 3);
      uvs.set([(i / SA) * (o.uvRepeat ?? 1), (j / SU) * (o.uvRepeat ?? 1)], k * 2);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
      if (i < SA && j < SU) {
        const v = k;
        // winding chosen so faces point outward
        indices.push(v, v + SA + 1, v + 1, v + 1, v + SA + 1, v + SA + 2);
      }
    }
  }
  const normals = geometry.computeNormals({ positions, indices }) as Float32Array;
  // hide the angular seam: average normals of the duplicated first / last ring vertex
  for (let j = 0; j <= SU; j += 1) {
    const a = (j * (SA + 1)) * 3;
    const b = (j * (SA + 1) + SA) * 3;
    for (let d = 0; d < 3; d += 1) {
      const m = (normals[a + d]! + normals[b + d]!) * 0.5;
      normals[a + d] = m;
      normals[b + d] = m;
    }
  }
  return geometry.define({
    positions,
    normals,
    uvs,
    indices,
    bounds: { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] }
  });
}

// ---------- procedural metallic-flake normal map ----------
function makeFlakeNormalMap() {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(size, size);
  let seed = 1337;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let p = 0; p < size * size; p += 1) {
    const nx = (rnd() - 0.5) * 2;
    const ny = (rnd() - 0.5) * 2;
    const nz = Math.sqrt(Math.max(0.05, 1 - 0.5 * (nx * nx + ny * ny)));
    const len = Math.hypot(nx * 0.7, ny * 0.7, nz);
    img.data[p * 4] = Math.round(((nx * 0.7) / len * 0.5 + 0.5) * 255);
    img.data[p * 4 + 1] = Math.round(((ny * 0.7) / len * 0.5 + 0.5) * 255);
    img.data[p * 4 + 2] = Math.round((nz / len * 0.5 + 0.5) * 255);
    img.data[p * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = texture.canvas({ canvas, colorSpace: "linear" });
  tex.wrapS = "repeat";
  tex.wrapT = "repeat";
  return tex;
}

const flake = makeFlakeNormalMap();

// ---------- materials ----------
const candyPaint = material.physical({
  name: "candy-red-paint",
  color: "#b3000f",
  metallic: 0.55,
  roughness: 0.32,
  clearcoat: 1,
  clearcoatRoughness: 0.03,
  normal: flake,
  normalScale: 0.35,
  envMapIntensity: 1.35,
  sheen: 0.2,
  sheenColor: "#ff4a4a",
  sheenRoughness: 0.4
});
const glassMat = material.physical({
  name: "cabin-glass",
  color: "#04060a",
  metallic: 0.2,
  roughness: 0.04,
  clearcoat: 1,
  clearcoatRoughness: 0.01,
  envMapIntensity: 1.5
});
const chromeMat = material.physical({
  name: "chrome",
  color: "#f2f4f8",
  metallic: 1,
  roughness: 0.05,
  envMapIntensity: 1.6
});
const rubberMat = material.pbr({ name: "rubber", color: "#0b0b0d", roughness: 0.78, metallic: 0 });

// ---------- body, cabin, trim ----------
const BODY_CY = 0.64;
const bodyGeo = loft({
  halfLength: 1.5, halfWidth: 0.72, top: 0.42, bottom: 0.3,
  cx: 0, cy: BODY_CY, cz: 0, sectionExp: 3.0, endExp: 2.4, uvRepeat: 6
});
const cabinGeo = loft({
  halfLength: 0.82, halfWidth: 0.56, top: 0.38, bottom: 0.14,
  cx: -0.2, cy: 1.0, cz: 0, sectionExp: 2.4, endExp: 2.1, segU: 56, segA: 40
});
const beltGeo = loft({
  halfLength: 1.508, halfWidth: 0.727, top: 0.016, bottom: 0.016,
  cx: 0, cy: BODY_CY, cz: 0, sectionExp: 3.0, endExp: 2.4, segU: 72, segA: 40
});
const cabinRingGeo = loft({
  halfLength: 0.84, halfWidth: 0.575, top: 0.014, bottom: 0.014,
  cx: -0.2, cy: 0.985, cz: 0, sectionExp: 2.4, endExp: 2.1, segU: 56, segA: 40
});
const noseBarGeo = loft({
  halfLength: 0.06, halfWidth: 0.42, top: 0.035, bottom: 0.035,
  cx: 1.41, cy: 0.5, cz: 0, sectionExp: 3.0, endExp: 2.2, segU: 16, segA: 32
});
const tailBarGeo = loft({
  halfLength: 0.06, halfWidth: 0.42, top: 0.035, bottom: 0.035,
  cx: -1.41, cy: 0.5, cz: 0, sectionExp: 3.0, endExp: 2.2, segU: 16, segA: 32
});

const wheelNodes = [] as ReturnType<typeof primitives.cylinder>[];
const WHEEL_X = [0.88, -0.88];
const WHEEL_Z = [0.78, -0.78];
const WHEEL_R = 0.44;
for (const wx of WHEEL_X) {
  for (const wz of WHEEL_Z) {
    wheelNodes.push(
      primitives
        .cylinder({ name: `tyre-${wx}-${wz}`, size: [WHEEL_R * 2, 0.26, WHEEL_R * 2], material: rubberMat })
        .position(wx, WHEEL_R, wz)
        .rotation(Math.PI / 2, 0, 0) as never
    );
    const side = Math.sign(wz);
    wheelNodes.push(
      primitives
        .cylinder({ name: `hub-${wx}-${wz}`, size: [0.5, 0.03, 0.5], material: chromeMat })
        .position(wx, WHEEL_R, wz + side * 0.135)
        .rotation(Math.PI / 2, 0, 0) as never
    );
    wheelNodes.push(
      primitives
        .cylinder({ name: `cap-${wx}-${wz}`, size: [0.16, 0.05, 0.16], material: rubberMat })
        .position(wx, WHEEL_R, wz + side * 0.15)
        .rotation(Math.PI / 2, 0, 0) as never
    );
  }
}

const carChildren = [
  geometry.custom(bodyGeo, { name: "body", material: candyPaint }),
  geometry.custom(cabinGeo, { name: "cabin", material: glassMat }),
  geometry.custom(beltGeo, { name: "belt-trim", material: chromeMat }),
  geometry.custom(cabinRingGeo, { name: "cabin-trim", material: chromeMat }),
  geometry.custom(noseBarGeo, { name: "nose-bumper", material: chromeMat }),
  geometry.custom(tailBarGeo, { name: "tail-bumper", material: chromeMat }),
  ...wheelNodes
];

const PLATFORM_R = 2.35;

const turntable = groups
  .create("turntable", [
    primitives.cylinder({
      name: "platform-deck",
      size: [PLATFORM_R * 2, 0.08, PLATFORM_R * 2],
      material: material.physical({
        color: "#0c0d11", metallic: 0.6, roughness: 0.18, clearcoat: 0.6, clearcoatRoughness: 0.08, opacity: 0.55, alphaMode: "blend"
      }),
      castShadow: false
    }).position(0, -0.04, 0),
    ...carChildren
  ])
  .runtime({ id: "turntable", mutable: true });

// ---------- scene ----------
const app = createAuraApp("#app", {
  scene: scene({ background: "#030409" })
    .add(environments.studio({ preset: "softbox", intensity: 1.15, background: false, rotation: 0.4 }))
    // long overhead strip lights and side strips
    .add(lights.rect({ name: "strip-top", position: [0, 5.2, 0.6], target: [0, 0.5, 0], width: 1.0, height: 7, intensity: 5, color: "#fff4ea" }))
    .add(lights.rect({ name: "strip-left", position: [-4.6, 3.2, 1.2], target: [0, 0.6, 0], width: 0.7, height: 6, intensity: 4, color: "#ffffff" }))
    .add(lights.rect({ name: "strip-right", position: [4.6, 3.0, -1.5], target: [0, 0.6, 0], width: 0.7, height: 6, intensity: 4, color: "#ffffff" }))
    .add(lights.directional({ name: "rim", position: [-1, 2.5, -6], target: [0, 0.7, 0], intensity: 1.4, color: "#9fc4ff" }))
    .add(lights.key({ name: "key", position: [2.5, 6, 3], target: [0, 0.5, 0], intensity: 1.2, color: "#fff2e4", shadow: true }))
    // faint reflective floor
    .add(surfaces.mirror({ name: "floor-mirror", size: [22, 22], resolution: 512, tint: "#2b2d36", position: [0, -0.03, 0] }))
    // ring light around the platform
    .add(
      primitives.torus({
        name: "ring-light",
        size: PLATFORM_R * 2 + 0.2,
        params: { tubeRadius: 0.012, radialSegments: 12, tubularSegments: 128 } as never,
        material: material.pbr({ color: "#bcd4ff", emissive: "#8fb8ff", emissiveIntensity: 3, roughness: 0.3 }),
        castShadow: false
      }).position(0, 0.0, 0).rotation(Math.PI / 2, 0, 0)
    )
    .add(turntable)
    .camera(camera.perspective({ position: [4.9, 1.5, 6.0], target: [0, 0.62, 0], fov: 33 }))
});

const SPEED_DEG_PER_SEC = 20;
let angleDeg = 0;
window.__TASK_STATE__ = { turntableAngleDeg: 0, paintFinish: "clearcoat" };
let first = true;
app.onFrame((frame) => {
  angleDeg += frame.dt * SPEED_DEG_PER_SEC;
  app.nodes.require("turntable").setRotation(0, (angleDeg * Math.PI) / 180, 0);
  window.__TASK_STATE__ = { turntableAngleDeg: angleDeg, paintFinish: "clearcoat" };
  if (first) {
    first = false;
    window.__EVAL_READY__ = true;
  }
});
void app.ready();
