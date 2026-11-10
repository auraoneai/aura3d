// Candy-red coupe on a glossy turntable. Geometry and base materials only; flake, env and motion are native.
export const params = { paint: "#c4001d" };

export default function createScene({ THREE, params: p, random }) {
  const scene = new THREE.Scene();

  // Metallic flake normal map: each texel gets its own random tilt, so the base layer sparkles at fine scale.
  const FN = 256;
  const fdata = new Uint8Array(FN * FN * 4);
  for (let i = 0; i < FN * FN; i++) {
    let nx = (random() - 0.5) * 2, ny = (random() - 0.5) * 2;
    const m = 0.25 + 0.75 * random();
    nx *= m; ny *= m;
    const nz = Math.sqrt(Math.max(0.05, 1 - nx * nx - ny * ny));
    fdata[i * 4] = Math.round((nx * 0.5 + 0.5) * 255);
    fdata[i * 4 + 1] = Math.round((ny * 0.5 + 0.5) * 255);
    fdata[i * 4 + 2] = Math.round((nz * 0.5 + 0.5) * 255);
    fdata[i * 4 + 3] = 255;
  }
  const flakes = new THREE.DataTexture(fdata, FN, FN, THREE.RGBAFormat);
  flakes.wrapS = flakes.wrapT = THREE.RepeatWrapping;
  flakes.magFilter = THREE.LinearFilter;
  flakes.minFilter = THREE.LinearMipmapLinearFilter;
  flakes.generateMipmaps = true;
  flakes.needsUpdate = true;

  const mats = {
    paint: new THREE.MeshPhysicalMaterial({
      name: "paint", color: new THREE.Color(p.paint), metalness: 0.55, roughness: 0.38,
      normalMap: flakes, normalScale: new THREE.Vector2(0.9, -0.9),
      clearcoat: 1, clearcoatRoughness: 0.03
    }),

    glass: new THREE.MeshPhysicalMaterial({
      name: "glass", color: new THREE.Color("#05070a"), metalness: 0.2, roughness: 0.05,
      clearcoat: 1, clearcoatRoughness: 0.02
    }),
    chrome: new THREE.MeshStandardMaterial({ name: "chrome", color: new THREE.Color("#f2f4f8"), metalness: 1, roughness: 0.06 }),
    rubber: new THREE.MeshStandardMaterial({ name: "rubber", color: new THREE.Color("#0c0c0d"), metalness: 0, roughness: 0.85 }),
    rim: new THREE.MeshStandardMaterial({ name: "rim", color: new THREE.Color("#8d9097"), metalness: 1, roughness: 0.25 }),
    floor: new THREE.MeshPhysicalMaterial({
      name: "floor", color: new THREE.Color("#07080b"), metalness: 0.0, roughness: 0.08,
      transparent: true, opacity: 0.8, clearcoat: 1, clearcoatRoughness: 0.02
    }),
    platformEdge: new THREE.MeshStandardMaterial({ name: "platformEdge", color: new THREE.Color("#15171b"), metalness: 0.9, roughness: 0.3 }),
    ringLight: new THREE.MeshStandardMaterial({
      name: "ringLight", color: new THREE.Color("#0a1218"), emissive: new THREE.Color("#8fd0ff"), emissiveIntensity: 2.2
    })
  };

  // Streamlined body: superellipse cross-section swept along X, welded seam, single pole vertices.
  function bodyGeometry() {
    const L = 2.35, H = 0.52, W = 0.98, R = 64, S = 48;
    const pos = [], uv = [], idx = [];
    const point = (u, ph) => {
      const s = Math.sin(u);
      const taper = Math.pow(s, 0.55);
      const cx = Math.cos(ph), cy = Math.sin(ph);
      const n = 2.5;
      const sg = (v) => Math.sign(v) * Math.pow(Math.abs(v), 2 / n);
      let y = H * taper * sg(cy);
      if (y < 0) y *= 0.55;
      const z = W * taper * sg(cx);
      // nose lower than tail, a slight hump
      const x = -L * Math.cos(u);
      const lift = y > 0 ? 0.08 * Math.sin(u) : 0;
      return [x, y + lift, z];
    };
    pos.push(...point(0, 0)); uv.push(0.5, 0);
    for (let j = 1; j < S; j++) {
      const u = (j / S) * Math.PI;
      for (let i = 0; i < R; i++) {
        pos.push(...point(u, (i / R) * Math.PI * 2));
        uv.push(i / R, j / S);
      }
    }
    pos.push(...point(Math.PI, 0)); uv.push(0.5, 1);
    const top = 0, bot = 1 + (S - 1) * R;
    const ring = (j, i) => 1 + (j - 1) * R + (i % R);
    for (let i = 0; i < R; i++) idx.push(top, ring(1, i + 1), ring(1, i));
    for (let j = 1; j < S - 1; j++) {
      for (let i = 0; i < R; i++) {
        const a = ring(j, i), b = ring(j, i + 1), c = ring(j + 1, i), d = ring(j + 1, i + 1);
        idx.push(a, b, c, b, d, c);
      }
    }
    for (let i = 0; i < R; i++) idx.push(bot, ring(S - 1, i), ring(S - 1, i + 1));
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    // orientation check: first-ring normals should point outward at the roof
    return g;
  }

  // Each part: geometry with its transform baked in, so a mirrored copy can be flipped exactly.
  function bake(geo, build) {
    const o = new THREE.Object3D();
    build(o);
    o.updateMatrix();
    geo.applyMatrix4(o.matrix);
    return geo;
  }
  const ell = (sx, sy, sz, x, y, z) => bake(new THREE.SphereGeometry(1, 48, 32), (o) => { o.scale.set(sx, sy, sz); o.position.set(x, y, z); });

  const parts = [];
  const body = bodyGeometry();
  // winding check on a roof triangle: make normals face away from the centre line
  {
    const q = body.getAttribute("position");
    const ix = body.index.array;
    let vol = 0;
    for (let t = 0; t < ix.length; t += 3) {
      const a = ix[t], b = ix[t + 1], c = ix[t + 2];
      const ax = q.getX(a), ay = q.getY(a), az = q.getZ(a);
      const bx = q.getX(b), by = q.getY(b), bz = q.getZ(b);
      const cx = q.getX(c), cy = q.getY(c), cz = q.getZ(c);
      vol += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
    }
    if (vol < 0) {
      for (let t = 0; t < ix.length; t += 3) { const tmp = ix[t + 1]; ix[t + 1] = ix[t + 2]; ix[t + 2] = tmp; }
      body.computeVertexNormals();
    }
  }
  body.translate(0, 0.66, 0);
  const scaleUV = (g, su, sv) => { const t = g.getAttribute("uv"); for (let i = 0; i < t.count; i++) t.setXY(i, t.getX(i) * su, t.getY(i) * sv); return g; };
  scaleUV(body, 16, 8);
  parts.push({ name: "body", geo: body, mat: "paint" });
  parts.push({ name: "cabin", geo: scaleUV(ell(0.95, 0.4, 0.66, -0.12, 1.0, 0), 10, 5), mat: "paint" });
  parts.push({ name: "glass", geo: ell(1.0, 0.29, 0.705, -0.12, 1.03, 0), mat: "glass" });
  parts.push({
    name: "beltTrim",
    geo: bake(new THREE.TorusGeometry(1, 0.022, 12, 96), (o) => { o.rotation.x = Math.PI / 2; o.scale.set(0.9, 0.66, 1); o.position.set(-0.12, 1.12, 0); }),
    mat: "chrome"
  });
  // chrome front and rear bumper strips hugging the nose and tail
  for (const sx of [1, -1]) {
    parts.push({
      name: sx > 0 ? "bumperFront" : "bumperRear",
      geo: bake(new THREE.TorusGeometry(1, 0.025, 10, 40, Math.PI * 0.5), (o) => { o.rotation.x = Math.PI / 2; o.rotation.z = sx > 0 ? -Math.PI * 0.25 : Math.PI * 0.75; o.scale.set(0.9, 0.9, 1); o.position.set(sx * 1.55, 0.5, 0); }),
      mat: "chrome"
    });
  }
  // wheels
  for (const [wx, wz, id] of [[1.35, 0.9, "fr"], [1.35, -0.9, "fl"], [-1.3, 0.9, "rr"], [-1.3, -0.9, "rl"]]) {
    const out = wz > 0 ? 1 : -1;
    parts.push({
      name: `tire_${id}`,
      geo: bake(new THREE.CylinderGeometry(0.42, 0.42, 0.34, 40), (o) => { o.rotation.x = Math.PI / 2; o.position.set(wx, 0.42, wz); }),
      mat: "rubber"
    });
    parts.push({
      name: `hub_${id}`,
      geo: bake(new THREE.CylinderGeometry(0.28, 0.28, 0.02, 32), (o) => { o.rotation.x = Math.PI / 2; o.position.set(wx, 0.42, wz + out * 0.175); }),
      mat: "rim"
    });
    parts.push({
      name: `rimRing_${id}`,
      geo: bake(new THREE.TorusGeometry(0.3, 0.025, 12, 40), (o) => { o.position.set(wx, 0.42, wz + out * 0.178); }),
      mat: "chrome"
    });
    parts.push({
      name: `cap_${id}`,
      geo: bake(new THREE.SphereGeometry(0.07, 16, 12), (o) => { o.scale.set(1, 1, 0.5); o.position.set(wx, 0.42, wz + out * 0.19); }),
      mat: "chrome"
    });
  }

  function flipped(geo) {
    const g = geo.clone();
    const pa = g.getAttribute("position"), na = g.getAttribute("normal");
    for (let i = 0; i < pa.count; i++) { pa.setY(i, -pa.getY(i)); na.setY(i, -na.getY(i)); }
    const ix = g.index ? g.index.array : null;
    if (ix) for (let t = 0; t < ix.length; t += 3) { const tmp = ix[t + 1]; ix[t + 1] = ix[t + 2]; ix[t + 2] = tmp; }
    return g;
  }

  const turntable = new THREE.Group();
  turntable.name = "turntable";
  const car = new THREE.Group();
  car.name = "car";
  const reflection = new THREE.Group();
  reflection.name = "reflection";
  for (const part of parts) {
    const m = new THREE.Mesh(part.geo, mats[part.mat]);
    m.name = part.name;
    car.add(m);
    const r = new THREE.Mesh(flipped(part.geo), mats[part.mat]);
    r.name = `mirror_${part.name}`;
    reflection.add(r);
  }
  turntable.add(car, reflection);

  // Platform: glossy dark disc (semi-transparent so the mirrored car shows faintly), chrome-ish rim, ring light.
  const PR = 3.6;
  const disc = new THREE.Mesh(new THREE.CircleGeometry(PR, 96), mats.floor);
  disc.name = "floorDisc";
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.002;
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(PR, PR, 0.22, 96, 1, true), mats.platformEdge);
  wall.name = "platformWall";
  wall.position.y = -0.11;
  const lip = new THREE.Mesh(new THREE.TorusGeometry(PR, 0.045, 12, 128), mats.chrome);
  lip.name = "platformLip";
  lip.rotation.x = Math.PI / 2;
  lip.position.y = 0.0;
  const ringLight = new THREE.Mesh(new THREE.TorusGeometry(PR - 0.3, 0.03, 10, 128), mats.ringLight);
  ringLight.name = "ringLight";
  ringLight.rotation.x = Math.PI / 2;
  ringLight.position.y = 0.02;
  turntable.add(disc, wall, lip, ringLight);
  scene.add(turntable);

  return { scene, renderer: { toneMapping: "aces", exposure: 1 } };
}
