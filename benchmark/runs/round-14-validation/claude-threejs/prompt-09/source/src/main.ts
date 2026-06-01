import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Animated Primitive Humanoid
// A character placeholder built entirely from Three.js primitive geometries
// (sphere head, cylinder torso, box limbs) driven by a procedural walk cycle
// that strides across a ground plane.
// ---------------------------------------------------------------------------

const app = document.getElementById('app') ?? document.body;

// Renderer ------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
app.appendChild(renderer.domElement);

// Scene + camera ------------------------------------------------------------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fc6e8);
scene.fog = new THREE.Fog(0x9fc6e8, 14, 34);

const camera = new THREE.PerspectiveCamera(
  50,
  window.innerWidth / window.innerHeight,
  0.1,
  100,
);
camera.position.set(5.5, 3.4, 8.5);
camera.lookAt(0, 1.4, 0);

// Lighting ------------------------------------------------------------------
const hemi = new THREE.HemisphereLight(0xffffff, 0x4a5d3a, 0.9);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xffffff, 2.0);
sun.position.set(6, 10, 6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 40;
sun.shadow.camera.left = -12;
sun.shadow.camera.right = 12;
sun.shadow.camera.top = 12;
sun.shadow.camera.bottom = -12;
scene.add(sun);

// Ground plane --------------------------------------------------------------
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(60, 60),
  new THREE.MeshStandardMaterial({ color: 0x6f8f53, roughness: 1 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// A grid laid on the ground so traversal across it is clearly visible.
const grid = new THREE.GridHelper(60, 60, 0x33502a, 0x4d6b38);
(grid.material as THREE.Material).transparent = true;
(grid.material as THREE.Material).opacity = 0.55;
grid.position.y = 0.01;
scene.add(grid);

// ---------------------------------------------------------------------------
// Build the humanoid from primitives.
// Joint groups (pivots) sit at the shoulders / hips so the limbs rotate about
// the joint, exactly like a walk cycle. Limb meshes hang downward from the
// pivot origin.
// ---------------------------------------------------------------------------
const character = new THREE.Group();
scene.add(character);

const skin = new THREE.MeshStandardMaterial({ color: 0xe8b48c, roughness: 0.7 });
const shirt = new THREE.MeshStandardMaterial({ color: 0x2f6fb0, roughness: 0.6 });
const pants = new THREE.MeshStandardMaterial({ color: 0x394150, roughness: 0.8 });
const limb = new THREE.MeshStandardMaterial({ color: 0xd99a6c, roughness: 0.7 });
const shoe = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9 });

function castShadow(mesh: THREE.Mesh): THREE.Mesh {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// Torso (cylinder) ----------------------------------------------------------
const HIP_Y = 1.05;
const torso = castShadow(
  new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.28, 0.95, 20), shirt),
);
torso.position.y = HIP_Y + 0.55; // sits above the hips
character.add(torso);

// Neck + head (sphere) ------------------------------------------------------
const neck = castShadow(
  new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.14, 12), skin),
);
neck.position.y = torso.position.y + 0.55;
character.add(neck);

const head = castShadow(new THREE.Mesh(new THREE.SphereGeometry(0.27, 24, 24), skin));
head.position.y = neck.position.y + 0.32;
character.add(head);

// Helper to build a limb that pivots about a joint --------------------------
function makeLimb(
  jointPos: THREE.Vector3,
  length: number,
  thickness: number,
  mat: THREE.Material,
  withShoe: boolean,
): THREE.Group {
  const pivot = new THREE.Group();
  pivot.position.copy(jointPos);

  const seg = castShadow(
    new THREE.Mesh(new THREE.BoxGeometry(thickness, length, thickness), mat),
  );
  seg.position.y = -length / 2; // hang down from the pivot
  pivot.add(seg);

  if (withShoe) {
    const foot = castShadow(
      new THREE.Mesh(
        new THREE.BoxGeometry(thickness * 1.1, thickness * 0.9, thickness * 1.9),
        shoe,
      ),
    );
    foot.position.set(0, -length - thickness * 0.2, thickness * 0.55);
    pivot.add(foot);
  }

  character.add(pivot);
  return pivot;
}

// Arms (boxes) — shoulders just below the top of the torso.
const SHOULDER_Y = torso.position.y + 0.4;
const armL = makeLimb(new THREE.Vector3(-0.42, SHOULDER_Y, 0), 0.8, 0.16, limb, false);
const armR = makeLimb(new THREE.Vector3(0.42, SHOULDER_Y, 0), 0.8, 0.16, limb, false);

// Legs (boxes) — hips at the bottom of the torso.
const legL = makeLimb(new THREE.Vector3(-0.18, HIP_Y, 0), 0.95, 0.2, pants, true);
const legR = makeLimb(new THREE.Vector3(0.18, HIP_Y, 0), 0.95, 0.2, pants, true);

// Face the direction of travel: local +Z forward maps to world +X.
character.rotation.y = Math.PI / 2;

// ---------------------------------------------------------------------------
// Walk-cycle animation
// ---------------------------------------------------------------------------
const clock = new THREE.Clock();
let phase = 0; // walk-cycle phase in radians
let distance = -7; // position along the +X traversal axis

const STRIDE = 0.7; // limb swing amplitude (radians)
const CADENCE = 7; // walk-cycle speed
const SPEED = 1.6; // forward travel speed (units / sec)
const RANGE = 7; // wrap traversal in [-RANGE, RANGE]

function animate(): void {
  const dt = Math.min(clock.getDelta(), 0.05);
  phase += dt * CADENCE;

  const swing = Math.sin(phase);

  // Legs swing in opposition; arms counter-swing to the opposite legs.
  legL.rotation.x = swing * STRIDE;
  legR.rotation.x = -swing * STRIDE;
  armL.rotation.x = -swing * STRIDE * 0.85;
  armR.rotation.x = swing * STRIDE * 0.85;

  // Vertical bob (twice per stride) + subtle forward lean while striding.
  const bob = Math.abs(Math.cos(phase)) * 0.08;
  character.position.y = bob;
  character.rotation.x = 0; // keep upright
  torso.rotation.x = Math.cos(phase) * 0.04;

  // Travel across the ground plane, wrapping back to the start.
  distance += dt * SPEED;
  if (distance > RANGE) distance = -RANGE;
  character.position.x = distance;

  renderer.render(scene, camera);
}
renderer.setAnimationLoop(animate);

// Resize handling -----------------------------------------------------------
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
