import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

// ---------------------------------------------------------------------------
// Renderer / scene / camera
// ---------------------------------------------------------------------------
const app = document.querySelector<HTMLElement>("#app")!;
app.style.cssText = "position:fixed;inset:0;margin:0;overflow:hidden;";

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9bc4e2);
scene.fog = new THREE.Fog(0x9bc4e2, 18, 45);

const camera = new THREE.PerspectiveCamera(
  50,
  window.innerWidth / window.innerHeight,
  0.1,
  100,
);
camera.position.set(6, 4.2, 9);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.6, 0);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.495;
controls.update();

// ---------------------------------------------------------------------------
// Lighting
// ---------------------------------------------------------------------------
const hemi = new THREE.HemisphereLight(0xddeeff, 0x55503f, 0.9);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xfff4e0, 2.2);
sun.position.set(8, 12, 6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 40;
sun.shadow.camera.left = -15;
sun.shadow.camera.right = 15;
sun.shadow.camera.top = 15;
sun.shadow.camera.bottom = -15;
sun.shadow.bias = -0.0003;
scene.add(sun);

// ---------------------------------------------------------------------------
// Ground plane
// ---------------------------------------------------------------------------
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(120, 120),
  new THREE.MeshStandardMaterial({ color: 0x6f8f5a, roughness: 1 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const grid = new THREE.GridHelper(120, 120, 0x4a6340, 0x5d7a4c);
(grid.material as THREE.Material).transparent = true;
(grid.material as THREE.Material).opacity = 0.35;
scene.add(grid);

// ---------------------------------------------------------------------------
// Humanoid built from primitive shapes
// ---------------------------------------------------------------------------
const skin = new THREE.MeshStandardMaterial({ color: 0xe8b48c, roughness: 0.7 });
const shirt = new THREE.MeshStandardMaterial({ color: 0x2f6fb0, roughness: 0.6 });
const pants = new THREE.MeshStandardMaterial({ color: 0x33363d, roughness: 0.7 });
const shoes = new THREE.MeshStandardMaterial({ color: 0x20232a, roughness: 0.5 });

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// A pivot is placed at the joint; the limb mesh hangs below its pivot so the
// whole limb swings naturally around the joint when the pivot is rotated.
function limb(
  width: number,
  length: number,
  depth: number,
  material: THREE.Material,
) {
  const pivot = new THREE.Group();
  const m = mesh(new THREE.BoxGeometry(width, length, depth), material);
  m.position.y = -length / 2;
  pivot.add(m);
  return { pivot, length };
}

// Root group that travels across the ground.
const human = new THREE.Group();
scene.add(human);

// Body wrapper that we bob up and down with the stride.
const body = new THREE.Group();
human.add(body);

// Hips — origin for the legs and the rest of the upper body.
const HIP_Y = 1.05;
const hips = new THREE.Group();
hips.position.y = HIP_Y;
body.add(hips);

// Torso (cylinder) + pelvis.
const torso = mesh(new THREE.CylinderGeometry(0.34, 0.28, 0.95, 24), shirt);
torso.position.y = 0.55;
hips.add(torso);

const pelvis = mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.28, 20), pants);
pelvis.position.y = 0.05;
hips.add(pelvis);

// Neck + head (sphere).
const neck = mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.16, 16), skin);
neck.position.y = 1.08;
hips.add(neck);

const head = mesh(new THREE.SphereGeometry(0.28, 32, 24), skin);
head.position.y = 1.42;
hips.add(head);

// Simple face so the figure reads with a clear front-facing direction.
const nose = mesh(new THREE.SphereGeometry(0.05, 12, 12), skin);
nose.position.set(0, 1.4, 0.27);
hips.add(nose);
const eyeMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a });
for (const sx of [-1, 1]) {
  const eye = mesh(new THREE.SphereGeometry(0.045, 12, 12), eyeMat);
  eye.position.set(0.1 * sx, 1.48, 0.23);
  hips.add(eye);
}

// Shoulders sit at the top of the torso.
const SHOULDER_Y = 1.0;
const SHOULDER_X = 0.42;

// Arms (box limbs) — pivot at the shoulder.
const armL = limb(0.16, 0.8, 0.16, shirt);
armL.pivot.position.set(SHOULDER_X, SHOULDER_Y, 0);
hips.add(armL.pivot);
const handL = mesh(new THREE.SphereGeometry(0.1, 16, 12), skin);
handL.position.y = -0.82;
armL.pivot.add(handL);

const armR = limb(0.16, 0.8, 0.16, shirt);
armR.pivot.position.set(-SHOULDER_X, SHOULDER_Y, 0);
hips.add(armR.pivot);
const handR = mesh(new THREE.SphereGeometry(0.1, 16, 12), skin);
handR.position.y = -0.82;
armR.pivot.add(handR);

// Legs (box limbs) — pivot at the hip.
const HIP_X = 0.18;
const legL = limb(0.2, 0.95, 0.2, pants);
legL.pivot.position.set(HIP_X, 0, 0);
hips.add(legL.pivot);
const footL = mesh(new THREE.BoxGeometry(0.22, 0.12, 0.4), shoes);
footL.position.set(0, -0.97, 0.08);
legL.pivot.add(footL);

const legR = limb(0.2, 0.95, 0.2, pants);
legR.pivot.position.set(-HIP_X, 0, 0);
hips.add(legR.pivot);
const footR = mesh(new THREE.BoxGeometry(0.22, 0.12, 0.4), shoes);
footR.position.set(0, -0.97, 0.08);
legR.pivot.add(footR);

// ---------------------------------------------------------------------------
// Procedural walk cycle
// ---------------------------------------------------------------------------
// The figure walks in a large circle so it stays on screen while clearly
// translating across the ground plane.
const WALK_RADIUS = 3.0;
const ANGULAR_SPEED = 0.5; // radians / second around the circle
const STRIDE_FREQ = 6.0; // leg/arm oscillations per radian of heading

const clock = new THREE.Clock();
let heading = 0; // angle around the circle

function animate() {
  const dt = Math.min(clock.getDelta(), 0.05);
  heading += ANGULAR_SPEED * dt;

  // Position on the circular path.
  human.position.set(
    Math.cos(heading) * WALK_RADIUS,
    0,
    Math.sin(heading) * WALK_RADIUS,
  );
  // Face along the direction of travel (tangent to the circle).
  human.rotation.y = -heading + Math.PI / 2;

  // Walk-cycle phase advances with distance travelled.
  const phase = heading * STRIDE_FREQ;
  const swing = Math.sin(phase);

  // Legs swing in opposition.
  legL.pivot.rotation.x = swing * 0.85;
  legR.pivot.rotation.x = -swing * 0.85;

  // Arms counter-swing opposite to the legs on the same side.
  armL.pivot.rotation.x = -swing * 0.7;
  armR.pivot.rotation.x = swing * 0.7;
  // Slight outward splay so arms don't clip the torso.
  armL.pivot.rotation.z = -0.08;
  armR.pivot.rotation.z = 0.08;

  // Vertical bob: body rises twice per stride (once per footfall).
  body.position.y = Math.abs(Math.cos(phase)) * 0.12;

  // Gentle torso counter-rotation and lean for life.
  hips.rotation.y = swing * 0.12;
  body.rotation.z = Math.cos(phase) * 0.03;

  controls.update();
  renderer.render(scene, camera);
}
renderer.setAnimationLoop(animate);

// ---------------------------------------------------------------------------
// Resize
// ---------------------------------------------------------------------------
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
