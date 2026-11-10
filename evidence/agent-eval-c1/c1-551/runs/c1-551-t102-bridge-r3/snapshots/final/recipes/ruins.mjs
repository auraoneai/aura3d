// Ancient ruin stage: platform, ring portal frame, ruined pillars, rubble. Lights, vortex, particles live in src/.
export const params = { ringRadius: 2.6, blocks: 14 };

function noiseTexture(THREE, random, size, base, spread) {
  const grid = 8;
  const lattice = Array.from({ length: (grid + 1) * (grid + 1) }, () => random());
  const at = (x, y) => lattice[(y % grid) * (grid + 1) + (x % grid)];
  const smooth = (t) => t * t * (3 - 2 * t);
  const data = new Uint8Array(size * size * 4);
  for (let j = 0; j < size; j += 1) {
    for (let i = 0; i < size; i += 1) {
      let v = 0;
      let amp = 0.55;
      let freq = 1;
      for (let o = 0; o < 4; o += 1) {
        const gx = ((i / size) * grid * freq) % grid;
        const gy = ((j / size) * grid * freq) % grid;
        const x0 = Math.floor(gx);
        const y0 = Math.floor(gy);
        const fx = smooth(gx - x0);
        const fy = smooth(gy - y0);
        const a = at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx;
        const b = at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx;
        v += (a * (1 - fy) + b * fy) * amp;
        amp *= 0.5;
        freq *= 2;
      }
      const crack = random() < 0.012 ? 0.55 : 1;
      const k = (j * size + i) * 4;
      const s = (0.55 + (v - 0.5) * spread) * crack;
      data[k] = Math.max(0, Math.min(255, base[0] * s * 1.6));
      data[k + 1] = Math.max(0, Math.min(255, base[1] * s * 1.6));
      data[k + 2] = Math.max(0, Math.min(255, base[2] * s * 1.6));
      data[k + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export default function createScene({ THREE, random, params: p }) {
  const scene = new THREE.Scene();
  const tex = noiseTexture(THREE, random, 128, [120, 118, 130], 1.8);
  const texDark = noiseTexture(THREE, random, 128, [70, 70, 84], 1.5);

  const stone = new THREE.MeshStandardMaterial({ name: "stone", color: "#c9c6d2", map: tex, roughness: 0.92, metalness: 0.02 });
  const stoneDark = new THREE.MeshStandardMaterial({ name: "stone_dark", color: "#b8b5c4", map: texDark, roughness: 0.95, metalness: 0.0 });
  const ground = new THREE.MeshStandardMaterial({ name: "ground", color: "#2a2833", map: texDark, roughness: 1, metalness: 0 });
  const metal = new THREE.MeshStandardMaterial({ name: "rune_metal", color: "#3b4152", roughness: 0.45, metalness: 0.85 });
  const rune = new THREE.MeshStandardMaterial({ name: "rune_glow", color: "#06202a", emissive: "#3fe6ff", emissiveIntensity: 2.2, roughness: 0.5 });
  const moss = new THREE.MeshStandardMaterial({ name: "moss", color: "#2f4a3a", roughness: 1, metalness: 0 });

  const add = (parent, geo, mat, name, pos, rot) => {
    const m = new THREE.Mesh(geo, mat);
    m.name = name;
    m.position.set(pos[0], pos[1], pos[2]);
    if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };

  // Ground and platform
  const g = add(scene, new THREE.CircleGeometry(60, 48), ground, "ground", [0, 0, 0], [-Math.PI / 2, 0, 0]);
  g.castShadow = false;
  add(scene, new THREE.CylinderGeometry(7.6, 7.9, 0.28, 12), stoneDark, "step_outer", [0, 0.14, 0]);
  add(scene, new THREE.CylinderGeometry(6.2, 6.5, 0.5, 12), stone, "platform", [0, 0.25 + 0.28, 0]);
  add(scene, new THREE.CylinderGeometry(3.6, 3.7, 0.12, 24), metal, "dais_inlay", [0, 0.78 + 0.06, 0]);

  // Ring portal frame, standing in the XY plane, facing +Z
  const R = p.ringRadius;
  const cy = 0.84 + R + 0.1;
  const ring = new THREE.Group();
  ring.name = "portal_ring";
  ring.position.set(0, cy, 0);
  scene.add(ring);
  const n = p.blocks;
  const arc = (Math.PI * 2) / n;
  for (let i = 0; i < n; i += 1) {
    const a = i * arc + arc / 2;
    const w = 0.8 + random() * 0.08;
    const blockLen = 2 * (R - 0.35) * Math.tan(arc / 2) * 1.04;
    const bx = Math.cos(a) * (R - 0.35);
    const by = Math.sin(a) * (R - 0.35);
    const block = add(ring, new THREE.BoxGeometry(blockLen, w, 0.95 + random() * 0.1), i % 3 === 0 ? stoneDark : stone, `ring_block_${i}`, [bx, by, 0], [0, 0, a + Math.PI / 2]);
    block.userData = {};
    // glowing rune on the inner face
    const rr = R - 0.35 - w / 2 + 0.02;
    add(ring, new THREE.BoxGeometry(0.1, 0.34, 0.5), rune, `rune_${i}`, [Math.cos(a) * rr, Math.sin(a) * rr, 0.0], [0, 0, a]);
    // moss patches on lower blocks
    if (by < 0 && i % 2 === 0) add(ring, new THREE.BoxGeometry(blockLen * 0.6, 0.1, 0.8), moss, `moss_${i}`, [bx * 1.03, by * 1.03 + 0.1, 0], [0, 0, a + Math.PI / 2]);
  }
  // metal inner lip and outer collar
  const lip = new THREE.Mesh(new THREE.TorusGeometry(R - 0.78, 0.07, 12, 64), metal);
  lip.name = "inner_lip";
  lip.castShadow = true;
  ring.add(lip);
  const collar = new THREE.Mesh(new THREE.TorusGeometry(R - 0.35, 0.05, 8, 64), metal);
  collar.name = "outer_collar";
  collar.position.z = 0.5;
  ring.add(collar);
  const collar2 = collar.clone();
  collar2.name = "outer_collar_back";
  collar2.position.z = -0.5;
  ring.add(collar2);

  // Pedestal supports
  add(scene, new THREE.BoxGeometry(2.4, 0.9, 1.3), stoneDark, "pedestal", [0, 0.78 + 0.45 - 0.0, 0]);
  add(scene, new THREE.BoxGeometry(0.9, 1.4, 1.1), stone, "buttress_l", [-2.9, 0.78 + 0.7, 0], [0, 0, 0.12]);
  add(scene, new THREE.BoxGeometry(0.8, 0.9, 1.0), stone, "buttress_r", [3.0, 0.78 + 0.45, 0.1], [0, 0.1, -0.1]);

  // Ruined pillars
  const pillars = [
    { x: -6.8, z: 2.0, h: 5.2, broken: false },
    { x: 6.6, z: 3.4, h: 3.2, broken: true },
    { x: -5.4, z: -4.8, h: 4.2, broken: true },
    { x: 5.6, z: -5.2, h: 5.6, broken: false },
    { x: -9.5, z: -1.5, h: 2.0, broken: true },
    { x: 9.6, z: -0.8, h: 4.4, broken: true }
  ];
  pillars.forEach((pl, i) => {
    const group = new THREE.Group();
    group.name = `pillar_${i}`;
    const baseY = 0;
    group.position.set(pl.x, baseY, pl.z);
    group.rotation.y = random() * 3;
    scene.add(group);
    add(group, new THREE.BoxGeometry(1.5, 0.4, 1.5), stoneDark, "plinth", [0, 0.2, 0]);
    const shaft = add(group, new THREE.CylinderGeometry(0.5, 0.58, pl.h, 10), i % 2 ? stoneDark : stone, "shaft", [0, 0.4 + pl.h / 2, 0]);
    if (pl.broken) shaft.rotation.z = (random() - 0.5) * 0.06;
    // groove bands
    for (let b = 0; b < 3; b += 1) add(group, new THREE.CylinderGeometry(0.6, 0.6, 0.12, 10), stone, `band_${b}`, [0, 0.9 + b * (pl.h / 3.2), 0]);
    if (!pl.broken) {
      add(group, new THREE.BoxGeometry(1.4, 0.35, 1.4), stoneDark, "capital", [0, 0.4 + pl.h + 0.17, 0]);
    } else {
      // jagged top chunk and fallen drum
      add(group, new THREE.DodecahedronGeometry(0.5, 0), stone, "chip", [0.2, 0.4 + pl.h + 0.1, 0.1], [random(), random(), random()]);
      const drum = add(scene, new THREE.CylinderGeometry(0.5, 0.52, 1.4 + random(), 10), stone, `fallen_drum_${i}`, [pl.x + 1.5 + random(), 0.52, pl.z + 1.2 + random()], [0, 0, Math.PI / 2]);
      drum.rotation.y = random() * 3;
    }
  });
  // lintel fallen across two stumps
  add(scene, new THREE.BoxGeometry(4.2, 0.6, 0.9), stoneDark, "fallen_lintel", [-8.2, 0.32, 5.6], [0.0, 0.5, 0.05]);

  // Rubble
  for (let i = 0; i < 26; i += 1) {
    const a = random() * Math.PI * 2;
    const r = 3.4 + random() * 8;
    const s = 0.15 + random() * 0.45;
    const onPlatform = r < 6;
    add(scene, new THREE.DodecahedronGeometry(s, 0), i % 2 ? stone : stoneDark, `rubble_${i}`, [Math.cos(a) * r, (onPlatform ? 0.78 : 0) + s * 0.5, Math.sin(a) * r], [random() * 3, random() * 3, random() * 3]);
  }

  const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 200);
  camera.position.set(0, 3.6, 13);
  return {
    scene,
    camera,
    cameraTarget: [0, 3.2, 0],
    renderer: { toneMapping: "aces", exposure: 1 }
  };
}
