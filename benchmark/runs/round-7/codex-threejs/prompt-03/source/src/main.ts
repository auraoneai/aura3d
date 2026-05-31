import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

type Planet = {
  pivot: THREE.Object3D;
  mesh: THREE.Mesh;
  distance: number;
  speed: number;
  spin: number;
  startAngle: number;
};

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('Missing #app root element');
}

document.body.style.margin = '0';
document.body.style.overflow = 'hidden';
document.body.style.background = '#02040a';
app.style.width = '100vw';
app.style.height = '100vh';

const style = document.createElement('style');
style.textContent = `
  .planet-label {
    color: #f5f8ff;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0;
    line-height: 1;
    padding: 5px 8px;
    border: 1px solid rgba(255, 255, 255, 0.48);
    border-radius: 6px;
    background: rgba(4, 9, 20, 0.78);
    box-shadow: 0 0 14px rgba(118, 178, 255, 0.32);
    text-shadow: 0 1px 2px #000;
    white-space: nowrap;
    user-select: none;
  }
`;
document.head.append(style);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x02040a);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 260);
camera.position.set(0, 44, 78);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;
app.append(renderer.domElement);

const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(window.innerWidth, window.innerHeight);
labelRenderer.domElement.style.position = 'fixed';
labelRenderer.domElement.style.inset = '0';
labelRenderer.domElement.style.pointerEvents = 'none';
app.append(labelRenderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 22;
controls.maxDistance = 150;
controls.target.set(0, 0, 0);

scene.add(new THREE.AmbientLight(0x6f88bb, 0.32));

const sunLight = new THREE.PointLight(0xffd58a, 420, 150, 1.65);
scene.add(sunLight);

const sunMaterial = new THREE.MeshBasicMaterial({ color: 0xffb11f });
const sun = new THREE.Mesh(new THREE.SphereGeometry(4.6, 80, 48), sunMaterial);
sun.layers.enable(1);
scene.add(sun);

const halo = new THREE.Mesh(
  new THREE.SphereGeometry(6.8, 80, 48),
  new THREE.MeshBasicMaterial({
    color: 0xff7a18,
    transparent: true,
    opacity: 0.22,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }),
);
scene.add(halo);

const starGeometry = new THREE.BufferGeometry();
const starPositions: number[] = [];
for (let i = 0; i < 900; i += 1) {
  const radius = 95 + Math.random() * 80;
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.acos(THREE.MathUtils.randFloatSpread(2));
  starPositions.push(
    radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}
starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
scene.add(
  new THREE.Points(
    starGeometry,
    new THREE.PointsMaterial({ color: 0xdce7ff, size: 0.23, sizeAttenuation: true }),
  ),
);

const planetSpecs = [
  { name: 'Aster', distance: 10, radius: 0.9, color: 0x9fb7d9, speed: 0.92, spin: 1.9 },
  { name: 'Vesta', distance: 15, radius: 1.18, color: 0xd8955e, speed: 0.62, spin: 1.3 },
  { name: 'Maris', distance: 21, radius: 1.38, color: 0x4f93ff, speed: 0.43, spin: 1.05 },
  { name: 'Nysa', distance: 29, radius: 1.08, color: 0xe46750, speed: 0.31, spin: 1.16 },
  { name: 'Orion', distance: 39, radius: 2.35, color: 0xe3bc79, speed: 0.2, spin: 0.72 },
  { name: 'Caelus', distance: 52, radius: 1.85, color: 0x67d4df, speed: 0.13, spin: 0.84 },
] as const;

const planets: Planet[] = [];
const orbitMaterial = new THREE.LineBasicMaterial({ color: 0x49627f, transparent: true, opacity: 0.44 });

for (const [index, spec] of planetSpecs.entries()) {
  const orbitCurve = new THREE.EllipseCurve(0, 0, spec.distance, spec.distance, 0, Math.PI * 2);
  const orbitPoints = orbitCurve.getPoints(160).map((point) => new THREE.Vector3(point.x, 0, point.y));
  const orbit = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(orbitPoints), orbitMaterial);
  scene.add(orbit);

  const pivot = new THREE.Object3D();
  scene.add(pivot);

  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(spec.radius, 48, 32),
    new THREE.MeshStandardMaterial({
      color: spec.color,
      roughness: 0.68,
      metalness: 0.02,
      emissive: spec.color,
      emissiveIntensity: 0.025,
    }),
  );
  mesh.position.x = spec.distance;
  pivot.add(mesh);

  if (spec.name === 'Orion') {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(spec.radius * 1.45, spec.radius * 2.1, 96),
      new THREE.MeshBasicMaterial({
        color: 0xd7c59a,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.58,
      }),
    );
    ring.rotation.x = Math.PI * 0.48;
    mesh.add(ring);
  }

  const labelElement = document.createElement('div');
  labelElement.className = 'planet-label';
  labelElement.textContent = spec.name;
  const label = new CSS2DObject(labelElement);
  label.position.set(0, spec.radius + 1.2, 0);
  mesh.add(label);

  planets.push({
    pivot,
    mesh,
    distance: spec.distance,
    speed: spec.speed,
    spin: spec.spin,
    startAngle: index * 0.74,
  });
}

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(
  new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    1.35,
    0.72,
    0.12,
  ),
);

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  const elapsed = clock.getElapsedTime();
  sun.rotation.y = elapsed * 0.18;
  halo.scale.setScalar(1 + Math.sin(elapsed * 1.6) * 0.035);

  for (const planet of planets) {
    planet.pivot.rotation.y = planet.startAngle + elapsed * planet.speed;
    planet.mesh.rotation.y += 0.012 * planet.spin;
    planet.mesh.position.y = Math.sin(elapsed * planet.speed * 1.7 + planet.distance) * 0.28;
  }

  controls.update();
  composer.render();
  labelRenderer.render(scene, camera);
}

function resize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  labelRenderer.setSize(window.innerWidth, window.innerHeight);
}

window.addEventListener('resize', resize);
animate();
