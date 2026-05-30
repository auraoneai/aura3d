// Neon Tunnel Flythrough
// Procedurally generated tube geometry with emissive segments, a camera
// animated through the tunnel, UnrealBloom postprocessing, and exponential
// fog for depth falloff. Built with Three.js (no external assets).

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

const app = document.getElementById('app') ?? document.body;
app.appendChild(renderer.domElement);

// ---------------------------------------------------------------------------
// Scene + fog (depth falloff)
// ---------------------------------------------------------------------------
const scene = new THREE.Scene();
const FOG_COLOR = 0x05010f;
scene.background = new THREE.Color(FOG_COLOR);
// Exponential fog gives a strong, neon-friendly depth falloff: distant tunnel
// segments fade into the dark while near segments stay bright.
scene.fog = new THREE.FogExp2(FOG_COLOR, 0.045);

const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000,
);

// ---------------------------------------------------------------------------
// Tunnel path — a winding closed curve so the flythrough loops seamlessly
// ---------------------------------------------------------------------------
const pathPoints: THREE.Vector3[] = [];
const SEGMENTS = 16;
for (let i = 0; i < SEGMENTS; i++) {
  const t = (i / SEGMENTS) * Math.PI * 2;
  pathPoints.push(
    new THREE.Vector3(
      Math.sin(t * 2) * 18 + Math.cos(t * 3) * 6,
      Math.cos(t * 2) * 14 + Math.sin(t) * 8,
      Math.sin(t) * 60 - 30,
    ),
  );
}
const curve = new THREE.CatmullRomCurve3(pathPoints, true, 'catmullrom', 0.5);

const TUBE_RADIUS = 3.2;
const TUBULAR_SEGMENTS = 600;

