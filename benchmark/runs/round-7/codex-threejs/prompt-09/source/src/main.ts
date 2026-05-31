import * as THREE from 'three';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('Missing #app container');
}

document.body.style.margin = '0';
document.body.style.overflow = 'hidden';
document.body.style.background = '#d7e8f0';
app.style.width = '100vw';
app.style.height = '100vh';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xd7e8f0);
scene.fog = new THREE.Fog(0xd7e8f0, 15, 34);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(6.5, 4.2, 8);
camera.lookAt(0, 1.25, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

const hemiLight = new THREE.HemisphereLight(0xffffff, 0x78909c, 1.9);
scene.add(hemiLight);

const keyLight = new THREE.DirectionalLight(0xffffff, 2.4);
keyLight.position.set(4, 7, 5);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.left = -9;
keyLight.shadow.camera.right = 9;
keyLight.shadow.camera.top = 9;
keyLight.shadow.camera.bottom = -9;
scene.add(keyLight);

const groundMaterial = new THREE.MeshStandardMaterial({
  color: 0x7fb069,
  roughness: 0.92,
  metalness: 0.02,
});
const ground = new THREE.Mesh(new THREE.PlaneGeometry(28, 16), groundMaterial);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const grid = new THREE.GridHelper(28, 28, 0x426045, 0x9fbe90);
grid.position.y = 0.012;
scene.add(grid);

const path = new THREE.Mesh(
  new THREE.PlaneGeometry(15, 1.35),
  new THREE.MeshStandardMaterial({ color: 0xb8a487, roughness: 0.95 }),
);
path.rotation.x = -Math.PI / 2;
path.position.y = 0.018;
path.receiveShadow = true;
scene.add(path);

type Limb = {
  pivot: THREE.Group;
  mesh: THREE.Mesh;
  side: -1 | 1;
};

const walker = new THREE.Group();
walker.position.set(-4.8, 0, 0);
scene.add(walker);

const skin = new THREE.MeshStandardMaterial({ color: 0xf0b38d, roughness: 0.62 });
const shirt = new THREE.MeshStandardMaterial({ color: 0x2d6cdf, roughness: 0.72 });
const shorts = new THREE.MeshStandardMaterial({ color: 0x263238, roughness: 0.78 });
const shoe = new THREE.MeshStandardMaterial({ color: 0x11171a, roughness: 0.64 });

function cast(mesh: THREE.Mesh) {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

const torso = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.58, 1.55, 24), shirt));
torso.position.y = 1.78;
walker.add(torso);

const neck = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.19, 0.2, 18), skin));
neck.position.y = 2.66;
walker.add(neck);

const head = cast(new THREE.Mesh(new THREE.SphereGeometry(0.42, 32, 20), skin));
head.position.y = 3.12;
walker.add(head);

const nose = cast(new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.18, 12), skin));
nose.rotation.x = Math.PI / 2;
nose.position.set(0, 3.12, 0.42);
walker.add(nose);

const hip = cast(new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.32, 0.48), shorts));
hip.position.y = 0.98;
walker.add(hip);

const armGeometry = new THREE.BoxGeometry(0.22, 1.18, 0.22);
armGeometry.translate(0, -0.5, 0);
const legGeometry = new THREE.BoxGeometry(0.28, 1.22, 0.28);
legGeometry.translate(0, -0.5, 0);
const shoeGeometry = new THREE.BoxGeometry(0.34, 0.16, 0.62);

function makeArm(side: -1 | 1): Limb {
  const pivot = new THREE.Group();
  pivot.position.set(side * 0.68, 2.38, 0);
  walker.add(pivot);

  const mesh = cast(new THREE.Mesh(armGeometry, skin));
  mesh.position.y = -0.12;
  pivot.add(mesh);

  const hand = cast(new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12), skin));
  hand.position.y = -1.24;
  mesh.add(hand);

  return { pivot, mesh, side };
}

function makeLeg(side: -1 | 1): Limb {
  const pivot = new THREE.Group();
  pivot.position.set(side * 0.29, 0.9, 0);
  walker.add(pivot);

  const mesh = cast(new THREE.Mesh(legGeometry, shorts));
  mesh.position.y = -0.1;
  pivot.add(mesh);

  const foot = cast(new THREE.Mesh(shoeGeometry, shoe));
  foot.position.set(0, -1.2, 0.13);
  mesh.add(foot);

  return { pivot, mesh, side };
}

const leftArm = makeArm(-1);
const rightArm = makeArm(1);
const leftLeg = makeLeg(-1);
const rightLeg = makeLeg(1);

const shadowBlob = new THREE.Mesh(
  new THREE.CircleGeometry(0.9, 48),
  new THREE.MeshBasicMaterial({ color: 0x263238, transparent: true, opacity: 0.18 }),
);
shadowBlob.rotation.x = -Math.PI / 2;
shadowBlob.position.y = 0.03;
walker.add(shadowBlob);

function animate(timeMs: number) {
  const time = timeMs * 0.001;
  const cycle = time * 5.2;
  const stride = Math.sin(cycle);
  const counterStride = Math.sin(cycle + Math.PI);
  const bob = Math.abs(Math.sin(cycle)) * 0.11;

  walker.position.x = THREE.MathUtils.euclideanModulo(time * 1.15, 10) - 5;
  walker.position.y = bob;
  walker.rotation.y = Math.sin(time * 0.8) * 0.05;

  torso.rotation.z = Math.sin(cycle) * 0.035;
  hip.rotation.z = -Math.sin(cycle) * 0.045;
  head.rotation.z = -Math.sin(cycle) * 0.025;

  leftLeg.pivot.rotation.x = stride * 0.72;
  rightLeg.pivot.rotation.x = counterStride * 0.72;
  leftLeg.mesh.rotation.x = Math.max(0, -stride) * 0.34;
  rightLeg.mesh.rotation.x = Math.max(0, -counterStride) * 0.34;

  leftArm.pivot.rotation.x = counterStride * 0.82;
  rightArm.pivot.rotation.x = stride * 0.82;
  leftArm.pivot.rotation.z = -0.12;
  rightArm.pivot.rotation.z = 0.12;

  shadowBlob.scale.setScalar(1 + bob * 1.5);

  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

renderer.setAnimationLoop(animate);
