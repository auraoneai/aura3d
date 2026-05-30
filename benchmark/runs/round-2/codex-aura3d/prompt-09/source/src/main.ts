import * as THREE from "three";

const host = document.querySelector<HTMLDivElement>("#app");

if (!host) {
  throw new Error("Missing #app host element");
}

document.body.style.margin = "0";
document.body.style.overflow = "hidden";
document.body.style.background = "#091018";
host.style.width = "100vw";
host.style.height = "100vh";

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
host.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color("#091018");
scene.fog = new THREE.Fog("#091018", 6, 14);

const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(4.2, 2.6, 5.8);
camera.lookAt(0, 1.0, 0);

const groundMaterial = new THREE.MeshStandardMaterial({
  color: "#223038",
  roughness: 0.78,
  metalness: 0.04
});
const ground = new THREE.Mesh(new THREE.PlaneGeometry(9, 5.4), groundMaterial);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const grid = new THREE.GridHelper(9, 18, "#5b7278", "#32454c");
grid.position.y = 0.006;
scene.add(grid);

const laneMaterial = new THREE.MeshStandardMaterial({
  color: "#78d6ff",
  emissive: "#1d5c74",
  roughness: 0.35
});
for (let x = -3; x <= 3; x += 1.5) {
  const dash = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.018, 0.05), laneMaterial);
  dash.position.set(x, 0.02, -1.35);
  dash.receiveShadow = true;
  scene.add(dash);
}

const footprintMaterial = new THREE.MeshStandardMaterial({
  color: "#9fe7ff",
  emissive: "#154b5e",
  roughness: 0.5
});
for (let index = 0; index < 8; index += 1) {
  const foot = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.014, 0.12), footprintMaterial);
  foot.position.set(-3.2 + index * 0.9, 0.025, index % 2 === 0 ? 0.44 : -0.06);
  foot.rotation.y = index % 2 === 0 ? -0.2 : 0.2;
  scene.add(foot);
}

const ambient = new THREE.HemisphereLight("#dff7ff", "#071015", 1.8);
scene.add(ambient);

const key = new THREE.DirectionalLight("#ffffff", 3.2);
key.position.set(3.5, 5.4, 3.2);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.near = 0.5;
key.shadow.camera.far = 18;
key.shadow.camera.left = -5;
key.shadow.camera.right = 5;
key.shadow.camera.top = 5;
key.shadow.camera.bottom = -5;
scene.add(key);

const rim = new THREE.PointLight("#7bdcff", 90, 9, 2);
rim.position.set(-3.0, 2.4, -2.2);
scene.add(rim);

const skin = new THREE.MeshStandardMaterial({ color: "#f0b892", roughness: 0.62 });
const shirt = new THREE.MeshStandardMaterial({ color: "#e1504d", roughness: 0.55 });
const pants = new THREE.MeshStandardMaterial({ color: "#2d78c4", roughness: 0.58 });
const shoeMaterial = new THREE.MeshStandardMaterial({ color: "#10151b", roughness: 0.7 });

const walker = new THREE.Group();
scene.add(walker);

const hips = new THREE.Group();
hips.position.y = 1.0;
walker.add(hips);

const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.42, 0.92, 32), shirt);
torso.position.y = 0.35;
torso.castShadow = true;
torso.receiveShadow = true;
hips.add(torso);

const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.14, 24), skin);
neck.position.y = 0.89;
neck.castShadow = true;
hips.add(neck);

const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 32, 24), skin);
head.position.y = 1.16;
head.castShadow = true;
hips.add(head);

const makeLimb = (
  materialValue: THREE.Material,
  width: number,
  length: number,
  depth: number,
  lowerOffset: number
) => {
  const pivot = new THREE.Group();
  const limb = new THREE.Mesh(new THREE.BoxGeometry(width, length, depth), materialValue);
  limb.position.y = -lowerOffset;
  limb.castShadow = true;
  limb.receiveShadow = true;
  pivot.add(limb);
  return { pivot, mesh: limb };
};

const leftArm = makeLimb(skin, 0.16, 0.72, 0.16, 0.36);
leftArm.pivot.position.set(-0.48, 0.72, 0);
hips.add(leftArm.pivot);

const rightArm = makeLimb(skin, 0.16, 0.72, 0.16, 0.36);
rightArm.pivot.position.set(0.48, 0.72, 0);
hips.add(rightArm.pivot);

const leftLeg = makeLimb(pants, 0.2, 0.82, 0.2, 0.41);
leftLeg.pivot.position.set(-0.18, -0.1, 0);
hips.add(leftLeg.pivot);

const rightLeg = makeLimb(pants, 0.2, 0.82, 0.2, 0.41);
rightLeg.pivot.position.set(0.18, -0.1, 0);
hips.add(rightLeg.pivot);

const makeFoot = (parent: THREE.Group) => {
  const foot = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.12, 0.42), shoeMaterial);
  foot.position.set(0, -0.86, 0.1);
  foot.castShadow = true;
  foot.receiveShadow = true;
  parent.add(foot);
  return foot;
};

const leftFoot = makeFoot(leftLeg.pivot);
const rightFoot = makeFoot(rightLeg.pivot);

const eyeMaterial = new THREE.MeshStandardMaterial({ color: "#10151b", roughness: 0.4 });
for (const x of [-0.09, 0.09]) {
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.025, 12, 8), eyeMaterial);
  eye.position.set(x, 1.2, 0.255);
  hips.add(eye);
}

const ghostMaterial = new THREE.MeshStandardMaterial({
  color: "#79d8ff",
  transparent: true,
  opacity: 0.22,
  roughness: 0.6
});
for (const [x, scale] of [
  [-1.25, 0.9],
  [-0.78, 0.72],
  [-0.34, 0.54]
] as const) {
  const trail = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.43, 0.92, 24), ghostMaterial);
  trail.position.set(x, 1.35, 0);
  trail.scale.setScalar(scale);
  trail.castShadow = false;
  scene.add(trail);
}

const clock = new THREE.Clock();
const phaseOffset = 0.62;

function animate() {
  const time = clock.getElapsedTime() + phaseOffset;
  const stride = time * Math.PI * 2 * 0.82;
  const swing = Math.sin(stride);
  const counterSwing = Math.sin(stride + Math.PI);
  const lift = Math.abs(Math.sin(stride));
  const travel = ((time * 0.64 + 0.18) % 1) * 5.7 - 2.85;

  walker.position.set(travel, 0, 0);
  walker.rotation.y = 0.12 * Math.sin(stride * 0.5);
  hips.position.y = 1.0 + lift * 0.055;
  hips.rotation.z = 0.045 * Math.sin(stride);
  torso.rotation.x = 0.05 * Math.sin(stride + Math.PI * 0.5);
  head.rotation.z = -0.04 * Math.sin(stride);

  leftArm.pivot.rotation.x = counterSwing * 0.85;
  rightArm.pivot.rotation.x = swing * 0.85;
  leftArm.pivot.rotation.z = -0.12;
  rightArm.pivot.rotation.z = 0.12;

  leftLeg.pivot.rotation.x = swing * 0.72;
  rightLeg.pivot.rotation.x = counterSwing * 0.72;
  leftFoot.rotation.x = -0.42 * Math.max(0, swing);
  rightFoot.rotation.x = -0.42 * Math.max(0, counterSwing);

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();
