import {
  camera,
  createAuraApp,
  effects,
  geometry,
  instances,
  lights,
  material,
  scene,
  sky,
  type AuraTransformSpec
} from "@aura3d/engine";

// ---------------------------------------------------------------- helpers
type V3 = [number, number, number];
const clamp = (x: number, a: number, b: number): number => Math.min(b, Math.max(a, x));
const smooth = (a: number, b: number, x: number): number => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const hexToRgb = (h: string): V3 => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
const mix3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const toHex = (c: V3): string =>
  "#" + c.map((v) => Math.round(clamp(v, 0, 1) * 255).toString(16).padStart(2, "0")).join("");

const hash2 = (i: number, j: number): number => {
  let h = Math.imul(i | 0, 374761393) ^ Math.imul(j | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
let seed = 12345;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

// ---------------------------------------------------------------- terrain
const R = 17; // island radius scale
const TERRAIN = 52; // metres per side
const G = 52; // cells per side (1 m)

const height = (x: number, z: number): number => {
  const r = Math.hypot(x, z) / R;
  const bump = 2.6 * Math.exp(-((x - 2.5) ** 2 + (z + 1.5) ** 2) / 22);
  const wob = 0.55 * Math.sin(x * 0.45 + 1.1) * Math.cos(z * 0.38) + 0.35 * Math.sin(x * 0.9 + z * 0.7);
  const land = smooth(1.15, 0.5, r);
  const h = 5.2 * (1 - r * r) - 1.4 + bump + wob * land;
  return Math.max(h, -3.2);
};

const gridH = new Float32Array((G + 1) * (G + 1));
const gridX = new Float32Array((G + 1) * (G + 1));
const gridZ = new Float32Array((G + 1) * (G + 1));
for (let j = 0; j <= G; j += 1) {
  for (let i = 0; i <= G; i += 1) {
    const v = j * (G + 1) + i;
    const edge = i === 0 || j === 0 || i === G || j === G;
    const jx = edge ? 0 : (hash2(i, j) - 0.5) * 0.75;
    const jz = edge ? 0 : (hash2(i + 91, j + 17) - 0.5) * 0.75;
    const x = (i / G - 0.5) * TERRAIN + jx;
    const z = (j / G - 0.5) * TERRAIN + jz;
    gridX[v] = x;
    gridZ[v] = z;
    gridH[v] = height(x, z);
  }
}

const faceCount = G * G * 2;
const tPos = new Float32Array(faceCount * 9);
const tNor = new Float32Array(faceCount * 9);
const tCol = new Float32Array(faceCount * 3 * 4);
const tIdx: number[] = [];
const sand: V3 = [0.78, 0.68, 0.45];
const grassA: V3 = [0.22, 0.5, 0.16];
const grassB: V3 = [0.36, 0.58, 0.2];
const rockA: V3 = [0.45, 0.4, 0.36];
const snow: V3 = [0.88, 0.9, 0.92];
let face = 0;
const pushFace = (a: number, b: number, c: number): void => {
  const idx = [a, b, c];
  const p: V3[] = idx.map((k) => [gridX[k] ?? 0, gridH[k] ?? 0, gridZ[k] ?? 0] as V3);
  const [pa, pb, pc] = p as [V3, V3, V3];
  const ux = pb[0] - pa[0], uy = pb[1] - pa[1], uz = pb[2] - pa[2];
  const wx = pc[0] - pa[0], wy = pc[1] - pa[1], wz = pc[2] - pa[2];
  let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
  const len = Math.hypot(nx, ny, nz) || 1;
  nx /= len; ny /= len; nz /= len;
  const avg = (pa[1] + pb[1] + pc[1]) / 3;
  const n = hash2(face, 7);
  let col: V3;
  if (avg < 0.45) col = mix3(sand, [0.7, 0.6, 0.4], n);
  else if (avg < 2.7) col = mix3(grassA, grassB, n);
  else if (avg < 4.0) col = mix3(rockA, [0.55, 0.5, 0.45], n);
  else col = mix3(rockA, snow, 0.4 + 0.6 * n);
  if (ny < 0.72 && avg > 0.45) col = mix3(col, rockA, 0.7); // steep faces are rocky
  for (let k = 0; k < 3; k += 1) {
    const base = face * 9 + k * 3;
    const pk = p[k] as V3;
    tPos[base] = pk[0]; tPos[base + 1] = pk[1]; tPos[base + 2] = pk[2];
    tNor[base] = nx; tNor[base + 1] = ny; tNor[base + 2] = nz;
    tCol.set([col[0], col[1], col[2], 1], (face * 3 + k) * 4);
    tIdx.push(face * 3 + k);
  }
  face += 1;
};
for (let j = 0; j < G; j += 1) {
  for (let i = 0; i < G; i += 1) {
    const v = j * (G + 1) + i;
    const a = v, b = v + G + 1, c = v + 1, d = v + G + 2;
    if ((i + j) % 2 === 0) {
      pushFace(a, b, c);
      pushFace(c, b, d);
    } else {
      pushFace(a, b, d);
      pushFace(a, d, c);
    }
  }
}

// ---------------------------------------------------------------- water mesh (uv.x carries terrain height for shore foam)
const WS = 360;
const WN = 240;
const wPos = new Float32Array((WN + 1) ** 2 * 3);
const wNor = new Float32Array(wPos.length);
const wUv = new Float32Array((WN + 1) ** 2 * 2);
const wIdx: number[] = [];
for (let j = 0; j <= WN; j += 1) {
  for (let i = 0; i <= WN; i += 1) {
    const v = j * (WN + 1) + i;
    const x = (i / WN - 0.5) * WS;
    const z = (j / WN - 0.5) * WS;
    wPos.set([x, 0, z], v * 3);
    wNor[v * 3 + 1] = 1;
    wUv[v * 2] = height(x, z);
    wUv[v * 2 + 1] = 0;
    if (i < WN && j < WN) wIdx.push(v, v + WN + 1, v + 1, v + 1, v + WN + 1, v + WN + 2);
  }
}

const waterMat = material.custom({
  glsl: {
    vertex: /* glsl */ `
out vec3 vPos;
out vec3 vNormal;
out vec2 vUv;
vec3 wave(vec2 p, float t, out vec2 slope) {
  float k = 0.5;
  float p1 = dot(p, vec2(0.21, 0.13)) * 3.0 + t * 1.1;
  float p2 = dot(p, vec2(-0.17, 0.25)) * 3.0 + t * 1.4;
  float p3 = dot(p, vec2(0.4, 0.31)) * 3.0 + t * 2.1;
  float h = sin(p1) * 0.35 + sin(p2) * 0.22 + sin(p3) * 0.08;
  slope = k * vec2(
    cos(p1) * 0.35 * 0.63 + cos(p2) * 0.22 * -0.51 + cos(p3) * 0.08 * 1.2,
    cos(p1) * 0.35 * 0.39 + cos(p2) * 0.22 * 0.75 + cos(p3) * 0.08 * 0.93);
  return vec3(p.x, k * h, p.y);
}
void main() {
  vec2 slope;
  vec3 p = wave(position.xz, waveClock, slope);
  vPos = p;
  vUv = uv;
  vNormal = normalize(vec3(-slope.x, 1.0, -slope.y));
  gl_Position = modelViewProjectionMatrix * vec4(p, 1.0);
}`,
    fragment: /* glsl */ `
in vec3 vPos;
in vec3 vNormal;
in vec2 vUv;
out vec4 outColor;
void main() {
  vec3 n = normalize(vNormal);
  vec3 toCam = cameraPosition - vPos;
  float dist = length(toCam.xz);
  vec3 v = normalize(toCam);
  float depth = max(-vUv.x, 0.0);
  float ndv = clamp(dot(n, v), 0.0, 1.0);
  float fresnel = pow(1.0 - ndv, 4.0);

  vec3 deep = vec3(0.02, 0.20, 0.34);
  vec3 shallow = vec3(0.10, 0.62, 0.62);
  vec3 body = mix(shallow, deep, smoothstep(0.0, 3.2, depth));
  float diffuse = max(dot(n, normalize(keyDir)), 0.0);
  body *= ambientCol + keyCol * diffuse * 0.5;

  vec3 col = mix(body, skyZenith, clamp(fresnel * 0.85 + 0.06, 0.0, 1.0));
  float glint = pow(max(dot(reflect(-normalize(keyDir), n), v), 0.0), 90.0);
  col += keyCol * glint * 1.2;

  // animated shoreline foam
  float wob = sin(waveClock * 1.6 + vPos.x * 0.9 + vPos.z * 0.7) * 0.18 + sin(waveClock * 2.3 - vPos.x * 0.5 + vPos.z * 1.1) * 0.1;
  float foam = 1.0 - smoothstep(0.12, 0.5, depth + wob);
  foam *= step(-0.2, vUv.x * -1.0 + 0.0 + 0.2); // only near/under water level
  float ripple = 0.5 + 0.5 * sin(depth * 9.0 - waveClock * 2.0);
  float foamBand = (1.0 - smoothstep(0.5, 1.3, depth)) * smoothstep(0.1, 0.0, abs(ripple - 0.9)) * 0.5;
  col = mix(col, (ambientCol + keyCol * 0.5) * 1.1, clamp(foam * 0.85 + foamBand, 0.0, 1.0));

  // fade into the horizon colour
  col = mix(col, skyHorizon, smoothstep(90.0, 170.0, dist));
  outColor = vec4(col, 1.0);
}`
  },
  uniforms: {
    waveClock: { type: "f32", value: 0 },
    keyDir: { type: "vec3", value: [0.5, 0.6, 0.4] },
    keyCol: { type: "vec3", value: [1, 0.95, 0.85] },
    ambientCol: { type: "vec3", value: [0.6, 0.65, 0.75] },
    skyZenith: { type: "vec3", value: [0.3, 0.55, 0.85] },
    skyHorizon: { type: "vec3", value: [0.72, 0.84, 0.93] }
  }
});

// ---------------------------------------------------------------- props: trees and rocks
const trunks: AuraTransformSpec[] = [];
const lowCrowns: AuraTransformSpec[] = [];
const highCrowns: AuraTransformSpec[] = [];
const rocks: AuraTransformSpec[] = [];
let tries = 0;
while (trunks.length < 22 && tries < 2000) {
  tries += 1;
  const a = rand() * Math.PI * 2;
  const r = 2 + rand() * 13;
  const x = Math.cos(a) * r, z = Math.sin(a) * r;
  const h = height(x, z);
  if (h < 0.9 || h > 3.4) continue;
  if (Math.hypot(height(x + 0.8, z) - h, height(x, z + 0.8) - h) > 1.1) continue;
  if (trunks.some((t) => Math.hypot((t.position?.[0] ?? 0) - x, (t.position?.[2] ?? 0) - z) < 2.2)) continue;
  const s = 0.8 + rand() * 0.6;
  trunks.push({ position: [x, h + 0.55 * s, z], scale: [0.3 * s, 1.5 * s, 0.3 * s] });
  lowCrowns.push({ position: [x, h + 1.9 * s, z], scale: [2.0 * s, 2.3 * s, 2.0 * s], rotation: [0, rand() * 3, 0] });
  highCrowns.push({ position: [x, h + 3.0 * s, z], scale: [1.5 * s, 1.9 * s, 1.5 * s], rotation: [0, rand() * 3, 0] });
}
tries = 0;
while (rocks.length < 14 && tries < 2000) {
  tries += 1;
  const a = rand() * Math.PI * 2;
  const r = 6 + rand() * 11;
  const x = Math.cos(a) * r, z = Math.sin(a) * r;
  const h = height(x, z);
  if (h < -0.3 || h > 1.6) continue;
  const s = 0.5 + rand() * 0.9;
  rocks.push({ position: [x, h + 0.15 * s, z], scale: [s * 1.3, s * 0.85, s], rotation: [rand() * 1.5, rand() * 6, rand() * 1.5] });
}

// ---------------------------------------------------------------- day / night
const DAY_SECONDS = 20;
const START_HOUR = 9;
const hourAt = (clock: number): number => (START_HOUR + (clock / DAY_SECONDS) * 24) % 24;
const sunAngles = (hour: number): { elevationDeg: number; azimuthDeg: number } => ({
  elevationDeg: Math.sin(((hour - 6) / 24) * Math.PI * 2) * 62,
  azimuthDeg: 90 + ((hour - 6) / 12) * 180
});
const lightAt = (elevationDeg: number, azimuthDeg: number, distance = 45): V3 => {
  const e = (elevationDeg * Math.PI) / 180, a = (azimuthDeg * Math.PI) / 180;
  return [Math.sin(a) * Math.cos(e) * distance, Math.sin(e) * distance, -Math.cos(a) * Math.cos(e) * distance];
};

const C = {
  horizonDay: hexToRgb("#bfd8ee"),
  horizonNight: hexToRgb("#10193a"),
  horizonDusk: hexToRgb("#f2a678"),
  zenithDay: hexToRgb("#4a8fdc"),
  zenithNight: hexToRgb("#080e26"),
  sunDay: hexToRgb("#fff1d6"),
  sunDusk: hexToRgb("#ff9650"),
  moon: hexToRgb("#8fb0ff"),
  hemiDaySky: hexToRgb("#b8d0f0"),
  hemiNightSky: hexToRgb("#3c4f96")
};

const h0 = hourAt(0);
const s0 = sunAngles(h0);
const camAt = (t: number): { position: V3; target: V3 } => {
  const ang = 0.6 + t * 0.07;
  const d = 40;
  return { position: [Math.cos(ang) * d, 18, Math.sin(ang) * d], target: [0, 0.8, 0] };
};
const cam0 = camAt(0);

const app = createAuraApp("#app", {
  scene: scene({ background: "#7aa7d8" })
    .add(sky.preetham({ sun: { ...s0, intensity: 1 }, stars: { count: 700 } }))
    .add(lights.hemisphere({ name: "hemi", skyColor: "#b8d0f0", groundColor: "#3d4a30", intensity: 1.0 }).runtime({ id: "hemi", mutable: true }))
    .add(lights.directional({ name: "sun", position: lightAt(s0.elevationDeg, s0.azimuthDeg), target: [0, 0, 0], intensity: 3.5, color: "#fff1d6", shadow: true }).runtime({ id: "sun", mutable: true }))
    .add(lights.directional({ name: "moon", position: lightAt(-s0.elevationDeg, s0.azimuthDeg + 180), target: [0, 0, 0], intensity: 0.1, color: "#8fb0ff" }).runtime({ id: "moon", mutable: true }))
    .add(geometry.custom(
      geometry.define({
        positions: tPos,
        normals: tNor,
        colors: tCol,
        indices: tIdx,
        bounds: { min: [-TERRAIN / 2, -4, -TERRAIN / 2], max: [TERRAIN / 2, 8, TERRAIN / 2] }
      }),
      { name: "island", material: material.pbr({ color: "#ffffff", roughness: 0.95 }) }
    ))
    .add(geometry.custom(
      geometry.define({
        positions: wPos,
        normals: wNor,
        uvs: wUv,
        indices: wIdx,
        bounds: { min: [-WS / 2, -2, -WS / 2], max: [WS / 2, 2, WS / 2] }
      }),
      { name: "water", material: waterMat, castShadow: false, receiveShadow: false }
    ).runtime({ id: "water", mutable: true }))
    .add(instances.cylinder({ name: "trunks", transforms: trunks, material: material.pbr({ color: "#5a3d24", roughness: 0.95 }), params: { radialSegments: 5 } }))
    .add(instances.cone({ name: "crowns-low", transforms: lowCrowns, material: material.pbr({ color: "#2c6a36", roughness: 0.9 }), params: { radialSegments: 6 } }))
    .add(instances.cone({ name: "crowns-high", transforms: highCrowns, material: material.pbr({ color: "#3a7d3e", roughness: 0.9 }), params: { radialSegments: 6 } }))
    .add(instances.box({ name: "rocks", transforms: rocks, material: material.pbr({ color: "#7d7a76", roughness: 1 }) }))
    .add(effects.fog({ color: "#bfd8ee", density: 0.002 }))
    .camera(camera.perspective({ position: cam0.position, target: cam0.target, fov: 45, near: 0.5, far: 700 }))
});

let clock = 0;
let fogTimer = 0;
app.onFrame((frame) => {
  clock += frame.dt;
  const hour = hourAt(clock);
  const s = sunAngles(hour);
  const sinE = Math.sin((s.elevationDeg * Math.PI) / 180);
  const dayAmt = smooth(-0.12, 0.3, sinE);
  const dusk = Math.exp(-((sinE / 0.22) ** 2)) * (1 - 0.0);

  const sunPos = lightAt(s.elevationDeg, s.azimuthDeg);
  const moonPos = lightAt(-s.elevationDeg, s.azimuthDeg + 180);
  const sunCol = mix3(C.sunDay, C.sunDusk, dusk);
  const sunInt = 3.6 * smooth(-0.03, 0.35, sinE);
  const moonInt = 0.15 + 0.65 * (1 - dayAmt);
  app.nodes.require("sun").setPosition(...sunPos);
  app.nodes.require("sun").setLight?.({ intensity: sunInt, color: toHex(sunCol) });
  app.nodes.require("moon").setPosition(...moonPos);
  app.nodes.require("moon").setLight?.({ intensity: moonInt });
  app.nodes.require("hemi").setLight?.({ intensity: 0.45 + 0.65 * dayAmt, color: toHex(mix3(C.hemiNightSky, C.hemiDaySky, dayAmt)) });
  app.atmosphere?.setSky({ sun: { ...s, intensity: 1 } });

  const horizon = mix3(mix3(C.horizonNight, C.horizonDay, dayAmt), C.horizonDusk, dusk * 0.6);
  const zenith = mix3(C.zenithNight, C.zenithDay, dayAmt);
  fogTimer += frame.dt;
  if (fogTimer > 0.1) {
    fogTimer = 0;
    app.atmosphere?.setFog({ color: toHex(horizon) });
  }

  // water follows the sun by day and the moon by night
  const keyIsSun = sinE > -0.05;
  const kp = keyIsSun ? sunPos : moonPos;
  const kl = Math.hypot(kp[0], kp[1], kp[2]) || 1;
  const keyStrength = keyIsSun ? sunInt / 3.6 : moonInt;
  const keyColor = keyIsSun ? sunCol : C.moon;
  const water = app.nodes.require("water");
  water.setUniform?.("waveClock", clock);
  water.setUniform?.("keyDir", [kp[0] / kl, Math.max(kp[1] / kl, 0.08), kp[2] / kl]);
  water.setUniform?.("keyCol", [keyColor[0] * keyStrength, keyColor[1] * keyStrength, keyColor[2] * keyStrength]);
  const amb = 0.28 + 0.72 * dayAmt;
  water.setUniform?.("ambientCol", [amb * (0.55 + 0.1 * dayAmt), amb * 0.6, amb * 0.75]);
  water.setUniform?.("skyZenith", zenith);
  water.setUniform?.("skyHorizon", horizon);

  // slow orbit around the island
  const c = camAt(clock);
  app.camera?.setPose({ position: c.position, target: c.target }, { cut: true });
});

await app.ready();
requestAnimationFrame(() => {
  (window as unknown as { __EVAL_READY__?: boolean }).__EVAL_READY__ = true;
});
