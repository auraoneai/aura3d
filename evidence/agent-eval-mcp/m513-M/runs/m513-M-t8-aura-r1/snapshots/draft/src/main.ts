import { camera, createAuraApp, environments, geometry, instances, lights, material, scene, sky, type AuraTransformSpec } from "@aura3d/engine";

type V3 = [number, number, number];

// ---------- helpers ----------
const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
const smooth = (a: number, b: number, x: number): number => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
const mix3 = (a: V3, b: V3, t: number): V3 => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const hex = (c: V3): string => {
  const h = (v: number): string => Math.round(clamp01(v) * 255).toString(16).padStart(2, "0");
  return `#${h(c[0])}${h(c[1])}${h(c[2])}`;
};

let seed = 12345;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

// ---------- terrain ----------
const shoreRadius = (ang: number): number => 13 + 1.3 * Math.sin(ang * 3 + 1) + 0.9 * Math.sin(ang * 5 + 2);
const height = (x: number, z: number): number => {
  const r = Math.hypot(x, z);
  const t = r / shoreRadius(Math.atan2(z, x));
  const s = Math.max(1 - t * t, 0);
  const hill = 2.2 * Math.exp(-(((x - 3) ** 2 + (z + 2.5) ** 2) / 14));
  const noise = 0.55 * Math.sin(x * 0.55 + 0.7) * Math.cos(z * 0.5) + 0.3 * Math.sin(x * 1.1 + z * 0.9);
  const land = 4.6 * Math.pow(s, 1.3) + hill * s + noise * Math.min(1, s * 3);
  return Math.max(land - Math.max(t - 1, 0) * 5, -1.5);
};

const GRID = 46;
const SIZE = 46;
const gx = new Float32Array((GRID + 1) ** 2);
const gz = new Float32Array((GRID + 1) ** 2);
const gh = new Float32Array((GRID + 1) ** 2);
for (let j = 0; j <= GRID; j += 1) {
  for (let i = 0; i <= GRID; i += 1) {
    const k = j * (GRID + 1) + i;
    const edge = i === 0 || j === 0 || i === GRID || j === GRID;
    const x = (i / GRID - 0.5) * SIZE + (edge ? 0 : (rand() - 0.5) * 0.7);
    const z = (j / GRID - 0.5) * SIZE + (edge ? 0 : (rand() - 0.5) * 0.7);
    gx[k] = x;
    gz[k] = z;
    gh[k] = height(x, z);
  }
}

const posList: number[] = [];
const nrmList: number[] = [];
const colList: number[] = [];
const idxList: number[] = [];
const faceColor = (h: number): [number, number, number, number] => {
  const v = (rand() - 0.5) * 0.06;
  if (h < -0.1) return [0.52 + v, 0.55 + v, 0.42 + v, 1];
  if (h < 0.75) return [0.87 + v, 0.78 + v, 0.5 + v, 1];
  if (h < 3.0) return [0.22 + v, 0.5 + v * 2, 0.17 + v, 1];
  if (h < 4.3) return [0.45 + v, 0.4 + v, 0.33 + v, 1];
  return [0.62 + v, 0.6 + v, 0.58 + v, 1];
};
const emitTri = (a: number, b: number, c: number): void => {
  let ia = a;
  let ib = b;
  let ic = c;
  const ax = gx[ia] ?? 0, ay = gh[ia] ?? 0, az = gz[ia] ?? 0;
  let bx = gx[ib] ?? 0, by = gh[ib] ?? 0, bz = gz[ib] ?? 0;
  let cx = gx[ic] ?? 0, cy = gh[ic] ?? 0, cz = gz[ic] ?? 0;
  if (ay < -1.2 && by < -1.2 && cy < -1.2) return;
  let ux = bx - ax, uy = by - ay, uz = bz - az;
  let wx = cx - ax, wy = cy - ay, wz = cz - az;
  let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
  if (ny < 0) {
    [ib, ic] = [ic, ib];
    [bx, cx] = [cx, bx];
    [by, cy] = [cy, by];
    [bz, cz] = [cz, bz];
    ux = bx - ax; uy = by - ay; uz = bz - az;
    wx = cx - ax; wy = cy - ay; wz = cz - az;
    nx = uy * wz - uz * wy; ny = uz * wx - ux * wz; nz = ux * wy - uy * wx;
  }
  const len = Math.hypot(nx, ny, nz) || 1;
  const col = faceColor((ay + by + cy) / 3);
  const base = posList.length / 3;
  posList.push(ax, ay, az, bx, by, bz, cx, cy, cz);
  for (let q = 0; q < 3; q += 1) {
    nrmList.push(nx / len, ny / len, nz / len);
    colList.push(...col);
    idxList.push(base + q);
  }
};
for (let j = 0; j < GRID; j += 1) {
  for (let i = 0; i < GRID; i += 1) {
    const a = j * (GRID + 1) + i;
    const b = a + 1;
    const c = a + GRID + 1;
    const d = c + 1;
    if ((i + j) % 2 === 0) {
      emitTri(a, c, b);
      emitTri(b, c, d);
    } else {
      emitTri(a, c, d);
      emitTri(a, d, b);
    }
  }
}