// ---------------------------------------------------------------------------
// Procedural emissive grid texture for the tunnel wall
// ---------------------------------------------------------------------------
function makeTunnelTexture(): THREE.CanvasTexture {
  const w = 128;
  const h = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  // Dark base.
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, w, h);

  // Glowing ring bands across the tube (these are the "emissive segments").
  const ringSpacing = 64;
  for (let y = 0; y < h; y += ringSpacing) {
    // Alternate neon hues for a clubby, cyberpunk look.
    const hue = (y / ringSpacing) % 2 === 0 ? 190 : 305; // cyan / magenta
    const grad = ctx.createLinearGradient(0, y - 6, 0, y + 6);
    grad.addColorStop(0, `hsla(${hue}, 100%, 50%, 0)`);
    grad.addColorStop(0.5, `hsla(${hue}, 100%, 65%, 1)`);
    grad.addColorStop(1, `hsla(${hue}, 100%, 50%, 0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, y - 6, w, 12);
  }

  // Longitudinal neon strips running down the length of the tunnel.
  const strips = 6;
  for (let i = 0; i < strips; i++) {
    const x = (i + 0.5) * (w / strips);
    const grad = ctx.createLinearGradient(x - 3, 0, x + 3, 0);
    grad.addColorStop(0, 'hsla(280, 100%, 60%, 0)');
    grad.addColorStop(0.5, 'hsla(280, 100%, 70%, 1)');
    grad.addColorStop(1, 'hsla(280, 100%, 60%, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(x - 3, 0, 6, h);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 28); // around the tube, along the tube
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

const gridTexture = makeTunnelTexture();

// ---------------------------------------------------------------------------
// Tunnel wall mesh — interior visible (BackSide)
// ---------------------------------------------------------------------------
const tubeGeometry = new THREE.TubeGeometry(
  curve,
  TUBULAR_SEGMENTS,
  TUBE_RADIUS,
  32,
  true,
);
const tubeMaterial = new THREE.MeshStandardMaterial({
  color: 0x05060f,
  roughness: 0.45,
  metalness: 0.6,
  side: THREE.BackSide,
  emissive: 0xffffff,
  emissiveMap: gridTexture,
  emissiveIntensity: 1.1,
});
const tube = new THREE.Mesh(tubeGeometry, tubeMaterial);
scene.add(tube);

// ---------------------------------------------------------------------------
// Bright emissive ring gates placed at intervals along the path. These read
// clearly as discrete glowing segments rushing toward the camera and feed the
// bloom pass strongly.
// ---------------------------------------------------------------------------
const ringGroup = new THREE.Group();
scene.add(ringGroup);

const RING_COUNT = 90;
const tmpPos = new THREE.Vector3();
const tmpTan = new THREE.Vector3();
const quat = new THREE.Quaternion();
const zAxis = new THREE.Vector3(0, 0, 1);

const ringHues = [0.52, 0.85, 0.62, 0.95]; // cyan, magenta, blue, pink
for (let i = 0; i < RING_COUNT; i++) {
  const u = i / RING_COUNT;
  curve.getPointAt(u, tmpPos);
  curve.getTangentAt(u, tmpTan);

  const color = new THREE.Color().setHSL(ringHues[i % ringHues.length], 1.0, 0.6);
  const ringGeo = new THREE.TorusGeometry(TUBE_RADIUS * 0.96, 0.07, 12, 48);
  const ringMat = new THREE.MeshBasicMaterial({ color });
  const ring = new THREE.Mesh(ringGeo, ringMat);

  ring.position.copy(tmpPos);
  quat.setFromUnitVectors(zAxis, tmpTan); // align ring plane to path tangent
  ring.quaternion.copy(quat);
  ring.userData.baseColor = color.clone();
  ring.userData.phase = i * 0.4;
  ringGroup.add(ring);
}

// A few point lights traveling so the metallic tube wall catches highlights.
const movingLights: THREE.PointLight[] = [];
const lightColors = [0x00ffff, 0xff00ff, 0x4060ff];
for (let i = 0; i < lightColors.length; i++) {
  const l = new THREE.PointLight(lightColors[i], 12, 35, 2);
  scene.add(l);
  movingLights.push(l);
}
scene.add(new THREE.AmbientLight(0x0a0a1a, 0.6));

// ---------------------------------------------------------------------------
// Post-processing: render -> bloom -> output (tone map + sRGB)
// ---------------------------------------------------------------------------
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.85, // strength
  0.55, // radius
  0.45, // threshold — only the bright neon segments bleed
);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

// ---------------------------------------------------------------------------
// Resize
// ---------------------------------------------------------------------------
function onResize() {
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
// Animation — fly the camera along the curve
// ---------------------------------------------------------------------------
const clock = new THREE.Clock();
const camPos = new THREE.Vector3();
const lookPos = new THREE.Vector3();
const SPEED = 0.018; // loops of the full curve per second

function animate() {
  const elapsed = clock.getElapsedTime();
  const t = (elapsed * SPEED) % 1;

  // Camera position on the curve; look a little further ahead down the tunnel.
  curve.getPointAt(t, camPos);
  const ahead = (t + 0.012) % 1;
  curve.getPointAt(ahead, lookPos);

  camera.position.copy(camPos);
  camera.lookAt(lookPos);
  // Gentle roll for a sense of motion.
  camera.up.set(Math.sin(elapsed * 0.3) * 0.15, 1, 0).normalize();

  // Travelling lights staggered ahead of the camera.
  for (let i = 0; i < movingLights.length; i++) {
    const lt = (t + 0.02 + i * 0.06) % 1;
    curve.getPointAt(lt, tmpPos);
    movingLights[i].position.copy(tmpPos);
  }

  // Pulse the ring gates for an energetic neon feel.
  for (const obj of ringGroup.children) {
    const ring = obj as THREE.Mesh;
    const base = ring.userData.baseColor as THREE.Color;
    const phase = ring.userData.phase as number;
    const pulse = 0.7 + 0.6 * (0.5 + 0.5 * Math.sin(elapsed * 2.0 + phase));
    (ring.material as THREE.MeshBasicMaterial).color
      .copy(base)
      .multiplyScalar(pulse);
  }

  // Slowly scroll the wall texture for extra forward motion.
  gridTexture.offset.y = -elapsed * 0.05;

  composer.render();
}
renderer.setAnimationLoop(animate);

// ---------------------------------------------------------------------------
// Minimal on-screen caption
// ---------------------------------------------------------------------------
const caption = document.createElement('div');
caption.textContent = 'NEON TUNNEL // FLYTHROUGH';
Object.assign(caption.style, {
  position: 'fixed',
  left: '16px',
  bottom: '14px',
  font: '600 13px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace',
  letterSpacing: '0.18em',
  color: '#9fe9ff',
  textShadow: '0 0 8px rgba(0,200,255,0.8)',
  pointerEvents: 'none',
  userSelect: 'none',
} as CSSStyleDeclaration);
app.appendChild(caption);
