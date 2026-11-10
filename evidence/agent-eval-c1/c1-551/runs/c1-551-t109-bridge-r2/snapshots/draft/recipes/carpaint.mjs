// Candy-red car-paint object on a turntable platform. Procedural, smooth shapes only.
// Y is up, the car points along +X, the platform top is y = 0.
export const params = { paint: "#9a000e", length: 1.7 };

function sgnPow(v, e) {
  return Math.sign(v) * Math.pow(Math.abs(v), e);
}

export default function createScene({ THREE, params: p, random }) {
  const scene = new THREE.Scene();

  // ---------- superellipsoid helper with indexed (shared) vertices ----------
  function superEllipsoid({ a, b, c, e1, e2, nu = 96, nv = 56, shape, uvScale = 0.85 }) {
    const pos = [];
    const uvs = [];
    const idx = [];
    for (let j = 0; j <= nv; j++) {
      const eta = -Math.PI / 2 + (j / nv) * Math.PI;
      for (let i = 0; i < nu; i++) {
        const om = (i / nu) * Math.PI * 2;
        let x = a * sgnPow(Math.cos(eta), e1) * sgnPow(Math.cos(om), e2);
        let y = b * sgnPow(Math.sin(eta), e1);
        let z = c * sgnPow(Math.cos(eta), e1) * sgnPow(Math.sin(om), e2);
        if (shape) [x, y, z] = shape(x, y, z);
        pos.push(x, y, z);
        uvs.push(0, 0);
      }
    }
    for (let j = 0; j < nv; j++) {
      for (let i = 0; i < nu; i++) {
        const i2 = (i + 1) % nu;
        const v00 = j * nu + i;
        const v10 = j * nu + i2;
        const v01 = (j + 1) * nu + i;
        const v11 = (j + 1) * nu + i2;
        idx.push(v00, v01, v10, v10, v01, v11);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    // Dominant-axis projection for the flake texture (noise hides the seams).
    const n = g.getAttribute("normal");
    const uv = new Float32Array(uvs.length);
    for (let k = 0; k < n.count; k++) {
      const nx = Math.abs(n.getX(k)), ny = Math.abs(n.getY(k)), nz = Math.abs(n.getZ(k));
      const x = pos[k * 3], y = pos[k * 3 + 1], z = pos[k * 3 + 2];
      let u, v;
      if (ny >= nx && ny >= nz) { u = x; v = z; }
      else if (nz >= nx) { u = x; v = y; }
      else { u = z; v = y; }
      uv[k * 2] = u * uvScale;
      uv[k * 2 + 1] = v * uvScale;
    }
    g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    return g;
  }

  const A = p.length; // half length of the body
  const bodyShape = (x, y, z) => {
    const t = Math.min(1, Math.abs(x) / A);
    const front = x > 0 ? t : 0;
    const rear = x < 0 ? t : 0;
    const taper = 1 - 0.22 * t * t;
    let yy = y;
    if (yy > 0) yy *= 1 - 0.38 * front * front - 0.2 * rear * rear;
    return [x, yy, z * taper];
  };
  const BODY_Y = 0.62;

  // ---------- metallic flake normal map (fine random facets) ----------
  const N = 256;
  const data = new Uint8Array(N * N * 4);
  for (let i = 0; i < N * N; i++) {
    const sx = (random() - 0.5) * 1.5;
    const sy = (random() - 0.5) * 1.5;
    const inv = 1 / Math.hypot(sx, sy, 1);
    data[i * 4] = Math.round((sx * inv * 0.5 + 0.5) * 255);
    data[i * 4 + 1] = Math.round((sy * inv * 0.5 + 0.5) * 255);
    data[i * 4 + 2] = Math.round((inv * 0.5 + 0.5) * 255);
    data[i * 4 + 3] = 255;
  }
  const flake = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  flake.wrapS = flake.wrapT = THREE.RepeatWrapping;
  flake.magFilter = THREE.LinearFilter;
  flake.minFilter = THREE.LinearMipmapLinearFilter;
  flake.generateMipmaps = true;
  flake.needsUpdate = true;

  // ---------- materials ----------
  const paint = new THREE.MeshPhysicalMaterial({
    name: "candy_paint",
    color: new THREE.Color(p.paint),
    metalness: 0.6,
    roughness: 0.34,
    clearcoat: 1,
    clearcoatRoughness: 0.02,
    normalMap: flake,
    normalScale: new THREE.Vector2(0.9, -0.9),
  });
  const glass = new THREE.MeshPhysicalMaterial({
    name: "dark_glass", color: new THREE.Color("#04060a"), metalness: 0.2, roughness: 0.06,
    clearcoat: 1, clearcoatRoughness: 0.01,
  });
  const chrome = new THREE.MeshStandardMaterial({ name: "chrome", color: new THREE.Color("#f2f4f8"), metalness: 1, roughness: 0.05 });
  const rubber = new THREE.MeshStandardMaterial({ name: "rubber", color: new THREE.Color("#0b0b0d"), metalness: 0, roughness: 0.85 });
  const plat = new THREE.MeshPhysicalMaterial({
    name: "platform", color: new THREE.Color("#101216"), metalness: 0.5, roughness: 0.18,
    clearcoat: 1, clearcoatRoughness: 0.05,
  });
  const ring = new THREE.MeshStandardMaterial({
    name: "ring_light", color: new THREE.Color("#0a1420"), emissive: new THREE.Color("#8fc4ff"), emissiveIntensity: 2.2,
    metalness: 0, roughness: 0.4,
  });

  // ---------- turntable ----------
  const root = new THREE.Group();
  root.name = "turntable";
  scene.add(root);

  const platform = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 0.16, 96), plat);
  platform.name = "platform";
  platform.position.y = -0.08;
  root.add(platform);

  const edge = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.035, 16, 128), chrome);
  edge.name = "edge_trim";
  edge.rotation.x = Math.PI / 2;
  edge.position.y = -0.01;
  root.add(edge);

  const glow = new THREE.Mesh(new THREE.TorusGeometry(2.42, 0.014, 12, 160), ring);
  glow.name = "ring_light";
  glow.rotation.x = Math.PI / 2;
  glow.position.y = 0.006;
  root.add(glow);

  // tick marks so the rotation reads on the platform
  for (let i = 0; i < 24; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.012, 0.035), chrome);
    m.name = "tick_" + i;
    const ang = (i / 24) * Math.PI * 2;
    m.position.set(Math.cos(ang) * 2.2, 0.006, Math.sin(ang) * 2.2);
    m.rotation.y = -ang;
    root.add(m);
  }

  // ---------- car ----------
  const car = new THREE.Group();
  car.name = "car";
  root.add(car);

  const body = new THREE.Mesh(
    superEllipsoid({ a: A, b: 0.4, c: 0.8, e1: 0.55, e2: 0.7, shape: bodyShape }),
    paint,
  );
  body.name = "body";
  body.position.y = BODY_Y;
  car.add(body);

  const cabinGlass = new THREE.Mesh(
    superEllipsoid({ a: 0.98, b: 0.36, c: 0.66, e1: 0.8, e2: 0.9, nu: 72, nv: 40 }),
    glass,
  );
  cabinGlass.name = "cabin_glass";
  cabinGlass.position.set(-0.2, 0.95, 0);
  car.add(cabinGlass);

  const roof = new THREE.Mesh(
    superEllipsoid({ a: 0.86, b: 0.3, c: 0.6, e1: 0.8, e2: 0.9, nu: 72, nv: 40 }),
    paint,
  );
  roof.name = "roof";
  roof.position.set(-0.2, 1.07, 0);
  car.add(roof);

  // chrome belt line following the body outline at its widest
  const pts = [];
  for (let i = 0; i < 96; i++) {
    const om = (i / 96) * Math.PI * 2;
    let x = A * sgnPow(Math.cos(om), 0.7);
    let z = 0.8 * sgnPow(Math.sin(om), 0.7);
    [x, , z] = bodyShape(x, 0, z);
    pts.push(new THREE.Vector3(x * 1.004, 0, z * 1.004 + Math.sign(z) * 0.004));
  }
  const belt = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 240, 0.017, 10, true),
    chrome,
  );
  belt.name = "chrome_belt";
  belt.position.y = BODY_Y - 0.06;
  car.add(belt);

  // chrome rings around the cabin glass base
  const sill = new THREE.Mesh(new THREE.TorusGeometry(1, 0.012, 10, 96), chrome);
  sill.name = "chrome_window_trim";
  sill.rotation.x = Math.PI / 2;
  sill.scale.set(0.9, 0.62, 1);
  sill.position.set(-0.2, 1.0, 0);
  car.add(sill);

  // wheels
  const wheelPos = [
    [1.0, 0.36, 0.86], [1.0, 0.36, -0.86],
    [-1.05, 0.36, 0.86], [-1.05, 0.36, -0.86],
  ];
  wheelPos.forEach(([x, y, z], i) => {
    const w = new THREE.Group();
    w.name = "wheel_" + i;
    w.position.set(x, y, z);
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.28, 48), rubber);
    tire.name = "tire_" + i;
    tire.rotation.x = Math.PI / 2;
    w.add(tire);
    const side = Math.sign(z);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.01, 40), chrome);
    hub.name = "hub_" + i;
    hub.rotation.x = Math.PI / 2;
    hub.position.z = side * 0.142;
    w.add(hub);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.03, 12, 48), chrome);
    rim.name = "rim_" + i;
    rim.position.z = side * 0.135;
    w.add(rim);
    car.add(w);
  });

  const camera = new THREE.PerspectiveCamera(30, 16 / 9, 0.1, 100);
  camera.position.set(6.2, 2.0, 6.6);

  return {
    scene,
    camera,
    cameraTarget: [0, 0.75, 0],
    renderer: { toneMapping: "aces", exposure: 1 },
  };
}
