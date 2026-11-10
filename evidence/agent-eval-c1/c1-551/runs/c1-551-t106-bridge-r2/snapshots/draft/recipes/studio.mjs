// Studio product shot: cove floor + glass / brushed metal / woven velvet spheres.
export const params = { radius: 0.62, spacing: 1.65 };

function hash(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

export default function createScene({ THREE, params: p }) {
  const scene = new THREE.Scene();
  const R = p.radius;

  // ---- seamless cove: flat floor, quarter-circle sweep, vertical backdrop ----
  const floorFront = 9, floorBack = -2.6, sweepR = 2.4, wallH = 5, halfW = 14;
  const prof = [];
  prof.push([floorFront, 0, 0, 1]); // z, y, nz, ny
  const nFlat = 8;
  for (let i = 1; i <= nFlat; i++) {
    const z = floorFront + (floorBack - floorFront) * (i / nFlat);
    prof.push([z, 0, 0, 1]);
  }
  const nSweep = 28;
  for (let i = 1; i <= nSweep; i++) {
    const a = (i / nSweep) * Math.PI / 2;
    const z = floorBack - Math.sin(a) * sweepR;
    const y = sweepR - Math.cos(a) * sweepR;
    prof.push([z, y, Math.sin(a), Math.cos(a)]);
  }
  prof.push([floorBack - sweepR, sweepR + wallH, 1, 0]);
  const cols = 2;
  const pos = [], nor = [], uvs = [], idx = [];
  prof.forEach(([z, y, nz, ny], r) => {
    for (let c = 0; c < cols; c++) {
      pos.push(-halfW + (2 * halfW * c) / (cols - 1), y, z);
      nor.push(0, ny, nz);
      uvs.push(c, r / prof.length);
    }
  });
  for (let r = 0; r < prof.length - 1; r++) {
    const a = r * cols, b = a + 1, c = a + cols, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  const fg = new THREE.BufferGeometry();
  fg.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  fg.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  fg.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  fg.setIndex(idx);
  const floor = new THREE.Mesh(fg, new THREE.MeshStandardMaterial({ name: "floor", color: "#c9cacd", roughness: 0.82, metalness: 0 }));
  floor.name = "floor";
  floor.receiveShadow = true;
  scene.add(floor);

  // ---- glass ----
  const glassMat = new THREE.MeshPhysicalMaterial({
    name: "glass", color: "#f4fbff", roughness: 0.02, metalness: 0,
    transmission: 1, thickness: 0.7, ior: 1.5, transparent: false,
    specularIntensity: 1, clearcoat: 1, clearcoatRoughness: 0.02,
    attenuationColor: new THREE.Color("#dff3ff"), attenuationDistance: 3
  });
  const glass = new THREE.Mesh(new THREE.SphereGeometry(R, 96, 64), glassMat);
  glass.name = "glass";
  glass.position.set(-p.spacing, R, 0);
  scene.add(glass);

  // ---- brushed metal: roughness streaks running around the sphere ----
  const W = 256, H = 256;
  const rough = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    const line = hash(y, 7) * 0.7 + hash(y >> 1, 11) * 0.3;
    for (let x = 0; x < W; x++) {
      const fine = hash(x >> 3, y * 3) * 0.25;
      const v = Math.min(1, 0.78 + line * 0.14 + fine * 0.12 - 0.06);
      const o = (y * W + x) * 4;
      rough[o] = Math.round(v * 255); rough[o + 1] = Math.round(v * 255); rough[o + 2] = Math.round(v * 255); rough[o + 3] = 255;
    }
  }
  const roughTex = new THREE.DataTexture(rough, W, H, THREE.RGBAFormat);
  roughTex.colorSpace = THREE.SRGBColorSpace;
  roughTex.wrapS = roughTex.wrapT = THREE.RepeatWrapping;
  roughTex.needsUpdate = true;
  const metalMat = new THREE.MeshPhysicalMaterial({
    name: "metal", color: "#d3d8de", map: roughTex, metalness: 1, roughness: 0.34,
    anisotropy: 0.85, anisotropyRotation: 0
  });
  const metal = new THREE.Mesh(new THREE.SphereGeometry(R, 96, 64), metalMat);
  metal.name = "metal";
  metal.position.set(0, R, 0);
  scene.add(metal);

  // ---- woven velvet: checker-over/under weave colour + normal map ----
  const N = 128, cell = 8; // 16x16 threads per tile
  const col = new Uint8Array(N * N * 4);
  const nrm = new Uint8Array(N * N * 4);
  const height = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const cx = Math.floor(x / cell), cy = Math.floor(y / cell);
    const fx = (x % cell) / cell, fy = (y % cell) / cell;
    const warpOver = (cx + cy) % 2 === 0;
    // thread cross-section bump
    const t = warpOver ? Math.sin(fx * Math.PI) : Math.sin(fy * Math.PI);
    const along = warpOver ? fy : fx;
    const h = Math.pow(t, 0.7) * (0.75 + 0.25 * Math.sin(along * Math.PI)) + (hash(x, y) - 0.5) * 0.12;
    height[y * N + x] = h;
  }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const hL = height[y * N + ((x + N - 1) % N)], hR = height[y * N + ((x + 1) % N)];
    const hD = height[((y + N - 1) % N) * N + x], hU = height[((y + 1) % N) * N + x];
    let nx = (hL - hR) * 1.6, ny = (hD - hU) * 1.6, nz = 1;
    const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const o = (y * N + x) * 4;
    nrm[o] = Math.round((nx * 0.5 + 0.5) * 255);
    nrm[o + 1] = Math.round((ny * 0.5 + 0.5) * 255);
    nrm[o + 2] = Math.round((nz * 0.5 + 0.5) * 255);
    nrm[o + 3] = 255;
    const h = height[y * N + x];
    const shade = 0.45 + 0.75 * Math.min(1, Math.max(0, h));
    const fuzz = 0.9 + 0.2 * hash(x * 5, y * 5);
    col[o] = Math.min(255, Math.round(150 * shade * fuzz));
    col[o + 1] = Math.round(10 * shade * fuzz);
    col[o + 2] = Math.round(24 * shade * fuzz);
    col[o + 3] = 255;
  }
  const colTex = new THREE.DataTexture(col, N, N, THREE.RGBAFormat);
  colTex.colorSpace = THREE.SRGBColorSpace;
  const nrmTex = new THREE.DataTexture(nrm, N, N, THREE.RGBAFormat);
  for (const t of [colTex, nrmTex]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.needsUpdate = true; }
  const fabricMat = new THREE.MeshPhysicalMaterial({
    name: "fabric", color: "#ffffff", map: colTex, normalMap: nrmTex, normalScale: new THREE.Vector2(1, -1),
    roughness: 1, metalness: 0, sheen: 1, sheenRoughness: 0.35, sheenColor: new THREE.Color("#ff6b7a"),
    specularIntensity: 0
  });
  const fg2 = new THREE.SphereGeometry(R, 96, 64);
  const uv = fg2.getAttribute("uv");
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 14, uv.getY(i) * 7);
  const fabric = new THREE.Mesh(fg2, fabricMat);
  fabric.name = "fabric";
  fabric.position.set(p.spacing, R, 0);
  scene.add(fabric);

  const camera = new THREE.PerspectiveCamera(30, 640 / 360, 0.1, 100);
  camera.position.set(0, 2.1, 7.4);

  return {
    scene, camera, cameraTarget: [0, 0.55, 0],
    renderer: { toneMapping: "aces", exposure: 1 }
  };
}
