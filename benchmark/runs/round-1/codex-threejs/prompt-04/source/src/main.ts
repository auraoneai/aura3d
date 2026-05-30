import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('Missing #app mount point');
}

document.body.style.margin = '0';
document.body.style.overflow = 'hidden';
document.body.style.background = '#020006';
app.style.width = '100vw';
app.style.height = '100vh';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x020006);
scene.fog = new THREE.FogExp2(0x04000b, 0.042);

const camera = new THREE.PerspectiveCamera(
  74,
  window.innerWidth / window.innerHeight,
  0.02,
  240,
);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;
renderer.outputColorSpace = THREE.SRGBColorSpace;
app.appendChild(renderer.domElement);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  1.45,
  0.78,
  0.08,
);
composer.addPass(bloomPass);

const tunnelLength = 210;
const ringCount = 210;
const radialSegments = 56;
const radius = 4.6;

type Ring = {
  center: THREE.Vector3;
  z: number;
};

const rings: Ring[] = [];

function centerAt(z: number): THREE.Vector3 {
  return new THREE.Vector3(
    Math.sin(z * 0.047) * 1.15 + Math.sin(z * 0.018 + 1.4) * 0.75,
    Math.cos(z * 0.039 + 0.5) * 0.85 + Math.sin(z * 0.021) * 0.45,
    -z,
  );
}

function localRadius(z: number, angle: number): number {
  return radius + Math.sin(z * 0.12 + angle * 4) * 0.22 + Math.sin(z * 0.055) * 0.16;
}

const tunnelPositions: number[] = [];
const tunnelUvs: number[] = [];
const tunnelIndices: number[] = [];

for (let i = 0; i <= ringCount; i += 1) {
  const z = (i / ringCount) * tunnelLength;
  const center = centerAt(z);
  rings.push({ center, z });

  for (let j = 0; j < radialSegments; j += 1) {
    const angle = (j / radialSegments) * Math.PI * 2;
    const r = localRadius(z, angle);
    tunnelPositions.push(
      center.x + Math.cos(angle) * r,
      center.y + Math.sin(angle) * r,
      center.z,
    );
    tunnelUvs.push(j / radialSegments, i / ringCount);
  }
}

for (let i = 0; i < ringCount; i += 1) {
  for (let j = 0; j < radialSegments; j += 1) {
    const a = i * radialSegments + j;
    const b = i * radialSegments + ((j + 1) % radialSegments);
    const c = (i + 1) * radialSegments + j;
    const d = (i + 1) * radialSegments + ((j + 1) % radialSegments);
    tunnelIndices.push(a, c, b, b, c, d);
  }
}

const tunnelGeometry = new THREE.BufferGeometry();
tunnelGeometry.setAttribute('position', new THREE.Float32BufferAttribute(tunnelPositions, 3));
tunnelGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(tunnelUvs, 2));
tunnelGeometry.setIndex(tunnelIndices);
tunnelGeometry.computeVertexNormals();

const tunnelMaterial = new THREE.MeshStandardMaterial({
  color: 0x080214,
  roughness: 0.74,
  metalness: 0.38,
  side: THREE.BackSide,
  emissive: 0x09001c,
  emissiveIntensity: 0.28,
});

const tunnel = new THREE.Mesh(tunnelGeometry, tunnelMaterial);
scene.add(tunnel);

const ambient = new THREE.AmbientLight(0x24104d, 0.38);
scene.add(ambient);

const colors = [0x00f5ff, 0xff2eea, 0xb7ff00, 0xff7a00, 0x7d5cff];
const glowGroup = new THREE.Group();
scene.add(glowGroup);

function wallPoint(z: number, angle: number, inset = 0.12): THREE.Vector3 {
  const center = centerAt(z);
  const r = localRadius(z, angle) - inset;
  return new THREE.Vector3(
    center.x + Math.cos(angle) * r,
    center.y + Math.sin(angle) * r,
    center.z,
  );
}

