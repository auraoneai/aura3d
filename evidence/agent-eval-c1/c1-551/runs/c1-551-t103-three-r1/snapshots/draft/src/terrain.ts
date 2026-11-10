import * as THREE from 'three';

/** Length of one periodic stretch of canyon. The camera loops over exactly this length. */
export const L = 640;
export const K = (Math.PI * 2) / L;
const per = (n: number): number => n * K;

export const SUN = new THREE.Vector3(0.5, 0.19, -0.85).normalize();

function sstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export const center = (z: number): number =>
  26 * Math.sin(per(2) * z + 0.5) + 5 * Math.sin(per(4) * z + 1.3);
export const halfWidth = (z: number): number =>
  15 + 3 * Math.sin(per(7) * z + 2) + 1.5 * Math.sin(per(13) * z + 0.3);
export const channel = (z: number): number => 4 * Math.sin(per(9) * z + 0.7);

function wallH(z: number, side: number): number {
  return (
    24 +
    9 * Math.sin(per(3) * z + side * 2.1) +
    5 * Math.sin(per(11) * z + side * 1.1) +
    3 * Math.sin(per(23) * z + side * 0.7)
  );
}
function wallD(z: number, side: number): number {
  return 9 + 3 * Math.sin(per(6) * z + side);
}
function noise(u: number, z: number): number {
  return (
    0.55 * Math.sin(0.31 * u + per(41) * z + 0.5 + 1.3 * Math.sin(per(17) * z + 0.2 * u)) +
    0.3 * Math.sin(0.83 * u - per(97) * z + 2.0) +
    0.15 * Math.sin(0.17 * u + per(29) * z)
  );
}
function noiseHi(u: number, z: number): number {
  return (
    0.5 * Math.sin(2.1 * u + per(113) * z + 1.0) +
    0.3 * Math.sin(3.3 * u - per(149) * z + 0.4) +
    0.2 * Math.sin(1.3 * u + per(71) * z)
  );
}

/** Smooth floor profile (no ripples), used for the camera height. */
export function floorBase(u: number, z: number): number {
  const d = u - channel(z);
  return 1.5 * Math.sin(per(2) * z + 1) - 0.7 * Math.exp(-(d * d) / 10);
}

/** Terrain height at offset u from the canyon centre line at world z. Periodic in z with period L. */
export function height(u: number, z: number): number {
  let y = floorBase(u, z) + 0.12 * noiseHi(u, z);
  const side = u < 0 ? 0 : 1;
  const a = Math.abs(u);
  const dd = a - halfWidth(z) + 2.5 * noise(u, z);
  if (dd > 0) {
    const hs = wallH(z, side);
    const d = wallD(z, side);
    const t = Math.min(1, dd / d);
    const sm = t * t * (3 - 2 * t);
    const hw = hs * sm;
    const s = hw / 5.5 + 0.35 * noise(u * 0.2 + 3, z);
    const fr = s - Math.floor(s);
    const st = (Math.floor(s) + sstep(0.6, 1.0, fr)) * 5.5;
    const f = sstep(0, 0.25, sm) * (1 - sstep(0.8, 1.0, sm));
    y += hw + (st - hw) * 0.55 * f + 0.9 * noiseHi(u, z) * sm * (1 - sstep(0.85, 1, sm) * 0.7);
  }
  return y;
}

/* ---- Height lookup table used only for sun shadow ray marching ---- */
export const NZ = 400;
export const DZ = L / NZ;
export const U0 = -112;
export const DU = 0.5;
export const NU = 449;

export function buildTable(): Float32Array {
  const t = new Float32Array(NZ * NU);
  for (let iz = 0; iz < NZ; iz++) {
    const z = iz * DZ;
    for (let iu = 0; iu < NU; iu++) t[iz * NU + iu] = height(U0 + iu * DU, z);
  }
  return t;
}

