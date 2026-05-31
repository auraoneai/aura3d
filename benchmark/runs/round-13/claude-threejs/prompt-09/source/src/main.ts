// Prompt 09: Animated Primitive Humanoid
// A humanoid placeholder built entirely from primitive shapes
// (sphere head, cylinder torso, box limbs) with a procedural
// walk-cycle animation that carries it across a ground plane.

import * as THREE from 'three';

// ----------------------------------------------------------------------------
// Renderer
// ----------------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setClearColor(0x9fc6e8);

const app = document.getElementById('app') ?? document.body;
app.appendChild(renderer.domElement);
renderer.domElement.style.display = 'block';

// ----------------------------------------------------------------------------
// Scene & camera
// ----------------------------------------------------------------------------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fc6e8);
scene.fog = new THREE.Fog(0x9fc6e8, 14, 38);

const camera = new THREE.PerspectiveCamera(
  50,
  window.innerWidth / window.innerHeight,
  0.1,
  100,
);
camera.position.set(6.5, 4.2, 8.5);
camera.lookAt(0, 1.2, 0);

// ----------------------------------------------------------------------------
// Lighting
// ----------------------------------------------------------------------------
const hemi = new THREE.HemisphereLight(0xffffff, 0x4a5a3a, 0.9);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xfff3e0, 2.0);
sun.position.set(6, 12, 6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 40;
sun.shadow.camera.left = -12;
sun.shadow.camera.right = 12;
sun.shadow.camera.top = 12;
sun.shadow.camera.bottom = -12;
sun.shadow.bias = -0.0005;
scene.add(sun);

// ----------------------------------------------------------------------------
// Ground plane
// ----------------------------------------------------------------------------
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(80, 80),
  new THREE.MeshStandardMaterial({ color: 0x6b8f4e, roughness: 1 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const grid = new THREE.GridHelper(80, 80, 0x355024, 0x4a6b33);
(grid.material as THREE.Material).transparent = true;
(grid.material as THREE.Material).opacity = 0.35;
grid.position.y = 0.01;
scene.add(grid);

// ----------------------------------------------------------------------------
// Humanoid figure (all primitives)
// ----------------------------------------------------------------------------
const skin = new THREE.MeshStandardMaterial({ color: 0xf0c5a0, roughness: 0.7 });
const shirt = new THREE.MeshStandardMaterial({ color: 0x2f6fb0, roughness: 0.6 });
const pants = new THREE.MeshStandardMaterial({ color: 0x33384a, roughness: 0.7 });
const shoe = new THREE.MeshStandardMaterial({ color: 0x20232b, roughness: 0.5 });

function makeMesh(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  x = 0,
  y = 0,
  z = 0,
): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// Body dimensions
const HIP_Y = 0.92; // height of the hip joints above the feet
const SHOULDER_Y = 1.62; // height of the shoulder joints
const LEG_LEN = 0.9;
const ARM_LEN = 0.72;

// Root group: the whole character. Moved across the ground each frame.
const human = new THREE.Group();
scene.add(human);

// Torso — cylinder (slightly tapered for a chest shape)
const torso = makeMesh(
  new THREE.CylinderGeometry(0.26, 0.32, 0.78, 24),
  shirt,
  0,
  1.22,
  0,
);
human.add(torso);

// Pelvis — small box bridging torso and legs
human.add(makeMesh(new THREE.BoxGeometry(0.5, 0.28, 0.32), pants, 0, HIP_Y, 0));

// Head — sphere, on a short cylinder neck
human.add(makeMesh(new THREE.CylinderGeometry(0.1, 0.12, 0.14, 16), skin, 0, 1.68, 0));
human.add(makeMesh(new THREE.SphereGeometry(0.24, 28, 24), skin, 0, 1.95, 0));

// Helper that builds a swinging limb around a pivot at the joint.
// The limb mesh hangs downward from the pivot so rotation about X swings it
// like a real arm/leg.
function makeLimb(
  jointX: number,
  jointY: number,
  width: number,
  length: number,
  limbMat: THREE.Material,
  foot: boolean,
): THREE.Group {
  const pivot = new THREE.Group();
  pivot.position.set(jointX, jointY, 0);

  const limb = makeMesh(
    new THREE.BoxGeometry(width, length, width),
    limbMat,
    0,
    -length / 2,
    0,
  );
  pivot.add(limb);

  if (foot) {
    // Foot — a small box at the bottom of the leg, pushed forward.
    pivot.add(makeMesh(new THREE.BoxGeometry(width * 1.1, 0.14, width * 2.0), shoe, 0, -length - 0.02, width * 0.5));
  } else {
    // Hand — a small box at the end of the arm.
    pivot.add(makeMesh(new THREE.BoxGeometry(width * 1.2, width * 1.4, width * 1.2), skin, 0, -length - 0.02, 0));
  }

  human.add(pivot);
  return pivot;
}

const leftLeg = makeLimb(-0.16, HIP_Y, 0.2, LEG_LEN, pants, true);
const rightLeg = makeLimb(0.16, HIP_Y, 0.2, LEG_LEN, pants, true);
const leftArm = makeLimb(-0.42, SHOULDER_Y, 0.14, ARM_LEN, shirt, false);
const rightArm = makeLimb(0.42, SHOULDER_Y, 0.14, ARM_LEN, shirt, false);

// ----------------------------------------------------------------------------
// Walk-cycle animation
// ----------------------------------------------------------------------------
const clock = new THREE.Clock();

// The character walks a large circular path so it is always in frame while
// clearly traversing the ground plane.
const PATH_RADIUS = 5.0;
const MOVE_SPEED = 0.45; // radians/sec around the path
const STEP_FREQ = 6.5; // limb swing speed
const SWING = 0.85; // max limb swing (radians)

function animate(): void {
  const t = clock.getElapsedTime();

  // Position along the circular path.
  const angle = t * MOVE_SPEED;
  human.position.set(
    Math.cos(angle) * PATH_RADIUS,
    0,
    Math.sin(angle) * PATH_RADIUS,
  );

  // Face the direction of travel (tangent to the circle).
  const vx = -Math.sin(angle);
  const vz = Math.cos(angle);
  human.rotation.y = Math.atan2(vx, vz);

  // Limb swing — legs and arms in opposite phase for a natural gait.
  const phase = t * STEP_FREQ;
  const swing = Math.sin(phase) * SWING;
  leftLeg.rotation.x = swing;
  rightLeg.rotation.x = -swing;
  leftArm.rotation.x = -swing * 0.8;
  rightArm.rotation.x = swing * 0.8;

  // Slight knee/elbow-style bend so the back swing lifts the foot.
  // Vertical bob: body rises twice per stride.
  human.position.y = Math.abs(Math.sin(phase)) * 0.07;

  // Subtle torso counter-rotation and lean for liveliness.
  torso.rotation.y = Math.sin(phase) * 0.12;
  torso.rotation.x = 0.06;

  renderer.render(scene, camera);
}

renderer.setAnimationLoop(animate);

// ----------------------------------------------------------------------------
// Resize handling
// ----------------------------------------------------------------------------
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
