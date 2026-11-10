// Studio product shot: curved seamless floor + glass / brushed metal / velvet spheres.
export const params = { radius: 0.8, spacing: 2.2 };

function makeCyclorama(THREE) {
  // Profile in (z, y): flat floor from z=+9 to z=-2, quarter-circle sweep (r=3.2) up into a vertical backdrop.
  const R = 3.2, flatFront = 9, flatBack = -2, wallH = 7;
  const prof = [];
  prof.push([flatFront, 0]);
  prof.push([flatBack, 0]);
  const arc = 20;
  for (let i = 1; i <= arc; i++) {
    const a = (i / arc) * (Math.PI / 2);
    prof.push([flatBack - Math.sin(a) * R, R - Math.cos(a) * R]);
  }
  prof.push([flatBack - R, R + wallH]);
  const W = 40, nx = 2;
  const pos = [], idx = [];
  for (let j = 0; j < prof.length; j++) {
    for (let i = 0; i <= nx; i++) {
      pos.push(-W / 2 + (W * i) / nx, prof[j][1], prof[j][0]);
    }
  }
  for (let j = 0; j < prof.length - 1; j++) {
    for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i, b = a + 1, c = a + (nx + 1), d = c + 1;
      // normal must face +y (floor) / +z (wall): profile runs toward -z, so use (a, c, b)
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // ensure upward normals
  const n = g.getAttribute("normal");
  if (n.getY(0) < 0) {
    const flipped = [];
    for (let k = 0; k < idx.length; k += 3) flipped.push(idx[k], idx[k + 2], idx[k + 1]);
    g.setIndex(flipped);
    g.computeVertexNormals();
  }
  return g;
}

// Woven velvet: 512x256 colour + tangent-space normal, periodic so it tiles around the sphere.
function makeWeave(THREE) {
  const w = 512, h = 256, cell = 16;
  const col = new Uint8Array(w * h * 4);
  const nor = new Uint8Array(w * h * 4);
  const height = new Float32Array(w * h);
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = (x % cell) / cell, v = (y % cell) / cell;
      const cx = Math.floor(x / cell), cy = Math.floor(y / cell);
      const over = (cx + cy) % 2 === 0; // warp over weft checker
      const thread = over ? Math.sin(Math.PI * u) : Math.sin(Math.PI * v);
      const cross = over ? Math.cos(Math.PI * (v - 0.5)) * 0.3 + 0.7 : Math.cos(Math.PI * (u - 0.5)) * 0.3 + 0.7;
      height[y * w + x] = (over ? 0.6 : 0.3) * Math.pow(Math.max(0, thread), 0.7) * cross + (rnd() - 0.5) * 0.08;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const hx = height[y * w + ((x + 1) % w)] - height[y * w + ((x + w - 1) % w)];
      const hy = height[((y + 1) % h) * w + x] - height[((y + h - 1) % h) * w + x];
      let nx = -hx * 4, ny = hy * 4, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      nx /= l; ny /= l; nz /= l;
      const i = (y * w + x) * 4;
      nor[i] = Math.round((nx * 0.5 + 0.5) * 255);
      nor[i + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      nor[i + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      nor[i + 3] = 255;
      const hv = height[y * w + x];
      const shade = 0.55 + hv * 0.9 + (rnd() - 0.5) * 0.12;
      col[i] = Math.max(0, Math.min(255, Math.round(150 * shade)));
      col[i + 1] = Math.max(0, Math.min(255, Math.round(14 * shade)));
      col[i + 2] = Math.max(0, Math.min(255, Math.round(26 * shade)));
      col[i + 3] = 255;
    }
  }
  const map = new THREE.DataTexture(col, w, h, THREE.RGBAFormat);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.needsUpdate = true;
  const normalMap = new THREE.DataTexture(nor, w, h, THREE.RGBAFormat);
  normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping;
  normalMap.needsUpdate = true;
  return { map, normalMap };
}

// Brushed streaks: roughness variation along one direction.
function makeBrushed(THREE) {
  const w = 256, h = 256;
  const d = new Uint8Array(w * h * 4);
  let seed = 777;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const rows = [];
  for (let y = 0; y < h; y++) rows.push(rnd());
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const r = 0.5 + 0.35 * (rows[y] - 0.5) * 2 + (rnd() - 0.5) * 0.1;
      const i = (y * w + x) * 4;
      const v = Math.max(0, Math.min(255, Math.round(r * 255)));
      d[i] = 255; d[i + 1] = v; d[i + 2] = 255; d[i + 3] = 255; // G = roughness, B = metalness
    }
  }
  const t = new THREE.DataTexture(d, w, h, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.needsUpdate = true;
  return t;
}

export default function createScene({ THREE, params: p }) {
  const scene = new THREE.Scene();

  const floor = new THREE.Mesh(
    makeCyclorama(THREE),
    new THREE.MeshStandardMaterial({ name: "cyclorama", color: "#d4d5d8", roughness: 0.85, metalness: 0 })
  );
  floor.name = "cyclorama";
  scene.add(floor);

  const geo = new THREE.SphereGeometry(p.radius, 96, 64);

  const glass = new THREE.Mesh(
    geo,
    new THREE.MeshPhysicalMaterial({
      name: "glass", color: "#f4fbff", roughness: 0.02, metalness: 0,
      transmission: 1, thickness: 1.2, ior: 1.5, specularIntensity: 1,
      attenuationColor: new THREE.Color("#d9f0ee"), attenuationDistance: 3
    })
  );
  glass.name = "glass";
  glass.position.set(-p.spacing, p.radius, 0);
  scene.add(glass);

  const metal = new THREE.Mesh(
    geo,
    new THREE.MeshPhysicalMaterial({
      name: "metal", color: "#c9ced4", roughness: 0.38, metalness: 1,
      anisotropy: 0.9, anisotropyRotation: 0
    })
  );
  metal.name = "metal";
  metal.position.set(0, p.radius, 0);
  scene.add(metal);

  const { map, normalMap } = makeWeave(THREE);
  const fabric = new THREE.Mesh(
    geo,
    new THREE.MeshPhysicalMaterial({
      name: "fabric", color: "#ffffff", map, normalMap, normalScale: new THREE.Vector2(1, -1),
      roughness: 1, metalness: 0,
      sheen: 1, sheenRoughness: 0.35, sheenColor: new THREE.Color("#ff6a6a")
    })
  );
  fabric.name = "fabric";
  fabric.position.set(p.spacing, p.radius, 0);
  scene.add(fabric);

  return { scene };
}
