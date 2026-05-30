import * as THREE from "three";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Missing #app container");
}

app.innerHTML = "";
Object.assign(document.body.style, {
  margin: "0",
  overflow: "hidden",
  background: "#12161d",
});
Object.assign(app.style, {
  width: "100vw",
  height: "100vh",
});

const scene = new THREE.Scene();
scene.background = new THREE.Color("#d7e7f4");
scene.fog = new THREE.Fog("#d7e7f4", 8, 22);

const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(4.6, 3.1, 6.2);
camera.lookAt(0, 1.15, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
app.append(renderer.domElement);

const hemiLight = new THREE.HemisphereLight("#ffffff", "#5f6f79", 1.9);
scene.add(hemiLight);

const sun = new THREE.DirectionalLight("#fff7e8", 2.4);
sun.position.set(4, 7, 5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -8;
sun.shadow.camera.right = 8;
sun.shadow.camera.top = 8;
sun.shadow.camera.bottom = -8;
scene.add(sun);

const groundMaterial = new THREE.MeshStandardMaterial({
  color: "#6f8a76",
  roughness: 0.82,
  metalness: 0,
});
const ground = new THREE.Mesh(new THREE.PlaneGeometry(18, 10), groundMaterial);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const grid = new THREE.GridHelper(18, 18, "#ffffff", "#496351");
grid.position.y = 0.012;
grid.material.opacity = 0.26;
grid.material.transparent = true;
scene.add(grid);

const pathMaterial = new THREE.MeshStandardMaterial({
  color: "#d6e378",
  emissive: "#8a982d",
  emissiveIntensity: 0.18,
  roughness: 0.6,
});
for (let i = 0; i < 11; i += 1) {
  const marker = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.025, 0.07), pathMaterial);
  marker.position.set(-4.4 + i * 0.88, 0.03, -1.05);
  marker.rotation.y = -0.08;
  marker.receiveShadow = true;
  scene.add(marker);
}

const skin = new THREE.MeshStandardMaterial({ color: "#f2b37b", roughness: 0.55 });
const shirt = new THREE.MeshStandardMaterial({ color: "#2f7d8b", roughness: 0.5 });
const shorts = new THREE.MeshStandardMaterial({ color: "#29384c", roughness: 0.5 });
const shoe = new THREE.MeshStandardMaterial({ color: "#171a20", roughness: 0.62 });
const ghostMaterial = new THREE.MeshStandardMaterial({
  color: "#76b7ff",
  emissive: "#2b6fa4",
  emissiveIntensity: 0.25,
  transparent: true,
  opacity: 0.18,
  roughness: 0.45,
});

type LimbSide = "left" | "right";

interface HumanoidRig {
  root: THREE.Group;
  torso: THREE.Mesh;
  head: THREE.Mesh;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  leftFoot: THREE.Group;
  rightFoot: THREE.Group;
}

function boxPart(width: number, height: number, depth: number, material: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function makeArm(side: LimbSide): THREE.Group {
  const sign = side === "left" ? -1 : 1;
  const pivot = new THREE.Group();
  pivot.position.set(sign * 0.48, 1.86, 0);

  const upper = boxPart(0.18, 0.76, 0.2, skin);
  upper.position.y = -0.38;
  pivot.add(upper);

  const hand = new THREE.Mesh(new THREE.SphereGeometry(0.12, 20, 14), skin);
  hand.position.y = -0.84;
  hand.castShadow = true;
  pivot.add(hand);

  return pivot;
}

function makeLeg(side: LimbSide): { leg: THREE.Group; foot: THREE.Group } {
  const sign = side === "left" ? -1 : 1;
  const leg = new THREE.Group();
  leg.position.set(sign * 0.22, 1.08, 0);

  const thigh = boxPart(0.22, 0.82, 0.24, shorts);
  thigh.position.y = -0.41;
  leg.add(thigh);

  const foot = new THREE.Group();
  foot.position.y = -0.86;
  const shoeBox = boxPart(0.26, 0.16, 0.48, shoe);
  shoeBox.position.set(0, -0.08, 0.12);
  foot.add(shoeBox);
  leg.add(foot);

  return { leg, foot };
}

function makeHumanoid(materialOverride?: THREE.Material): HumanoidRig {
  const root = new THREE.Group();
  const bodyMaterial = materialOverride ?? shirt;
  const headMaterial = materialOverride ?? skin;
  const limbMaterial = materialOverride ?? skin;
  const legMaterial = materialOverride ?? shorts;

  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 1.08, 32), bodyMaterial);
  torso.position.y = 1.48;
  torso.castShadow = true;
  torso.receiveShadow = true;
  root.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 32, 20), headMaterial);
  head.position.y = 2.27;
  head.castShadow = true;
  root.add(head);

  const neck = boxPart(0.16, 0.14, 0.16, limbMaterial);
  neck.position.y = 2.0;
  root.add(neck);

  const leftArm = makeArm("left");
  const rightArm = makeArm("right");
  if (materialOverride) {
    leftArm.traverse((part) => {
      if (part instanceof THREE.Mesh) part.material = materialOverride;
    });
    rightArm.traverse((part) => {
      if (part instanceof THREE.Mesh) part.material = materialOverride;
    });
  }
  root.add(leftArm, rightArm);

  const left = makeLeg("left");
  const right = makeLeg("right");
  if (materialOverride) {
    left.leg.traverse((part) => {
      if (part instanceof THREE.Mesh) part.material = materialOverride;
    });
    right.leg.traverse((part) => {
      if (part instanceof THREE.Mesh) part.material = materialOverride;
    });
  } else {
    left.leg.children[0] instanceof THREE.Mesh && (left.leg.children[0].material = legMaterial);
    right.leg.children[0] instanceof THREE.Mesh && (right.leg.children[0].material = legMaterial);
  }
  root.add(left.leg, right.leg);

  return {
    root,
    torso,
    head,
    leftArm,
    rightArm,
    leftLeg: left.leg,
    rightLeg: right.leg,
    leftFoot: left.foot,
    rightFoot: right.foot,
  };
}

