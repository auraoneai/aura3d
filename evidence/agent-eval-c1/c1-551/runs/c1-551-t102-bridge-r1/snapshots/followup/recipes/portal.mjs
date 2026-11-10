// Ancient ruin: stone platform, standing ring frame, broken pillars, rubble. The energy disc, lights,
// particles and camera are native Aura3D code in src/.
export const params = { blocks: 18, ringRadius: 2.3 };

export default function createScene({ THREE, random, params: p }) {
  const scene = new THREE.Scene();
  const rnd = (a = 0, b = 1) => a + (b - a) * random();

  // Mottled stone texture (DataTexture survives the headless export).
  const N = 128;
  const data = new Uint8Array(N * N * 4);
  const vals = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) vals[i] = random();
  const smooth = (x, y) => {
    let s = 0, w = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      s += vals[((y + dy + N) % N) * N + ((x + dx + N) % N)]; w++;
    }
    return s / w;
  };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const v = 0.55 * smooth(x, y) + 0.45 * vals[y * N + x];
    const g = Math.round(130 + v * 100);
    const k = (y * N + x) * 4;
    data[k] = g; data[k + 1] = g; data[k + 2] = Math.min(255, g + 6); data[k + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;

  const stone = (name, color, rough = 0.85) => new THREE.MeshStandardMaterial({ name, color, roughness: rough, metalness: 0.05, map: tex });
  const mStone = stone("stone", "#6d6a72");
  const mStoneDark = stone("stone_dark", "#4a4852");
  const mStoneMoss = stone("stone_moss", "#55604f", 0.95);
  const mPlatform = stone("platform", "#5d5a66", 0.55);
  const mGround = stone("ground", "#17161e", 0.95);
  const mRuneCyan = new THREE.MeshStandardMaterial({ name: "rune_cyan", color: "#0a2a33", emissive: "#27e6ff", emissiveIntensity: 2.2, roughness: 0.4 });
  const mRuneViolet = new THREE.MeshStandardMaterial({ name: "rune_violet", color: "#1a0a33", emissive: "#9a5cff", emissiveIntensity: 2.2, roughness: 0.4 });
  const mMetal = new THREE.MeshStandardMaterial({ name: "runic_metal", color: "#3b3f4d", roughness: 0.4, metalness: 0.8 });

  const add = (parent, geo, mat, name, pos, rot) => {
    const m = new THREE.Mesh(geo, mat);
    m.name = name;
    m.position.set(...pos);
    if (rot) m.rotation.set(...rot);
    m.castShadow = true; m.receiveShadow = true;
    parent.add(m);
    return m;
  };

  // Ground and platform
  const ground = add(scene, new THREE.CylinderGeometry(40, 40, 0.2, 48), mGround, "ground", [0, -0.1, 0]);
  ground.castShadow = false;
  add(scene, new THREE.CylinderGeometry(4.6, 4.9, 0.35, 28), mPlatform, "platform_base", [0, 0.175, 0]);
  add(scene, new THREE.CylinderGeometry(4.0, 4.2, 0.25, 28), mPlatform, "platform_top", [0, 0.475, 0]);
  // glowing rune circles inlaid in the platform
  const inlay = (name, r, t, mat, y) => {
    const m = add(scene, new THREE.TorusGeometry(r, t, 6, 64), mat, name, [0, y, 0], [Math.PI / 2, 0, 0]);
    m.castShadow = false;
  };
  inlay("platform_ring_outer", 3.6, 0.04, mRuneViolet, 0.605);
  inlay("platform_ring_inner", 3.0, 0.03, mRuneCyan, 0.605);
  // radial rune ticks
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const r = 3.3;
    const tick = add(scene, new THREE.BoxGeometry(0.5, 0.02, 0.07), i % 2 ? mRuneCyan : mRuneViolet, `platform_tick_${i}`,
      [Math.cos(a) * r, 0.605, Math.sin(a) * r], [0, -a, 0]);
    tick.castShadow = false;
  }
  // steps in front
  add(scene, new THREE.BoxGeometry(3.4, 0.2, 0.9), mStone, "step_1", [0, 0.1, 5.1]);
  add(scene, new THREE.BoxGeometry(2.6, 0.2, 0.8), mStoneDark, "step_2", [0, 0.2, 4.7]);

  // Ring frame
  const ring = new THREE.Group();
  ring.name = "ring";
  const R = p.ringRadius, cy = 0.6 + R + 0.15;
  ring.position.set(0, cy, 0);
  scene.add(ring);
  const nb = p.blocks;
  const chord = (2 * Math.PI * R) / nb;
  for (let i = 0; i < nb; i++) {
    const a = (i / nb) * Math.PI * 2 + Math.PI / nb;
    const mat = i % 5 === 3 ? mStoneMoss : i % 2 ? mStone : mStoneDark;
    const depth = 0.7 + rnd(-0.06, 0.08);
    const rad = 0.55 + rnd(-0.04, 0.06);
    const b = add(ring, new THREE.BoxGeometry(rad, chord * 1.02, depth), mat, `ring_block_${i}`,
      [Math.cos(a) * R, Math.sin(a) * R, 0], [rnd(-0.03, 0.03), rnd(-0.03, 0.03), a]);
    // glowing rune on the face
    const rune = add(ring, new THREE.BoxGeometry(0.06, chord * 0.5, 0.05), i % 2 ? mRuneCyan : mRuneViolet, `ring_rune_${i}`,
      [Math.cos(a) * R, Math.sin(a) * R, depth / 2 + 0.01], [0, 0, a]);
    rune.castShadow = false;
    void b;
  }
  // metal inner lip (thin torus hugging the disc) with bright cyan edge
  add(ring, new THREE.TorusGeometry(R - 0.3, 0.07, 10, 64), mMetal, "ring_lip", [0, 0, 0.0]);
  const edge = add(ring, new THREE.TorusGeometry(R - 0.36, 0.03, 8, 64), mRuneCyan, "ring_edge", [0, 0, 0.02]);
  edge.castShadow = false;
  // keystone cap and base blocks
  add(ring, new THREE.BoxGeometry(0.9, 0.5, 0.95), mStoneDark, "keystone", [0, R + 0.4, 0]);
  add(scene, new THREE.BoxGeometry(2.0, 0.5, 1.2), mStone, "ring_footing", [0, 0.85, 0]);

  // Pillars: intact, broken, fallen
  const pillar = (id, x, z, h, broken, tilt = 0) => {
    const g = new THREE.Group();
    g.name = `pillar_${id}`;
    g.position.set(x, 0.6, z);
    scene.add(g);
    const mat = id % 2 ? mStone : mStoneMoss;
    add(g, new THREE.BoxGeometry(1.1, 0.35, 1.1), mStoneDark, `pillar_${id}_base`, [0, 0.17, 0]);
    const shaft = add(g, new THREE.CylinderGeometry(0.38, 0.44, h, 8), mat, `pillar_${id}_shaft`, [0, 0.35 + h / 2, 0]);
    shaft.rotation.z = tilt;
    if (!broken) {
      add(g, new THREE.BoxGeometry(1.0, 0.3, 1.0), mStoneDark, `pillar_${id}_cap`, [0, 0.35 + h + 0.15, 0]);
    } else {
      // jagged top
      add(g, new THREE.DodecahedronGeometry(0.4, 0), mat, `pillar_${id}_chunk`, [0.15, 0.35 + h + 0.05, 0.05], [0.3, 0.5, 0.2]);
    }
    return g;
  };
  pillar(0, -5.6, -1.2, 4.6, false);
  pillar(1, 5.5, -2.0, 3.0, true);
  pillar(2, -4.2, -4.6, 2.0, true);
  pillar(3, 4.4, 3.2, 3.6, false);
  pillar(4, -6.0, 3.2, 1.3, true);
  pillar(5, 2.6, -5.8, 4.0, false);

  // Fallen drums and rubble
  const fallen = (id, x, z, ry, len) => {
    const m = add(scene, new THREE.CylinderGeometry(0.4, 0.42, len, 8), id % 2 ? mStone : mStoneMoss, `fallen_${id}`,
      [x, 0.4, z], [0, 0, Math.PI / 2]);
    m.rotation.order = "YZX";
    m.rotation.y = ry;
  };
  fallen(0, -3.0, 4.4, 0.6, 2.4);
  fallen(1, 6.8, 1.0, -0.3, 1.6);
  fallen(2, -7.4, -3.4, 1.1, 2.0);
  for (let i = 0; i < 26; i++) {
    const a = rnd(0, Math.PI * 2);
    const r = rnd(4.4, 11);
    const s = rnd(0.12, 0.45);
    add(scene, new THREE.DodecahedronGeometry(s, 0), i % 3 ? mStoneDark : mStone, `rubble_${i}`,
      [Math.cos(a) * r, s * 0.5, Math.sin(a) * r], [rnd(0, 3), rnd(0, 3), rnd(0, 3)]);
  }
  // crumbled wall segments in the background
  for (let i = 0; i < 6; i++) {
    const x = -8 + i * 3.2 + rnd(-0.5, 0.5);
    const h = rnd(0.8, 2.4);
    add(scene, new THREE.BoxGeometry(2.4, h, 0.7), i % 2 ? mStoneDark : mStone, `wall_${i}`,
      [x, h / 2, -9 + rnd(-0.6, 0.6)], [0, rnd(-0.1, 0.1), 0]);
  }

  return {
    scene,
    camera: new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 80),
    cameraTarget: [0, 2.8, 0],
    renderer: { toneMapping: "aces", exposure: 1 }
  };
}
