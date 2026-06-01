// Neon Tunnel Flythrough
// Procedurally generated tube geometry with emissive ring segments, a camera
// animated through the tunnel, UnrealBloom postprocessing, and exponential fog
// for depth falloff. Built with raw three.js + official addons.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

const FOG_COLOR = 0x05010f;

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------
const container = document.getElementById('app') ?? document.body;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(FOG_COLOR, 1);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
container.appendChild(renderer.domElement);

// ---------------------------------------------------------------------------
// Scene + fog (depth falloff)
// ---------------------------------------------------------------------------
const scene = new THREE.Scene();
scene.background = new THREE.Color(FOG_COLOR);
scene.fog = new THREE.FogExp2(FOG_COLOR, 0.055);

const camera = new THREE.PerspectiveCamera(
  72,
  window.innerWidth / window.innerHeight,
  0.1,
  1000,
);

// ---------------------------------------------------------------------------
// Procedural tunnel path: a closed, wobbly loop so the flythrough repeats
// seamlessly.
// ---------------------------------------------------------------------------
const PATH_POINTS = 48;
const LOOP_RADIUS = 42;
const curvePoints: THREE.Vector3[] = [];
for (let i = 0; i < PATH_POINTS; i++) {
  const a = (i / PATH_POINTS) * Math.PI * 2;
  const x = Math.cos(a) * LOOP_RADIUS + Math.sin(a * 3) * 7;
  const y = Math.sin(a * 2) * 9 + Math.cos(a * 5) * 3;
  const z = Math.sin(a) * LOOP_RADIUS + Math.cos(a * 4) * 7;
  curvePoints.push(new THREE.Vector3(x, y, z));
}
const curve = new THREE.CatmullRomCurve3(curvePoints, true, 'catmullrom', 0.5);

const TUBE_RADIUS = 3.2;

// ---------------------------------------------------------------------------
// Tube geometry — rendered from the inside (BackSide) so we fly through the
// interior.
// ---------------------------------------------------------------------------
const tubeGeometry = new THREE.TubeGeometry(curve, 600, TUBE_RADIUS, 32, true);
const tubeMaterial = new THREE.MeshStandardMaterial({
  color: 0x0a0a18,
  emissive: 0x110826,
  emissiveIntensity: 0.6,
  metalness: 0.85,
  roughness: 0.35,
  side: THREE.BackSide,
});
const tube = new THREE.Mesh(tubeGeometry, tubeMaterial);
scene.add(tube);

// A faint emissive wireframe over the inner wall gives the surface readable
// neon structure even where direct lights don't reach.
const wireGeometry = new THREE.TubeGeometry(curve, 240, TUBE_RADIUS * 0.995, 16, true);
const wireMaterial = new THREE.MeshBasicMaterial({
  color: 0x1b2a6b,
  wireframe: true,
  transparent: true,
  opacity: 0.25,
  side: THREE.BackSide,
});
scene.add(new THREE.Mesh(wireGeometry, wireMaterial));

// ---------------------------------------------------------------------------
// Emissive ring segments along the tunnel + a colored light at each ring so
// the walls are lit as the camera passes through.
// ---------------------------------------------------------------------------
const RING_COUNT = 64;
const ringGeometry = new THREE.TorusGeometry(TUBE_RADIUS * 0.93, 0.09, 12, 48);
const up = new THREE.Vector3(0, 0, 1);
const tmpTangent = new THREE.Vector3();
const tmpQuat = new THREE.Quaternion();

for (let i = 0; i < RING_COUNT; i++) {
  const u = i / RING_COUNT;
  const point = curve.getPointAt(u);
  curve.getTangentAt(u, tmpTangent);

  const color = new THREE.Color().setHSL((u * 4) % 1, 1.0, 0.6);

  const ringMaterial = new THREE.MeshBasicMaterial({ color });
  const ring = new THREE.Mesh(ringGeometry, ringMaterial);
  ring.position.copy(point);
  tmpQuat.setFromUnitVectors(up, tmpTangent);
  ring.quaternion.copy(tmpQuat);
  scene.add(ring);

  // Light only every other ring to keep the live light count reasonable while
  // still illuminating the surrounding tube wall.
  if (i % 2 === 0) {
    const light = new THREE.PointLight(color, 14, 22, 2);
    light.position.copy(point);
    scene.add(light);
  }
}

// Ambient fill + a headlight that travels with the camera.
scene.add(new THREE.AmbientLight(0x223066, 0.6));
const headLight = new THREE.PointLight(0x66ccff, 8, 18, 2);
scene.add(headLight);

// ---------------------------------------------------------------------------
// Postprocessing: bloom/glow
// ---------------------------------------------------------------------------
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  1.6, // strength
  0.55, // radius
  0.12, // threshold
);
composer.addPass(bloomPass);

// ---------------------------------------------------------------------------
// Resize
// ---------------------------------------------------------------------------
function onResize(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer.setSize(w, h);
  bloomPass.setSize(w, h);
}
window.addEventListener('resize', onResize);

// ---------------------------------------------------------------------------
// Camera flythrough animation
// ---------------------------------------------------------------------------
const SPEED = 0.018; // loop fraction per second
const camPos = new THREE.Vector3();
const lookPos = new THREE.Vector3();
const clock = new THREE.Clock();

function animate(): void {
  const elapsed = clock.getElapsedTime();
  const t = (elapsed * SPEED) % 1;

  curve.getPointAt(t, camPos);
  curve.getPointAt((t + 0.012) % 1, lookPos);

  camera.position.copy(camPos);
  camera.lookAt(lookPos);
  headLight.position.copy(camPos);

  composer.render();
}
renderer.setAnimationLoop(animate);
