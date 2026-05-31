import * as THREE from 'three';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('Missing #app root element.');
}

document.body.style.margin = '0';
document.body.style.overflow = 'hidden';
document.body.style.background = '#cfe6ff';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xcfe6ff);
scene.fog = new THREE.Fog(0xcfe6ff, 14, 34);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(5.8, 4.1, 8.2);
camera.lookAt(0, 1.15, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

const hemiLight = new THREE.HemisphereLight(0xffffff, 0x6f7b62, 2.2);
scene.add(hemiLight);

const sun = new THREE.DirectionalLight(0xffffff, 2.6);
sun.position.set(4, 8, 5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -9;
sun.shadow.camera.right = 9;
sun.shadow.camera.top = 9;
sun.shadow.camera.bottom = -9;
scene.add(sun);

const groundMaterial = new THREE.MeshStandardMaterial({
  color: 0x7ca56b,
  roughness: 0.92,
});
const ground = new THREE.Mesh(new THREE.PlaneGeometry(28, 12), groundMaterial);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const grid = new THREE.GridHelper(28, 28, 0xffffff, 0x5f8e58);
grid.position.y = 0.012;
grid.material.transparent = true;
grid.material.opacity = 0.25;
scene.add(grid);

const pathMaterial = new THREE.MeshStandardMaterial({
  color: 0xe7d6a0,
  roughness: 0.86,
});
const path = new THREE.Mesh(new THREE.PlaneGeometry(28, 2.4), pathMaterial);
path.rotation.x = -Math.PI / 2;
path.position.y = 0.018;
path.receiveShadow = true;
scene.add(path);

const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x2f7dd1, roughness: 0.55 });
const headMaterial = new THREE.MeshStandardMaterial({ color: 0xffc28f, roughness: 0.62 });
const limbMaterial = new THREE.MeshStandardMaterial({ color: 0x26333f, roughness: 0.58 });
const shoeMaterial = new THREE.MeshStandardMaterial({ color: 0x101214, roughness: 0.5 });

const character = new THREE.Group();
scene.add(character);

const hip = new THREE.Group();
hip.position.y = 1.36;
character.add(hip);

const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.55, 1.35, 24), bodyMaterial);
torso.position.y = 0.45;
torso.castShadow = true;
hip.add(torso);

const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.18, 18), headMaterial);
neck.position.y = 1.24;
neck.castShadow = true;
hip.add(neck);

const head = new THREE.Mesh(new THREE.SphereGeometry(0.36, 32, 20), headMaterial);
head.position.y = 1.62;
head.castShadow = true;
hip.add(head);

const shoulderBar = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.18, 0.28), bodyMaterial);
shoulderBar.position.y = 1.05;
shoulderBar.castShadow = true;
hip.add(shoulderBar);

type Limb = {
  upper: THREE.Group;
  lower: THREE.Group;
  foot?: THREE.Group;
};

function makeBoxLimb(
  width: number,
  height: number,
  depth: number,
  material: THREE.Material,
  y: number,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  mesh.position.y = y;
  mesh.castShadow = true;
  return mesh;
}

function createArm(side: -1 | 1): Limb {
  const upper = new THREE.Group();
  upper.position.set(side * 0.74, 0.98, 0);
  hip.add(upper);

  upper.add(makeBoxLimb(0.22, 0.72, 0.24, limbMaterial, -0.36));

  const lower = new THREE.Group();
  lower.position.y = -0.72;
  upper.add(lower);
  lower.add(makeBoxLimb(0.2, 0.68, 0.22, limbMaterial, -0.34));

  const hand = new THREE.Mesh(new THREE.SphereGeometry(0.13, 18, 12), headMaterial);
  hand.position.y = -0.72;
  hand.castShadow = true;
  lower.add(hand);

  return { upper, lower };
}

function createLeg(side: -1 | 1): Limb {
  const upper = new THREE.Group();
  upper.position.set(side * 0.28, -0.2, 0);
  hip.add(upper);

  upper.add(makeBoxLimb(0.28, 0.82, 0.3, limbMaterial, -0.41));

  const lower = new THREE.Group();
  lower.position.y = -0.82;
  upper.add(lower);
  lower.add(makeBoxLimb(0.24, 0.76, 0.26, limbMaterial, -0.38));

  const foot = new THREE.Group();
  foot.position.y = -0.76;
  lower.add(foot);
  const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.16, 0.56), shoeMaterial);
  shoe.position.set(0, -0.04, 0.14);
  shoe.castShadow = true;
  foot.add(shoe);

  return { upper, lower, foot };
}

const leftArm = createArm(-1);
const rightArm = createArm(1);
const leftLeg = createLeg(-1);
const rightLeg = createLeg(1);

const clock = new THREE.Clock();
const strideTrack = 7.2;

function animate(): void {
  const time = clock.getElapsedTime();
  const gait = time * 4.2;
  const stride = Math.sin(gait);
  const counterStride = Math.sin(gait + Math.PI);
  const lift = Math.max(0, Math.sin(gait));
  const counterLift = Math.max(0, Math.sin(gait + Math.PI));

  character.position.x = ((time * 1.35 + strideTrack / 2) % strideTrack) - strideTrack / 2;
  character.position.z = 0;
  character.rotation.y = 0.08 * Math.sin(time * 1.1);

  hip.position.y = 1.38 + Math.abs(Math.sin(gait)) * 0.09;
  hip.rotation.z = 0.055 * Math.sin(gait + Math.PI / 2);
  torso.rotation.x = 0.06 * Math.sin(gait + Math.PI / 2);
  head.rotation.x = -0.06 * Math.sin(gait + Math.PI / 2);

  leftLeg.upper.rotation.x = 0.72 * stride;
  rightLeg.upper.rotation.x = 0.72 * counterStride;
  leftLeg.lower.rotation.x = -0.36 - 0.8 * lift;
  rightLeg.lower.rotation.x = -0.36 - 0.8 * counterLift;
  leftLeg.foot!.rotation.x = 0.34 * lift - 0.12;
  rightLeg.foot!.rotation.x = 0.34 * counterLift - 0.12;

  leftArm.upper.rotation.x = 0.78 * counterStride;
  rightArm.upper.rotation.x = 0.78 * stride;
  leftArm.lower.rotation.x = -0.32 - 0.22 * counterLift;
  rightArm.lower.rotation.x = -0.32 - 0.22 * lift;

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();
