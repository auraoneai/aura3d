// Prompt 09: Animated Primitive Humanoid
//
// A humanoid figure assembled entirely from primitive geometry
// (sphere head, cylinder torso, box limbs) walking across a ground
// plane with a fully procedural walk-cycle animation. No external
// assets are used — everything is generated at runtime.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const app = document.getElementById('app') ?? document.body;
app.appendChild(renderer.domElement);
Object.assign(document.body.style, { margin: '0', overflow: 'hidden' });
renderer.domElement.style.display = 'block';

// ---------------------------------------------------------------------------
// Scene & camera
// ---------------------------------------------------------------------------

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fc4e8);
scene.fog = new THREE.Fog(0x9fc4e8, 18, 40);

const camera = new THREE.PerspectiveCamera(
  50,
  window.innerWidth / window.innerHeight,
  0.1,
  100,
);
camera.position.set(6.5, 4.5, 9);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1, 0);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.49;
controls.minDistance = 4;
controls.maxDistance = 30;
controls.update();

// ---------------------------------------------------------------------------
// Lighting
// ---------------------------------------------------------------------------

const hemi = new THREE.HemisphereLight(0xbfe3ff, 0x4a6b3a, 0.8);
scene.add(hemi);

const ambient = new THREE.AmbientLight(0xffffff, 0.25);
scene.add(ambient);

const sun = new THREE.DirectionalLight(0xfff3e0, 2.0);
sun.position.set(6, 10, 6);
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

// ---------------------------------------------------------------------------
// Ground plane
// ---------------------------------------------------------------------------

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(60, 60),
  new THREE.MeshStandardMaterial({ color: 0x5d8a4a, roughness: 1, metalness: 0 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const grid = new THREE.GridHelper(60, 60, 0x335522, 0x44663a);
(grid.material as THREE.Material).transparent = true;
(grid.material as THREE.Material).opacity = 0.35;
grid.position.y = 0.001;
scene.add(grid);

// ---------------------------------------------------------------------------
// Humanoid construction
//
// The figure is a hierarchy of pivot groups so each joint can be
// rotated independently for the walk cycle:
//
//   character (moves across the ground)
//     └─ body (vertical bob)
//          ├─ torso (cylinder) + head (sphere) + neck
//          ├─ shoulderL/R → upperArm(box) → elbow → foreArm(box)
//          └─ hipL/R       → upperLeg(box) → knee  → lowerLeg(box) → foot(box)
// ---------------------------------------------------------------------------

const skin = new THREE.MeshStandardMaterial({ color: 0xf1c9a5, roughness: 0.7 });
const shirt = new THREE.MeshStandardMaterial({ color: 0x3f7bd4, roughness: 0.6 });
const pants = new THREE.MeshStandardMaterial({ color: 0x2c3e63, roughness: 0.7 });
const shoe = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.8 });

function mesh(geometry: THREE.BufferGeometry, material: THREE.Material): THREE.Mesh {
  const m = new THREE.Mesh(geometry, material);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/**
 * A limb segment whose pivot is at the *top* of the box (the joint).
 * Returns the pivot group (rotate this to swing the limb) and an `end`
 * group positioned at the far tip so the next segment can attach there.
 */
function segment(
  length: number,
  width: number,
  depth: number,
  material: THREE.Material,
): { pivot: THREE.Group; end: THREE.Group } {
  const pivot = new THREE.Group();
  const box = mesh(new THREE.BoxGeometry(width, length, depth), material);
  box.position.y = -length / 2; // hang down from the joint
  pivot.add(box);

  const end = new THREE.Group();
  end.position.y = -length;
  pivot.add(end);

  return { pivot, end };
}

const character = new THREE.Group();
scene.add(character);

const body = new THREE.Group();
character.add(body);

// --- Torso (cylinder) --------------------------------------------------------
const torsoHeight = 0.62;
const hipY = 0.92; // height of the hip joints above the ground
const torsoBottomY = hipY;
const torso = mesh(
  new THREE.CylinderGeometry(0.2, 0.26, torsoHeight, 24),
  shirt,
);
torso.position.y = torsoBottomY + torsoHeight / 2;
body.add(torso);

const pelvis = mesh(new THREE.CylinderGeometry(0.26, 0.24, 0.18, 24), pants);
pelvis.position.y = torsoBottomY - 0.04;
body.add(pelvis);

const shoulderY = torsoBottomY + torsoHeight; // top of torso

// --- Neck + head (sphere) ----------------------------------------------------
const neck = mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.12, 16), skin);
neck.position.y = shoulderY + 0.06;
body.add(neck);