const terrain = geometry.custom(
  geometry.define({
    positions: new Float32Array(posList),
    normals: new Float32Array(nrmList),
    colors: new Float32Array(colList),
    indices: idxList,
    bounds: { min: [-SIZE / 2, -1.6, -SIZE / 2], max: [SIZE / 2, 9, SIZE / 2] }
  }),
  { name: "terrain", material: material.pbr({ color: "#ffffff", roughness: 1 }) }
);

// ---------- trees and rocks ----------
const trunks: AuraTransformSpec[] = [];
const trunkColors: string[] = [];
const crowns: AuraTransformSpec[] = [];
const crownColors: string[] = [];
const placed: Array<[number, number]> = [];
for (let n = 0; n < 600 && placed.length < 34; n += 1) {
  const x = (rand() - 0.5) * 28;
  const z = (rand() - 0.5) * 28;
  const h = height(x, z);
  if (h < 0.9 || h > 3.6) continue;
  if (placed.some(([px, pz]) => Math.hypot(px - x, pz - z) < 2.2)) continue;
  placed.push([x, z]);
  const s = 0.8 + rand() * 0.7;
  const y0 = h - 0.2;
  trunks.push({ position: [x, y0 + 0.5 * s, z], scale: [0.28 * s, 1.0 * s, 0.28 * s] });
  trunkColors.push("#6b4a2b");
  const g = rand();
  const green = g < 0.5 ? "#2f7d3a" : g < 0.8 ? "#3b8f40" : "#276b44";
  crowns.push({ position: [x, y0 + 0.7 * s + 0.9 * s, z], scale: [1.7 * s, 1.8 * s, 1.7 * s], rotation: [0, rand() * 3, 0] });
  crownColors.push(green);
  crowns.push({ position: [x, y0 + 1.6 * s + 0.7 * s, z], scale: [1.2 * s, 1.4 * s, 1.2 * s], rotation: [0, rand() * 3, 0] });
  crownColors.push(green);
}

const rocks: AuraTransformSpec[] = [];
const rockColors: string[] = [];
for (let n = 0; n < 400 && rocks.length < 26; n += 1) {
  const ang = rand() * Math.PI * 2;
  const r = shoreRadius(ang) * (0.55 + rand() * 0.6);
  const x = Math.cos(ang) * r;
  const z = Math.sin(ang) * r;
  const h = height(x, z);
  if (h > 3.4) continue;
  const s = 0.4 + rand() * 0.9;
  rocks.push({ position: [x, Math.max(h, -0.2) + 0.1 * s, z], scale: [s * 1.3, s * 0.9, s], rotation: [rand() * 1.2, rand() * 6, rand() * 1.2] });
  const grey = 0.42 + rand() * 0.2;
  rockColors.push(hex([grey, grey * 0.97, grey * 0.93]));
}

// ---------- water ----------
const WN = 120;
const WSIZE = 320;
const wpos = new Float32Array((WN + 1) ** 2 * 3);
const wnrm = new Float32Array(wpos.length);
const widx: number[] = [];
for (let j = 0; j <= WN; j += 1) {
  for (let i = 0; i <= WN; i += 1) {
    const v = j * (WN + 1) + i;
    const u = (i / WN) * 2 - 1;
    const w = (j / WN) * 2 - 1;
    const stretch = (q: number): number => (WSIZE / 2) * (0.1 * q + 0.9 * q * q * q);
    wpos.set([stretch(u), 0, stretch(w)], v * 3);
    wnrm[v * 3 + 1] = 1;
    if (i < WN && j < WN) widx.push(v, v + WN + 1, v + 1, v + 1, v + WN + 1, v + WN + 2);
  }
}

