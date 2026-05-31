import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------
const container = document.getElementById('app') as HTMLDivElement;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
container.appendChild(renderer.domElement);

// ---------------------------------------------------------------------------
// Scene + fog falloff
// ---------------------------------------------------------------------------
const BG_COLOR = new THREE.Color(0x05010f);

const scene = new THREE.Scene();
scene.background = BG_COLOR;
// Exponential fog gives clear depth falloff: far tunnel segments fade into the
// background so the corridor reads as receding into the distance.
scene.fog = new THREE.FogExp2(BG_COLOR.getHex(), 0.06);

const camera = new THREE.PerspectiveCamera(
  72,
  window.innerWidth / window.innerHeight,
  0.1,
  100,
);

// ---------------------------------------------------------------------------
// Procedural tunnel path (a closed winding curve through space)
// ---------------------------------------------------------------------------
const pathPoints: THREE.Vector3[] = [];
const POINT_COUNT = 24;
for (let i = 0; i < POINT_COUNT; i++) {
  const t = (i / POINT_COUNT) * Math.PI * 2;
  pathPoints.push(
    new THREE.Vector3(
      Math.sin(t * 1.0) * 18 + Math.sin(t * 2.3) * 6,
      Math.cos(t * 1.4) * 10 + Math.sin(t * 3.1) * 4,
      Math.cos(t * 1.0) * 18 + Math.cos(t * 2.7) * 6,
    ),
  );
}

const curve = new THREE.CatmullRomCurve3(pathPoints, true, 'catmullrom', 0.5);

const TUBE_RADIUS = 4;
const TUBULAR_SEGMENTS = 600;

// ---------------------------------------------------------------------------
// Tube interior shell
// ---------------------------------------------------------------------------
const tubeGeometry = new THREE.TubeGeometry(
  curve,
  TUBULAR_SEGMENTS,
  TUBE_RADIUS,
  24,
  true,
);

const tubeMaterial = new THREE.MeshStandardMaterial({
  color: 0x0a0826,
  emissive: 0x1a0a4a,
  emissiveIntensity: 0.6,
  metalness: 0.85,
  roughness: 0.35,
  side: THREE.BackSide, // we fly *inside* the tube, so render the inner faces
});
const tube = new THREE.Mesh(tubeGeometry, tubeMaterial);
scene.add(tube);

// A subtly glowing inner ribcage (slightly smaller, wireframe) adds neon lines
// running the length of the tunnel for extra structure.
const ribGeometry = new THREE.TubeGeometry(
  curve,
  TUBULAR_SEGMENTS,
  TUBE_RADIUS * 0.96,
  16,
  true,
);
const ribMaterial = new THREE.MeshBasicMaterial({
  color: 0x2266ff,
  wireframe: true,
  transparent: true,
  opacity: 0.18,
  fog: true,
});
const ribs = new THREE.Mesh(ribGeometry, ribMaterial);
scene.add(ribs);

// ---------------------------------------------------------------------------
// Emissive neon ring segments spaced along the tunnel
// ---------------------------------------------------------------------------
const RING_COUNT = 90;
const ringGeo = new THREE.TorusGeometry(TUBE_RADIUS * 0.92, 0.12, 12, 48);
const up = new THREE.Vector3();

for (let i = 0; i < RING_COUNT; i++) {
  const t = i / RING_COUNT;
  const pos = curve.getPointAt(t);
  const tangent = curve.getTangentAt(t);

  // Cycle through neon hues along the corridor.
  const color = new THREE.Color().setHSL((t * 3.0) % 1.0, 1.0, 0.6);
  const ringMat = new THREE.MeshBasicMaterial({ color, fog: true });

  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.position.copy(pos);
  // Orient the ring so its plane is perpendicular to the path tangent.
  up.copy(pos).add(tangent);
  ring.lookAt(up);
  scene.add(ring);
}

// ---------------------------------------------------------------------------
// Lighting (mostly for the metallic shell; rings/ribs are self-lit)
// ---------------------------------------------------------------------------
scene.add(new THREE.AmbientLight(0x223366, 0.6));
const headLight = new THREE.PointLight(0x88aaff, 8, 30, 2);
scene.add(headLight);

// ---------------------------------------------------------------------------
// Bloom postprocessing
// ---------------------------------------------------------------------------
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  1.6, // strength
  0.6, // radius
  0.0, // threshold
);
composer.addPass(bloomPass);

// ---------------------------------------------------------------------------
// Flythrough animation: camera rides along the curve
// ---------------------------------------------------------------------------
const camPos = new THREE.Vector3();
const lookPos = new THREE.Vector3();
const clock = new THREE.Clock();

function animate(): void {
  const elapsed = clock.getElapsedTime();
  const t = (elapsed * 0.025) % 1; // loop time around the closed curve
  const lookAhead = (t + 0.012) % 1;

  curve.getPointAt(t, camPos);
  curve.getPointAt(lookAhead, lookPos);

  camera.position.copy(camPos);
  camera.lookAt(lookPos);

  headLight.position.copy(camPos);

  composer.render();
}
renderer.setAnimationLoop(animate);

// ---------------------------------------------------------------------------
// Resize handling
// ---------------------------------------------------------------------------
window.addEventListener('resize', () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer.setSize(w, h);
});
