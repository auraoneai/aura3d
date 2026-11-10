// Desert canyon at dusk: layered sandstone heightfield, boulders and dead shrubs.
// The terrain is periodic in z (PERIOD metres) so a camera that wraps by PERIOD never shows a seam.
export const params = { period: 300, zNear: 20, zFar: -740 };

export default function createScene({ THREE, random, params: p }) {
  const PERIOD = p.period;
  const TAU = Math.PI * 2;
  const U = (z) => (TAU * z) / PERIOD;

  // ---- periodic noise built from sines (integer harmonics in z) ----
  const waves = [];
  for (let i = 0; i < 14; i += 1) {
    waves.push({
      kx: 0.05 + random() * 0.35,
      mz: 1 + Math.floor(random() * 12),
      px: random() * TAU,
      pz: random() * TAU,
      a: 1 / (1 + i * 0.35)
    });
  }
  const noise = (x, z) => {
    let s = 0, n = 0;
    for (const w of waves) { s += w.a * Math.sin(w.kx * x + w.px + 0.7 * Math.sin(U(z) * w.mz + w.pz)) * Math.sin(U(z) * w.mz + w.pz); n += w.a; }
    return s / n * 2.2;
  };

  const center = (z) => 16 * Math.sin(U(z) + 0.5) + 7 * Math.sin(2 * U(z) + 2) + 3 * Math.sin(5 * U(z));
  const halfWidth = (z) => 11 + 3 * Math.sin(3 * U(z) + 1) + 2 * Math.sin(7 * U(z));
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

  function terrace(r, step) {
    const q = r / step;
    const f = Math.floor(q);
    return (f + smooth(0.45, 1.0, q - f)) * step;
  }

  function height(x, z) {
    const dx = x - center(z);
    const s = Math.abs(dx);
    const side = dx < 0 ? -1 : 1;
    const w = halfWidth(z);
    const n = noise(x, z);
    // floor with a shallow dry riverbed that wanders inside the canyon
    const cc = 3 * Math.sin(4 * U(z) + 0.3);
    const bed = -0.55 * Math.exp(-(((dx - cc) / 3.2) ** 2));
    const floorY = bed + 0.12 * n;
    const t = s - w;
    if (t <= 0) return floorY + 0.35 * smooth(w - 3, w, s) * 0; // flat floor
    const hmax = 30 + 9 * Math.sin(2 * U(z) + side * 1.3) + 3 * n;
    const raw = hmax * (1 - Math.exp(-t / 8)) + 2.2 * n + 0.04 * t;
    const step = 4.2 + 1.6 * Math.sin(U(z) * 3 + 2 + raw * 0.05);
    const wall = terrace(Math.max(raw, 0), step);
    const blend = smooth(0, 1.2, t);
    return floorY + (wall + 0.6 * n) * blend;
  }

  // ---- terrain mesh ----
  const DX = 1.25, DZ = 2;
  const XH = 90;
  const cols = Math.round((2 * XH) / DX);
  const rows = Math.round((p.zNear - p.zFar) / DZ);
  const nv = (cols + 1) * (rows + 1);
  const pos = new Float32Array(nv * 3);
  const nor = new Float32Array(nv * 3);
  const col = new Float32Array(nv * 3);
  const idx = new Uint32Array(cols * rows * 6);

  // sandstone strata palette (sRGB hex -> linear via THREE.Color)
  const palette = ["#a64b2a", "#c9733e", "#dba06a", "#8f3f2a", "#e0b985", "#b8643a", "#7d3a2c", "#d28a52"].map((h) => new THREE.Color(h));
  const dust = new THREE.Color("#d9a46d");
  const sand = new THREE.Color("#d8b184");
  const bedC = new THREE.Color("#e6cda4");
  const top = new THREE.Color("#b5703f");
  const shadowC = new THREE.Color("#5a2c26");
  const tmp = new THREE.Color();
  const hash = (i) => { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

  let v = 0;
  for (let j = 0; j <= rows; j += 1) {
    const z = p.zNear - j * DZ;
    const c = center(z);
    for (let i = 0; i <= cols; i += 1) {
      const x = -XH + i * DX + c * 0; // fixed x grid
      const y = height(x, z);
      pos[v * 3] = x; pos[v * 3 + 1] = y; pos[v * 3 + 2] = z;
      const e = 0.5;
      const hx = height(x - e, z) - height(x + e, z);
      const hz = height(x, z - e) - height(x, z + e);
      const l = Math.hypot(hx, 2 * e, hz);
      const ny = (2 * e) / l;
      nor[v * 3] = hx / l; nor[v * 3 + 1] = ny; nor[v * 3 + 2] = hz / l;

      const n = noise(x * 1.7, z * 1.3);
      const band = y * 0.42 + n * 0.6 + Math.sin(U(z) * 2 + x * 0.02) * 0.8;
      const bi = Math.floor(band);
      const f = band - bi;
      const c0 = palette[Math.floor(hash(bi) * palette.length) % palette.length];
      const c1 = palette[Math.floor(hash(bi + 1) * palette.length) % palette.length];
      tmp.copy(c0).lerp(c1, smooth(0.8, 1, f));
      // thin dark seams between layers
      if (f < 0.05) tmp.multiplyScalar(0.8);
      // flat ledges collect dust, floor is sand
      const dxs = Math.abs(x - c) - halfWidth(z);
      const flat = smooth(0.55, 0.9, ny);
      if (dxs > 0 && y > 1) tmp.lerp(dust, flat * 0.7);
      if (y > 36 + 3 * n) tmp.lerp(top, 0.5);
      const floorMix = 1 - smooth(-0.5, 2.5, dxs + y * 0.4);
      const bedMix = Math.exp(-(((x - c - 3 * Math.sin(4 * U(z) + 0.3)) / 3.2) ** 2));
      tmp.lerp(sand, floorMix);
      tmp.lerp(bedC, floorMix * bedMix * 0.8);
      // darker talus at the foot of the walls
      tmp.lerp(shadowC, 0.25 * smooth(2.5, 0.2, dxs) * (dxs > 0 ? 1 : 0));
      const g = 0.93 + 0.14 * hash(v);
      col[v * 3] = tmp.r * g; col[v * 3 + 1] = tmp.g * g; col[v * 3 + 2] = tmp.b * g;
      v += 1;
    }
  }
  let k = 0;
  for (let j = 0; j < rows; j += 1) {
    for (let i = 0; i < cols; i += 1) {
      const a = j * (cols + 1) + i;
      const b = a + 1;
      const c2 = a + cols + 1;
      const d = c2 + 1;
      // counter-clockwise seen from above (+y): a(-x,+z) -> c2(-x,-z) -> b
      idx[k++] = a; idx[k++] = c2; idx[k++] = b;
      idx[k++] = b; idx[k++] = c2; idx[k++] = d;
    }
  }
  const tg = new THREE.BufferGeometry();
  tg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  tg.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  tg.setAttribute("color", new THREE.BufferAttribute(col, 3));
  tg.setIndex(new THREE.BufferAttribute(idx, 1));

  const scene = new THREE.Scene();
  const terrain = new THREE.Mesh(tg, new THREE.MeshStandardMaterial({ name: "sandstone", color: 0xffffff, vertexColors: true, roughness: 0.95, metalness: 0 }));
  terrain.name = "terrain";
  scene.add(terrain);

  // ---- merged props ----
  function makeMerger() {
    const P = [], N = [], C = [];
    return {
      add(geo, matrix, color, jitter = 0.06) {
        const g = geo.index ? geo.toNonIndexed() : geo;
        const m3 = new THREE.Matrix3().getNormalMatrix(matrix);
        const pa = g.attributes.position;
        const na = g.attributes.normal;
        const vtx = new THREE.Vector3();
        const nrm = new THREE.Vector3();
        for (let i = 0; i < pa.count; i += 1) {
          vtx.fromBufferAttribute(pa, i).applyMatrix4(matrix);
          nrm.fromBufferAttribute(na, i).applyMatrix3(m3).normalize();
          P.push(vtx.x, vtx.y, vtx.z); N.push(nrm.x, nrm.y, nrm.z);
          const t = 1 + (hash(i * 3.1 + vtx.x * 7.7) - 0.5) * jitter * 2;
          C.push(color.r * t, color.g * t, color.b * t);
        }
      },
      mesh(name, mat) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
        geo.setAttribute("normal", new THREE.Float32BufferAttribute(N, 3));
        geo.setAttribute("color", new THREE.Float32BufferAttribute(C, 3));
        const m = new THREE.Mesh(geo, mat);
        m.name = name;
        return m;
      }
    };
  }

  const boulders = makeMerger();
  const shrubs = makeMerger();
  const rockColors = ["#a8603a", "#8c5436", "#b9784a", "#7a4a33"].map((h) => new THREE.Color(h));
  const woodColors = ["#5d4a38", "#6b5640", "#4a3b2e"].map((h) => new THREE.Color(h));

  // props for one period, replicated so they repeat with the terrain
  const copies = Math.ceil((p.zNear - p.zFar) / PERIOD) + 1;
  const mtx = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const eul = new THREE.Euler();
  const sc = new THREE.Vector3();
  const ps = new THREE.Vector3();

  const rockBase = new THREE.IcosahedronGeometry(1, 2);
  function rockGeo(seedv) {
    const g = rockBase.clone();
    const pa = g.attributes.position;
    const vt = new THREE.Vector3();
    for (let i = 0; i < pa.count; i += 1) {
      vt.fromBufferAttribute(pa, i);
      // same displacement for coincident vertices keeps the mesh closed
      const d = 1 + 0.28 * Math.sin(vt.x * 2.3 + seedv) * Math.sin(vt.y * 2.1 + seedv * 1.7) + 0.18 * Math.sin(vt.z * 4.1 + seedv * 2.3) + 0.08 * Math.sin((vt.x + vt.y) * 7.0 + seedv);
      vt.multiplyScalar(d);
      pa.setXYZ(i, vt.x, vt.y, vt.z);
    }
    g.computeVertexNormals();
    return g;
  }
  const rockVariants = [rockGeo(1.3), rockGeo(4.1), rockGeo(7.7), rockGeo(2.9)];

  const baseRocks = [];
  for (let i = 0; i < 26; i += 1) {
    const z = -random() * PERIOD;
    const side = random() < 0.5 ? -1 : 1;
    const w = halfWidth(z);
    const off = 4.8 + random() * (w - 5.6);
    const x = center(z) + side * off;
    const big = random() < 0.25;
    const s = big ? 1.6 + random() * 1.8 : 0.4 + random() * 0.9;
    baseRocks.push({ x, z, s, rot: random() * TAU, flat: 0.55 + random() * 0.4, variant: i % 4, color: i % 4 });
  }
  for (let c = 0; c < copies; c += 1) {
    for (const r of baseRocks) {
      const z = r.z - c * PERIOD + PERIOD; // spans zNear .. zFar
      if (z > p.zNear || z < p.zFar) continue;
      const y = height(r.x, z) + r.s * r.flat * 0.35;
      eul.set(0, r.rot, 0);
      q.setFromEuler(eul);
      sc.set(r.s * 1.1, r.s * r.flat, r.s);
      ps.set(r.x, y, z);
      mtx.compose(ps, q, sc);
      boulders.add(rockVariants[r.variant], mtx, rockColors[r.color], 0.08);
    }
  }

  const twig = new THREE.CylinderGeometry(0.5, 1, 1, 5, 1);
  twig.translate(0, 0.5, 0);
  const baseShrubs = [];
  for (let i = 0; i < 22; i += 1) {
    const z = -random() * PERIOD;
    const side = random() < 0.5 ? -1 : 1;
    const w = halfWidth(z);
    const off = 4.2 + random() * (w - 5);
    baseShrubs.push({ x: center(z) + side * off, z, s: 0.7 + random() * 0.9, seed: random() * 1000, color: i % 3 });
  }
  function addBranch(base, dir, len, rad, depth, rnd, colr) {
    const up = new THREE.Vector3(0, 1, 0);
    const qq = new THREE.Quaternion().setFromUnitVectors(up, dir.clone().normalize());
    const m = new THREE.Matrix4().compose(base, qq, new THREE.Vector3(rad, len, rad));
    shrubs.add(twig, m, colr, 0.05);
    if (depth <= 0) return;
    const end = base.clone().addScaledVector(dir.clone().normalize(), len);
    const kids = 2 + Math.floor(rnd() * 2);
    for (let k2 = 0; k2 < kids; k2 += 1) {
      const nd = dir.clone().normalize();
      nd.x += (rnd() - 0.5) * 1.3; nd.z += (rnd() - 0.5) * 1.3; nd.y += (rnd() - 0.3) * 0.5;
      addBranch(end.clone().addScaledVector(dir.clone().normalize(), -len * rnd() * 0.3), nd, len * (0.6 + rnd() * 0.25), rad * 0.6, depth - 1, rnd, colr);
    }
  }
  const lcg = (sd) => { let s = Math.floor(sd) >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); };
  for (let c = 0; c < copies; c += 1) {
    for (const b of baseShrubs) {
      const z = b.z - c * PERIOD + PERIOD;
      if (z > p.zNear || z < p.zFar) continue;
      const rnd = lcg(b.seed);
      const y = height(b.x, z) - 0.05;
      const n = 6 + Math.floor(rnd() * 4);
      for (let k2 = 0; k2 < n; k2 += 1) {
        const a = rnd() * TAU;
        const dir = new THREE.Vector3(Math.cos(a) * (0.5 + rnd() * 0.6), 0.9 + rnd() * 0.8, Math.sin(a) * (0.5 + rnd() * 0.6));
        addBranch(new THREE.Vector3(b.x, y, z), dir, b.s * (0.7 + rnd() * 0.5), 0.035 * b.s + 0.015, 2, rnd, woodColors[b.color]);
      }
    }
  }

  const rockMat = new THREE.MeshStandardMaterial({ name: "boulderStone", color: 0xffffff, vertexColors: true, roughness: 0.92, metalness: 0 });
  const woodMat = new THREE.MeshStandardMaterial({ name: "deadWood", color: 0xffffff, vertexColors: true, roughness: 0.9, metalness: 0 });
  scene.add(boulders.mesh("boulders", rockMat));
  scene.add(shrubs.mesh("shrubs", woodMat));

  const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 900);
  camera.position.set(center(-200), 2.4, -200);

  return { scene, camera, cameraTarget: [center(-225), 4, -225], renderer: { toneMapping: "aces", exposure: 1 } };
}
