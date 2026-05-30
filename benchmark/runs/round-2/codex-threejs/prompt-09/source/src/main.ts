import * as THREE from 'three';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('App root not found');
}

document.body.style.margin = '0';
document.body.style.overflow = 'hidden';
document.body.style.background = '#b9d4e5';
app.style.width = '100vw';
app.style.height = '100vh';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xb9d4e5);
scene.fog = new THREE.Fog(0xb9d4e5, 18, 42);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(7, 4.4, 8);
camera.lookAt(0, 1.4, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

const ambientLight = new THREE.HemisphereLight(0xf7fbff, 0x6c8064, 2.2);
scene.add(ambientLight);

const sun = new THREE.DirectionalLight(0xffffff, 3.1);
sun.position.set(5, 8, 4);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -14;
sun.shadow.camera.right = 14;
sun.shadow.camera.top = 14;
sun.shadow.camera.bottom = -14;
scene.add(sun);

const groundMaterial = new THREE.MeshStandardMaterial({
  color: 0x6fa35c,
  roughness: 0.9,
  metalness: 0,
});
const ground = new THREE.Mesh(new THREE.PlaneGeometry(30, 18), groundMaterial);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const grid = new THREE.GridHelper(30, 30, 0x2f5c41, 0x87b973);
grid.position.y = 0.012;
scene.add(grid);

const pathMaterial = new THREE.MeshStandardMaterial({
  color: 0xb78b52,
  roughness: 1,
});
const path = new THREE.Mesh(new THREE.PlaneGeometry(18, 2.2), pathMaterial);
path.rotation.x = -Math.PI / 2;
path.position.y = 0.016;
path.receiveShadow = true;
scene.add(path);

const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x3778bf, roughness: 0.6 });
const headMaterial = new THREE.MeshStandardMaterial({ color: 0xf0c19b, roughness: 0.7 });
const limbMaterial = new THREE.MeshStandardMaterial({ color: 0x26374c, roughness: 0.65 });
const handMaterial = new THREE.MeshStandardMaterial({ color: 0xf0c19b, roughness: 0.7 });
const footMaterial = new THREE.MeshStandardMaterial({ color: 0x1b1f26, roughness: 0.75 });
const accentMaterial = new THREE.MeshStandardMaterial({ color: 0xffd166, roughness: 0.5 });

const character = new THREE.Group();
scene.add(character);

const hips = new THREE.Group();
hips.position.y = 1.45;
character.add(hips);

const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.52, 1.25, 24), bodyMaterial);
torso.castShadow = true;
torso.receiveShadow = true;
hips.add(torso);

const chestBand = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.12, 0.62), accentMaterial);
chestBand.position.set(0, 0.2, 0.01);
chestBand.castShadow = true;
hips.add(chestBand);

const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.22, 16), headMaterial);
neck.position.y = 0.73;
neck.castShadow = true;
hips.add(neck);

const head = new THREE.Mesh(new THREE.SphereGeometry(0.36, 32, 20), headMaterial);
head.position.y = 1.14;
head.castShadow = true;
hips.add(head);

const eyeMaterial = new THREE.MeshStandardMaterial({ color: 0x101820, roughness: 0.4 });
for (const x of [-0.12, 0.12]) {
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), eyeMaterial);
  eye.position.set(x, 1.19, 0.34);
  hips.add(eye);
}

type LimbSide = 'left' | 'right';

interface Limb {
  shoulder: THREE.Group;
  upperArm: THREE.Mesh;
  elbow: THREE.Group;
  lowerArm: THREE.Mesh;
  hand: THREE.Mesh;
  hip: THREE.Group;
  thigh: THREE.Mesh;
  knee: THREE.Group;
  shin: THREE.Mesh;
  foot: THREE.Mesh;
}

