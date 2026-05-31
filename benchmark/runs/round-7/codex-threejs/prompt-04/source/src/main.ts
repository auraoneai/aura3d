import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('Missing #app element');
}

document.body.style.margin = '0';
document.body.style.overflow = 'hidden';
document.body.style.background = '#02030a';
app.style.width = '100vw';
app.style.height = '100vh';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x02030a);
scene.fog = new THREE.FogExp2(0x060719, 0.035);

const camera = new THREE.PerspectiveCamera(76, window.innerWidth / window.innerHeight, 0.05, 150);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.35;
app.appendChild(renderer.domElement);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  1.45,
  0.8,
  0.08,
);
composer.addPass(bloomPass);

const points: THREE.Vector3[] = [];
for (let i = 0; i < 34; i += 1) {
  const z = -i * 4.7;
  const angle = i * 0.43;
  const radius = 4.2 + Math.sin(i * 0.31) * 1.4;
  points.push(new THREE.Vector3(Math.sin(angle) * radius, Math.cos(angle * 0.72) * 2.1, z));
}

const path = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.45);
const tubeRadius = 2.45;
const tubeGeometry = new THREE.TubeGeometry(path, 520, tubeRadius, 32, false);
const wallMaterial = new THREE.MeshStandardMaterial({
  color: 0x091021,
  emissive: 0x05091b,
  emissiveIntensity: 0.75,
  metalness: 0.2,
  roughness: 0.62,
  side: THREE.BackSide,
});
scene.add(new THREE.Mesh(tubeGeometry, wallMaterial));

const rimMaterialA = new THREE.MeshBasicMaterial({ color: 0x00f6ff, toneMapped: false });
const rimMaterialB = new THREE.MeshBasicMaterial({ color: 0xff2be7, toneMapped: false });
const rimMaterialC = new THREE.MeshBasicMaterial({ color: 0xfff36b, toneMapped: false });
const stripMaterial = new THREE.MeshBasicMaterial({ color: 0x5eff8a, toneMapped: false });
const darkRimMaterial = new THREE.MeshBasicMaterial({
  color: 0x061028,
  transparent: true,
  opacity: 0.72,
  side: THREE.DoubleSide,
});

const ringGroup = new THREE.Group();
scene.add(ringGroup);

const tangent = new THREE.Vector3();
const normal = new THREE.Vector3();
const binormal = new THREE.Vector3();
const ringQuaternion = new THREE.Quaternion();
const zAxis = new THREE.Vector3(0, 0, 1);
const up = new THREE.Vector3(0, 1, 0);

for (let i = 5; i < 148; i += 1) {
  const t = i / 154;
  const position = path.getPointAt(t);
  path.getTangentAt(t, tangent).normalize();
  ringQuaternion.setFromUnitVectors(zAxis, tangent);

  const majorRadius = tubeRadius - 0.03;
  const tube = i % 5 === 0 ? 0.034 : 0.02;
  const material = i % 7 === 0 ? rimMaterialC : i % 2 === 0 ? rimMaterialA : rimMaterialB;
  const geometry = new THREE.TorusGeometry(majorRadius, tube, 8, 72, Math.PI * (i % 3 === 0 ? 1.62 : 1.95));
  const ring = new THREE.Mesh(geometry, material);
  ring.position.copy(position);
  ring.quaternion.copy(ringQuaternion);
  ring.rotateZ(i * 0.41);
  ringGroup.add(ring);

  if (i % 4 === 0) {
    const shadow = new THREE.Mesh(new THREE.TorusGeometry(majorRadius * 0.96, 0.045, 6, 48), darkRimMaterial);
    shadow.position.copy(position);
    shadow.quaternion.copy(ringQuaternion);
    ringGroup.add(shadow);
  }
}

