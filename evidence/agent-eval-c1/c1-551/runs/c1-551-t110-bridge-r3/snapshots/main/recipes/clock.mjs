// Grandfather clock built from simple shapes. Front faces +z. Units are metres.
export const params = {
  wood: "#6b3d1e",
  face: "#efe3c4",
  brass: "#c9a24a",
  includeMoving: false
};

export default function createScene({ THREE, params: p }) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#1a120d");

  const std = (color, rough = 0.6, metal = 0) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
  const wood = std(p.wood, 0.55);
  wood.name = "wood";
  const darkWood = std("#3a2112", 0.7);
  darkWood.name = "dark_wood";
  const interior = std("#2a1810", 0.9);
  interior.name = "interior";
  const brass = std(p.brass, 0.3, 0.8);
  brass.name = "brass";
  const faceMat = std(p.face, 0.8);
  faceMat.name = "face";
  const ink = std("#1b1410", 0.6);
  ink.name = "ink";
  const glassMat = new THREE.MeshStandardMaterial({ color: "#cfe6ee", roughness: 0.05, metalness: 0, transparent: true, opacity: 0.14 });
  glassMat.name = "glass";
  const wallMat = std("#8c6b55", 0.95);
  wallMat.name = "wall";
  const floorMat = std("#4b3022", 0.5);
  floorMat.name = "floor";

  const add = (parent, geo, mat, name, x, y, z) => {
    const m = new THREE.Mesh(geo, mat);
    m.name = name;
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  };
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

  // Room
  const floor = add(scene, new THREE.PlaneGeometry(10, 8), floorMat, "floor_plane", 0, 0, 1.5);
  floor.rotation.x = -Math.PI / 2;
  add(scene, new THREE.PlaneGeometry(10, 6), wallMat, "wall_plane", 0, 3, -0.5);
  add(scene, box(10, 0.18, 0.05), darkWood, "skirting", 0, 0.09, -0.47);

  const clock = new THREE.Group();
  clock.name = "clock";
  scene.add(clock);

  // Plinth and trunk
  add(clock, box(1.5, 0.35, 0.8), wood, "plinth", 0, 0.175, 0);
  add(clock, box(1.58, 0.05, 0.86), darkWood, "plinth_cap", 0, 0.375, 0);
  add(clock, box(1.3, 1.8, 0.04), interior, "trunk_back", 0, 1.4, -0.3);
  add(clock, box(0.1, 1.8, 0.64), wood, "trunk_side_l", -0.6, 1.4, 0);
  add(clock, box(0.1, 1.8, 0.64), wood, "trunk_side_r", 0.6, 1.4, 0);
  add(clock, box(1.3, 0.14, 0.06), wood, "rail_bottom", 0, 0.5, 0.31);
  add(clock, box(1.3, 0.14, 0.06), wood, "rail_top", 0, 2.28, 0.31);
  add(clock, box(1.1, 1.62, 0.01), glassMat, "glass_pane", 0, 1.39, 0.33);
  add(clock, box(1.1, 0.03, 0.02), brass, "trim_bottom", 0, 0.58, 0.335);
  add(clock, box(1.1, 0.03, 0.02), brass, "trim_top", 0, 2.2, 0.335);

  // Hood
  add(clock, box(1.4, 1.2, 0.72), wood, "hood", 0, 2.95, 0);
  add(clock, box(1.55, 0.1, 0.84), darkWood, "hood_cornice", 0, 3.6, 0);
  add(clock, box(1.0, 0.12, 0.6), darkWood, "hood_crown", 0, 3.71, 0);
  add(clock, new THREE.SphereGeometry(0.07, 16, 12), brass, "finial", 0, 3.84, 0);

  // Dial
  const dialZ = 0.365;
  const bezel = add(clock, new THREE.TorusGeometry(0.47, 0.035, 12, 48), brass, "bezel", 0, 2.95, dialZ);
  bezel.name = "bezel";
  const dial = add(clock, new THREE.CylinderGeometry(0.47, 0.47, 0.02, 48), faceMat, "dial", 0, 2.95, dialZ);
  dial.rotation.x = Math.PI / 2;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const major = i % 3 === 0;
    const r = major ? 0.37 : 0.385;
    const mark = add(clock, box(major ? 0.05 : 0.03, major ? 0.12 : 0.08, 0.012), ink, "hour_mark_" + (i === 0 ? 12 : i), Math.sin(a) * r, 2.95 + Math.cos(a) * r, dialZ + 0.014);
    mark.rotation.z = -a;
  }

  // Hands: pivot groups, hand points to +y at rotation 0 (12 o'clock).
  // The moving parts (hands, pendulum, weights) are native Aura3D nodes in src/main.ts so they can be driven per frame.
  // Set params.includeMoving to true to bake them in at their rest pose instead.
  if (p.includeMoving) {
  const handPivot = (name, z) => {
    const g = new THREE.Group();
    g.name = name;
    g.position.set(0, 2.95, z);
    clock.add(g);
    return g;
  };
  const hourHand = handPivot("hour_hand", dialZ + 0.02);
  add(hourHand, box(0.05, 0.24, 0.012), ink, "hour_hand_blade", 0, 0.1, 0);
  add(hourHand, box(0.05, 0.05, 0.012), ink, "hour_hand_tail", 0, -0.04, 0);
  const minuteHand = handPivot("minute_hand", dialZ + 0.035);
  add(minuteHand, box(0.03, 0.36, 0.012), ink, "minute_hand_blade", 0, 0.15, 0);
  add(minuteHand, box(0.03, 0.08, 0.012), ink, "minute_hand_tail", 0, -0.06, 0);
  const secondHand = handPivot("second_hand", dialZ + 0.05);
  add(secondHand, box(0.012, 0.4, 0.008), std("#a3201a", 0.5), "second_hand_blade", 0, 0.14, 0);
  add(secondHand, box(0.012, 0.1, 0.008), std("#a3201a", 0.5), "second_hand_tail", 0, -0.08, 0);
  const hub = add(clock, new THREE.CylinderGeometry(0.03, 0.03, 0.02, 16), brass, "hub", 0, 2.95, dialZ + 0.065);
  hub.rotation.x = Math.PI / 2;

  // Pendulum: pivot at the top of the trunk, rod hangs along -y.
  const pendulum = new THREE.Group();
  pendulum.name = "pendulum";
  pendulum.position.set(0, 2.2, 0);
  clock.add(pendulum);
  add(pendulum, box(0.02, 1.35, 0.01), brass, "pendulum_rod", 0, -0.675, 0);
  const bob = add(pendulum, new THREE.CylinderGeometry(0.17, 0.17, 0.04, 40), brass, "bob", 0, -1.35, 0);
  bob.rotation.x = Math.PI / 2;
  add(pendulum, new THREE.TorusGeometry(0.17, 0.012, 8, 40), std("#8e6d25", 0.3, 0.8), "bob_rim", 0, -1.35, 0.022);
  add(pendulum, new THREE.SphereGeometry(0.03, 12, 8), brass, "pendulum_pivot", 0, 0, 0);

  // Weights on chains (chain runs up into the hood, out of sight)
  const makeWeight = (name, x) => {
    const g = new THREE.Group();
    g.name = name;
    g.position.set(x, 1.5, 0.05);
    clock.add(g);
    add(g, new THREE.CylinderGeometry(0.01, 0.01, 1.3, 6), std("#6a6a6a", 0.4, 0.8), name + "_chain", 0, 0.85, 0);
    add(g, new THREE.CylinderGeometry(0.09, 0.09, 0.36, 24), brass, name + "_body", 0, 0, 0);
    add(g, new THREE.CylinderGeometry(0.1, 0.1, 0.03, 24), std("#8e6d25", 0.3, 0.8), name + "_cap", 0, 0.195, 0);
    return g;
  };
  makeWeight("weight_l", -0.4);
  makeWeight("weight_r", 0.4);
  }

  // Lights: warm interior glow, a lamp and soft fill
  const hemi = new THREE.HemisphereLight("#ffe2b8", "#3a2418", 0.9);
  hemi.name = "hemi";
  scene.add(hemi);
  const lamp = new THREE.PointLight("#ffb866", 40, 14, 2);
  lamp.name = "lamp";
  lamp.position.set(-2.4, 3.2, 3.2);
  scene.add(lamp);
  const inner = new THREE.PointLight("#ffa84a", 6, 4, 2);
  inner.name = "inner_glow";
  inner.position.set(0, 1.5, 0.2);
  clock.add(inner);
  const key = new THREE.DirectionalLight("#ffd9a0", 1.6);
  key.name = "key";
  key.position.set(2, 4, 5);
  key.target.position.set(0, 1.8, 0);
  scene.add(key);

  const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 50);
  camera.position.set(0, 2.35, 6.8);

  return { scene, camera, cameraTarget: [0, 1.85, 0], renderer: { toneMapping: "aces", exposure: 1 } };
}
