// Showroom turntable bezel: dark floor with a circular opening, chrome rim and a cool ring light.
// The reflective disc itself (a planar mirror) is added natively in src/ inside the opening.

export const params = { radius: 2.4 };

export default function createScene({ THREE, params: p }) {
  const scene = new THREE.Scene();
  const R = p.radius;

  const floorMat = new THREE.MeshStandardMaterial({ name: "showroom_floor", color: new THREE.Color("#07080b"), metalness: 0.1, roughness: 0.7 });
  const chrome = new THREE.MeshStandardMaterial({ name: "bezel_chrome", color: new THREE.Color("#e9edf3"), metalness: 1, roughness: 0.05 });
  const ring = new THREE.MeshStandardMaterial({
    name: "ring_light", color: new THREE.Color("#9fd2ff"), emissive: new THREE.Color("#7fc2ff"), emissiveIntensity: 2.4, roughness: 0.4,
  });

  // lathe profile: opening edge -> raised lip -> flat floor out to the horizon
  const prof = [
    [R, 0.0], [R, 0.1], [R + 0.05, 0.14], [R + 0.16, 0.15], [R + 0.28, 0.12], [R + 0.5, 0.09], [R + 1.0, 0.08], [14, 0.08], [14, 0.0],
  ].map(([x, y]) => new THREE.Vector2(x, y)).reverse();
  const bezel = new THREE.Mesh(new THREE.LatheGeometry(prof, 128), floorMat);
  bezel.name = "floor_bezel";
  scene.add(bezel);

  const rim = new THREE.Mesh(new THREE.TorusGeometry(R + 0.04, 0.035, 16, 160), chrome);
  rim.name = "chrome_rim";
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.12;
  scene.add(rim);

  const light = new THREE.Mesh(new THREE.TorusGeometry(R - 0.14, 0.02, 12, 160), ring);
  light.name = "ring_light";
  light.rotation.x = Math.PI / 2;
  light.position.y = 0.075;
  scene.add(light);

  return { scene, camera: new THREE.PerspectiveCamera(32, 16 / 9, 0.1, 100), cameraTarget: [0, 0.5, 0], renderer: { toneMapping: "aces", exposure: 1 } };
}
