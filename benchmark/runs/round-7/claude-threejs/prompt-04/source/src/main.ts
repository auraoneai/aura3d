// Neon Tunnel Flythrough
// Procedural tube geometry with emissive neon segments, a camera animated
// through the tunnel, UnrealBloom postprocessing, and exponential fog falloff.

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
Object.assign(document.body.style, { margin: '0', overflow: 'hidden', background: '#000' });
Object.assign(renderer.domElement.style, { display: 'block' });

// ---------------------------------------------------------------------------
// Scene + fog falloff
// ---------------------------------------------------------------------------
const scene = new THREE.Scene();
const fogColor = new THREE.Color(0x05010f);
scene.background = fogColor;
// Exponential fog gives a strong depth falloff down the length of the tunnel.
scene.fog = new THREE.FogExp2(fogColor, 0.045);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 600);

// ---------------------------------------------------------------------------
// Procedural tunnel path
// ---------------------------------------------------------------------------
// A long, gently winding closed spline that the camera will fly through.
const PATH_POINTS = 24;
const pathPoints: THREE.Vector3[] = [];
for (let i = 0; i < PATH_POINTS; i++) {
  const t = (i / PATH_POINTS) * Math.PI * 2;
  pathPoints.push(
    new THREE.Vector3(
      Math.sin(t * 2) * 18 + Math.cos(t * 3) * 6,
      Math.cos(t * 2) * 14 + Math.sin(t * 5) * 5,
      Math.sin(t) * 90,
    ),
  );
}
const curve = new THREE.CatmullRomCurve3(pathPoints, true, 'catmullrom', 0.5);

// ---------------------------------------------------------------------------
// Tunnel interior surface with an emissive neon grid texture
// ---------------------------------------------------------------------------
function makeGridTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Dark base.
  ctx.fillStyle = '#020008';
  ctx.fillRect(0, 0, size, size);

  // Bright neon grid lines -> these become the emissive segments and bloom.
  const lines = 8;
  const step = size / lines;
  ctx.lineWidth = 6;
  for (let i = 0; i <= lines; i++) {
    const hue = (i / lines) * 360;
    ctx.strokeStyle = `hsl(${hue}, 100%, 60%)`;
    const p = i * step;
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, p);
    ctx.lineTo(size, p);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const gridTex = makeGridTexture();
gridTex.repeat.set(28, 6); // many segments along the length, ringed around.

const tubeGeometry = new THREE.TubeGeometry(curve, 600, 4.4, 24, true);
const tubeMaterial = new THREE.MeshStandardMaterial({
  side: THREE.BackSide, // we fly *inside* the tube, so render the interior faces.
  color: 0x0a0a14,
  roughness: 0.35,
  metalness: 0.9,
  emissive: 0xffffff,
  emissiveMap: gridTex,
  emissiveIntensity: 2.4,
  map: gridTex,
  fog: true,
});
const tube = new THREE.Mesh(tubeGeometry, tubeMaterial);
scene.add(tube);

// ---------------------------------------------------------------------------
// Emissive neon ring segments placed along the tunnel
// ---------------------------------------------------------------------------
const NEON_COLORS = [0x00ffff, 0xff00ff, 0x7a00ff, 0x00ff88, 0xff2d6f, 0xffaa00];
const RING_COUNT = 90;
const ringGeometry = new THREE.TorusGeometry(4.0, 0.12, 12, 48);
const up = new THREE.Vector3(0, 1, 0);
const tmpMatrix = new THREE.Matrix4();

for (let i = 0; i < RING_COUNT; i++) {
  const t = i / RING_COUNT;
  const pos = curve.getPointAt(t);
  const tangent = curve.getTangentAt(t).normalize();

  const color = new THREE.Color(NEON_COLORS[i % NEON_COLORS.length]);
  const mat = new THREE.MeshBasicMaterial({ color, fog: true });
  const ring = new THREE.Mesh(ringGeometry, mat);
  ring.position.copy(pos);
  // Orient the ring so its plane is perpendicular to the path direction.
  tmpMatrix.lookAt(new THREE.Vector3(0, 0, 0), tangent, up);
  ring.quaternion.setFromRotationMatrix(tmpMatrix);
  scene.add(ring);
}

// ---------------------------------------------------------------------------
// Lighting — a moving point light keeps the tunnel interior readable.
// ---------------------------------------------------------------------------
scene.add(new THREE.AmbientLight(0x222244, 1.2));
const headLight = new THREE.PointLight(0x88aaff, 80, 60, 2);
scene.add(headLight);

// ---------------------------------------------------------------------------
// Postprocessing — UnrealBloom for the neon glow.
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
composer.addPass(new OutputPass());

// ---------------------------------------------------------------------------
// Camera flythrough animation
// ---------------------------------------------------------------------------
const camPos = new THREE.Vector3();
const lookAt = new THREE.Vector3();
const LOOP_SECONDS = 36; // time to traverse the whole tunnel once.
const clock = new THREE.Clock();

function animate() {
  const elapsed = clock.getElapsedTime();
  const t = (elapsed / LOOP_SECONDS) % 1;

  curve.getPointAt(t, camPos);
  curve.getPointAt((t + 0.012) % 1, lookAt); // look slightly ahead down the tube.

  camera.position.copy(camPos);
  camera.lookAt(lookAt);

  headLight.position.copy(camPos);

  // Subtle texture drift adds extra motion energy to the neon walls.
  gridTex.offset.y = -elapsed * 0.15;

  composer.render();
}
renderer.setAnimationLoop(animate);

// ---------------------------------------------------------------------------
// Resize handling
// ---------------------------------------------------------------------------
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});