function makePanel(z: number, angle: number, arc = 0.18, depth = 1.3): THREE.BufferGeometry {
  const a0 = angle - arc;
  const a1 = angle + arc;
  const z0 = z - depth * 0.5;
  const z1 = z + depth * 0.5;
  const p0 = wallPoint(z0, a0);
  const p1 = wallPoint(z0, a1);
  const p2 = wallPoint(z1, a0);
  const p3 = wallPoint(z1, a1);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, p2.x, p2.y, p2.z, p3.x, p3.y, p3.z],
      3,
    ),
  );
  geometry.setIndex([0, 1, 2, 1, 3, 2]);
  geometry.computeVertexNormals();
  return geometry;
}

for (let i = 0; i < 120; i += 1) {
  const z = 3 + i * 1.72;
  const spiral = i * 0.72 + Math.sin(i * 0.31) * 0.8;
  const color = new THREE.Color(colors[i % colors.length]);
  const material = new THREE.MeshBasicMaterial({
    color,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.92,
  });

  const primary = new THREE.Mesh(makePanel(z, spiral, 0.075 + (i % 3) * 0.025, 1.0 + (i % 4) * 0.18), material);
  glowGroup.add(primary);

  if (i % 2 === 0) {
    const opposing = new THREE.Mesh(makePanel(z + 0.58, spiral + Math.PI, 0.07, 0.86), material.clone());
    glowGroup.add(opposing);
  }

  if (i % 8 === 0) {
    const point = wallPoint(z, spiral, 0.55);
    const light = new THREE.PointLight(color, 5.5, 15, 2.2);
    light.position.copy(point);
    glowGroup.add(light);
  }
}

const ringMaterial = new THREE.MeshBasicMaterial({
  color: 0x21f6ff,
  side: THREE.DoubleSide,
  transparent: true,
  opacity: 0.2,
});

for (let i = 9; i < ringCount; i += 17) {
  const z = rings[i].z;
  const torus = new THREE.Mesh(
    new THREE.TorusGeometry(radius - 0.1, 0.018, 8, 96),
    ringMaterial.clone(),
  );
  torus.position.copy(centerAt(z));
  torus.rotation.z = z * 0.08;
  torus.material.color.setHex(colors[i % colors.length]);
  glowGroup.add(torus);
}

const nearLight = new THREE.PointLight(0x58f7ff, 7, 18, 2);
scene.add(nearLight);

const startTime = performance.now();
const clock = new THREE.Clock();

function sampleCamera(time: number): void {
  const progress = ((time * 10.5) % (tunnelLength - 26)) + 7;
  const center = centerAt(progress);
  const next = centerAt(progress + 2.4);
  const tangent = next.clone().sub(center).normalize();
  const roll = time * 0.34;

  camera.position.copy(center);
  camera.position.x += Math.sin(time * 1.3) * 0.34;
  camera.position.y += Math.cos(time * 1.1) * 0.25;
  camera.up.set(Math.sin(roll) * 0.34, 1, Math.cos(roll) * 0.14).normalize();
  camera.lookAt(center.clone().add(tangent.multiplyScalar(8)));

  nearLight.position.copy(camera.position);
  nearLight.position.z -= 1.4;
}

function animate(): void {
  const elapsed = clock.getElapsedTime();
  sampleCamera(elapsed);

  glowGroup.children.forEach((child, index) => {
    if (child instanceof THREE.Mesh) {
      const pulse = 0.72 + Math.sin(elapsed * 4.2 + index * 0.37) * 0.22;
      const material = child.material;
      if (material instanceof THREE.MeshBasicMaterial) {
        material.opacity = Math.max(0.16, pulse);
      }
    }
  });

  bloomPass.strength = 1.25 + Math.sin(elapsed * 0.9) * 0.18;
  composer.render();
}

renderer.setAnimationLoop(animate);
sampleCamera((performance.now() - startTime) / 1000);

window.addEventListener('resize', () => {
  const width = window.innerWidth;
  const height = window.innerHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
  composer.setSize(width, height);
  bloomPass.setSize(width, height);
});