const walker = makeHumanoid();
scene.add(walker.root);

const ghostA = makeHumanoid(ghostMaterial);
ghostA.root.position.set(-1.35, 0, -0.36);
ghostA.root.scale.setScalar(0.96);
ghostA.root.rotation.y = 0.02;
scene.add(ghostA.root);

const ghostB = makeHumanoid(ghostMaterial);
ghostB.root.position.set(-2.45, 0, -0.58);
ghostB.root.scale.setScalar(0.9);
ghostB.root.rotation.y = 0.04;
scene.add(ghostB.root);

const clock = new THREE.Clock();
const walkSeconds = 5.4;
const initialPhase = 0.72;

function poseRig(rig: HumanoidRig, phase: number, strideScale = 1): void {
  const stride = Math.sin(phase) * 0.72 * strideScale;
  const counterStride = Math.sin(phase + Math.PI) * 0.72 * strideScale;
  const liftLeft = Math.max(0, Math.sin(phase)) * 0.18 * strideScale;
  const liftRight = Math.max(0, Math.sin(phase + Math.PI)) * 0.18 * strideScale;
  const bob = Math.abs(Math.sin(phase)) * 0.085 * strideScale;

  rig.root.position.y = bob;
  rig.torso.rotation.z = Math.sin(phase) * 0.045;
  rig.torso.rotation.x = -0.08 + Math.cos(phase * 2) * 0.025;
  rig.head.rotation.z = -Math.sin(phase) * 0.055;
  rig.head.rotation.x = Math.cos(phase * 2) * 0.035;

  rig.leftArm.rotation.x = counterStride;
  rig.rightArm.rotation.x = stride;
  rig.leftArm.rotation.z = -0.12;
  rig.rightArm.rotation.z = 0.12;

  rig.leftLeg.rotation.x = stride;
  rig.rightLeg.rotation.x = counterStride;
  rig.leftFoot.rotation.x = -0.42 * Math.sin(phase) + liftLeft;
  rig.rightFoot.rotation.x = -0.42 * Math.sin(phase + Math.PI) + liftRight;

  rig.leftLeg.position.y = 1.08 + liftLeft * 0.42;
  rig.rightLeg.position.y = 1.08 + liftRight * 0.42;
}

poseRig(ghostA, initialPhase - 0.85, 0.82);
poseRig(ghostB, initialPhase - 1.55, 0.68);

function animate(): void {
  const elapsed = clock.getElapsedTime() + initialPhase;
  const loop = (elapsed % walkSeconds) / walkSeconds;
  const phase = loop * Math.PI * 2 * 3.0;
  const x = THREE.MathUtils.lerp(-3.55, 3.55, loop);
  const sway = Math.sin(phase * 0.5) * 0.08;

  poseRig(walker, phase, 1);
  walker.root.position.x = x;
  walker.root.position.z = -0.15 + sway;
  walker.root.rotation.y = Math.sin(phase * 0.5) * 0.055;

  camera.position.x = x * 0.2 + 4.6;
  camera.lookAt(x * 0.15, 1.22, -0.1);

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

animate();

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
