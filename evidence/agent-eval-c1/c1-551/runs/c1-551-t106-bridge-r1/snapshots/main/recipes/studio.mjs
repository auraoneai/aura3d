// Studio product shot: glass, brushed metal and woven red velvet spheres on a cyclorama floor.
export const params = { radius: 0.8, spacing: 2.1 };

function weaveTexture(THREE) {
  const N = 128;
  const data = new Uint8Array(N * N * 4);
  const cell = 8; // thread width in px
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const cx = Math.floor(x / cell), cy = Math.floor(y / cell);
      const over = (cx + cy) % 2 === 0; // plain weave: warp over weft on a checker
      const u = (x % cell) / cell, v = (y % cell) / cell;
      // rounded thread profile across the thread, plus fibre noise
      const across = over ? Math.sin(Math.PI * u) : Math.sin(Math.PI * v);
      const fibre = 0.5 + 0.5 * Math.sin((over ? v : u) * 40 + cx * 3.1 + cy * 1.7);
      const h = 0.45 + 0.4 * across + 0.15 * fibre;
      const hash = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
      const noise = hash - Math.floor(hash);
      const k = Math.min(1, Math.max(0, h * (0.85 + 0.3 * noise)));
      const i = (y * N + x) * 4;
      data[i] = Math.round(255 * Math.min(1, 0.35 + 0.65 * k));
      data[i + 1] = Math.round(255 * Math.min(1, 0.28 + 0.55 * k));
      data[i + 2] = Math.round(255 * Math.min(1, 0.28 + 0.55 * k));
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 3);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

// Cyclorama: flat floor that curves up into a vertical backdrop.
function cycloramaGeometry(THREE) {
  const halfW = 14, floorFront = 12, floorBack = -3, R = 3.5, wallH = 9;
  const profile = []; // [y, z]
  profile.push([0, floorFront]);
  profile.push([0, floorBack]);
  const arc = 20;
  for (let i = 1; i <= arc; i++) {
    const a = (i / arc) * Math.PI / 2;
    profile.push([R - R * Math.cos(a), floorBack - R * Math.sin(a)]);
  }
  profile.push([wallH, floorBack - R]);
  const cols = 8;
  const pos = [], uv = [], idx = [];
  for (let j = 0; j < profile.length; j++) {
    for (let i = 0; i <= cols; i++) {
      pos.push(-halfW + (2 * halfW * i) / cols, profile[j][0], profile[j][1]);
      uv.push(i / cols, j / (profile.length - 1));
    }
  }
  for (let j = 0; j < profile.length - 1; j++) {
    for (let i = 0; i < cols; i++) {
      const a = j * (cols + 1) + i, b = a + 1, c = a + cols + 1, d = c + 1;
      // normal faces up/forward (+y/+z)
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export default function createScene({ THREE, params: p }) {
  const scene = new THREE.Scene();
  const r = p.radius;

  const floor = new THREE.Mesh(
    cycloramaGeometry(THREE),
    new THREE.MeshStandardMaterial({ name: "cyc", color: "#8e9096", roughness: 0.85, metalness: 0, side: THREE.DoubleSide })
  );
  floor.name = "cyclorama";
  floor.receiveShadow = true;
  scene.add(floor);

  const geo = () => new THREE.SphereGeometry(r, 96, 64);

  const glass = new THREE.Mesh(
    geo(),
    new THREE.MeshPhysicalMaterial({
      name: "glass", color: "#1f4a58", metalness: 0, roughness: 0.02, transparent: true, opacity: 0.35,
      ior: 1.5, specularIntensity: 1, envMapIntensity: 2.2, clearcoat: 1, clearcoatRoughness: 0
    })
  );
  glass.name = "glass";
  glass.position.set(-p.spacing, r, 0);
  glass.castShadow = true;
  scene.add(glass);

  // brushed streaks: per-row roughness (G) with full metalness (B); rows run around the sphere
  const BH = 256;
  const bdata = new Uint8Array(4 * BH * 4);
  for (let y = 0; y < BH; y++) {
    const h1 = Math.sin(y * 91.7) * 43758.5453, h2 = Math.sin(y * 12.3 + 4.0) * 24634.6345;
    const n = (h1 - Math.floor(h1)) * 0.7 + (h2 - Math.floor(h2)) * 0.3;
    const rough = Math.round(255 * (0.2 + 0.25 * n));
    for (let x = 0; x < 4; x++) {
      const i = (y * 4 + x) * 4;
      bdata[i] = 255; bdata[i + 1] = rough; bdata[i + 2] = 255; bdata[i + 3] = 255;
    }
  }
  const brush = new THREE.DataTexture(bdata, 4, BH, THREE.RGBAFormat);
  brush.wrapS = brush.wrapT = THREE.RepeatWrapping;
  brush.magFilter = THREE.LinearFilter;
  brush.minFilter = THREE.LinearMipmapLinearFilter;
  brush.generateMipmaps = true;
  brush.needsUpdate = true;

  const metal = new THREE.Mesh(
    geo(),
    new THREE.MeshPhysicalMaterial({
      name: "metal", color: "#9ba0a9", metalness: 1, roughness: 1, metalnessMap: brush, roughnessMap: brush, envMapIntensity: 1.2
    })
  );
  metal.name = "metal";
  metal.position.set(0, r, 0);
  metal.castShadow = true;
  scene.add(metal);

  const weave = weaveTexture(THREE);
  const fabric = new THREE.Mesh(
    geo(),
    new THREE.MeshPhysicalMaterial({
      name: "fabric", color: "#7a1024", map: weave, metalness: 0, roughness: 1, sheen: 0.7, sheenColor: "#a02a3c",
      sheenRoughness: 0.45, envMapIntensity: 0.5
    })
  );
  fabric.name = "fabric";
  fabric.position.set(p.spacing, r, 0);
  fabric.castShadow = true;
  scene.add(fabric);

  const camera = new THREE.PerspectiveCamera(19, 16 / 9, 0.1, 100);
  camera.position.set(0.6, 3.0, 10.2);

  return {
    scene,
    camera,
    cameraTarget: [0, 0.75, 0],
    renderer: { toneMapping: "aces", exposure: 0.8 }
  };
}
