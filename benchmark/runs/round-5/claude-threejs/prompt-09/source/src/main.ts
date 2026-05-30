import "./style.css";

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------
const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = "";

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

// ---------------------------------------------------------------------------
// Scene & camera
// ---------------------------------------------------------------------------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87a7d6);
scene.fog = new THREE.Fog(0x87a7d6, 18, 42);

const camera = new THREE.PerspectiveCamera(
  50,
  window.innerWidth / window.innerHeight,
  0.1,
  100
);
camera.position.set(6, 3.4, 8);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.1, 0);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.49;
controls.minDistance = 4;
controls.maxDistance = 24;
controls.update();

// ---------------------------------------------------------------------------
// Lighting
// ---------------------------------------------------------------------------
const hemi = new THREE.HemisphereLight(0xbfd4ff, 0x4a6a4a, 0.9);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xfff4e0, 2.0);
sun.position.set(6, 10, 5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 40;
sun.shadow.camera.left = -12;
sun.shadow.camera.right = 12;
sun.shadow.camera.top = 12;
sun.shadow.camera.bottom = -12;
sun.shadow.bias = -0.0001;
scene.add(sun);

// ---------------------------------------------------------------------------
// Ground plane
// ---------------------------------------------------------------------------
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(60, 60),
  new THREE.MeshStandardMaterial({ color: 0x6f9f63, roughness: 1 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const grid = new THREE.GridHelper(60, 60, 0x355c2e, 0x4f7a45);
(grid.material as THREE.Material).transparent = true;
(grid.material as THREE.Material).opacity = 0.35;
grid.position.y = 0.002;
scene.add(grid);

// ---------------------------------------------------------------------------
// Humanoid built from primitive shapes
// ---------------------------------------------------------------------------
const SKIN = new THREE.MeshStandardMaterial({ color: 0xf1c9a5, roughness: 0.7 });
const SHIRT = new THREE.MeshStandardMaterial({ color: 0x3a76c4, roughness: 0.6 });
const PANTS = new THREE.MeshStandardMaterial({ color: 0x2c3138, roughness: 0.7 });
const LIMB = new THREE.MeshStandardMaterial({ color: 0xe0a47f, roughness: 0.7 });

function castShadow(obj: THREE.Object3D): THREE.Object3D {
  obj.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });
  return obj;
}

// Root: handles travel across the ground + vertical bob + facing direction.
const character = new THREE.Group();
scene.add(character);

// Pelvis sits at the hip line; everything hangs off it.
const HIP_HEIGHT = 1.1;
const pelvis = new THREE.Group();
pelvis.position.y = HIP_HEIGHT;
character.add(pelvis);

// Torso (box) — sphere head on top.
const torso = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.95, 0.4), SHIRT);
torso.position.y = 0.55;
pelvis.add(torso);

const hips = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.3, 0.4), PANTS);
hips.position.y = 0.05;
pelvis.add(hips);

const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.12, 16), SKIN);
neck.position.y = 1.07;
pelvis.add(neck);

const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 32, 24), SKIN);
head.position.y = 1.32;
pelvis.add(head);

// Simple face so "front" reads clearly.
const eyeGeo = new THREE.SphereGeometry(0.04, 12, 12);
const eyeMat = new THREE.MeshStandardMaterial({ color: 0x222428 });
for (const dx of [-0.1, 0.1]) {
  const eye = new THREE.Mesh(eyeGeo, eyeMat);
  eye.position.set(dx, 1.35, 0.24);
  pelvis.add(eye);
}

// --- Limb factory -----------------------------------------------------------
// Returns a pivot group placed at the joint; the limb hangs downward (-y) so
// rotating the pivot around X swings it like a real shoulder / hip joint.
interface Limb {
  pivot: THREE.Group; // shoulder / hip joint
  knee: THREE.Group; // elbow / knee joint
}

function makeLimb(
  upperLen: number,
  lowerLen: number,
  thickness: number,
  upperMat: THREE.Material,
  lowerMat: THREE.Material
): Limb {
  const pivot = new THREE.Group();

  const upper = new THREE.Mesh(
    new THREE.BoxGeometry(thickness, upperLen, thickness),
    upperMat
  );
  upper.position.y = -upperLen / 2;
  pivot.add(castShadow(upper));

  const knee = new THREE.Group();
  knee.position.y = -upperLen;
  pivot.add(knee);

  const lower = new THREE.Mesh(
    new THREE.BoxGeometry(thickness * 0.9, lowerLen, thickness * 0.9),
    lowerMat
  );
  lower.position.y = -lowerLen / 2;
  knee.add(castShadow(lower));

  return { pivot, knee };
}

