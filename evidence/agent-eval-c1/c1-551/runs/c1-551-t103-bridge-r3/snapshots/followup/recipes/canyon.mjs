// Desert canyon: sandstone terrain (vertex coloured), boulders and dead shrubs.
// The whole terrain is periodic in z with period PERIOD so the camera can loop seamlessly.
export const params = { period: 240 };

export default function createScene({ THREE, random, params: p }) {
  const P = p.period;
  const K = (Math.PI * 2) / P;
  const smooth = (a, b, x) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };

  // ---- canyon layout (u = lateral offset from the winding centre line) -----------------------
  const centre = (z) => 9 * Math.sin(K * z + 0.4) + 4 * Math.sin(2 * K * z + 1.7);
  const half = (z) => 20 + 4 * Math.sin(3 * K * z + 0.9) + 2 * Math.sin(K * z + 2.0);
  const riverU = (z) => 3.5 * Math.sin(2 * K * z + 2.0);
  const camU = (z) => 5 * Math.sin(3 * K * z + 0.3); // keep in sync with src/main.ts

  const nA = (u, z) => Math.sin(0.21 * u + 5 * K * z + 1.3);
  const nB = (u, z) => Math.sin(0.37 * u - 8 * K * z + 0.4);
  const nC = (u, z) => Math.sin(0.71 * u + 13 * K * z + 2.2);
  const nD = (u, z) => Math.sin(1.7 * u + 29 * K * z + 0.7) * Math.sin(1.3 * u - 17 * K * z);

  const wallT = (u, z) => Math.max(0, Math.abs(u) - half(z) + 2.2 * (nA(u, z) + 0.6 * nB(u, z)));

  const STEP = 4.4;
  const heightAt = (u, z) => {
    const t = wallT(u, z);
    const rv = u - riverU(z);
    let floor = 0.22 * nB(u, z) + 0.12 * nD(u, z) - 0.55 * Math.exp(-(rv * rv) / 14);
    if (t <= 0) return floor;
    const hmax = 32 + 6 * Math.sin(2 * K * z + 0.6) + 0.12 * t;
    const raw = hmax * (1 - Math.exp(-t / 13)) * (0.88 + 0.12 * nC(u, z));
    const q = raw / STEP;
    const fl = Math.floor(q);
    const fr = q - fl;
    const stepped = (fl + smooth(0.35, 1.0, fr)) * STEP;
    const rough = Math.min(1, t / 4);
    return floor + stepped + rough * (0.4 * nC(u, z) + 0.18 * nD(u, z));
  };

  // ---- terrain mesh (grid follows the canyon centre line) -------------------------------------
  const U_HALF = 72;
  const DU = 1.3;
  const DZ = 1.3;
  const Z_NEAR = 40;
  const Z_FAR = -(P + 300);
  const cols = Math.round((U_HALF * 2) / DU);
  const rows = Math.round((Z_NEAR - Z_FAR) / DZ);
  const nv = (cols + 1) * (rows + 1);
  const positions = new Float32Array(nv * 3);
  const colors = new Float32Array(nv * 3);
  const index = [];
  const us = new Float32Array(nv);
  const zs = new Float32Array(nv);
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i <= cols; i++) {
      const v = j * (cols + 1) + i;
      const u = -U_HALF + (i * 2 * U_HALF) / cols;
      const z = Z_NEAR - (j * (Z_NEAR - Z_FAR)) / rows;
      positions[v * 3] = centre(z) + u;
      positions[v * 3 + 1] = heightAt(u, z);
      positions[v * 3 + 2] = z;
      us[v] = u;
      zs[v] = z;
      if (i < cols && j < rows) {
        const a = v, b = v + 1, c = v + cols + 1, d = v + cols + 2;
        // counter-clockwise seen from +y (z decreases with j)
        index.push(a, b, c, b, d, c);
      }
    }
  }
  const tgeo = new THREE.BufferGeometry();
  tgeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  tgeo.setIndex(index);
  tgeo.computeVertexNormals();
  const nrm = tgeo.getAttribute("normal");

  const pal = ["#a8452a", "#d2824a", "#e3b27c", "#8e4436", "#c97a58", "#ecd0a4", "#b9623a"].map((c) => new THREE.Color(c));
  const sand = new THREE.Color("#dcbb8c");
  const sandDark = new THREE.Color("#b58f68");
  const dust = new THREE.Color("#e6c394");
  const tmp = new THREE.Color();
  for (let v = 0; v < nv; v++) {
    const u = us[v], z = zs[v];
    const y = positions[v * 3 + 1];
    const ny = nrm.getY(v);
    const t = wallT(u, z);
    // strata: pick a palette entry from a banded coordinate
    const s = y + 1.8 * nA(u, z) + 0.7 * nC(u, z);
    const band = 0.5 + 0.5 * Math.sin(s * 1.25) * 0.7 + 0.3 * Math.sin(s * 3.1 + 1.0) * 0.5;
    const f = Math.min(0.9999, Math.max(0, band)) * (pal.length - 1);
    const i0 = Math.floor(f);
    tmp.copy(pal[i0]).lerp(pal[i0 + 1], f - i0);
    // slopes show the rock, flat treads and the floor collect pale dust
    const flat = smooth(0.78, 0.97, ny);
    tmp.lerp(dust, flat * 0.55 * smooth(0.5, 4, t));
    // canyon floor
    const fl = 1 - smooth(0, 3, t);
    if (fl > 0) {
      const rv = u - riverU(z);
      const bed = Math.exp(-(rv * rv) / 22);
      const floorCol = sand.clone().lerp(sandDark, 0.35 + 0.35 * nD(u, z) + 0.5 * bed);
      tmp.lerp(floorCol, fl);
    }
    // darken the rock a touch with roughness
    const g = 0.92 + 0.08 * nD(u, z);
    colors[v * 3] = tmp.r * g;
    colors[v * 3 + 1] = tmp.g * g;
    colors[v * 3 + 2] = tmp.b * g;
  }
  tgeo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  const terrainMat = new THREE.MeshStandardMaterial({ name: "sandstone", vertexColors: true, roughness: 0.96, metalness: 0 });
  const terrain = new THREE.Mesh(tgeo, terrainMat);
  terrain.name = "terrain";
  terrain.castShadow = true;
  terrain.receiveShadow = true;

  // ---- boulders --------------------------------------------------------------------------------
  const hash3 = (x, y, z) => {
    const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
    return s - Math.floor(s);
  };
  const makeBoulder = (seed) => {
    const g = new THREE.IcosahedronGeometry(1, 2);
    const pos = g.getAttribute("position");
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const r = 0.78 + 0.35 * hash3(Math.round(x * 50) + seed, Math.round(y * 50), Math.round(z * 50)) +
        0.12 * Math.sin(x * 3 + seed) * Math.sin(z * 2.6 - seed);
      pos.setXYZ(i, x * r, y * r * 0.72, z * r);
    }
    g.computeVertexNormals();
    return g;
  };
  const boulderGeos = [makeBoulder(1.1), makeBoulder(7.3), makeBoulder(13.9)];
  const boulderMats = ["#8c5640", "#a06a48", "#7a4a3c"].map(
    (c, i) => new THREE.MeshStandardMaterial({ name: `boulder_rock_${i}`, color: c, roughness: 0.95, flatShading: true })
  );

  // ---- dead shrubs: merged tapered twigs -------------------------------------------------------
  const mergeGeos = (list) => {
    const pos = [], nor = [];
    for (const g0 of list) {
      const g = g0.index ? g0.toNonIndexed() : g0;
      pos.push(...g.getAttribute("position").array);
      nor.push(...g.getAttribute("normal").array);
    }
    const m = new THREE.BufferGeometry();
    m.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    m.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
    return m;
  };
  const makeShrub = (seed) => {
    const parts = [];
    const rnd = (n) => {
      const s = Math.sin(seed * 91.7 + n * 17.13) * 9631.7;
      return s - Math.floor(s);
    };
    const twig = (base, dir, len, r0) => {
      const g = new THREE.CylinderGeometry(r0 * 0.25, r0, len, 5, 1);
      g.translate(0, len / 2, 0);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
      g.applyMatrix4(new THREE.Matrix4().compose(base, q, new THREE.Vector3(1, 1, 1)));
      parts.push(g);
      return base.clone().add(dir.clone().normalize().multiplyScalar(len));
    };
    const n = 7 + Math.floor(rnd(1) * 4);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rnd(i + 3);
      const tilt = 0.35 + 0.5 * rnd(i + 20);
      const dir = new THREE.Vector3(Math.sin(tilt) * Math.cos(a), Math.cos(tilt), Math.sin(tilt) * Math.sin(a));
      const len = 0.55 + 0.35 * rnd(i + 40);
      const tip = twig(new THREE.Vector3(0, 0, 0), dir, len, 0.028);
      for (let k = 0; k < 2; k++) {
        const a2 = a + (k ? 0.7 : -0.7) + rnd(i * 3 + k) * 0.5;
        const d2 = new THREE.Vector3(Math.cos(a2) * 0.7, 0.8, Math.sin(a2) * 0.7);
        const mid = tip.clone().sub(dir.clone().normalize().multiplyScalar(len * (0.25 + 0.2 * k)));
        const tip2 = twig(mid, d2, len * 0.55, 0.014);
        twig(tip2, d2.clone().add(new THREE.Vector3(rnd(k + i) - 0.5, 0, rnd(i + 5) - 0.5)), len * 0.3, 0.007);
      }
    }
    return mergeGeos(parts);
  };
  const shrubGeos = [makeShrub(1), makeShrub(2), makeShrub(3)];
  const shrubMat = new THREE.MeshStandardMaterial({ name: "dead_wood", color: "#6b5340", roughness: 1 });

  // ---- placement (one period, replicated so that the loop is seamless) ------------------------
  const items = [];
  const rr = (a, b) => a + (b - a) * random();
  const clearOfCamera = (u, z, margin) => Math.abs(u - camU(z)) > margin;
  let guard = 0;
  while (items.filter((it) => it.kind === "boulder").length < 26 && guard++ < 2000) {
    const z = -rr(0, P);
    const side = random() < 0.5 ? -1 : 1;
    const u = random() < 0.6 ? rr(-half(z) - 2, half(z) + 2) : side * rr(half(z) - 8, half(z) + 4);
    if (!clearOfCamera(u, z, 5.5)) continue;
    const big = random() < 0.25;
    const s = big ? rr(1.8, 3.2) : rr(0.5, 1.4);
    items.push({ kind: "boulder", u, z, s, ry: rr(0, 6.28), v: Math.floor(random() * 3), sx: rr(0.8, 1.3), sz: rr(0.8, 1.3) });
  }
  guard = 0;
  while (items.filter((it) => it.kind === "shrub").length < 30 && guard++ < 2000) {
    const z = -rr(0, P);
    const u = rr(-half(z) + 1, half(z) - 1);
    if (!clearOfCamera(u, z, 3.2)) continue;
    items.push({ kind: "shrub", u, z, s: rr(0.8, 1.7), ry: rr(0, 6.28), v: Math.floor(random() * 3) });
  }

  const props = new THREE.Group();
  props.name = "props";
  let n = 0;
  for (let copy = -1; copy <= 2; copy++) {
    for (const it of items) {
      const z = it.z - copy * P;
      if (z > Z_NEAR - 5 || z < Z_FAR + 20) continue;
      const x = centre(z) + it.u;
      const y = heightAt(it.u, z);
      const mesh =
        it.kind === "boulder"
          ? new THREE.Mesh(boulderGeos[it.v], boulderMats[it.v])
          : new THREE.Mesh(shrubGeos[it.v], shrubMat);
      mesh.name = `${it.kind}_${n++}`;
      mesh.castShadow = true;
      mesh.receiveShadow = it.kind === "boulder";
      if (it.kind === "boulder") {
        mesh.position.set(x, y + it.s * 0.18, z);
        mesh.scale.set(it.s * it.sx, it.s, it.s * it.sz);
      } else {
        mesh.position.set(x, y - 0.03, z);
        mesh.scale.setScalar(it.s);
      }
      mesh.rotation.y = it.ry;
      props.add(mesh);
    }
  }

  const scene = new THREE.Scene();
  scene.add(terrain, props);

  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.3, 500);
  camera.position.set(centre(0), 2.2, 0);
  camera.lookAt(centre(-25), 3, -25);

  return { scene, camera, cameraTarget: [centre(-25), 3, -25], renderer: { toneMapping: "aces", exposure: 1 } };
}
