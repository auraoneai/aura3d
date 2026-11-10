// Grandfather clock built from simple primitives. Animated parts are named groups driven natively in src/main.ts.
export default function createScene({ THREE }) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#1d1410");

  const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0, ...o });
  const wood = std("#7a4624", { roughness: 0.5 });
  const darkWood = std("#4a2a14", { roughness: 0.55 });
  const interior = std("#3b2114", { roughness: 0.9 });
  const brass = std("#d9a93a", { roughness: 0.3, metalness: 0.9 });
  const faceMat = std("#f2e8cc", { roughness: 0.8 });
  const ink = std("#1b1410", { roughness: 0.7 });
  const red = std("#a01818", { roughness: 0.5 });
  const iron = std("#2a2a2e", { roughness: 0.4, metalness: 0.7 });
  const glass = new THREE.MeshStandardMaterial({
    color: "#cfe6ff", roughness: 0.05, metalness: 0, transparent: true, opacity: 0.14
  });

  const add = (parent, geo, mat, name, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.name = name;
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  };
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

  // Room
  const wall = add(scene, new THREE.PlaneGeometry(9, 5.6), std("#9c7658", { roughness: 0.95 }), "wall", 0, 2.6, -0.3);
  const floor = add(scene, new THREE.PlaneGeometry(9, 6), std("#5b3a22", { roughness: 0.55 }), "floor", 0, 0, 2.7);
  floor.rotation.x = -Math.PI / 2;
  add(scene, box(9, 0.22, 0.05), std("#e8dcc4", { roughness: 0.8 }), "baseboard", 0, 0.11, -0.275);

  // Case
  const clock = new THREE.Group();
  clock.name = "clock";
  scene.add(clock);
  add(clock, box(1.14, 0.5, 0.62), darkWood, "base", 0, 0.25, 0.0);
  add(clock, box(1.2, 0.06, 0.68), wood, "base_top", 0, 0.53, 0.0);
  add(clock, box(0.08, 1.5, 0.5), wood, "side_left", -0.46, 1.28, 0);
  add(clock, box(0.08, 1.5, 0.5), wood, "side_right", 0.46, 1.28, 0);
  add(clock, box(0.84, 1.5, 0.04), interior, "back_panel", 0, 1.28, -0.23);
  add(clock, box(0.84, 0.07, 0.04), wood, "rail_top", 0, 1.965, 0.24);
  add(clock, box(0.84, 0.07, 0.04), wood, "rail_bottom", 0, 0.615, 0.24);
  add(clock, box(0.84, 1.3, 0.01), glass, "glass", 0, 1.29, 0.25);
  add(clock, box(1.0, 0.9, 0.5), wood, "hood", 0, 2.45, 0);
  add(clock, box(1.12, 0.1, 0.62), darkWood, "cap", 0, 2.95, 0);
  add(clock, box(0.6, 0.12, 0.5), wood, "pediment", 0, 3.06, 0);
  add(clock, new THREE.SphereGeometry(0.05, 16, 12), brass, "finial", 0, 3.17, 0);

  // Face
  const faceZ = 0.255;
  const disc = (r, mat, name, z) => {
    const m = add(clock, new THREE.CylinderGeometry(r, r, 0.012, 48), mat, name, 0, 2.45, z);
    m.rotation.x = Math.PI / 2;
    return m;
  };
  disc(0.395, brass, "face_rim", faceZ);
  disc(0.365, faceMat, "face", faceZ + 0.004);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const major = i % 3 === 0;
    const len = major ? 0.09 : 0.06;
    const wid = major ? 0.035 : 0.022;
    const r = 0.365 - 0.03 - len / 2;
    const mark = add(clock, box(wid, len, 0.008), ink, `hour_mark_${i + 1}`, Math.sin(a) * r, 2.45 + Math.cos(a) * r, faceZ + 0.014);
    mark.rotation.z = -a;
  }

  // Hands and weights are native Aura3D nodes in src/main.ts (they follow the real clock).

  // Pendulum: pivot group at the top of the trunk, swings about z
  const pendulum = new THREE.Group();
  pendulum.name = "pendulum";
  pendulum.position.set(0, 1.95, 0.04);
  clock.add(pendulum);
  add(pendulum, box(0.016, 1.0, 0.01), brass, "rod", 0, -0.5, 0);
  const bob = add(pendulum, new THREE.SphereGeometry(0.14, 32, 20), brass, "bob", 0, -1.02, 0);
  bob.scale.set(1, 1, 0.35);
  add(pendulum, new THREE.TorusGeometry(0.1, 0.012, 8, 32), iron, "bob_ring", 0, -1.02, 0.055);
  add(pendulum, new THREE.SphereGeometry(0.02, 12, 8), iron, "pivot_pin", 0, 0, 0);

  // Swing clip: 2 s period, sinusoidal (slowest at the extremes), loops seamlessly.
  const N = 64, AMP = 0.22, PERIOD = 2;
  const times = [], values = [];
  const q = new THREE.Quaternion(), axis = new THREE.Vector3(0, 0, 1);
  for (let i = 0; i <= N; i++) {
    times.push((i / N) * PERIOD);
    q.setFromAxisAngle(axis, AMP * Math.sin((i / N) * Math.PI * 2));
    values.push(q.x, q.y, q.z, q.w);
  }
  const swing = new THREE.AnimationClip("pendulum_swing", PERIOD, [
    new THREE.QuaternionKeyframeTrack("pendulum.quaternion", times, values)
  ]);

  // Warm lighting
  const lamp = new THREE.PointLight("#ffb866", 6, 3.5, 2);
  lamp.name = "interior_lamp";
  lamp.position.set(0, 1.5, 0.15);
  scene.add(lamp);
  const key = new THREE.PointLight("#ffc98a", 30, 12, 2);
  key.name = "room_lamp";
  key.position.set(1.8, 3.6, 3.2);
  scene.add(key);
  const fill = new THREE.PointLight("#ff9a55", 8, 10, 2);
  fill.name = "fill_lamp";
  fill.position.set(-2.2, 1.2, 2.4);
  scene.add(fill);

  const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 50);
  camera.position.set(0, 1.9, 5.6);
  return {
    scene,
    camera,
    cameraTarget: [0, 1.55, 0],
    clips: [swing],
    renderer: { toneMapping: "aces", exposure: 1 }
  };
}
