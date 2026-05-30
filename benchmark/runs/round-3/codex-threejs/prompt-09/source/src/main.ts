import * as THREE from "three";

const root = document.querySelector<HTMLElement>("#app");

if (!root) {
  throw new Error("Missing #app root element");
}

document.body.style.margin = "0";
document.body.style.overflow = "hidden";
document.body.style.background = "#d9e4ec";
root.style.width = "100vw";
root.style.height = "100vh";

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xd9e4ec);
scene.fog = new THREE.Fog(0xd9e4ec, 12, 42);

const camera = new THREE.PerspectiveCamera(
  48,
  window.innerWidth / window.innerHeight,
  0.1,
  100,
);
camera.position.set(7.2, 4.8, 8.4);
camera.lookAt(0, 1.55, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
root.appendChild(renderer.domElement);

const hemi = new THREE.HemisphereLight(0xf5fbff, 0x52606a, 2.2);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xffffff, 2.4);
sun.position.set(6, 8, 5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 0.5;
sun.shadow.camera.far = 30;
sun.shadow.camera.left = -12;
sun.shadow.camera.right = 12;
sun.shadow.camera.top = 12;
sun.shadow.camera.bottom = -12;
scene.add(sun);

const groundMaterial = new THREE.MeshStandardMaterial({
  color: 0x7faa82,
  roughness: 0.86,
  metalness: 0,
});
const ground = new THREE.Mesh(new THREE.PlaneGeometry(32, 18), groundMaterial);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const grid = new THREE.GridHelper(32, 32, 0xffffff, 0x5d805f);
grid.position.y = 0.012;
grid.material.opacity = 0.28;
grid.material.transparent = true;
scene.add(grid);

const lane = new THREE.Mesh(
  new THREE.PlaneGeometry(13.5, 1.25),
  new THREE.MeshStandardMaterial({
    color: 0x6f946d,
    roughness: 0.92,
  }),
);
lane.rotation.x = -Math.PI / 2;
lane.position.set(0, 0.018, 0);
lane.receiveShadow = true;
scene.add(lane);

const humanoid = new THREE.Group();
scene.add(humanoid);

const torsoMaterial = new THREE.MeshStandardMaterial({
  color: 0x2f6f92,
  roughness: 0.55,
});
const headMaterial = new THREE.MeshStandardMaterial({
  color: 0xf0c891,
  roughness: 0.62,
});
const limbMaterial = new THREE.MeshStandardMaterial({
  color: 0x35424d,
  roughness: 0.6,
});
const footMaterial = new THREE.MeshStandardMaterial({
  color: 0x1f2730,
  roughness: 0.7,
});
const jointMaterial = new THREE.MeshStandardMaterial({
  color: 0xf6d5a8,
  roughness: 0.6,
});

function mesh<T extends THREE.BufferGeometry>(
  geometry: T,
  material: THREE.Material,
  position: THREE.Vector3Tuple,
): THREE.Mesh<T, THREE.Material> {
  const part = new THREE.Mesh(geometry, material);
  part.position.set(...position);
  part.castShadow = true;
  part.receiveShadow = true;
  return part;
}

const torso = mesh(
  new THREE.CylinderGeometry(0.42, 0.55, 1.35, 24),
  torsoMaterial,
  [0, 2.05, 0],
);
torso.scale.z = 0.72;
humanoid.add(torso);

const neck = mesh(new THREE.CylinderGeometry(0.13, 0.16, 0.22, 16), jointMaterial, [
  0,
  2.84,
  0,
]);
humanoid.add(neck);

const head = mesh(new THREE.SphereGeometry(0.42, 32, 20), headMaterial, [
  0,
  3.28,
  0,
]);
humanoid.add(head);

const nose = mesh(new THREE.BoxGeometry(0.11, 0.1, 0.18), headMaterial, [
  0,
  3.27,
  0.42,
]);
humanoid.add(nose);

function makeLimb(
  side: -1 | 1,
  hipX: number,
  shoulderX: number,
): {
  arm: THREE.Group;
  leg: THREE.Group;
  foot: THREE.Mesh;
} {
  const arm = new THREE.Group();
  arm.position.set(shoulderX * side, 2.55, 0);
  const upperArm = mesh(new THREE.BoxGeometry(0.22, 0.76, 0.22), limbMaterial, [
    0,
    -0.38,
    0,
  ]);
  const foreArm = mesh(new THREE.BoxGeometry(0.2, 0.68, 0.2), limbMaterial, [
    0,
    -0.98,
    0.02,
  ]);
  const hand = mesh(new THREE.SphereGeometry(0.15, 16, 10), jointMaterial, [
    0,
    -1.38,
    0.04,
  ]);
  arm.add(upperArm, foreArm, hand);
  humanoid.add(arm);

  const leg = new THREE.Group();
  leg.position.set(hipX * side, 1.36, 0);
  const thigh = mesh(new THREE.BoxGeometry(0.28, 0.82, 0.28), limbMaterial, [
    0,
    -0.41,
    0,
  ]);
  const shin = mesh(new THREE.BoxGeometry(0.24, 0.78, 0.24), limbMaterial, [
    0,
    -1.14,
    0,
  ]);
  const foot = mesh(new THREE.BoxGeometry(0.34, 0.18, 0.62), footMaterial, [
    0,
    -1.6,
    0.18,
  ]);
  leg.add(thigh, shin, foot);
  humanoid.add(leg);

  return { arm, leg, foot };
}

const left = makeLimb(-1, 0.24, 0.54);
const right = makeLimb(1, 0.24, 0.54);

const shadowPatch = new THREE.Mesh(
  new THREE.CircleGeometry(0.95, 48),
  new THREE.MeshBasicMaterial({
    color: 0x26322f,
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
  }),
);
shadowPatch.rotation.x = -Math.PI / 2;
shadowPatch.position.y = 0.026;
scene.add(shadowPatch);

const strideMarkers = new THREE.Group();
const markerMaterial = new THREE.MeshBasicMaterial({
  color: 0xf2f6f0,
  transparent: true,
  opacity: 0.52,
});
for (let i = 0; i < 9; i += 1) {
  const marker = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.08), markerMaterial);
  marker.rotation.x = -Math.PI / 2;
  marker.position.set(-5.8 + i * 1.45, 0.032, i % 2 === 0 ? -0.31 : 0.31);
  strideMarkers.add(marker);
}
scene.add(strideMarkers);

