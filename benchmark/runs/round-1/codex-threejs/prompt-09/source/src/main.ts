import * as THREE from 'three';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('Missing #app container');
}

document.body.style.margin = '0';
document.body.style.overflow = 'hidden';
document.body.style.background = '#aeb9c4';
app.style.width = '100vw';
app.style.height = '100vh';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xaeb9c4);
scene.fog = new THREE.Fog(0xaeb9c4, 9, 24);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(5.5, 3.7, 7.2);
camera.lookAt(0, 1.3, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

const hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x6d747a, 2.1);
scene.add(hemisphereLight);

const keyLight = new THREE.DirectionalLight(0xffffff, 2.8);
keyLight.position.set(4, 7, 5);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.left = -8;
keyLight.shadow.camera.right = 8;
keyLight.shadow.camera.top = 8;
keyLight.shadow.camera.bottom = -8;
scene.add(keyLight);

const groundMaterial = new THREE.MeshStandardMaterial({
  color: 0x6f806d,
  roughness: 0.86,
  metalness: 0.02,
});
const ground = new THREE.Mesh(new THREE.PlaneGeometry(18, 10), groundMaterial);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const grid = new THREE.GridHelper(18, 18, 0xffffff, 0xd6dfd4);
grid.position.y = 0.006;
scene.add(grid);

const pathMaterial = new THREE.MeshBasicMaterial({
  color: 0xf4f0de,
  transparent: true,
  opacity: 0.33,
});
const path = new THREE.Mesh(new THREE.PlaneGeometry(12.5, 0.36), pathMaterial);
path.rotation.x = -Math.PI / 2;
path.position.set(0, 0.012, 0);
scene.add(path);

const torsoMaterial = new THREE.MeshStandardMaterial({ color: 0x2f6f91, roughness: 0.58 });
const headMaterial = new THREE.MeshStandardMaterial({ color: 0xf1c597, roughness: 0.64 });
const armMaterial = new THREE.MeshStandardMaterial({ color: 0xeaa85f, roughness: 0.62 });
const legMaterial = new THREE.MeshStandardMaterial({ color: 0x243852, roughness: 0.56 });
const jointMaterial = new THREE.MeshStandardMaterial({ color: 0xf7d08d, roughness: 0.6 });
const shoeMaterial = new THREE.MeshStandardMaterial({ color: 0x151719, roughness: 0.7 });

type Limb = {
  pivot: THREE.Group;
  mesh: THREE.Mesh;
  foot?: THREE.Mesh;
};

const character = new THREE.Group();
scene.add(character);

const body = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.58, 1.45, 28), torsoMaterial);
body.position.y = 1.92;
body.castShadow = true;
character.add(body);

const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.18, 18), headMaterial);
neck.position.y = 2.72;
neck.castShadow = true;
character.add(neck);

const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 32, 24), headMaterial);
head.position.y = 3.13;
head.castShadow = true;
character.add(head);

const nose = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.18), headMaterial);
nose.position.set(0, 3.1, 0.42);
nose.castShadow = true;
character.add(nose);

const shoulderBar = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.18, 0.32), torsoMaterial);
shoulderBar.position.y = 2.5;
shoulderBar.castShadow = true;
character.add(shoulderBar);

const hipBar = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.2, 0.34), legMaterial);
hipBar.position.y = 1.17;
hipBar.castShadow = true;
character.add(hipBar);

function createLimb(
  side: -1 | 1,
  upperY: number,
  x: number,
  z: number,
  size: THREE.Vector3,
  material: THREE.Material,
  hasFoot = false,
): Limb {
  const pivot = new THREE.Group();
  pivot.position.set(x, upperY, z);
  character.add(pivot);

  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), material);
  mesh.position.y = -size.y / 2;
  mesh.castShadow = true;
  pivot.add(mesh);

  const joint = new THREE.Mesh(new THREE.SphereGeometry(Math.max(size.x, size.z) * 0.58, 18, 12), jointMaterial);
  joint.scale.y = 0.65;
  joint.castShadow = true;
  pivot.add(joint);

  let foot: THREE.Mesh | undefined;
  if (hasFoot) {
    foot = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.16, 0.62), shoeMaterial);
    foot.position.set(0, -size.y - 0.04, 0.17 * side);
    foot.castShadow = true;
    pivot.add(foot);
  }

  return { pivot, mesh, foot };
}