const head = mesh(new THREE.SphereGeometry(0.17, 32, 24), skin);
head.position.y = shoulderY + 0.27;
body.add(head);

// A tiny nose so the figure clearly has a "front" / facing direction.
const nose = mesh(new THREE.SphereGeometry(0.035, 12, 12), skin);
nose.position.set(0, shoulderY + 0.26, 0.17);
body.add(nose);

// --- Arms (box limbs) --------------------------------------------------------
interface Arm {
  shoulder: THREE.Group;
  elbow: THREE.Group;
}

function buildArm(side: number): Arm {
  const upper = segment(0.42, 0.12, 0.12, shirt);
  const lower = segment(0.4, 0.1, 0.1, skin);

  upper.pivot.position.set(side * 0.32, shoulderY - 0.04, 0);
  upper.end.add(lower.pivot); // forearm hangs from the elbow
  body.add(upper.pivot);

  const hand = mesh(new THREE.BoxGeometry(0.12, 0.12, 0.1), skin);
  hand.position.y = -0.05;
  lower.end.add(hand);

  return { shoulder: upper.pivot, elbow: lower.pivot };
}

// --- Legs (box limbs) --------------------------------------------------------
interface Leg {
  hip: THREE.Group;
  knee: THREE.Group;
}

function buildLeg(side: number): Leg {
  const upper = segment(0.46, 0.16, 0.16, pants);
  const lower = segment(0.44, 0.13, 0.13, pants);

  upper.pivot.position.set(side * 0.14, hipY, 0);
  upper.end.add(lower.pivot); // shin hangs from the knee
  body.add(upper.pivot);

  const foot = mesh(new THREE.BoxGeometry(0.16, 0.1, 0.32), shoe);
  foot.position.set(0, -0.05, 0.06); // toes point forward (+Z)
  lower.end.add(foot);

  return { hip: upper.pivot, knee: lower.pivot };
}

const armL = buildArm(-1);
const armR = buildArm(1);
const legL = buildLeg(-1);
const legR = buildLeg(1);

// ---------------------------------------------------------------------------
// Walk cycle
//
// The character walks anticlockwise around a circle so it is always
// crossing the ground plane and stays in frame. Limbs swing in
// opposite phase (arms counter to legs), knees flex on the back-swing,
// and the whole body bobs vertically at twice the stride frequency.
// ---------------------------------------------------------------------------

const PATH_RADIUS = 3.2;
const ANGULAR_SPEED = 0.45; // radians / second around the circle
const STRIDE_FREQ = 6.0; // walk-cycle radians / second
const SWING = 0.7; // hip / shoulder swing amplitude (radians)
const baseBodyY = 0.0;

const clock = new THREE.Clock();

function animate(): void {
  const t = clock.getElapsedTime();

  // --- locomotion around the circular path ---
  const a = t * ANGULAR_SPEED;
  const px = Math.sin(a) * PATH_RADIUS;
  const pz = Math.cos(a) * PATH_RADIUS;
  character.position.set(px, 0, pz);

  // face the direction of travel (tangent to the circle)
  const vx = Math.cos(a);
  const vz = -Math.sin(a);
  character.rotation.y = Math.atan2(vx, vz);

  // --- stride phase ---
  const phase = t * STRIDE_FREQ;
  const s = Math.sin(phase);

  // Legs swing in opposite phase about the hip (X axis).
  legL.hip.rotation.x = s * SWING;
  legR.hip.rotation.x = -s * SWING;

  // Knees bend mainly while the leg swings through its lift (positive only).
  legL.knee.rotation.x = Math.max(0, Math.sin(phase + Math.PI * 0.5)) * 1.1;
  legR.knee.rotation.x = Math.max(0, Math.sin(-phase + Math.PI * 0.5)) * 1.1;

  // Arms counter-swing to the legs, with a relaxed elbow bend.
  armL.shoulder.rotation.x = -s * SWING * 0.85;
  armR.shoulder.rotation.x = s * SWING * 0.85;
  armL.elbow.rotation.x = 0.4 + s * 0.25;
  armR.elbow.rotation.x = 0.4 - s * 0.25;

  // Slight torso counter-rotation and side sway for a lively gait.
  body.rotation.y = s * 0.12;
  body.rotation.z = Math.cos(phase) * 0.04;

  // Vertical bob: highest when a leg passes under the body (2x freq).
  body.position.y = baseBodyY + Math.abs(Math.cos(phase)) * 0.06;

  controls.update();
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