function makeLimb(side: LimbSide): Limb {
  const direction = side === 'left' ? -1 : 1;

  const shoulder = new THREE.Group();
  shoulder.position.set(direction * 0.58, 0.42, 0);
  hips.add(shoulder);

  const upperArm = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.68, 0.22), limbMaterial);
  upperArm.position.y = -0.34;
  upperArm.castShadow = true;
  shoulder.add(upperArm);

  const elbow = new THREE.Group();
  elbow.position.y = -0.68;
  shoulder.add(elbow);

  const lowerArm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.62, 0.2), limbMaterial);
  lowerArm.position.y = -0.31;
  lowerArm.castShadow = true;
  elbow.add(lowerArm);

  const hand = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 10), handMaterial);
  hand.position.y = -0.66;
  hand.castShadow = true;
  elbow.add(hand);

  const hip = new THREE.Group();
  hip.position.set(direction * 0.27, -0.67, 0);
  hips.add(hip);

  const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.78, 0.26), limbMaterial);
  thigh.position.y = -0.39;
  thigh.castShadow = true;
  hip.add(thigh);

  const knee = new THREE.Group();
  knee.position.y = -0.78;
  hip.add(knee);

  const shin = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.74, 0.23), limbMaterial);
  shin.position.y = -0.37;
  shin.castShadow = true;
  knee.add(shin);

  const foot = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.16, 0.55), footMaterial);
  foot.position.set(0, -0.77, 0.17);
  foot.castShadow = true;
  knee.add(foot);

  return { shoulder, upperArm, elbow, lowerArm, hand, hip, thigh, knee, shin, foot };
}

const left = makeLimb('left');
const right = makeLimb('right');

const footprintMaterial = new THREE.MeshStandardMaterial({
  color: 0x5a3f2a,
  roughness: 1,
  transparent: true,
  opacity: 0.34,
});

for (let i = 0; i < 12; i += 1) {
  const print = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.02, 0.48), footprintMaterial);
  print.position.set(-7.5 + i * 1.25, 0.035, (i % 2 === 0 ? -0.28 : 0.28));
  print.rotation.y = (i % 2 === 0 ? -0.16 : 0.16);
  print.receiveShadow = true;
  scene.add(print);
}

const markerMaterial = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  emissive: 0x2a4f7a,
  emissiveIntensity: 0.12,
  roughness: 0.5,
});

for (const x of [-8, 8]) {
  const marker = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.1, 12), markerMaterial);
  marker.position.set(x, 0.55, -1.35);
  marker.castShadow = true;
  scene.add(marker);
}

function setLimbPose(limb: Limb, phase: number, armOffset: number): void {
  const swing = Math.sin(phase);
  const backSwing = Math.sin(phase + Math.PI);
  const lift = Math.max(0, Math.sin(phase));

  limb.shoulder.rotation.x = armOffset - swing * 0.75;
  limb.shoulder.rotation.z = limb.shoulder.position.x < 0 ? -0.08 : 0.08;
  limb.elbow.rotation.x = -0.32 - Math.max(0, backSwing) * 0.55;

  limb.hip.rotation.x = swing * 0.72;
  limb.hip.rotation.z = limb.hip.position.x < 0 ? 0.035 : -0.035;
  limb.knee.rotation.x = -0.12 - lift * 0.86;
  limb.foot.rotation.x = 0.12 + lift * 0.35;
}

const clock = new THREE.Clock();
const walkSpeed = 1.55;
const stridePhaseOffset = 0.95;

function animate(): void {
  const elapsed = clock.getElapsedTime() + stridePhaseOffset;
  const phase = elapsed * 5.2;
  const travel = ((elapsed * walkSpeed + 8) % 16) - 8;

  character.position.set(travel, 0, 0);
  character.rotation.y = 0;
  hips.position.y = 1.48 + Math.abs(Math.sin(phase)) * 0.075;
  hips.rotation.z = Math.sin(phase) * 0.055;
  hips.rotation.x = Math.sin(phase * 2) * 0.035;
  head.rotation.x = Math.sin(phase * 2 + 0.5) * 0.055;

  setLimbPose(left, phase, 0.14);
  setLimbPose(right, phase + Math.PI, 0.14);

  camera.lookAt(character.position.x * 0.18, 1.45, 0);
  renderer.render(scene, camera);
}

renderer.setAnimationLoop(animate);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
