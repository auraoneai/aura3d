// Prompt 09 — Animated Primitive Humanoid
//
// A humanoid placeholder assembled entirely from primitive geometry
// (sphere head, cylinder torso, box limbs) driven by a procedural
// walk-cycle. The figure strides back and forth across a visible
// ground plane: hips and shoulders swing in opposition, knees and
// elbows flex on the swing phase, and the torso bobs and counter-
// rotates so any captured frame reads as mid-stride.

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
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const app = document.getElementById('app') ?? document.body;
app.appendChild(renderer.domElement);
Object.assign(document.body.style, { margin: '0', overflow: 'hidden' });

// ---------------------------------------------------------------------------
// Scene & camera
// ---------------------------------------------------------------------------

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fc4e8);
scene.fog = new THREE.Fog(0x9fc4e8, 18, 48);

const camera = new THREE.PerspectiveCamera(
  50,
  window.innerWidth / window.innerHeight,
  0.1,
  200,
);
camera.position.set(7.5, 4.2, 9.5);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.6, 0);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.495; // keep the camera above ground
controls.minDistance = 4;
controls.maxDistance = 30;
controls.update();

// ---------------------------------------------------------------------------
// Lighting
// ---------------------------------------------------------------------------

const hemi = new THREE.HemisphereLight(0xffffff, 0x4a5a3a, 0.9);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xfff2dd, 2.4);
sun.position.set(6, 12, 5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 40;
sun.shadow.camera.left = -14;
sun.shadow.camera.right = 14;
sun.shadow.camera.top = 14;
sun.shadow.camera.bottom = -14;
sun.shadow.bias = -0.0002;
scene.add(sun);

// ---------------------------------------------------------------------------
// Ground plane
// ---------------------------------------------------------------------------

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(60, 60),
  new THREE.MeshStandardMaterial({ color: 0x6f8f5a, roughness: 1 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const grid = new THREE.GridHelper(60, 60, 0x2f3d24, 0x55703f);
(grid.material as THREE.Material).opacity = 0.35;
(grid.material as THREE.Material).transparent = true;
grid.position.y = 0.001;
scene.add(grid);

// ---------------------------------------------------------------------------
// Humanoid built from primitives
// ---------------------------------------------------------------------------

const skin = new THREE.MeshStandardMaterial({ color: 0xe8b48c, roughness: 0.7 });
const shirt = new THREE.MeshStandardMaterial({ color: 0x3f76c4, roughness: 0.6 });
const pants = new THREE.MeshStandardMaterial({ color: 0x394150, roughness: 0.7 });
const limb = new THREE.MeshStandardMaterial({ color: 0x2d56a0, roughness: 0.6 });
const shoe = new THREE.MeshStandardMaterial({ color: 0x20242c, roughness: 0.5 });

/** Create a mesh that casts shadows and add it to a parent. */
function part(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  parent: THREE.Object3D,
): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

// Root translates/rotates the whole figure across the ground.
const character = new THREE.Group();
scene.add(character);

// Body group bobs vertically and counter-rotates (the "rig" sits here).
const body = new THREE.Group();
character.add(body);

// --- Torso (cylinder) -------------------------------------------------------
const HIP_Y = 1.05; // height of the hip joints above the feet
const torso = part(
  new THREE.CylinderGeometry(0.34, 0.28, 0.95, 20),
  shirt,
  body,
);
torso.position.y = HIP_Y + 0.55;

// --- Neck + head (sphere) ---------------------------------------------------
part(new THREE.CylinderGeometry(0.1, 0.12, 0.18, 12), skin, body).position.y =
  HIP_Y + 1.12;
const head = part(new THREE.SphereGeometry(0.3, 24, 18), skin, body);
head.position.y = HIP_Y + 1.42;
// A partial-sphere "cap" gives the head a clear front so the figure reads
// as facing its direction of travel.
const hair = part(
  new THREE.SphereGeometry(0.31, 24, 18, 0, Math.PI * 2, 0, Math.PI * 0.55),
  shoe,
  body,
);
hair.position.y = HIP_Y + 1.45;

/**
 * Build a two-segment limb (upper box + lower box) hinged at a joint group.
 * Returns the pivot groups so the walk cycle can rotate them.
 */
function buildLimb(opts: {
  parent: THREE.Object3D;
  jointPos: THREE.Vector3;
  upperLen: number;
  lowerLen: number;
  thickness: number;
  upperMat: THREE.Material;
  lowerMat: THREE.Material;
  footMat?: THREE.Material;
}) {
  const root = new THREE.Group(); // shoulder / hip pivot
  root.position.copy(opts.jointPos);
  opts.parent.add(root);

  const upper = part(
    new THREE.BoxGeometry(opts.thickness, opts.upperLen, opts.thickness),
    opts.upperMat,
    root,
  );
  upper.position.y = -opts.upperLen / 2;

  const joint = new THREE.Group(); // elbow / knee pivot
  joint.position.y = -opts.upperLen;
  root.add(joint);

  const lower = part(
    new THREE.BoxGeometry(opts.thickness * 0.9, opts.lowerLen, opts.thickness * 0.9),
    opts.lowerMat,
    joint,
  );
  lower.position.y = -opts.lowerLen / 2;

  // Optional foot for legs.
  if (opts.footMat) {
    const foot = part(
      new THREE.BoxGeometry(opts.thickness * 1.1, 0.14, opts.thickness * 1.9),
      opts.footMat,
      joint,
    );
    foot.position.set(0, -opts.lowerLen - 0.02, opts.thickness * 0.5);
  }

  return { root, joint };
}

const shoulderY = HIP_Y + 1.0;
const SHOULDER_X = 0.46;
const HIP_X = 0.18;

const leftArm = buildLimb({
  parent: body,
  jointPos: new THREE.Vector3(-SHOULDER_X, shoulderY, 0),
  upperLen: 0.5,
  lowerLen: 0.45,
  thickness: 0.16,
  upperMat: shirt,
  lowerMat: skin,
});
const rightArm = buildLimb({
  parent: body,
  jointPos: new THREE.Vector3(SHOULDER_X, shoulderY, 0),
  upperLen: 0.5,
  lowerLen: 0.45,
  thickness: 0.16,
  upperMat: shirt,
  lowerMat: skin,
});

const leftLeg = buildLimb({
  parent: body,
  jointPos: new THREE.Vector3(-HIP_X, HIP_Y, 0),
  upperLen: 0.55,
  lowerLen: 0.5,
  thickness: 0.2,
  upperMat: pants,
  lowerMat: limb,
  footMat: shoe,
});
const rightLeg = buildLimb({
  parent: body,
  jointPos: new THREE.Vector3(HIP_X, HIP_Y, 0),
  upperLen: 0.55,
  lowerLen: 0.5,
  thickness: 0.2,
  upperMat: pants,
  lowerMat: limb,
  footMat: shoe,
});

// ---------------------------------------------------------------------------
// Walk cycle
// ---------------------------------------------------------------------------

const WALK_SPEED = 1.6;     // metres / second across the ground
const STEP_FREQ = 2.6;      // stride cadence (phase radians per second)
const HIP_SWING = 0.7;      // max thigh / shoulder swing (radians)
const KNEE_BEND = 1.1;      // max knee flex (radians)
const ELBOW_BEND = 0.55;    // arm flex (radians)
const RANGE = 9;            // walk extent along Z before turning around
const INITIAL_PHASE = 1.1;  // start mid-stride so frame 0 already reads animated

let phase = INITIAL_PHASE;
let direction = 1; // +Z or -Z

/** Drive one leg + the opposing arm for a given phase. */
function poseSide(
  leg: { root: THREE.Group; joint: THREE.Group },
  arm: { root: THREE.Group; joint: THREE.Group },
  p: number,
) {
  const swing = Math.sin(p);

  // Thigh swings forward/back; knee flexes only on the rear/lift portion.
  leg.root.rotation.x = swing * HIP_SWING;
  leg.joint.rotation.x = Math.max(0, -Math.sin(p - 0.4)) * KNEE_BEND;

  // Arm swings opposite the leg; elbow keeps a relaxed forward bend.
  arm.root.rotation.x = -swing * HIP_SWING * 0.85;
  arm.joint.rotation.x = 0.25 + Math.max(0, Math.sin(p)) * ELBOW_BEND;
}

function updateWalk(dt: number) {
  phase += dt * STEP_FREQ;

  // Opposing limbs are half a cycle apart.
  poseSide(leftLeg, leftArm, phase);
  poseSide(rightLeg, rightArm, phase + Math.PI);

  // Vertical bob (twice per stride) and a slight torso twist / sway.
  body.position.y = Math.abs(Math.sin(phase)) * 0.08;
  body.rotation.y = Math.sin(phase) * 0.12;
  body.rotation.z = Math.sin(phase) * 0.04;

  // Advance across the ground, turning around at the extents.
  character.position.z += direction * WALK_SPEED * dt;
  if (character.position.z > RANGE) {
    character.position.z = RANGE;
    direction = -1;
  } else if (character.position.z < -RANGE) {
    character.position.z = -RANGE;
    direction = 1;
  }
  // Face the direction of travel (model forward is +Z).
  character.rotation.y = direction > 0 ? 0 : Math.PI;
}

// ---------------------------------------------------------------------------
// Resize + render loop
// ---------------------------------------------------------------------------

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const clock = new THREE.Clock();

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  updateWalk(dt);
  controls.update();
  renderer.render(scene, camera);
});
