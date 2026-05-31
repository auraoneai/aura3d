import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('Missing #app container');
}

document.body.style.margin = '0';
document.body.style.overflow = 'hidden';
document.body.style.background = '#020008';
app.style.width = '100vw';
app.style.height = '100vh';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x020008);
scene.fog = new THREE.FogExp2(0x020008, 0.034);

const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 120);
camera.position.set(0, 0, 8);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.outputColorSpace = THREE.SRGBColorSpace;
app.appendChild(renderer.domElement);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const bloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  1.35,
  0.62,
  0.08,
);
composer.addPass(bloom);

const tunnelPoints: THREE.Vector3[] = [];
for (let index = 0; index < 18; index += 1) {
  const z = 18 - index * 16;
  tunnelPoints.push(
    new THREE.Vector3(
      Math.sin(index * 0.92) * 3.2 + Math.cos(index * 0.31) * 1.1,
      Math.cos(index * 0.78) * 2.2 + Math.sin(index * 0.43) * 0.8,
      z,
    ),
  );
}

const path = new THREE.CatmullRomCurve3(tunnelPoints, false, 'catmullrom', 0.35);
const tubeRadius = 4.2;
const tubeGeometry = new THREE.TubeGeometry(path, 520, tubeRadius, 42, false);
const tunnelMaterial = new THREE.MeshStandardMaterial({
  color: 0x070816,
  emissive: 0x07101c,
  emissiveIntensity: 0.75,
  metalness: 0.2,
  roughness: 0.72,
  side: THREE.BackSide,
});
const tunnel = new THREE.Mesh(tubeGeometry, tunnelMaterial);
scene.add(tunnel);

const ringGroup = new THREE.Group();
scene.add(ringGroup);

const ringGeometry = new THREE.TorusGeometry(tubeRadius * 0.985, 0.052, 10, 96);
const cyan = new THREE.MeshBasicMaterial({ color: 0x00eaff, toneMapped: false });
const magenta = new THREE.MeshBasicMaterial({ color: 0xff2fe4, toneMapped: false });
const amber = new THREE.MeshBasicMaterial({ color: 0xffc64a, toneMapped: false });
const lime = new THREE.MeshBasicMaterial({ color: 0x74ff6a, toneMapped: false });
const ringMaterials = [cyan, magenta, amber, lime];

const zAxis = new THREE.Vector3(0, 0, 1);
for (let index = 0; index < 74; index += 1) {
  const t = 0.018 + index / 80;
  if (t >= 0.982) break;

  const ring = new THREE.Mesh(ringGeometry, ringMaterials[index % ringMaterials.length]);
  const position = path.getPointAt(t);
  const tangent = path.getTangentAt(t).normalize();
  ring.position.copy(position);
  ring.quaternion.setFromUnitVectors(zAxis, tangent);
  ring.scale.setScalar(index % 5 === 0 ? 1.045 : 1);
  ringGroup.add(ring);
}

const dashGroup = new THREE.Group();
scene.add(dashGroup);

const dashGeometry = new THREE.BoxGeometry(0.16, 0.48, 1.8);
const dashMaterials = [
  new THREE.MeshBasicMaterial({ color: 0x18f6ff, toneMapped: false }),
  new THREE.MeshBasicMaterial({ color: 0xff4ddb, toneMapped: false }),
  new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }),
];
const normal = new THREE.Vector3();
const binormal = new THREE.Vector3();
const radial = new THREE.Vector3();
const matrix = new THREE.Matrix4();
const frame = new THREE.Matrix4();
const xAxis = new THREE.Vector3();
const yAxis = new THREE.Vector3();

for (let index = 0; index < 190; index += 1) {
  const t = 0.018 + index / 205;
  if (t >= 0.985) break;

  const tangent = path.getTangentAt(t).normalize();
  const helper = Math.abs(tangent.y) > 0.92 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  normal.crossVectors(helper, tangent).normalize();
  binormal.crossVectors(tangent, normal).normalize();

  const angle = index * 2.399963 + Math.sin(index * 0.7) * 0.35;
  radial.copy(normal).multiplyScalar(Math.cos(angle)).addScaledVector(binormal, Math.sin(angle)).normalize();

  const dash = new THREE.Mesh(dashGeometry, dashMaterials[index % dashMaterials.length]);
  dash.position.copy(path.getPointAt(t)).addScaledVector(radial, tubeRadius * 0.93);

  xAxis.copy(radial);
  yAxis.crossVectors(tangent, xAxis).normalize();
  frame.makeBasis(xAxis, yAxis, tangent);
  matrix.makeRotationFromQuaternion(new THREE.Quaternion().setFromRotationMatrix(frame));
  dash.quaternion.setFromRotationMatrix(matrix);
  dashGroup.add(dash);
}

const centerLineMaterial = new THREE.LineBasicMaterial({
  color: 0x37f6ff,
  transparent: true,
  opacity: 0.22,
  toneMapped: false,
});
const centerLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(path.getSpacedPoints(380)), centerLineMaterial);
scene.add(centerLine);

const particleCount = 900;
const particlePositions = new Float32Array(particleCount * 3);
for (let index = 0; index < particleCount; index += 1) {
  const t = index / particleCount;
  const position = path.getPointAt(t);
  const angle = index * 1.734;
  const radius = tubeRadius * (0.55 + Math.random() * 0.4);
  particlePositions[index * 3] = position.x + Math.cos(angle) * radius;
  particlePositions[index * 3 + 1] = position.y + Math.sin(angle) * radius;
  particlePositions[index * 3 + 2] = position.z;
}
const particles = new THREE.Points(
  new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(particlePositions, 3)),
  new THREE.PointsMaterial({
    color: 0x9bf7ff,
    size: 0.035,
    transparent: true,
    opacity: 0.78,
    depthWrite: false,
    toneMapped: false,
  }),
);
scene.add(particles);

scene.add(new THREE.AmbientLight(0x4a7cff, 0.22));
const cameraGlow = new THREE.PointLight(0x56efff, 3.2, 28);
scene.add(cameraGlow);

const clock = new THREE.Clock();
const lookAhead = new THREE.Vector3();
const cameraPosition = new THREE.Vector3();
const cameraTangent = new THREE.Vector3();
const cameraNormal = new THREE.Vector3();

function animate(): void {
  const elapsed = clock.getElapsedTime();
  const travel = (elapsed * 0.07 + 0.06) % 0.86;
  const t = 0.055 + travel;

  cameraPosition.copy(path.getPointAt(t));
  cameraTangent.copy(path.getTangentAt(t)).normalize();
  cameraNormal.set(Math.sin(elapsed * 1.7) * 0.34, Math.cos(elapsed * 1.31) * 0.24, 0);
  camera.position.copy(cameraPosition).add(cameraNormal);

  lookAhead.copy(path.getPointAt(Math.min(t + 0.045, 0.985)));
  camera.lookAt(lookAhead);
  camera.rotateZ(Math.sin(elapsed * 0.9) * 0.13);

  cameraGlow.position.copy(camera.position).addScaledVector(cameraTangent, 1.5);
  ringGroup.rotation.z = Math.sin(elapsed * 0.22) * 0.08;
  dashGroup.children.forEach((dash, index) => {
    dash.scale.z = 0.85 + Math.sin(elapsed * 5.5 + index * 0.37) * 0.18;
  });

  composer.render();
  requestAnimationFrame(animate);
}

function resize(): void {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
}

window.addEventListener('resize', resize);
animate();
