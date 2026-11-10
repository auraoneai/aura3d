// Ancient stone ruin: stepped platform, runic ring frame, ruined pillars, rubble.
// The portal faces +z. Ring centre is at (0, 3.6, 0).
export const params = { ringRadius: 2.55, centerY: 3.6 };

export default function createScene({ THREE, params: p, random }) {
  const scene = new THREE.Scene();

  // Weathered stone albedo: small DataTexture of value noise (survives the headless export).
  const N = 64;
  const data = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const base = 150 + (random() - 0.5) * 70;
      const blotch = Math.sin(x * 0.31) * Math.cos(y * 0.23) * 18;
      const v = Math.max(60, Math.min(235, base + blotch));
      const i = (y * N + x) * 4;
      data[i] = v * 0.97; data[i + 1] = v * 0.98; data[i + 2] = v * 1.04; data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;

  const stone = new THREE.MeshStandardMaterial({ name: "stone", color: "#6f7080", map: tex, roughness: 0.92, metalness: 0.02 });
  const stoneDark = new THREE.MeshStandardMaterial({ name: "stone_dark", color: "#44454f", map: tex, roughness: 0.95, metalness: 0.02 });
  const metal = new THREE.MeshStandardMaterial({ name: "runic_metal", color: "#4b4f62", roughness: 0.45, metalness: 0.85 });
  const moss = new THREE.MeshStandardMaterial({ name: "moss", color: "#35452f", roughness: 1, metalness: 0 });

  const add = (parent, geo, mat, name, pos, rot) => {
    const m = new THREE.Mesh(geo, mat);
    m.name = name;
    m.castShadow = true;
    m.receiveShadow = true;
    if (pos) m.position.set(...pos);
    if (rot) m.rotation.set(...rot);
    parent.add(m);
    return m;
  };

  // Ground
  add(scene, new THREE.CylinderGeometry(26, 26, 0.3, 48), stoneDark, "ground", [0, -0.15, 0]);

  // Platform steps
  add(scene, new THREE.CylinderGeometry(6.2, 6.5, 0.4, 40), stoneDark, "platform_low", [0, 0.2, 0]);
  add(scene, new THREE.CylinderGeometry(5.0, 5.2, 0.36, 40), stone, "platform_high", [0, 0.58, 0]);

  // Moss patches / cracks on the platform
  for (let i = 0; i < 7; i++) {
    const a = random() * Math.PI * 2, r = 2.5 + random() * 2.2;
    add(scene, new THREE.CylinderGeometry(0.4 + random() * 0.5, 0.4, 0.03, 10), moss, `moss_${i}`, [Math.cos(a) * r, 0.78, Math.sin(a) * r]);
  }

  // Portal frame
  const cy = p.centerY, R = p.ringRadius;
  const frame = new THREE.Group();
  frame.name = "portal_frame";
  frame.position.set(0, cy, 0);
  scene.add(frame);

  // inner metal ring (runic metal)
  add(frame, new THREE.TorusGeometry(R - 0.05, 0.13, 14, 72), metal, "inner_band");
  // outer stone ring built from blocks
  const blocks = 16;
  for (let i = 0; i < blocks; i++) {
    const a = (i / blocks) * Math.PI * 2;
    const w = 2 * Math.PI * (R + 0.3) / blocks * 0.97;
    const missing = i === 5 ? 0.55 : 1; // a chipped block
    const h = 0.62 * missing + (i === 5 ? 0 : 0);
    const b = add(frame, new THREE.BoxGeometry(w, 0.7, 0.8), i % 2 ? stone : stoneDark, `block_${i}`,
      [Math.cos(a) * (R + 0.28), Math.sin(a) * (R + 0.28), 0], [0, 0, a + Math.PI / 2]);
    if (i === 5) b.scale.set(0.7, 0.85, 0.9);
    void h;
  }
  // flanking stone fins at front and back of the ring
  add(frame, new THREE.TorusGeometry(R + 0.3, 0.1, 10, 72), metal, "outer_band", [0, 0, 0.42]);
  add(frame, new THREE.TorusGeometry(R + 0.3, 0.1, 10, 72), metal, "outer_band_back", [0, 0, -0.42]);

  // Base plinth and side supports
  add(scene, new THREE.BoxGeometry(3.4, 0.5, 1.5), stone, "plinth", [0, 0.9 + 0.1, 0]);
  add(scene, new THREE.BoxGeometry(1.2, 1.4, 1.1), stoneDark, "support_l", [-2.55, 1.5, 0]);
  add(scene, new THREE.BoxGeometry(1.2, 1.1, 1.1), stoneDark, "support_r", [2.55, 1.35, 0], [0, 0.15, 0]);

  // Ruined pillars around the platform
  const pillar = (name, x, z, h, lean, broken) => {
    const g = new THREE.Group();
    g.name = name;
    g.position.set(x, 0.76, z);
    g.rotation.set(lean[0], 0, lean[1]);
    scene.add(g);
    add(g, new THREE.BoxGeometry(1.1, 0.3, 1.1), stoneDark, `${name}_base`, [0, 0.15, 0]);
    add(g, new THREE.CylinderGeometry(0.4, 0.46, h, 12), stone, `${name}_shaft`, [0, 0.3 + h / 2, 0]);
    add(g, new THREE.TorusGeometry(0.43, 0.06, 6, 16), stoneDark, `${name}_ring`, [0, 0.5, 0], [Math.PI / 2, 0, 0]);
    if (!broken) add(g, new THREE.BoxGeometry(1.05, 0.28, 1.05), stoneDark, `${name}_cap`, [0, 0.3 + h + 0.14, 0]);
    return g;
  };
  pillar("pillar_a", -5.4, -2.2, 4.6, [0, 0], false);
  pillar("pillar_b", 5.6, -1.4, 3.1, [0, 0.04], true);
  pillar("pillar_c", -4.4, 3.6, 2.0, [0, -0.05], true);
  pillar("pillar_d", 4.6, 4.2, 4.2, [0.02, 0], false);
  pillar("pillar_e", 0.8, -5.6, 2.6, [0.03, 0.02], true);

  // Fallen drums and rubble beyond the platform edge
  const fallen = [
    [-7.4, 1.0, 0.8, 0.3], [-6.2, 4.6, 0.9, 1.2], [7.2, 3.4, 0.7, 0.5], [6.8, -3.8, 1.0, 2.0], [-2.6, -7.0, 0.8, 0.9],
    [3.4, 7.0, 0.6, 2.4], [-8.5, -4.5, 0.7, 1.6], [8.6, 0.4, 0.8, 0.2]
  ];
  fallen.forEach(([x, z, s, ry], i) => {
    add(scene, new THREE.BoxGeometry(s * 1.3, s * 0.7, s), i % 2 ? stone : stoneDark, `rubble_${i}`, [x, s * 0.3, z], [0.1 * i, ry, 0.08 * i]);
  });
  add(scene, new THREE.CylinderGeometry(0.42, 0.45, 1.8, 12), stone, "fallen_drum_a", [-3.4, 0.55, 5.6], [0, 0.6, Math.PI / 2]);
  add(scene, new THREE.CylinderGeometry(0.4, 0.43, 1.4, 12), stone, "fallen_drum_b", [3.2, 0.5, -6.0], [0, -0.3, Math.PI / 2]);

  // Steps leading onto the platform (front)
  add(scene, new THREE.BoxGeometry(3.0, 0.2, 1.0), stone, "step_1", [0, 0.1, 6.9]);
  add(scene, new THREE.BoxGeometry(2.6, 0.3, 0.9), stone, "step_2", [0, 0.35, 6.2]);

  const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 120);
  camera.position.set(0, 3.2, 13);
  return { scene, camera, cameraTarget: [0, 3, 0], renderer: { toneMapping: "aces", exposure: 1 } };
}