/** Raise a dome (boulder) in the table. x,z are world coordinates, y0 the ground height. */
export function addBump(tab: Float32Array, x: number, z: number, y0: number, r: number, h: number): void {
  const ci = Math.round(z / DZ);
  const n = Math.ceil(r / DZ) + 1;
  for (let k = -n; k <= n; k++) {
    const zz = (ci + k) * DZ;
    const iz = ((ci + k) % NZ + NZ) % NZ;
    const uu = x - center(zz);
    const dz = zz - z;
    const i0 = Math.max(0, Math.floor((uu - r - U0) / DU));
    const i1 = Math.min(NU - 1, Math.ceil((uu + r - U0) / DU));
    for (let iu = i0; iu <= i1; iu++) {
      const dx = U0 + iu * DU - uu;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      const v = y0 + h * Math.sqrt(1 - d2 / (r * r));
      const idx = iz * NU + iu;
      if (v > tab[idx]) tab[idx] = v;
    }
  }
}

function sampleTab(tab: Float32Array, x: number, z: number): number {
  let fu = (x - center(z) - U0) / DU;
  if (fu < 0) fu = 0;
  else if (fu > NU - 1.001) fu = NU - 1.001;
  const fz = z / DZ;
  const k = Math.floor(fz);
  const tz = fz - k;
  const iz0 = ((k % NZ) + NZ) % NZ;
  const iz1 = (iz0 + 1) % NZ;
  const iu0 = Math.floor(fu);
  const tu = fu - iu0;
  const a = tab[iz0 * NU + iu0] * (1 - tu) + tab[iz0 * NU + iu0 + 1] * tu;
  const b = tab[iz1 * NU + iu0] * (1 - tu) + tab[iz1 * NU + iu0 + 1] * tu;
  return a * (1 - tz) + b * tz;
}

/** Soft sun visibility (0 shadow, 1 lit) by marching a ray towards the sun over the table. */
export function visibility(tab: Float32Array, x: number, y: number, z: number): number {
  let t = 0.5;
  let m = 1;
  const sx = SUN.x;
  const sy = SUN.y;
  const sz = SUN.z;
  while (t < 420) {
    const ry = y + sy * t + 0.1;
    if (ry > 47) break;
    const h = sampleTab(tab, x + sx * t, z + sz * t);
    const v = (ry - h) / (0.12 * t + 0.45);
    if (v < m) {
      m = v;
      if (m <= 0) return 0;
    }
    t += Math.max(0.6, t * 0.1);
  }
  return m >= 1 ? 1 : sstep(0, 1, m);
}

/** Build the canyon mesh covering z from +40 down to about -940. */
export function buildTerrain(tab: Float32Array): THREE.BufferGeometry {
  const us: number[] = [];
  for (let u = -110; u < -36; u += 3) us.push(u);
  for (let i = -72; i <= 72; i++) us.push(i * 0.5);
  for (let u = 39; u <= 110; u += 3) us.push(u);
  const kStart = 25;
  const kEnd = -588;
  const nr = kStart - kEnd + 1;
  const nc = us.length;
  const pos = new Float32Array(nr * nc * 3);
  const shade = new Float32Array(nr * nc);
  for (let r = 0; r < nr; r++) {
    const z = (kStart - r) * DZ;
    const c = center(z);
    for (let j = 0; j < nc; j++) {
      const u = us[j];
      const x = c + u;
      const y = height(u, z);
      const i = r * nc + j;
      pos[i * 3] = x;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = z;
      shade[i] = visibility(tab, x, y, z);
    }
  }
  const idx = new Uint32Array((nr - 1) * (nc - 1) * 6);
  let p = 0;
  for (let r = 0; r < nr - 1; r++) {
    for (let j = 0; j < nc - 1; j++) {
      const a = r * nc + j;
      const b = a + 1;
      const d = a + nc;
      const e = d + 1;
      idx[p++] = a;
      idx[p++] = b;
      idx[p++] = e;
      idx[p++] = a;
      idx[p++] = e;
      idx[p++] = d;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aShade', new THREE.BufferAttribute(shade, 1));
  geo.setAttribute('aCol', new THREE.BufferAttribute(new Float32Array(nr * nc * 3), 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  // Make sure the surface faces up; flip the winding if not.
  const nrm = geo.getAttribute('normal');
  const mid = Math.floor(nr / 2) * nc + Math.floor(nc / 2);
  if (nrm.getY(mid) < 0) {
    for (let i = 0; i < idx.length; i += 3) {
      const t = idx[i + 1];
      idx[i + 1] = idx[i + 2];
      idx[i + 2] = t;
    }
    geo.computeVertexNormals();
  }
  geo.computeBoundingSphere();
  return geo;
}
