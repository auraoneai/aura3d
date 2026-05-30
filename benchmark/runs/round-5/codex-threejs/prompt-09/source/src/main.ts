import "./style.css";
import * as THREE from "three";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Missing #app root");
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xd9ecff);
scene.fog = new THREE.Fog(0xd9ecff, 16, 42);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(7, 4.2, 8);
camera.lookAt(0, 1.4, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

const hemiLight = new THREE.HemisphereLight(0xffffff, 0x6b7a8f, 1.8);
scene.add(hemiLight);

const sun = new THREE.DirectionalLight(0xffffff, 2.8);
sun.position.set(5, 8, 4);
sun.castShadow = true;
sun.shadow.camera.left = -12;
sun.shadow.camera.right = 12;
sun.shadow.camera.top = 12;
sun.shadow.camera.bottom = -12;
sun.shadow.mapSize.set(2048, 2048);
scene.add(sun);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(36, 18),
  new THREE.MeshStandardMaterial({ color: 0x6f9a72, roughness: 0.78 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const grid = new THREE.GridHelper(36, 36, 0x31513c, 0x86ad88);
grid.position.y = 0.01;
scene.add(grid);

const lane = new THREE.Mesh(
  new THREE.PlaneGeometry(18, 1.15),
  new THREE.MeshStandardMaterial({ color: 0x9a8f7b, roughness: 0.92 }),
);
lane.rotation.x = -Math.PI / 2;
lane.position.set(0, 0.015, 0);
lane.receiveShadow = true;
scene.add(lane);

const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x2f6ecf, roughness: 0.48 });
const limbMaterial = new THREE.MeshStandardMaterial({ color: 0xf0b56d, roughness: 0.52 });
const headMaterial = new THREE.MeshStandardMaterial({ color: 0xffd2a6, roughness: 0.58 });
const shoeMaterial = new THREE.MeshStandardMaterial({ color: 0x242833, roughness: 0.7 });

function primitiveMesh(geometry: THREE.BufferGeometry, material: THREE.Material) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

const character = new THREE.Group();
scene.add(character);

const torso = primitiveMesh(new THREE.CylinderGeometry(0.42, 0.5, 1.3, 24), bodyMaterial);
torso.position.y = 1.92;
character.add(torso);

const neck = primitiveMesh(new THREE.CylinderGeometry(0.14, 0.16, 0.18, 16), limbMaterial);
neck.position.y = 2.66;
character.add(neck);

const head = primitiveMesh(new THREE.SphereGeometry(0.38, 32, 24), headMaterial);
head.position.y = 3.08;
head.scale.set(0.96, 1.08, 0.96);
character.add(head);

const nose = primitiveMesh(new THREE.BoxGeometry(0.12, 0.1, 0.18), headMaterial);
nose.position.set(0, 3.08, 0.38);
character.add(nose);

const leftArm = new THREE.Group();
const rightArm = new THREE.Group();
leftArm.position.set(-0.58, 2.44, 0);
rightArm.position.set(0.58, 2.44, 0);
character.add(leftArm, rightArm);

const armGeometry = new THREE.BoxGeometry(0.22, 0.95, 0.22);
const leftArmMesh = primitiveMesh(armGeometry, limbMaterial);
leftArmMesh.position.y = -0.47;
leftArm.add(leftArmMesh);
const rightArmMesh = primitiveMesh(armGeometry.clone(), limbMaterial);
rightArmMesh.position.y = -0.47;
rightArm.add(rightArmMesh);

const leftHand = primitiveMesh(new THREE.SphereGeometry(0.15, 16, 12), headMaterial);
leftHand.position.y = -1.03;
leftArm.add(leftHand);
const rightHand = primitiveMesh(new THREE.SphereGeometry(0.15, 16, 12), headMaterial);
rightHand.position.y = -1.03;
rightArm.add(rightHand);

const leftLeg = new THREE.Group();
const rightLeg = new THREE.Group();
leftLeg.position.set(-0.23, 1.25, 0);
rightLeg.position.set(0.23, 1.25, 0);
character.add(leftLeg, rightLeg);

const legGeometry = new THREE.BoxGeometry(0.28, 1.15, 0.28);
const leftLegMesh = primitiveMesh(legGeometry, limbMaterial);
leftLegMesh.position.y = -0.56;
leftLeg.add(leftLegMesh);
const rightLegMesh = primitiveMesh(legGeometry.clone(), limbMaterial);
rightLegMesh.position.y = -0.56;
rightLeg.add(rightLegMesh);

const footGeometry = new THREE.BoxGeometry(0.34, 0.18, 0.62);
const leftFoot = primitiveMesh(footGeometry, shoeMaterial);
leftFoot.position.set(0, -1.18, 0.12);
leftLeg.add(leftFoot);
const rightFoot = primitiveMesh(footGeometry.clone(), shoeMaterial);
rightFoot.position.set(0, -1.18, 0.12);
rightLeg.add(rightFoot);

const clock = new THREE.Clock();
const walkLength = 10;

function animate() {
  const elapsed = clock.getElapsedTime();
  const stride = elapsed * 4.2;
  const swing = Math.sin(stride);
  const counterSwing = Math.sin(stride + Math.PI);
  const lift = Math.max(0, Math.sin(stride));
  const counterLift = Math.max(0, Math.sin(stride + Math.PI));

  character.position.x = ((elapsed * 1.35 + walkLength / 2) % walkLength) - walkLength / 2;
  character.position.y = 0.08 + Math.abs(Math.sin(stride * 2)) * 0.08;
  character.rotation.z = Math.sin(stride * 2) * 0.035;

  torso.rotation.x = Math.sin(stride * 2) * 0.045;
  head.rotation.x = Math.sin(stride * 2 + 0.4) * 0.05;
  nose.rotation.copy(head.rotation);

  leftArm.rotation.x = counterSwing * 0.92;
  rightArm.rotation.x = swing * 0.92;
  leftArm.rotation.z = -0.12;
  rightArm.rotation.z = 0.12;

  leftLeg.rotation.x = swing * 0.72;
  rightLeg.rotation.x = counterSwing * 0.72;
  leftLeg.position.y = 1.25 + lift * 0.08;
  rightLeg.position.y = 1.25 + counterLift * 0.08;
  leftFoot.rotation.x = -0.24 + counterLift * 0.45;
  rightFoot.rotation.x = -0.24 + lift * 0.45;

  camera.lookAt(character.position.x, 1.55, 0);
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();
