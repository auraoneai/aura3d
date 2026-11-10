// Static stage for the tower game: a round plinth the tower stands on and a dark floor. Slabs are native nodes.
export const params = { plinth: "#2b3040", floor: "#161922" };

export default function createScene({ THREE, params: p }) {
  const scene = new THREE.Scene();

  const floor = new THREE.Mesh(
    new THREE.CylinderGeometry(40, 40, 0.2, 48),
    new THREE.MeshStandardMaterial({ color: p.floor, roughness: 0.95, metalness: 0 })
  );
  floor.name = "floor";
  floor.position.y = -1.3;
  scene.add(floor);

  const plinth = new THREE.Mesh(
    new THREE.CylinderGeometry(3.4, 3.8, 0.8, 48),
    new THREE.MeshStandardMaterial({ color: p.plinth, roughness: 0.6, metalness: 0.2 })
  );
  plinth.name = "plinth";
  plinth.position.y = -0.8;
  scene.add(plinth);

  const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 200);
  camera.position.set(9, 7, 9);

  return { scene, camera, cameraTarget: [0, 1.5, 0], renderer: { toneMapping: "aces", exposure: 1 } };
}