const waterMaterial = material.custom({
  glsl: {
    vertex: /* glsl */ `
out vec3 vPos;
void main() {
  vec2 p = position.xz;
  float t = waveClock;
  float h = sin(dot(p, vec2(0.30, 0.18)) + t * 1.2) * 0.16
          + sin(dot(p, vec2(-0.22, 0.34)) + t * 1.6) * 0.11
          + sin(dot(p, vec2(0.55, 0.47)) + t * 2.3) * 0.05;
  vec3 wp = vec3(p.x, h, p.y);
  vPos = wp;
  gl_Position = modelViewProjectionMatrix * vec4(wp, 1.0);
}`,
    fragment: /* glsl */ `
in vec3 vPos;
out vec4 outColor;
void main() {
  vec3 n = normalize(cross(dFdx(vPos), dFdy(vPos)));
  if (n.y < 0.0) n = -n;
  vec3 v = normalize(cameraPosition - vPos);
  float d = length(vPos.xz);
  float fres = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 3.0);
  float shore = 1.0 - smoothstep(11.0, 21.0, d);
  vec3 deep = vec3(0.03, 0.24, 0.42);
  vec3 shallow = vec3(0.14, 0.68, 0.70);
  vec3 body = mix(deep, shallow, clamp(shore * 0.85 + vPos.y * 0.8, 0.0, 1.0));
  float light = 0.22 + 0.78 * uDay;
  body *= light;
  vec3 col = mix(body, uSkyCol, clamp(fres * 0.75 + 0.04, 0.0, 1.0));
  float glint = pow(max(dot(reflect(-uSunDir, n), v), 0.0), 60.0);
  col += uSunCol * glint * 1.6;
  float crest = smoothstep(0.2, 0.3, vPos.y);
  col = mix(col, vec3(0.95, 0.98, 1.0) * light, crest * 0.5);
  col = mix(col, uSkyCol, smoothstep(70.0, 150.0, d));
  outColor = vec4(col, 1.0);
}`
  },
  uniforms: {
    waveClock: { type: "f32", value: 0 },
    uDay: { type: "f32", value: 1 },
    uSkyCol: { type: "vec3", value: [0.7, 0.85, 0.95] },
    uSunDir: { type: "vec3", value: [0, 1, 0] },
    uSunCol: { type: "vec3", value: [1, 0.9, 0.7] }
  }
});

// ---------- day / night ----------
const DAY_SECONDS = 20;
const START_HOUR = 9;
const sunAngles = (hour: number): { el: number; az: number } => ({
  el: Math.sin(((hour - 6) / 24) * Math.PI * 2) * 62,
  az: ((hour - 6) / 12) * 180 - 90
});
const lightAt = (el: number, az: number, dist = 40): V3 => {
  const e = (el * Math.PI) / 180;
  const a = (az * Math.PI) / 180;
  return [Math.sin(a) * Math.cos(e) * dist, Math.sin(e) * dist, -Math.cos(a) * Math.cos(e) * dist];
};

const s0 = sunAngles(START_HOUR);
const CAM_DIST = 40;
const camPose = (t: number): { position: V3; target: V3 } => {
  const a = 0.55 * Math.sin(t * 0.16);
  return { position: [Math.sin(a) * CAM_DIST, 12, Math.cos(a) * CAM_DIST], target: [0, 2.2, 0] };
};
const c0 = camPose(0);

