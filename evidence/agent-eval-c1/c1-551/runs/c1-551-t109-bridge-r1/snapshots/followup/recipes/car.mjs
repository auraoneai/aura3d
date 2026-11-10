// Candy-red clear-coated concept car, built from smooth superellipsoid shells.
// Front of the car is +X, left/right is Z, up is Y. Wheels touch y = 0.

export const params = { paint: "#8e0616", length: 1.95, width: 0.86, height: 0.5 };

const spow = (v, e) => Math.sign(v) * Math.pow(Math.abs(v), e);

export default function createScene({ THREE, random, params: p }) {
  const scene = new THREE.Scene();

  // ---- smooth superellipsoid shell with shared seam + pole vertices (clean normals) ----
  function shell({ L, W, H, n = 2.6, bottomK = 0.55, tip = 0.72, R = 72, S = 96, droop = 0.08 }) {
    const pos = [];
    const uv = [];
    const idx = [];
    pos.push(L, -droop * H, 0); uv.push(0.5, 0); // pole 0 (nose)
    pos.push(-L, droop * 0.3 * H, 0); uv.push(0.5, 3); // pole 1 (tail)
    for (let i = 1; i < R; i++) {
      const th = (Math.PI * i) / R;
      const x = L * Math.cos(th);
      const r = Math.pow(Math.sin(th), tip);
      const yOff = -droop * H * (x / L);
      for (let j = 0; j < S; j++) {
        const a = (2 * Math.PI * j) / S - Math.PI / 2; // seam at the underside
        const cs = Math.cos(a);
        const sn = Math.sin(a);
        const z = W * r * spow(cs, 2 / n);
        let y = H * r * spow(sn, 2 / n);
        if (sn < 0) y *= bottomK;
        pos.push(x, y + yOff, z);
        uv.push((j / S) * 5, (i / R) * 2.5);
      }
    }
    const v = (i, j) => 2 + (i - 1) * S + (j % S);
    for (let j = 0; j < S; j++) {
      idx.push(0, v(1, j + 1), v(1, j));
      idx.push(1, v(R - 1, j), v(R - 1, j + 1));
    }
    for (let i = 1; i < R - 1; i++) {
      for (let j = 0; j < S; j++) {
        idx.push(v(i, j), v(i, j + 1), v(i + 1, j));
        idx.push(v(i, j + 1), v(i + 1, j + 1), v(i + 1, j));
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  // ---- metallic flake layer baked into data textures (colour variation + metal/roughness glints) ----
  const FN = 128;
  const colorData = new Uint8Array(FN * FN * 4);
  const mrData = new Uint8Array(FN * FN * 4);
  for (let k = 0; k < FN * FN; k++) {
    const flake = random() < 0.22;
    const tint = flake ? 0.9 + random() * 0.1 : 0.75 + random() * 0.08;
    colorData[k * 4] = Math.round(255 * tint);
    colorData[k * 4 + 1] = Math.round(255 * (flake ? tint : tint * (0.9 + random() * 0.08)));
    colorData[k * 4 + 2] = Math.round(255 * (flake ? tint : tint * (0.9 + random() * 0.08)));
    colorData[k * 4 + 3] = 255;
    mrData[k * 4] = 255;
    mrData[k * 4 + 1] = Math.round(255 * (flake ? 0.16 + random() * 0.06 : 0.3 + random() * 0.06)); // roughness
    mrData[k * 4 + 2] = Math.round(255 * (flake ? 1 : 0.68 + random() * 0.06)); // metalness
    mrData[k * 4 + 3] = 255;
  }
  const mk = (data, srgb) => {
    const t = new THREE.DataTexture(data, FN, FN, THREE.RGBAFormat);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearFilter;
    t.generateMipmaps = false;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
    return t;
  };
  const flakeColor = mk(colorData, true);
  const flakeMR = mk(mrData, false);

  const paint = new THREE.MeshPhysicalMaterial({
    name: "candy_paint",
    color: new THREE.Color(p.paint),
    map: flakeColor,
    metalnessMap: flakeMR,
    roughnessMap: flakeMR,
    metalness: 1,
    roughness: 1,
    clearcoat: 1,
    clearcoatRoughness: 0.025,
    envMapIntensity: 1.2,
  });
  const glass = new THREE.MeshPhysicalMaterial({
    name: "cabin_glass", color: new THREE.Color("#04060a"), metalness: 0.3, roughness: 0.06,
    clearcoat: 1, clearcoatRoughness: 0.01,
  });
  const chrome = new THREE.MeshStandardMaterial({ name: "chrome", color: new THREE.Color("#f2f4f8"), metalness: 1, roughness: 0.04 });
  const rubber = new THREE.MeshStandardMaterial({ name: "rubber", color: new THREE.Color("#020203"), metalness: 0, roughness: 0.92 });
  const lamp = new THREE.MeshStandardMaterial({
    name: "headlamp", color: new THREE.Color("#fff6e0"), emissive: new THREE.Color("#fff1c8"), emissiveIntensity: 2.2, roughness: 0.2,
  });
  const tail = new THREE.MeshStandardMaterial({
    name: "taillamp", color: new THREE.Color("#ff2030"), emissive: new THREE.Color("#ff1020"), emissiveIntensity: 1.6, roughness: 0.3,
  });

  const car = new THREE.Group();
  car.name = "car";
  scene.add(car);

  const L = p.length, W = p.width, H = p.height;
  const bodyY = 0.62; // body centre height above the ground

  const body = new THREE.Mesh(shell({ L, W, H }), paint);
  body.name = "body";
  body.position.y = bodyY;
  car.add(body);

  const cabin = new THREE.Mesh(shell({ L: 0.85, W: 0.64, H: 0.46, n: 2.3, bottomK: 0.4, tip: 0.8, droop: -0.25 }), glass);
  cabin.name = "cabin";
  cabin.position.set(-0.22, bodyY + 0.28, 0);
  car.add(cabin);

  // (roof cap removed: the glass cabin is the single bump)

  // chrome belt-line trims following the body side
  for (const side of [1, -1]) {
    const pts = [];
    for (let i = 0; i <= 40; i++) {
      const th = 0.22 + ((Math.PI - 0.44) * i) / 40;
      const x = L * Math.cos(th);
      const r = Math.pow(Math.sin(th), 0.72);
      pts.push(new THREE.Vector3(x, bodyY - 0.08 * H * (x / L) + 0.02, side * W * r * 1.004));
    }
    const trim = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 80, 0.014, 10, false), chrome);
    trim.name = side > 0 ? "trim_left" : "trim_right";
    car.add(trim);
  }

  // headlamps and tail lamps
  for (const side of [1, -1]) {
    const hl = new THREE.Mesh(new THREE.SphereGeometry(0.075, 20, 14), lamp);
    hl.name = side > 0 ? "headlamp_left" : "headlamp_right";
    hl.scale.set(0.8, 0.8, 1.5);
    hl.position.set(L * 0.84, bodyY - 0.015, side * 0.36);
    car.add(hl);
    const tl = new THREE.Mesh(new THREE.SphereGeometry(0.07, 20, 14), tail);
    tl.name = side > 0 ? "taillamp_left" : "taillamp_right";
    tl.scale.set(0.7, 0.8, 1.6);
    tl.position.set(-L * 0.88, bodyY + 0.03, side * 0.33);
    car.add(tl);
  }

  // wheels: rubber tyre disc, chrome rim ring, chrome hub cap
  const wheelPos = [
    ["fl", 1.14, 1], ["fr", 1.14, -1], ["rl", -1.12, 1], ["rr", -1.12, -1],
  ];
  for (const [id, x, side] of wheelPos) {
    const g = new THREE.Group();
    g.name = "wheel_" + id;
    g.position.set(x, 0.36, side * 0.70);
    const tyre = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.27, 56, 1), rubber);
    tyre.name = "tyre_" + id;
    tyre.rotation.x = Math.PI / 2;
    g.add(tyre);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.026, 12, 48), chrome);
    rim.name = "rim_" + id;
    rim.position.z = side * 0.138;
    g.add(rim);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.02, 32), chrome);
    hub.name = "hub_" + id;
    hub.rotation.x = Math.PI / 2;
    hub.position.z = side * 0.136;
    g.add(hub);
    car.add(g);
  }

  return {
    scene,
    camera: new THREE.PerspectiveCamera(32, 16 / 9, 0.1, 100),
    cameraTarget: [0, 0.6, 0],
    renderer: { toneMapping: "aces", exposure: 1 },
  };
}
