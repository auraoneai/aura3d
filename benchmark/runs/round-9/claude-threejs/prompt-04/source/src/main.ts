// Neon Tunnel Flythrough
// Procedurally generated tube geometry with emissive segment rings, a camera
// animated through the tunnel, UnrealBloom postprocessing and exponential fog
// falloff. Built with three.js + bundled addons only.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.setClearColor(0x05010f, 1);

const app = document.getElementById('app') ?? document.body;
app.appendChild(renderer.domElement);
renderer.domElement.style.display = 'block';

// ---------------------------------------------------------------------------
// Scene + fog (depth falloff into the dark distance)
// ---------------------------------------------------------------------------
const scene = new THREE.Scene();
const FOG_COLOR = 0x05010f;
scene.fog = new THREE.FogExp2(FOG_COLOR, 0.055);

const camera = new THREE.PerspectiveCamera(
  78,
  window.innerWidth / window.innerHeight,
  0.1,
  400,
);

// A faint ambient fill so the tunnel walls are never pure black.
scene.add(new THREE.AmbientLight(0x222244, 0.6));

// ---------------------------------------------------------------------------
// Procedural winding path for the tunnel
// ---------------------------------------------------------------------------
const PATH_POINTS: THREE.Vector3[] = [];
const TURNS = 6;
const SAMPLES = 220;
for (let i = 0; i < SAMPLES; i++) {
  const t = (i / SAMPLES) * Math.PI * 2 * TURNS;
  const radius = 26;
  PATH_POINTS.push(
    new THREE.Vector3(
      Math.cos(t) * radius + Math.sin(t * 0.6) * 8,
      Math.sin(t * 0.8) * 12,
      i * 2.4 - (SAMPLES * 2.4) / 2,
    ),
  );
}
const path = new THREE.CatmullRomCurve3(PATH_POINTS, true, 'catmullrom', 0.5);

// ---------------------------------------------------------------------------
// Procedural emissive wall texture (neon grid)
// ---------------------------------------------------------------------------
function makeTunnelTexture(): THREE.Texture {
  const w = 512;
  const h = 512;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  // Dark base
  ctx.fillStyle = '#06021a';
  ctx.fillRect(0, 0, w, h);

  // Longitudinal neon lines (run along tunnel length -> vertical here)
  const cols = 8;
  for (let i = 0; i < cols; i++) {
    const x = (i + 0.5) * (w / cols);
    const hue = (i / cols) * 360;
    ctx.strokeStyle = `hsl(${hue}, 100%, 60%)`;
    ctx.lineWidth = 5;
    ctx.shadowColor = ctx.strokeStyle;
    ctx.shadowBlur = 22;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }

  // Transverse segment bands (rings around the tunnel -> horizontal here)
  const rows = 16;
  for (let j = 0; j < rows; j++) {
    const y = (j + 0.5) * (h / rows);
    const bright = j % 2 === 0;
    ctx.strokeStyle = bright ? '#33e6ff' : '#3a1d66';
    ctx.lineWidth = bright ? 6 : 3;
    ctx.shadowColor = '#33e6ff';
    ctx.shadowBlur = bright ? 18 : 0;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------------------------------------------------------------------------
// Tube geometry (the tunnel) — rendered from the inside (BackSide)
// ---------------------------------------------------------------------------
const TUBULAR = 1400;
const tubeGeo = new THREE.TubeGeometry(path, TUBULAR, 4.2, 28, true);

const wallTex = makeTunnelTexture();
wallTex.repeat.set(80, 4);

const emissiveTex = makeTunnelTexture();
emissiveTex.repeat.set(80, 4);

const tubeMat = new THREE.MeshStandardMaterial({
  map: wallTex,
  emissive: 0xffffff,
  emissiveMap: emissiveTex,
  emissiveIntensity: 1.6,
  metalness: 0.4,
  roughness: 0.35,
  side: THREE.BackSide,
  fog: true,
});
const tube = new THREE.Mesh(tubeGeo, tubeMat);
scene.add(tube);

// ---------------------------------------------------------------------------
// Bright emissive ring segments placed along the path (clear neon "segments")
// ---------------------------------------------------------------------------
const NEON_COLORS = [0xff2d75, 0x18f7ff, 0xb14dff, 0x2dff8a, 0xffd23f];
const ringGroup = new THREE.Group();
const RING_COUNT = 120;

for (let i = 0; i < RING_COUNT; i++) {
  const u = i / RING_COUNT;
  const pos = path.getPointAt(u);
  const tangent = path.getTangentAt(u).normalize();

  const color = NEON_COLORS[i % NEON_COLORS.length];
  const ringGeo = new THREE.TorusGeometry(4.0, 0.12, 10, 40);
  const ringMat = new THREE.MeshBasicMaterial({ color, fog: true });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.position.copy(pos);
  // Torus lies in its local XY plane; align its axis (local Z) with the path.
  ring.quaternion.copy(
    new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), tangent),
  );
  ringGroup.add(ring);
}
scene.add(ringGroup);

// ---------------------------------------------------------------------------
// Postprocessing: bloom / glow
// ---------------------------------------------------------------------------
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const bloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  1.25, // strength
  0.8, // radius
  0.12, // threshold
);
composer.addPass(bloom);

// ---------------------------------------------------------------------------
// Camera animation through the tunnel
// ---------------------------------------------------------------------------
const camPos = new THREE.Vector3();
const lookPos = new THREE.Vector3();

function updateCamera(elapsed: number) {
  const speed = 0.018; // loops of the path per second
  const t = (elapsed * speed) % 1;
  path.getPointAt(t, camPos);
  // Look a little further down the tunnel for a flythrough feel.
  path.getPointAt((t + 0.008) % 1, lookPos);
  camera.position.copy(camPos);
  camera.lookAt(lookPos);
  // Subtle bank/roll so it reads as motion.
  camera.up.set(Math.sin(elapsed * 0.4) * 0.15, 1, 0).normalize();
}

// ---------------------------------------------------------------------------
// Resize
// ---------------------------------------------------------------------------
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

// ---------------------------------------------------------------------------
// Animation loop
// ---------------------------------------------------------------------------
const clock = new THREE.Clock();
function animate() {
  const elapsed = clock.getElapsedTime();

  // Scroll the emissive grid for a sense of speed.
  const scroll = (elapsed * 0.6) % 1;
  wallTex.offset.x = scroll;
  emissiveTex.offset.x = scroll;

  // Pulse the ring colours through the neon palette.
  ringGroup.children.forEach((child, i) => {
    const ring = child as THREE.Mesh;
    const mat = ring.material as THREE.MeshBasicMaterial;
    const pulse = 0.6 + 0.4 * Math.sin(elapsed * 2 + i * 0.5);
    mat.color.setHex(NEON_COLORS[i % NEON_COLORS.length]).multiplyScalar(pulse);
  });

  updateCamera(elapsed);
  composer.render();
}
renderer.setAnimationLoop(animate);
