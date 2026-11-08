// B1 recipe 3: a stylized car. Exercises MeshPhysicalMaterial (clearcoat paint), emissive lights, an exported
// wheel-spin AnimationClip, and an image-based-light hint (RoomEnvironment in three, environments.neutral in Aura3D).
import * as THREE from "three";

export const params = { paint: "#d23c2a", wheelBase: 2.4 };

function wheel(name, rubber, hub) {
  const group = new THREE.Group();
  group.name = name;
  const tyre = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.32, 24), rubber);
  tyre.name = "tyre";
  tyre.rotation.x = Math.PI / 2;
  tyre.castShadow = true;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.34, 6), hub);
  cap.name = "hub";
  cap.rotation.x = Math.PI / 2;
  group.add(tyre, cap);
  return group;
}

export default function createScene({ params: p }) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#d9dde3");
  const paint = new THREE.MeshPhysicalMaterial({ name: "paint", color: p.paint, metalness: 0.3, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.08 });
  const glass = new THREE.MeshStandardMaterial({ name: "glass", color: "#1d2a36", metalness: 0.1, roughness: 0.05 });
  const rubber = new THREE.MeshStandardMaterial({ name: "rubber", color: "#1b1b1d", roughness: 0.9 });
  const chrome = new THREE.MeshStandardMaterial({ name: "chrome", color: "#d8dce0", metalness: 1, roughness: 0.18 });
  const lamp = new THREE.MeshStandardMaterial({ name: "headlamp", color: "#fff7dc", emissive: "#fff2c0", emissiveIntensity: 2 });
  const tail = new THREE.MeshStandardMaterial({ name: "taillamp", color: "#5a0d0d", emissive: "#ff2a1a", emissiveIntensity: 1.5 });

  const car = new THREE.Group();
  car.name = "car";
  scene.add(car);
  const body = new THREE.Mesh(new THREE.BoxGeometry(p.wheelBase + 1.5, 0.55, 1.7), paint);
  body.name = "body";
  body.position.y = 0.62;
  body.castShadow = true;
  car.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.55, 1.5), paint);
  cabin.name = "cabin";
  cabin.position.set(-0.25, 1.15, 0);
  cabin.castShadow = true;
  car.add(cabin);
  const windows = new THREE.Mesh(new THREE.BoxGeometry(2.04, 0.4, 1.54), glass);
  windows.name = "windows";
  windows.position.set(-0.25, 1.17, 0);
  car.add(windows);
  for (const z of [-0.55, 0.55]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.34), lamp);
    head.name = z < 0 ? "headlamp_l" : "headlamp_r";
    head.position.set((p.wheelBase + 1.5) / 2 + 0.01, 0.7, z);
    car.add(head);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.14, 0.3), tail);
    back.name = z < 0 ? "taillamp_l" : "taillamp_r";
    back.position.set(-(p.wheelBase + 1.5) / 2 - 0.01, 0.72, z);
    car.add(back);
  }
  const bumper = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 1.72), chrome);
  bumper.name = "bumper";
  bumper.position.set((p.wheelBase + 1.5) / 2 + 0.04, 0.42, 0);
  car.add(bumper);
  const wheels = [];
  for (const [x, z, n] of [[p.wheelBase / 2, 0.85, "wheel_fr"], [p.wheelBase / 2, -0.85, "wheel_fl"], [-p.wheelBase / 2, 0.85, "wheel_rr"], [-p.wheelBase / 2, -0.85, "wheel_rl"]]) {
    const w = wheel(n, rubber, chrome);
    w.position.set(x, 0.42, z);
    car.add(w);
    wheels.push(w);
  }

  const floor = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 4.5, 0.1, 48), new THREE.MeshStandardMaterial({ name: "turntable", color: "#a6abb3", roughness: 0.6 }));
  floor.name = "turntable";
  floor.position.y = -0.05;
  floor.receiveShadow = true;
  scene.add(floor);

  // Wheel spin: one clip, quaternion tracks addressed by the wheels' stable names.
  const q0 = new THREE.Quaternion(), q1 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -Math.PI), q2 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -2 * Math.PI);
  const values = [...q0.toArray(), ...q1.toArray(), ...q2.toArray()];
  const clip = new THREE.AnimationClip("wheel_spin", 1, wheels.map((w) => new THREE.QuaternionKeyframeTrack(`${w.name}.quaternion`, [0, 0.5, 1], values)));

  scene.add(new THREE.HemisphereLight("#ffffff", "#8a8f99", 0.8));
  const key = new THREE.DirectionalLight("#ffffff", 2.2);
  key.name = "key";
  key.position.set(4, 7, 5);
  key.castShadow = true;
  scene.add(key);

  const camera = new THREE.PerspectiveCamera(35, 16 / 9, 0.1, 100);
  camera.position.set(5.2, 2.6, 6.2);
  return { scene, camera, cameraTarget: [0, 0.7, 0], clips: [clip], environment: { kind: "room", intensity: 0.6 }, renderer: { toneMapping: "aces", exposure: 1 } };
}