const leftArm = createLimb(-1, 2.43, -0.82, 0, new THREE.Vector3(0.24, 1.15, 0.24), armMaterial);
const rightArm = createLimb(1, 2.43, 0.82, 0, new THREE.Vector3(0.24, 1.15, 0.24), armMaterial);
const leftLeg = createLimb(-1, 1.08, -0.28, 0, new THREE.Vector3(0.28, 1.08, 0.3), legMaterial, true);
const rightLeg = createLimb(1, 1.08, 0.28, 0, new THREE.Vector3(0.28, 1.08, 0.3), legMaterial, true);

const shadowBlob = new THREE.Mesh(
  new THREE.CircleGeometry(0.9, 48),
  new THREE.MeshBasicMaterial({ color: 0x1d2420, transparent: true, opacity: 0.18 }),
);
shadowBlob.rotation.x = -Math.PI / 2;
shadowBlob.position.y = 0.018;
character.add(shadowBlob);

const strideMarkers: THREE.Mesh[] = [];
for (let i = 0; i < 8; i += 1) {
  const marker = new THREE.Mesh(
    new THREE.BoxGeometry(0.36, 0.025, 0.12),
    new THREE.MeshStandardMaterial({ color: i % 2 === 0 ? 0x20334a : 0xeaa85f, roughness: 0.74 }),
  );
  marker.position.set(-5.3 + i * 1.5, 0.035, i % 2 === 0 ? -0.34 : 0.34);
  marker.rotation.y = i % 2 === 0 ? 0.26 : -0.26;
  marker.castShadow = true;
  marker.receiveShadow = true;
  scene.add(marker);
  strideMarkers.push(marker);
}

function applyWalkPose(elapsedSeconds: number) {
  const phase = elapsedSeconds * 5.2 + 0.85;
  const stride = Math.sin(phase);
  const counterStride = Math.sin(phase + Math.PI);
  const bounce = Math.abs(Math.sin(phase)) * 0.08;
  const forward = ((elapsedSeconds * 0.95 + 2.4) % 8.8) - 4.4;

  character.position.set(forward, bounce, 0);
  character.rotation.y = Math.sin(elapsedSeconds * 0.75) * 0.04;
  body.rotation.z = Math.sin(phase) * 0.045;
  shoulderBar.rotation.z = -body.rotation.z * 1.4;
  hipBar.rotation.z = body.rotation.z * 1.1;
  head.rotation.z = -body.rotation.z * 0.55;
  head.position.y = 3.13 + bounce * 0.35;
  nose.position.y = 3.1 + bounce * 0.35;

  leftLeg.pivot.rotation.x = stride * 0.68;
  rightLeg.pivot.rotation.x = counterStride * 0.68;
  leftLeg.mesh.rotation.x = Math.max(0, -stride) * 0.28;
  rightLeg.mesh.rotation.x = Math.max(0, -counterStride) * 0.28;

  leftArm.pivot.rotation.x = counterStride * 0.82;
  rightArm.pivot.rotation.x = stride * 0.82;
  leftArm.pivot.rotation.z = -0.17;
  rightArm.pivot.rotation.z = 0.17;

  if (leftLeg.foot) {
    leftLeg.foot.rotation.x = -leftLeg.pivot.rotation.x * 0.5 - 0.12;
  }
  if (rightLeg.foot) {
    rightLeg.foot.rotation.x = -rightLeg.pivot.rotation.x * 0.5 - 0.12;
  }

  strideMarkers.forEach((marker, index) => {
    marker.position.x = -5.3 + index * 1.5 + Math.sin(elapsedSeconds * 0.8 + index) * 0.02;
  });
}

applyWalkPose(0);

function animate(time: number) {
  applyWalkPose(time / 1000);
  renderer.render(scene, camera);
}

renderer.setAnimationLoop(animate);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