async function main(): Promise<void> {
  const app = createAuraApp("#app", {
    scene: scene({ background: "#7aa7d8" })
      .add(sky.preetham({ sun: { elevationDeg: s0.el, azimuthDeg: s0.az, intensity: 1 }, stars: { count: 700 } }))
      .add(environments.neutral({ intensity: 0.25, background: false }))
      .add(lights.hemisphere({ name: "hemi", skyColor: "#bcd6f5", groundColor: "#4a5a3a", intensity: 0.9 }).runtime({ id: "hemi", mutable: true }))
      .add(lights.directional({ name: "sun", position: lightAt(s0.el, s0.az), target: [0, 0, 0], intensity: 3.5, color: "#fff2d8", shadow: true }).runtime({ id: "sun", mutable: true }))
      .add(lights.directional({ name: "moon", position: lightAt(-s0.el, s0.az + 180), target: [0, 0, 0], intensity: 0, color: "#8fb0ff" }).runtime({ id: "moon", mutable: true }))
      .add(terrain)
      .add(instances.cylinder({ name: "trunks", transforms: trunks, colors: trunkColors, material: material.pbr({ color: "#ffffff", roughness: 0.95 }), params: { radialSegments: 5 } }))
      .add(instances.cone({ name: "crowns", transforms: crowns, colors: crownColors, material: material.pbr({ color: "#ffffff", roughness: 0.9 }), params: { radialSegments: 6 } }))
      .add(instances.box({ name: "rocks", transforms: rocks, colors: rockColors, material: material.pbr({ color: "#ffffff", roughness: 1 }) }))
      .add(geometry.custom(
        geometry.define({ positions: wpos, normals: wnrm, indices: widx, bounds: { min: [-WSIZE / 2, -1, -WSIZE / 2], max: [WSIZE / 2, 1, WSIZE / 2] } }),
        { name: "water", material: waterMaterial, castShadow: false }
      ).runtime({ id: "water", mutable: true }))
      .camera(camera.perspective({ position: c0.position, target: c0.target, fov: 55, near: 0.5, far: 600 }))
  });

  const start = performance.now();
  app.onFrame(() => {
    const t = (performance.now() - start) / 1000;
    const hour = (START_HOUR + (t / DAY_SECONDS) * 24) % 24;
    const { el, az } = sunAngles(hour);

    const dayW = smooth(0, 22, el);
    const duskW = smooth(-12, 0, el);
    const sunPos = lightAt(el, az);
    const moonPos = lightAt(-el, az + 180);

    const sun = app.nodes.require("sun");
    sun.setPosition(...sunPos);
    sun.setLight?.({ intensity: 3.6 * smooth(-3, 12, el), color: hex(mix3([1, 0.55, 0.3], [1, 0.96, 0.86], smooth(0, 30, el))) });
    const moon = app.nodes.require("moon");
    moon.setPosition(...moonPos);
    moon.setLight?.({ intensity: 0.2 + 0.7 * (1 - smooth(-6, 6, el)) });
    app.nodes.require("hemi").setLight?.({
      intensity: mix(0.55, 0.95, dayW),
      color: hex(mix3(mix3([0.2, 0.28, 0.5], [0.95, 0.65, 0.5], duskW), [0.74, 0.84, 0.96], dayW))
    });

    app.atmosphere?.setSky({ sun: { elevationDeg: el, azimuthDeg: az, intensity: 1 } });

    // water follows the sky
    const horizon = mix3(mix3([0.05, 0.08, 0.17], [0.92, 0.6, 0.45], duskW), [0.72, 0.85, 0.95], dayW);
    const dir = el >= 0 ? sunPos : moonPos;
    const dl = Math.hypot(dir[0], dir[1], dir[2]) || 1;
    const glintK = el >= 0 ? smooth(0, 10, el) : 0.3 * smooth(0, 10, -el);
    const glintCol = el >= 0 ? mix3([1, 0.6, 0.35], [1, 0.95, 0.8], smooth(0, 30, el)) : ([0.55, 0.65, 1] as V3);
    const water = app.nodes.require("water");
    water.setUniform?.("waveClock", t);
    water.setUniform?.("uDay", mix(0.05, 1, smooth(-8, 14, el)));
    water.setUniform?.("uSkyCol", horizon);
    water.setUniform?.("uSunDir", [dir[0] / dl, dir[1] / dl, dir[2] / dl]);
    water.setUniform?.("uSunCol", [glintCol[0] * glintK, glintCol[1] * glintK, glintCol[2] * glintK]);

    const p = camPose(t);
    app.camera?.setPose({ position: p.position, target: p.target });
  });

  await app.ready();
  requestAnimationFrame(() => {
    (window as unknown as { __EVAL_READY__?: boolean }).__EVAL_READY__ = true;
  });
}

void main();
