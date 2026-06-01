import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('Missing #app mount point');
}

document.body.style.margin = '0';
document.body.style.overflow = 'hidden';
document.body.style.background = '#03040b';
app.style.width = '100vw';
app.style.height = '100vh';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x03040b);
scene.fog = new THREE.FogExp2(0x050714, 0.034);

const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.05, 260);
camera.position.set(0, 0, 10);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.82;
app.appendChild(renderer.domElement);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  1.55,
  0.72,
  0.08,
);
composer.addPass(bloomPass);

const pathPoints: THREE.Vector3[] = [];
const segmentCount = 128;
for (let i = 0; i <= segmentCount; i += 1) {
  const u = i / segmentCount;
  const z = 18 - u * 235;
  const x = Math.sin(u * Math.PI * 5.6) * 2.6 + Math.sin(u * Math.PI * 1.4) * 1.8;
  const y = Math.cos(u * Math.PI * 4.2) * 1.4 + Math.sin(u * Math.PI * 7.8) * 0.55;
  pathPoints.push(new THREE.Vector3(x, y, z));
}

const tunnelPath = new THREE.CatmullRomCurve3(pathPoints);
tunnelPath.curveType = 'catmullrom';
tunnelPath.tension = 0.38;

const tunnelRadius = 4.85;
const tubeGeometry = new THREE.TubeGeometry(tunnelPath, 440, tunnelRadius, 48, false);
const tunnelMaterial = new THREE.MeshStandardMaterial({
  color: 0x07091a,
  emissive: 0x050816,
  emissiveIntensity: 0.9,
  metalness: 0.35,
  roughness: 0.62,
  side: THREE.BackSide,
});
const tunnel = new THREE.Mesh(tubeGeometry, tunnelMaterial);
scene.add(tunnel);

const ambient = new THREE.HemisphereLight(0x21366f, 0x02030a, 1.2);
scene.add(ambient);

const headLamp = new THREE.PointLight(0x8ed7ff, 18, 32, 1.5);
scene.add(headLamp);

const axisZ = new THREE.Vector3(0, 0, 1);
const tempTangent = new THREE.Vector3();
const tempPosition = new THREE.Vector3();
const tempQuaternion = new THREE.Quaternion();
const palette = [0xff2ec4, 0x24f7ff, 0xfff04d, 0x7c5cff, 0x39ff86];

const ringGroup = new THREE.Group();
scene.add(ringGroup);

for (let i = 3; i < 104; i += 1) {
  const u = i / 108;
  tunnelPath.getPointAt(u, tempPosition);
  tunnelPath.getTangentAt(u, tempTangent).normalize();
  tempQuaternion.setFromUnitVectors(axisZ, tempTangent);

  const color = new THREE.Color(palette[i % palette.length]);
  const isGate = i % 5 === 0;
  const ringGeometry = new THREE.TorusGeometry(
    tunnelRadius - (isGate ? 0.16 : 0.28),
    isGate ? 0.07 : 0.035,
    10,
    isGate ? 96 : 36,
    isGate ? Math.PI * 2 : Math.PI * (0.42 + ((i * 13) % 7) * 0.07),
  );
  const ringMaterial = new THREE.MeshBasicMaterial({
    color,
    fog: false,
  });
  const ring = new THREE.Mesh(ringGeometry, ringMaterial);
  ring.position.copy(tempPosition);
  ring.quaternion.copy(tempQuaternion);
  ring.rotateZ((i * 0.73) % (Math.PI * 2));
  ringGroup.add(ring);
}

const ribMaterialA = new THREE.LineBasicMaterial({ color: 0x22e7ff, transparent: true, opacity: 0.55, fog: false });
const ribMaterialB = new THREE.LineBasicMaterial({ color: 0xff2bc2, transparent: true, opacity: 0.46, fog: false });

for (let lane = 0; lane < 10; lane += 1) {
  const angle = (lane / 10) * Math.PI * 2;
  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= 190; i += 1) {
    const u = i / 190;
    tunnelPath.getPointAt(u, tempPosition);
    tunnelPath.getTangentAt(u, tempTangent).normalize();

    const normal = new THREE.Vector3(Math.cos(angle + u * Math.PI * 4.4), Math.sin(angle + u * Math.PI * 4.4), 0);
    tempQuaternion.setFromUnitVectors(axisZ, tempTangent);
    normal.applyQuaternion(tempQuaternion).multiplyScalar(tunnelRadius - 0.11);
    points.push(tempPosition.clone().add(normal));
  }

  const ribGeometry = new THREE.BufferGeometry().setFromPoints(points);
  const rib = new THREE.Line(ribGeometry, lane % 2 === 0 ? ribMaterialA : ribMaterialB);
  scene.add(rib);
}

const starGeometry = new THREE.BufferGeometry();
const starPositions = new Float32Array(900);
for (let i = 0; i < starPositions.length; i += 3) {
  const u = Math.random();
  tunnelPath.getPointAt(u, tempPosition);
  const angle = Math.random() * Math.PI * 2;
  const radius = tunnelRadius * (0.28 + Math.random() * 0.65);
  starPositions[i] = tempPosition.x + Math.cos(angle) * radius;
  starPositions[i + 1] = tempPosition.y + Math.sin(angle) * radius;
  starPositions[i + 2] = tempPosition.z + (Math.random() - 0.5) * 2.2;
}
starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
const starMaterial = new THREE.PointsMaterial({
  color: 0x8fdcff,
  size: 0.055,
  transparent: true,
  opacity: 0.72,
  depthWrite: false,
  fog: true,
});
scene.add(new THREE.Points(starGeometry, starMaterial));

const clock = new THREE.Clock();
const lookAhead = new THREE.Vector3();
const cameraPoint = new THREE.Vector3();
const upProbe = new THREE.Vector3();
const rollAxis = new THREE.Vector3();

function render(): void {
  const elapsed = clock.getElapsedTime();
  const travel = (elapsed * 0.058) % 0.84;
  const u = 0.035 + travel;
  const aheadU = Math.min(u + 0.024, 0.99);

  tunnelPath.getPointAt(u, cameraPoint);
  tunnelPath.getPointAt(aheadU, lookAhead);
  tunnelPath.getTangentAt(u, rollAxis).normalize();

  const sway = Math.sin(elapsed * 1.7) * 0.28;
  const bob = Math.cos(elapsed * 1.25) * 0.2;
  camera.position.copy(cameraPoint);
  camera.position.x += sway;
  camera.position.y += bob;
  camera.lookAt(lookAhead);

  upProbe.set(Math.sin(elapsed * 0.34) * 0.33, 1, Math.cos(elapsed * 0.28) * 0.18).normalize();
  camera.up.lerp(upProbe, 0.05);
  camera.rotateZ(Math.sin(elapsed * 0.62) * 0.055);

  headLamp.position.copy(camera.position);
  ringGroup.rotation.z = Math.sin(elapsed * 0.18) * 0.04;
  bloomPass.strength = 1.45 + Math.sin(elapsed * 1.1) * 0.16;

  composer.render();
  requestAnimationFrame(render);
}

function resize(): void {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  bloomPass.setSize(window.innerWidth, window.innerHeight);
}

window.addEventListener('resize', resize);
render();
