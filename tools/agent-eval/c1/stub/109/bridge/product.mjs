// Stub-model recipe (C1 dry run only): the car-paint product authored in three.js for `aura3d import-three`.
export const params = { paint: "#b0121b" };
export default function createScene({ THREE, params: p }) {
  const scene = new THREE.Scene();
  const car = new THREE.Group();
  car.name = "car";
  const shell = new THREE.Mesh(new THREE.CapsuleGeometry(0.62, 2.0, 8, 32), new THREE.MeshPhysicalMaterial({ name: "paint", color: p.paint, metalness: 0.55, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.04 }));
  shell.name = "body";
  shell.rotation.x = Math.PI / 2;
  shell.scale.set(1.2, 1, 0.75);
  shell.position.y = 0.72;
  car.add(shell);
  const cabin = new THREE.Mesh(new THREE.SphereGeometry(0.6, 32, 16), new THREE.MeshPhysicalMaterial({ name: "glass", color: "#0d0f14", roughness: 0.05, metalness: 0.2 }));
  cabin.name = "cabin";
  cabin.scale.set(0.9, 0.5, 1.2);
  cabin.position.set(0, 1.12, -0.15);
  car.add(cabin);
  const trim = new THREE.Mesh(new THREE.TorusGeometry(0.78, 0.03, 12, 64), new THREE.MeshStandardMaterial({ name: "chrome", color: "#e8e8ec", metalness: 1, roughness: 0.08 }));
  trim.name = "trim";
  trim.rotation.x = Math.PI / 2;
  trim.position.y = 0.7;
  car.add(trim);
  [[-0.78, 1], [0.78, 1], [-0.78, -1], [0.78, -1]].forEach(([x, z], i) => {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.3, 32), new THREE.MeshStandardMaterial({ name: "rubber", color: "#16171a", roughness: 0.9 }));
    w.name = `wheel${i}`;
    w.rotation.z = Math.PI / 2;
    w.position.set(x, 0.31, z);
    car.add(w);
  });
  scene.add(car);
  const table = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.5, 0.12, 64), new THREE.MeshStandardMaterial({ name: "table", color: "#202228", roughness: 0.25, metalness: 0.3 }));
  table.name = "turntable";
  table.position.y = -0.06;
  scene.add(table);
  const key = new THREE.DirectionalLight("#ffffff", 2.2);
  key.name = "key";
  key.position.set(3, 6, 2);
  scene.add(key);
  const camera = new THREE.PerspectiveCamera(38, 16 / 9, 0.1, 100);
  camera.position.set(4.2, 1.6, 5.2);
  return { scene, camera, cameraTarget: [0, 0.7, 0], renderer: { toneMapping: "aces", exposure: 1 } };
}