// Shoulders
const SHOULDER_Y = 0.92;
const leftArm = makeLimb(0.42, 0.4, 0.16, SHIRT, LIMB);
leftArm.pivot.position.set(-0.45, SHOULDER_Y, 0);
pelvis.add(leftArm.pivot);

const rightArm = makeLimb(0.42, 0.4, 0.16, SHIRT, LIMB);
rightArm.pivot.position.set(0.45, SHOULDER_Y, 0);
pelvis.add(rightArm.pivot);

// Hands at the end of each forearm.
for (const arm of [leftArm, rightArm]) {
  const hand = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), SKIN);
  hand.position.y = -0.4;
  arm.knee.add(castShadow(hand));
}

// Hips / legs
const HIP_Y = -0.05;
const leftLeg = makeLimb(0.52, 0.5, 0.2, PANTS, PANTS);
leftLeg.pivot.position.set(-0.2, HIP_Y, 0);
pelvis.add(leftLeg.pivot);

const rightLeg = makeLimb(0.52, 0.5, 0.2, PANTS, PANTS);
rightLeg.pivot.position.set(0.2, HIP_Y, 0);
pelvis.add(rightLeg.pivot);

// Feet (box) at the end of each shin.
for (const leg of [leftLeg, rightLeg]) {
  const foot = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.34), PANTS);
  foot.position.set(0, -0.5, 0.07);
  leg.knee.add(castShadow(foot));
}

// ---------------------------------------------------------------------------
// Procedural walk cycle
// ---------------------------------------------------------------------------
const WALK_RANGE = 7; // how far it travels before turning around
const SPEED = 1.6; // metres / second
const STRIDE_RATE = 5.2; // gait frequency
let direction = 1; // +1 walking toward +x, -1 toward -x

const clock = new THREE.Clock();

function animateWalk(legPhase: number) {
  // legPhase advances with travelled distance so the gait matches the speed.
  const swing = Math.sin(legPhase);
  const swingOpp = Math.sin(legPhase + Math.PI);

  const HIP_SWING = 0.7;
  const ARM_SWING = 0.55;

  // Legs swing in opposition; arms swing opposite to the same-side leg.
  leftLeg.pivot.rotation.x = swing * HIP_SWING;
  rightLeg.pivot.rotation.x = swingOpp * HIP_SWING;
  leftArm.pivot.rotation.x = swingOpp * ARM_SWING;
  rightArm.pivot.rotation.x = swing * ARM_SWING;

  // Knees only bend on the backswing (so the leg lifts when coming forward).
  leftLeg.knee.rotation.x = Math.max(0, -swing) * 1.2;
  rightLeg.knee.rotation.x = Math.max(0, -swingOpp) * 1.2;

  // Elbows keep a slight, lively bend.
  leftArm.knee.rotation.x = 0.25 + Math.max(0, swingOpp) * 0.4;
  rightArm.knee.rotation.x = 0.25 + Math.max(0, swing) * 0.4;

  // Vertical bob — twice per stride (one bob per footfall).
  pelvis.position.y = HIP_HEIGHT + Math.abs(Math.cos(legPhase)) * 0.07;

  // Slight torso counter-rotation + bounce-driven lean for life.
  torso.rotation.y = swing * 0.12;
  pelvis.rotation.z = swing * 0.04;
}

function tick() {
  const dt = Math.min(clock.getDelta(), 0.05);

  // Travel across the ground plane, turning around at the limits.
  character.position.x += direction * SPEED * dt;
  if (character.position.x > WALK_RANGE) {
    character.position.x = WALK_RANGE;
    direction = -1;
  } else if (character.position.x < -WALK_RANGE) {
    character.position.x = -WALK_RANGE;
    direction = 1;
  }
  // Face the travel direction.
  character.rotation.y = direction > 0 ? Math.PI / 2 : -Math.PI / 2;

  // Drive the gait from distance travelled so feet don't skate.
  const legPhase = clock.elapsedTime * STRIDE_RATE;
  animateWalk(legPhase);

  controls.update();
  renderer.render(scene, camera);
}

renderer.setAnimationLoop(tick);

// ---------------------------------------------------------------------------
// Resize handling
// ---------------------------------------------------------------------------
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