for (let lane = 0; lane < 6; lane += 1) {
  const laneGroup = new THREE.Group();
  ringGroup.add(laneGroup);
  const laneAngle = (lane / 6) * Math.PI * 2;

  for (let i = 2; i < 45; i += 1) {
    const start = (i * 0.021 + lane * 0.006) % 0.92;
    const end = Math.min(start + 0.014, 0.98);
    const p0 = path.getPointAt(start);
    const p1 = path.getPointAt(end);
    path.getTangentAt(start, tangent).normalize();
    normal.crossVectors(tangent, up).normalize();
    if (normal.lengthSq() < 0.01) normal.set(1, 0, 0);
    binormal.crossVectors(normal, tangent).normalize();

    const offset = normal
      .clone()
      .multiplyScalar(Math.cos(laneAngle) * (tubeRadius - 0.08))
      .add(binormal.clone().multiplyScalar(Math.sin(laneAngle) * (tubeRadius - 0.08)));
    const mid = p0.clone().lerp(p1, 0.5).add(offset);
    const length = p0.distanceTo(p1) * 0.9;

    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.055, length), stripMaterial);
    strip.position.copy(mid);
    strip.quaternion.setFromUnitVectors(zAxis, tangent);
    strip.rotateZ(laneAngle);
    laneGroup.add(strip);
  }
}

const particleGeometry = new THREE.BufferGeometry();
const particlePositions: number[] = [];
const particleColors: number[] = [];
const color = new THREE.Color();
for (let i = 0; i < 700; i += 1) {
  const t = Math.random() * 0.96;
  const center = path.getPointAt(t);
  path.getTangentAt(t, tangent).normalize();
  normal.crossVectors(tangent, up).normalize();
  if (normal.lengthSq() < 0.01) normal.set(1, 0, 0);
  binormal.crossVectors(normal, tangent).normalize();
  const angle = Math.random() * Math.PI * 2;
  const radius = tubeRadius * (0.68 + Math.random() * 0.29);
  center
    .add(normal.clone().multiplyScalar(Math.cos(angle) * radius))
    .add(binormal.clone().multiplyScalar(Math.sin(angle) * radius));
  particlePositions.push(center.x, center.y, center.z);
  color.setHSL(0.52 + Math.random() * 0.32, 1, 0.62);
  particleColors.push(color.r, color.g, color.b);
}
particleGeometry.setAttribute('position', new THREE.Float32BufferAttribute(particlePositions, 3));
particleGeometry.setAttribute('color', new THREE.Float32BufferAttribute(particleColors, 3));
scene.add(
  new THREE.Points(
    particleGeometry,
    new THREE.PointsMaterial({
      size: 0.045,
      vertexColors: true,
      transparent: true,
      opacity: 0.74,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  ),
);

scene.add(new THREE.AmbientLight(0x223366, 1.1));

const clock = new THREE.Clock();
const lookAhead = 0.018;

function updateCamera(elapsed: number) {
  const progress = (elapsed * 0.042) % 0.87;
  const cameraPosition = path.getPointAt(progress);
  const lookAt = path.getPointAt(Math.min(progress + lookAhead, 0.99));
  path.getTangentAt(progress, tangent).normalize();
  normal.crossVectors(tangent, up).normalize();
  if (normal.lengthSq() < 0.01) normal.set(1, 0, 0);
  binormal.crossVectors(normal, tangent).normalize();

  const drift = Math.sin(elapsed * 1.7) * 0.18;
  camera.position.copy(cameraPosition).add(normal.multiplyScalar(drift)).add(binormal.multiplyScalar(Math.cos(elapsed) * 0.12));
  camera.lookAt(lookAt);
  camera.rotateZ(Math.sin(elapsed * 0.8) * 0.08);
}

function animate() {
  const elapsed = clock.getElapsedTime();
  ringGroup.rotation.z = Math.sin(elapsed * 0.18) * 0.03;
  bloomPass.strength = 1.35 + Math.sin(elapsed * 2.0) * 0.12;
  updateCamera(elapsed);
  composer.render();
}

renderer.setAnimationLoop(animate);

window.addEventListener('resize', () => {
  const width = window.innerWidth;
  const height = window.innerHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
  composer.setSize(width, height);
  bloomPass.setSize(width, height);
});