const clock = new THREE.Clock();
const walkSpeed = 1.15;
const pathLength = 11.8;
const startX = -pathLength / 2;

function animateCharacter(elapsed: number): void {
  const cycle = elapsed * 5.7;
  const stride = Math.sin(cycle);
  const counterStride = Math.sin(cycle + Math.PI);
  const footLiftLeft = Math.max(0, stride) * 0.22;
  const footLiftRight = Math.max(0, counterStride) * 0.22;
  const wrapped = ((elapsed * walkSpeed) % pathLength) + startX;

  humanoid.position.set(wrapped, 0.16 + Math.abs(Math.sin(cycle * 2)) * 0.035, 0);
  humanoid.rotation.y = Math.sin(cycle * 0.5) * 0.05;
  humanoid.rotation.z = Math.sin(cycle * 2) * 0.025;

  torso.rotation.x = Math.sin(cycle) * 0.055;
  head.rotation.y = Math.sin(cycle) * 0.12;
  head.rotation.z = -Math.sin(cycle * 2) * 0.035;
  neck.rotation.copy(head.rotation);
  nose.rotation.copy(head.rotation);

  left.leg.rotation.x = stride * 0.66;
  right.leg.rotation.x = counterStride * 0.66;
  left.leg.rotation.z = -0.035;
  right.leg.rotation.z = 0.035;
  left.leg.position.y = 1.36 + footLiftLeft;
  right.leg.position.y = 1.36 + footLiftRight;
  left.foot.rotation.x = -stride * 0.24 - footLiftLeft * 1.8;
  right.foot.rotation.x = -counterStride * 0.24 - footLiftRight * 1.8;

  left.arm.rotation.x = counterStride * 0.82;
  right.arm.rotation.x = stride * 0.82;
  left.arm.rotation.z = -0.16;
  right.arm.rotation.z = 0.16;

  shadowPatch.position.x = humanoid.position.x;
  shadowPatch.position.z = humanoid.position.z;
  shadowPatch.scale.setScalar(1 - Math.abs(Math.sin(cycle * 2)) * 0.08);
}

function render(): void {
  const elapsed = clock.getElapsedTime() + 0.7;
  animateCharacter(elapsed);
  renderer.render(scene, camera);
}

renderer.setAnimationLoop(render);

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
