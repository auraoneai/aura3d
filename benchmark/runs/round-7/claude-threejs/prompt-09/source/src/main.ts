import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Renderer + canvas
// ---------------------------------------------------------------------------
const app = document.querySelector<HTMLDivElement>('#app')!;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

document.body.style.margin = '0';
renderer.domElement.style.display = 'block';

// ---------------------------------------------------------------------------
// Scene + camera + lights
// ---------------------------------------------------------------------------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fc6e0);
scene.fog = new THREE.Fog(0x9fc6e0, 18, 42);

const camera = new THREE.PerspectiveCamera(
  50,
  window.innerWidth / window.innerHeight,
  0.1,
  100,
);
camera.position.set(6, 4.2, 9);
camera.lookAt(0, 1.6, 0);

const hemi = new THREE.HemisphereLight(0xffffff, 0x4f6b52, 0.9);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xfff2d6, 1.6);
sun.position.set(6, 12, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 40;
sun.shadow.camera.left = -16;
sun.shadow.camera.right = 16;
sun.shadow.camera.top = 16;
sun.shadow.camera.bottom = -16;
scene.add(sun);

// ---------------------------------------------------------------------------
// Ground plane
// ---------------------------------------------------------------------------
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(60, 60),
  new THREE.MeshStandardMaterial({ color: 0x5b8a4f, roughness: 1 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// A grid gives a clear sense of the figure travelling across the plane.
const grid = new THREE.GridHelper(60, 60, 0x335c2e, 0x4a7340);
(grid.material as THREE.Material).transparent = true;
(grid.material as THREE.Material).opacity = 0.4;
grid.position.y = 0.01;
scene.add(grid);

// ---------------------------------------------------------------------------
// Humanoid figure built from primitive shapes
// ---------------------------------------------------------------------------
const skin = new THREE.MeshStandardMaterial({ color: 0xf2c39b, roughness: 0.7 });
const shirt = new THREE.MeshStandardMaterial({ color: 0x2f6fb0, roughness: 0.6 });
const pants = new THREE.MeshStandardMaterial({ color: 0x33394a, roughness: 0.7 });

function makeMesh(geometry: THREE.BufferGeometry, material: THREE.Material) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// Root group: handles travel across the plane.
const figure = new THREE.Group();
scene.add(figure);

// Body group: everything that bobs up and down with the gait.
const body = new THREE.Group();
figure.add(body);

// Torso (cylinder) — its center sits at y = 1.55.
const torso = makeMesh(new THREE.CylinderGeometry(0.42, 0.34, 1.2, 24), shirt);
torso.position.y = 1.55;
body.add(torso);

// Head (sphere) sitting on top of the torso.
const head = makeMesh(new THREE.SphereGeometry(0.34, 24, 24), skin);
head.position.y = 2.45;
body.add(head);

// Small neck (cylinder) connecting head and torso.
const neck = makeMesh(new THREE.CylinderGeometry(0.13, 0.13, 0.18, 16), skin);
neck.position.y = 2.18;
body.add(neck);

// Helper that builds a limb hanging from a pivot so it swings about its top.
function makeLimb(
  width: number,
  length: number,
  depth: number,
  material: THREE.Material,
) {
  const pivot = new THREE.Group();
  const limb = makeMesh(new THREE.BoxGeometry(width, length, depth), material);
  // Offset the box down by half its length so the pivot sits at the joint.
  limb.position.y = -length / 2;
  pivot.add(limb);
  return pivot;
}

// Arms (box limbs) pivoting at the shoulders.
const armLength = 1.1;
const leftArm = makeLimb(0.22, armLength, 0.22, shirt);
leftArm.position.set(0.6, 2.05, 0);
body.add(leftArm);

const rightArm = makeLimb(0.22, armLength, 0.22, shirt);
rightArm.position.set(-0.6, 2.05, 0);
body.add(rightArm);

// Legs (box limbs) pivoting at the hips.
const legLength = 1.2;
const leftLeg = makeLimb(0.28, legLength, 0.3, pants);
leftLeg.position.set(0.22, 0.95, 0);
body.add(leftLeg);

const rightLeg = makeLimb(0.28, legLength, 0.3, pants);
rightLeg.position.set(-0.22, 0.95, 0);
body.add(rightLeg);

// ---------------------------------------------------------------------------
// Procedural walk-cycle animation
// ---------------------------------------------------------------------------
const clock = new THREE.Clock();
const WALK_SPEED = 2.2; // world units per second
const STRIDE = 6.5; // gait phase frequency
const RANGE = 9; // half-width of the patrol path along X

function animate() {
  const t = clock.getElapsedTime();

  // Travel back and forth across the plane so the figure stays in frame.
  const x = Math.sin((t * WALK_SPEED) / RANGE) * RANGE;
  figure.position.x = x;

  // Face the current direction of travel.
  const dir = Math.cos((t * WALK_SPEED) / RANGE);
  figure.rotation.y = dir >= 0 ? Math.PI / 2 : -Math.PI / 2;

  // Gait phase drives the limb swing.
  const phase = t * STRIDE;
  const swing = Math.sin(phase);

  // Legs swing in opposition.
  leftLeg.rotation.x = swing * 0.7;
  rightLeg.rotation.x = -swing * 0.7;

  // Arms swing opposite to the legs on the same side.
  leftArm.rotation.x = -swing * 0.6;
  rightArm.rotation.x = swing * 0.6;

  // Vertical bob: the body rises twice per stride (each foot plant).
  body.position.y = Math.abs(Math.cos(phase)) * 0.12;

  // Slight torso sway for liveliness.
  body.rotation.z = Math.sin(phase) * 0.04;

  renderer.render(scene, camera);
}

renderer.setAnimationLoop(animate);

// ---------------------------------------------------------------------------
// Resize handling
// ---------------------------------------------------------------------------
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
