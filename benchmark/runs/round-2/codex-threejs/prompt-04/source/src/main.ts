import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('Missing #app container');
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x020209);
scene.fog = new THREE.FogExp2(0x030511, 0.022);

const camera = new THREE.PerspectiveCamera(
  72,
  window.innerWidth / window.innerHeight,
  0.05,
  220,
);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
app.appendChild(renderer.domElement);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  1.65,
  0.62,
  0.12,
);
composer.addPass(bloomPass);

const tunnelGroup = new THREE.Group();
scene.add(tunnelGroup);

const tunnelLength = 260;
const tunnelRadius = 7;
const radialSegments = 56;
const lengthSegments = 360;

class TunnelCurve extends THREE.Curve<THREE.Vector3> {
  constructor() {
    super();
  }

  getPoint(t: number, target = new THREE.Vector3()): THREE.Vector3 {
    const z = (t - 0.5) * tunnelLength;
    const waveA = Math.sin(t * Math.PI * 5.2) * 3.1;
    const waveB = Math.cos(t * Math.PI * 3.7) * 2.2;

    return target.set(waveA, waveB, z);
  }
}

const path = new TunnelCurve();
const tunnelGeometry = new THREE.TubeGeometry(
  path,
  lengthSegments,
  tunnelRadius,
  radialSegments,
  false,
);
const tunnelMaterial = new THREE.MeshStandardMaterial({
  color: 0x050713,
  roughness: 0.58,
  metalness: 0.28,
  emissive: 0x030815,
  emissiveIntensity: 0.22,
  side: THREE.BackSide,
});
const tunnel = new THREE.Mesh(tunnelGeometry, tunnelMaterial);
tunnelGroup.add(tunnel);

const ribMaterial = new THREE.MeshBasicMaterial({
  color: 0x09fff7,
  side: THREE.DoubleSide,
});
const magentaMaterial = new THREE.MeshBasicMaterial({
  color: 0xff28c9,
  side: THREE.DoubleSide,
});
const amberMaterial = new THREE.MeshBasicMaterial({
  color: 0xffb13d,
  side: THREE.DoubleSide,
});
const blueMaterial = new THREE.MeshBasicMaterial({
  color: 0x3385ff,
  side: THREE.DoubleSide,
});

const ringGeometry = new THREE.TorusGeometry(tunnelRadius * 0.98, 0.055, 8, 96);
const ringCount = 68;

for (let index = 0; index < ringCount; index += 1) {
  const t = index / ringCount;
  const ring = new THREE.Mesh(
    ringGeometry,
    index % 5 === 0 ? amberMaterial : index % 2 === 0 ? ribMaterial : magentaMaterial,
  );
  path.getPointAt(t, ring.position);
  const tangent = path.getTangentAt(Math.min(t + 0.0001, 1)).normalize();
  ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tangent);
  ring.rotateZ(index * 0.19);
  tunnelGroup.add(ring);
}

const panelGeometry = new THREE.BoxGeometry(0.2, 1.6, 5.6);
const panelMaterials = [ribMaterial, magentaMaterial, blueMaterial, amberMaterial];

for (let index = 0; index < 190; index += 1) {
  const t = ((index * 0.021) + 0.03) % 1;
  const angle = (index * 2.399963 + Math.sin(index) * 0.35) % (Math.PI * 2);
  const center = path.getPointAt(t);
  const tangent = path.getTangentAt(t).normalize();
  const radial = new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0);
  const binormal = new THREE.Vector3().crossVectors(tangent, new THREE.Vector3(0, 1, 0));

  if (binormal.lengthSq() < 0.001) {
    binormal.set(1, 0, 0);
  }

  binormal.normalize();
  const normal = new THREE.Vector3().crossVectors(binormal, tangent).normalize();
  const offset = new THREE.Vector3()
    .addScaledVector(binormal, radial.x * tunnelRadius * 0.94)
    .addScaledVector(normal, radial.y * tunnelRadius * 0.94);

  const panel = new THREE.Mesh(panelGeometry, panelMaterials[index % panelMaterials.length]);
  panel.position.copy(center).add(offset);
  panel.lookAt(center);
  panel.rotateZ(Math.PI / 2);
  panel.scale.z = 0.65 + (index % 6) * 0.16;
  tunnelGroup.add(panel);
}

const starGeometry = new THREE.BufferGeometry();
const starPositions = new Float32Array(900);
for (let index = 0; index < starPositions.length; index += 3) {
  const radius = 23 + Math.random() * 30;
  const angle = Math.random() * Math.PI * 2;
  starPositions[index] = Math.cos(angle) * radius;
  starPositions[index + 1] = Math.sin(angle) * radius;
  starPositions[index + 2] = (Math.random() - 0.5) * tunnelLength;
}
starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
const starField = new THREE.Points(
  starGeometry,
  new THREE.PointsMaterial({
    color: 0x628cff,
    size: 0.08,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  }),
);
scene.add(starField);

scene.add(new THREE.AmbientLight(0x102040, 0.18));

const cyanLight = new THREE.PointLight(0x00f5ff, 40, 24);
const magentaLight = new THREE.PointLight(0xff00aa, 34, 22);
const whiteLight = new THREE.PointLight(0x9cc7ff, 16, 18);
scene.add(cyanLight, magentaLight, whiteLight);

const clock = new THREE.Clock();
const up = new THREE.Vector3(0, 1, 0);
const lookAhead = new THREE.Vector3();
const cameraPoint = new THREE.Vector3();

function animate(): void {
  const elapsed = clock.getElapsedTime();
  const progress = (elapsed * 0.035) % 1;
  const nextProgress = (progress + 0.018) % 1;

  path.getPointAt(progress, cameraPoint);
  path.getPointAt(nextProgress, lookAhead);

  const roll = elapsed * 0.72;
  const radiusBias = 0.55;
  camera.position.copy(cameraPoint);
  camera.position.x += Math.sin(roll * 1.7) * radiusBias;
  camera.position.y += Math.cos(roll * 1.35) * radiusBias;
  camera.lookAt(lookAhead);
  camera.rotateZ(Math.sin(roll) * 0.18);

  cyanLight.position.copy(camera.position).addScaledVector(up, 1.2);
  magentaLight.position.copy(lookAhead).add(new THREE.Vector3(-2.5, 1.5, 3));
  whiteLight.position.copy(camera.position).add(new THREE.Vector3(2, -1, -3));

  tunnelGroup.rotation.z = Math.sin(elapsed * 0.16) * 0.06;
  starField.rotation.z = elapsed * 0.015;

  bloomPass.strength = 1.45 + Math.sin(elapsed * 1.8) * 0.22;
  composer.render();
}

renderer.setAnimationLoop(animate);

function resize(): void {
  const width = window.innerWidth;
  const height = window.innerHeight;

  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
  composer.setSize(width, height);
  bloomPass.setSize(width, height);
}

window.addEventListener('resize', resize);
