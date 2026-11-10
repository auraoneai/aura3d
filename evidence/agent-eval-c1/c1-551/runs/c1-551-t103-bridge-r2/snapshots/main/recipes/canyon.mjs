// Desert canyon: terrain heightfield with vertex-coloured sandstone strata, scattered boulders and dead shrubs.
// Everything is periodic in z (period P) so the camera can loop along the canyon without a visible seam.
export const params = { period: 200, cols: 190, spacing: 1.0 };

export default function createScene({ THREE, random, params: p }) {
  const P = p.period;
  const K = (Math.PI * 2) / P;
  const sz = (n, z, ph) => Math.sin(n * K * z + ph);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

  // z-periodic pseudo noise in about [-1, 1]
  const noise = (x, z) =>
    0.4 * Math.sin(0.11 * x + 0.9) * sz(3, z, 0.4) +
    0.3 * Math.sin(0.23 * x - 1.7) * sz(7, z, 2.2) +
    0.2 * Math.sin(0.47 * x + 2.4) * sz(13, z, 5.1) +
    0.1 * Math.sin(0.93 * x - 0.3) * sz(29, z, 1.3);

  const cx = (z) => 12 * sz(1, z, 0.6) + 4 * sz(2, z, 2.0) + 1.5 * sz(3, z, 1.0);
  const halfWidth = (z, side) => 9.5 + 2.5 * sz(3, z, 0.3 + side) + 1.5 * sz(5, z, 2.0) + side * 1.2 * sz(2, z, 4.0);
  const riverX = (z) => cx(z) + 2.6 * sz(4, z, 0.5);

  const LAYERS = 9;
  function terrainH(x, z) {
    const d = x - cx(z);
    const side = d >= 0 ? 1 : -1;
    const a = Math.abs(d);
    const w = halfWidth(z, side);
    const u = Math.max(0, a - w + 1.6 * noise(x * 1.3, z));
    const W = 16 + 4 * sz(2, z, side);
    const t = u / W;
    const tt = Math.pow(clamp(t + 0.05 * noise(x * 0.7, z * 1.0), 0, 1), 1.12);
    const s = tt * LAYERS;
    const i = Math.floor(s);
    const f = s - i;
    const stair = (i + smooth(0.35, 1.0, f)) / LAYERS;
    const Hmax = 34 + 5 * sz(2, z, 1.0) + side * 2.5 * sz(3, z, 0.2);
    const talus = 2.4 * (1 - Math.exp(-u / 3));
    const plateau = smooth(0.9, 1.3, t) * (2.5 * noise(x * 0.6, z) + 0.05 * (u - W));
    const floorW = 1 - smooth(0, 3, u);
    const cd = x - riverX(z);
    const dip = -0.55 * Math.exp(-(cd * cd) / (2.2 * 2.2));
    const floor = (0.3 * noise(x * 0.8, z * 1.0) + dip) * floorW;
    return floor + talus + stair * Hmax + plateau;
  }
  const hash = (n) => { let h = (n * 2654435761) >>> 0; h ^= h >>> 13; h = Math.imul(h, 1274126177) >>> 0; return (h >>> 0) / 4294967295; };

  const sand = new THREE.Color("#d9b184");
  const riverSand = new THREE.Color("#cdb496");
  const plateauCol = new THREE.Color("#a5623c");
  const palette = ["#c2703d", "#a44f2e", "#d9a066", "#b5633a", "#e0b887", "#8c4632", "#cf8a52", "#9b4a36", "#d8a878", "#b8704a"].map((c) => new THREE.Color(c));

  // ---------------- terrain ----------------
  const dz = P / 128;
  const rowsBefore = 16, rowsAfter = 256;
  const rows = rowsBefore + rowsAfter + 1;
  const cols = p.cols;
  const dx = p.spacing;
  const positions = new Float32Array(rows * (cols + 1) * 3);
  const colors = new Float32Array(rows * (cols + 1) * 3);
  const indices = [];
  const hAt = new Float32Array(rows * (cols + 1));
  for (let j = 0; j < rows; j++) {
    const z = (j - rowsBefore) * dz;
    for (let i = 0; i <= cols; i++) {
      const x = (i - cols / 2) * dx;
      const h = terrainH(x, z);
      const v = j * (cols + 1) + i;
      positions[v * 3] = x; positions[v * 3 + 1] = h; positions[v * 3 + 2] = z;
      hAt[v] = h;
      if (i < cols && j < rows - 1) indices.push(v, v + cols + 1, v + 1, v + 1, v + cols + 1, v + cols + 2);
    }
  }
  const tg = new THREE.BufferGeometry();
  tg.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  tg.setIndex(indices);
  tg.computeVertexNormals();
  const nrm = tg.getAttribute("normal");
  const tmp = new THREE.Color();
  for (let v = 0; v < rows * (cols + 1); v++) {
    const x = positions[v * 3], h = positions[v * 3 + 1], z = positions[v * 3 + 2];
    const d = x - cx(z);
    const a = Math.abs(d);
    const w = halfWidth(z, d >= 0 ? 1 : -1);
    const u = Math.max(0, a - w);
    const band = Math.floor((h + 1.1 * noise(x * 0.5, z * 1.3)) / 2.7);
    const c1 = palette[Math.floor(hash(band + 17) * palette.length) % palette.length];
    tmp.copy(c1);
    const grain = 0.92 + 0.16 * hash(Math.floor(x * 3) * 131 + Math.floor(z * 3) * 7919);
    tmp.multiplyScalar(grain);
    // flat ledges collect pale dust
    const flat = smooth(0.78, 0.95, nrm.getY(v));
    tmp.lerp(sand, 0.55 * flat * smooth(1.5, 4, u + h * 0.1));
    // plateau cap
    tmp.lerp(plateauCol, smooth(0.8, 1.0, h / 34) * 0.7);
    // floor sand and river bed
    const floorW = 1 - smooth(0.2, 3.0, u);
    const rd = Math.abs(x - riverX(z));
    const riverW = (1 - smooth(1.2, 3.2, rd)) * floorW;
    tmp.lerp(sand, floorW * 0.92);
    tmp.lerp(riverSand, riverW * 0.8);
    tmp.multiplyScalar(0.9 + 0.1 * smooth(0, 6, u));
    colors[v * 3] = tmp.r; colors[v * 3 + 1] = tmp.g; colors[v * 3 + 2] = tmp.b;
  }
  tg.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const terrain = new THREE.Mesh(tg, new THREE.MeshStandardMaterial({ name: "sandstone", color: 0xffffff, vertexColors: true, roughness: 0.95, metalness: 0 }));
  terrain.name = "terrain";

  // ---------------- props ----------------
  const zMin = -rowsBefore * dz, zMax = rowsAfter * dz;
  const floorY = (x, z) => terrainH(x, z);

  const pos = [], nor = [], col = [];
  const addGeo = (g, matrix, color) => {
    let ng = g.index ? g.toNonIndexed() : g.clone();
    ng.applyMatrix4(matrix);
    const pa = ng.getAttribute("position"), na = ng.getAttribute("normal");
    for (let i = 0; i < pa.count; i++) {
      pos.push(pa.getX(i), pa.getY(i), pa.getZ(i));
      nor.push(na.getX(i), na.getY(i), na.getZ(i));
      col.push(color.r, color.g, color.b);
    }
  };

  // rock definitions generated once, then repeated every period so the loop is seamless
  const rockDefs = [];
  for (let k = 0; k < 22; k++) {
    const side = random() < 0.5 ? -1 : 1;
    const z = random() * P;
    const big = random() < 0.3;
    const size = big ? 1.3 + random() * 1.0 : 0.5 + random() * 0.9;
    const off = 6.2 + random() * 4.5;
    rockDefs.push({ z, side, size, off, seed: random() * 100, rot: random() * 6.28, sy: 0.6 + random() * 0.35, tone: 0.8 + random() * 0.35, warm: random() });
  }
  for (let k = 0; k < 50; k++) {
    const side = random() < 0.5 ? -1 : 1;
    rockDefs.push({ z: random() * P, side, size: 0.12 + random() * 0.3, off: 3.2 + random() * 8, seed: random() * 100, rot: random() * 6.28, sy: 0.6, tone: 0.8 + random() * 0.3, warm: random(), small: true });
  }
  const rockBase = new THREE.Color("#8d5a40");
  const rockAlt = new THREE.Color("#b07a52");
  const rockColor = new THREE.Color();
  const ico2 = new THREE.IcosahedronGeometry(1, 2);
  const ico0 = new THREE.IcosahedronGeometry(1, 1);
  const rockMatrix = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const s3 = new THREE.Vector3();
  const p3 = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const rockGeoCache = new Map();
  const rockGeo = (def) => {
    const key = def.seed;
    if (rockGeoCache.has(key)) return rockGeoCache.get(key);
    const g = (def.small ? ico0 : ico2).clone();
    const pa = g.getAttribute("position");
    for (let i = 0; i < pa.count; i++) {
      const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i);
      const n = 0.5 * Math.sin(x * 2.3 + def.seed) * Math.sin(y * 2.1 + def.seed * 1.7) + 0.35 * Math.sin(z * 3.7 + def.seed * 0.6) * Math.sin(x * 3.1 - y * 2.9) + 0.2 * Math.sin((x + y + z) * 5.3 + def.seed);
      const r = 1 + 0.28 * n;
      pa.setXYZ(i, x * r, Math.max(y * r, -0.45), z * r);
    }
    const ng = g.toNonIndexed();
    ng.computeVertexNormals();
    // average normals of coincident vertices so rocks shade smoothly
    const na = ng.getAttribute("normal"), pb = ng.getAttribute("position");
    const acc = new Map();
    const keyOf = (i) => `${Math.round(pb.getX(i) * 1e3)},${Math.round(pb.getY(i) * 1e3)},${Math.round(pb.getZ(i) * 1e3)}`;
    for (let i = 0; i < na.count; i++) {
      const k = keyOf(i);
      const a = acc.get(k) || [0, 0, 0];
      a[0] += na.getX(i); a[1] += na.getY(i); a[2] += na.getZ(i);
      acc.set(k, a);
    }
    for (let i = 0; i < na.count; i++) {
      const a = acc.get(keyOf(i));
      const l = Math.hypot(a[0], a[1], a[2]) || 1;
      na.setXYZ(i, a[0] / l, a[1] / l, a[2] / l);
    }
    rockGeoCache.set(key, ng);
    return ng;
  };
  const copyOffsets = [-P, 0, P, 2 * P];
  for (const def of rockDefs) {
    for (const off of copyOffsets) {
      const z = def.z + off;
      if (z < zMin + 4 || z > zMax - 4) continue;
      const x = cx(z) + def.side * def.off;
      const y = floorY(x, z);
      e.set(0, def.rot, 0);
      q.setFromEuler(e);
      s3.set(def.size * 1.15, def.size * def.sy, def.size);
      p3.set(x, y + def.size * def.sy * 0.18, z);
      rockMatrix.compose(p3, q, s3);
      rockColor.copy(rockBase).lerp(rockAlt, def.warm).multiplyScalar(def.tone);
      addGeo(rockGeo(def), rockMatrix, rockColor);
    }
  }
  const rocksGeom = new THREE.BufferGeometry();
  rocksGeom.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  rocksGeom.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  rocksGeom.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  const rocks = new THREE.Mesh(rocksGeom, new THREE.MeshStandardMaterial({ name: "boulder", color: 0xffffff, vertexColors: true, roughness: 0.92, metalness: 0 }));
  rocks.name = "boulders";

  // dead shrubs: bundles of thin tapered twigs
  pos.length = 0; nor.length = 0; col.length = 0;
  const shrubDefs = [];
  for (let k = 0; k < 16; k++) {
    shrubDefs.push({ z: random() * P, side: random() < 0.5 ? -1 : 1, off: 3.8 + random() * 6, scale: 0.7 + random() * 0.9, branches: 7 + Math.floor(random() * 6), seed: random() * 1000 });
  }
  const twig = new THREE.CylinderGeometry(0.012, 0.03, 1, 4, 1);
  twig.translate(0, 0.5, 0);
  const twigColor = new THREE.Color();
  const dirV = new THREE.Vector3();
  const mat = new THREE.Matrix4();
  const qa = new THREE.Quaternion();
  const addTwig = (origin, dir, len, thick, color) => {
    qa.setFromUnitVectors(up, dir);
    s3.set(thick, len, thick);
    mat.compose(origin, qa, s3);
    addGeo(twig, mat, color);
  };
  for (const def of shrubDefs) {
    for (const off of copyOffsets) {
      const z = def.z + off;
      if (z < zMin + 4 || z > zMax - 4) continue;
      const x = cx(z) + def.side * def.off;
      const base = new THREE.Vector3(x, floorY(x, z) - 0.03, z);
      let st = def.seed;
      const rnd = () => { st = (st * 16807 + 11) % 2147483647; return st / 2147483647; };
      for (let b = 0; b < def.branches; b++) {
        const ang = rnd() * Math.PI * 2;
        const lean = 0.25 + rnd() * 0.9;
        dirV.set(Math.cos(ang) * Math.sin(lean), Math.cos(lean), Math.sin(ang) * Math.sin(lean)).normalize();
        const len = (0.6 + rnd() * 0.7) * def.scale;
        twigColor.set("#4f3b2c").lerp(new THREE.Color("#8a7761"), rnd() * 0.6);
        addTwig(base, dirV.clone(), len, def.scale * (2 + rnd() * 1.5), twigColor);
        const tip = base.clone().addScaledVector(dirV, len * 0.9);
        const subs = 2 + Math.floor(rnd() * 3);
        for (let sidx = 0; sidx < subs; sidx++) {
          const a2 = rnd() * Math.PI * 2;
          const l2 = 0.45 + rnd() * 0.5;
          const d2 = new THREE.Vector3(Math.cos(a2) * Math.sin(l2), Math.cos(l2) * 0.8 + 0.25, Math.sin(a2) * Math.sin(l2)).add(dirV).normalize();
          const from = base.clone().addScaledVector(dirV, len * (0.45 + rnd() * 0.5));
          addTwig(from, d2, len * (0.35 + rnd() * 0.3), def.scale * 1.4, twigColor);
        }
        void tip;
      }
    }
  }
  const shrubGeom = new THREE.BufferGeometry();
  shrubGeom.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  shrubGeom.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  shrubGeom.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  const shrubs = new THREE.Mesh(shrubGeom, new THREE.MeshStandardMaterial({ name: "deadwood", color: 0xffffff, vertexColors: true, roughness: 0.9, metalness: 0, side: THREE.DoubleSide }));
  shrubs.name = "shrubs";

  const scene = new THREE.Scene();
  const group = new THREE.Group();
  group.name = "canyon";
  group.add(terrain, rocks, shrubs);
  scene.add(group);

  const camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.3, 700);
  camera.position.set(cx(0), 1.8, 0);
  camera.lookAt(cx(12), 4, 12);

  return { scene, camera, cameraTarget: [cx(12), 4, 12], renderer: { toneMapping: "aces", exposure: 1 } };
}
