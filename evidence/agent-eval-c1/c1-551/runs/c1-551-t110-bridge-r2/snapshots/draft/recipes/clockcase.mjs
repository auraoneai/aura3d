// Static parts of the grandfather clock: wall, floor, case, dial, hour marks, glass.
// Moving parts (hands, pendulum, weights) are native Aura3D nodes in src/main.ts.
export const params = {
  wood: "#6b3a1e",
  woodDark: "#3f2111",
  dial: "#f1e6c8",
  brass: "#c9962b"
};

export default function createScene({ THREE, params: p }) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#2a1b12");

  const mat = (color, roughness = 0.6, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const wood = mat(p.wood, 0.55);
  const woodDark = mat(p.woodDark, 0.6);
  const brass = mat(p.brass, 0.35, 0.8);
  const dialMat = mat(p.dial, 0.8);
  const ink = mat("#1a1209", 0.7);

  const add = (parent, geo, material, name, x, y, z) => {
    const m = new THREE.Mesh(geo, material);
    m.name = name;
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

  // Room
  const room = new THREE.Group();
  room.name = "room";
  scene.add(room);
  const wall = add(room, box(14, 8, 0.2), mat("#b98f66", 0.9), "wall", 0, 3.6, -0.8);
  wall.castShadow = false;
  const floor = add(room, box(14, 0.2, 9), mat("#5a3a22", 0.5), "floor", 0, -0.1, 3.5);
  floor.castShadow = false;
  add(room, box(14, 0.35, 0.1), mat("#e8dcc4", 0.7), "skirting", 0, 0.175, -0.65);

  // Case
  const clock = new THREE.Group();
  clock.name = "clock";
  clock.position.set(0, 0, -0.1);
  scene.add(clock);

  add(clock, box(1.5, 0.3, 1.0), woodDark, "plinth", 0, 0.15, 0);
  add(clock, box(1.1, 2.2, 0.05), mat("#2a170b", 0.8), "trunk_back", 0, 1.4, -0.375);
  add(clock, box(0.12, 2.2, 0.8), wood, "trunk_left", -0.49, 1.4, 0);
  add(clock, box(0.12, 2.2, 0.8), wood, "trunk_right", 0.49, 1.4, 0);
  add(clock, box(0.17, 2.2, 0.06), wood, "post_left", -0.465, 1.4, 0.37);
  add(clock, box(0.17, 2.2, 0.06), wood, "post_right", 0.465, 1.4, 0.37);
  add(clock, box(1.1, 0.2, 0.06), wood, "rail_top", 0, 2.4, 0.37);
  add(clock, box(1.1, 0.3, 0.06), wood, "rail_bottom", 0, 0.45, 0.37);
  add(clock, box(0.78, 0.04, 0.02), brass, "trim_bottom", 0, 0.62, 0.41);

  // glass-like pane in front of the pendulum opening
  const glassMat = new THREE.MeshStandardMaterial({ color: "#cfe8ee", roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.14 });
  const glass = add(clock, box(0.76, 1.7, 0.012), glassMat, "glass", 0, 1.45, 0.385);
  glass.castShadow = false;

  // Hood
  add(clock, box(1.2, 1.3, 0.9), wood, "hood", 0, 3.15, 0.0);
  add(clock, box(1.34, 0.1, 1.04), woodDark, "hood_base", 0, 2.55, 0);
  add(clock, box(1.34, 0.14, 1.04), woodDark, "cornice", 0, 3.87, 0);
  add(clock, box(1.0, 0.1, 0.8), woodDark, "crown", 0, 3.99, 0);

  // Dial
  const faceZ = 0.455;
  const faceY = 3.2;
  const dial = new THREE.Group();
  dial.name = "dial";
  dial.position.set(0, faceY, faceZ);
  clock.add(dial);
  const disc = add(dial, new THREE.CylinderGeometry(0.44, 0.44, 0.02, 64), dialMat, "dial_disc", 0, 0, 0.005);
  disc.rotation.x = Math.PI / 2;
  const bezel = add(dial, new THREE.TorusGeometry(0.455, 0.03, 12, 64), brass, "bezel", 0, 0, 0.02);
  bezel.castShadow = false;
  for (let i = 0; i < 12; i += 1) {
    const a = (i / 12) * Math.PI * 2;
    const major = i % 3 === 0;
    const r = major ? 0.35 : 0.37;
    const m = add(dial, box(major ? 0.05 : 0.03, major ? 0.12 : 0.08, 0.012), ink, `hour_mark_${i}`, Math.sin(a) * r, Math.cos(a) * r, 0.02);
    m.rotation.z = -a;
    m.castShadow = false;
  }
  // Latch plate below dial
  add(clock, box(0.5, 0.05, 0.02), brass, "hood_plate", 0, 2.68, 0.46);

  scene.userData.dialCenter = [0, faceY, faceZ - 0.1 + 0.0];

  return {
    scene,
    camera: (() => {
      const c = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 50);
      c.position.set(0, 2.5, 7.5);
      c.lookAt(0, 2.0, 0);
      return c;
    })(),
    cameraTarget: [0, 2.0, 0],
    renderer: { toneMapping: "aces", exposure: 1 }
  };
}
