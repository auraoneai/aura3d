// Prompt 04: Neon Tunnel Flythrough
// Procedurally generated tube geometry with emissive neon segments,
// camera animated through the tunnel, UnrealBloom postprocess, fog falloff.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------
const container = document.getElementById('app') as HTMLDivElement;

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.85;
renderer.outputColorSpace = THREE.SRGBColorSpace;
container.appendChild(renderer.domElement);

// Make the canvas fill the viewport.
const style = document.createElement('style');
style.textContent =
  'html,body{margin:0;height:100%;overflow:hidden;background:#05010f;}#app{width:100vw;height:100vh;}canvas{display:block;}';
document.head.appendChild(style);

// ---------------------------------------------------------------------------
// Scene + fog falloff
// ---------------------------------------------------------------------------
const scene = new THREE.Scene();
const FOG_COLOR = new THREE.Color(0x05010f);
scene.background = FOG_COLOR;
// Exponential fog gives the depth falloff down the length of the tunnel.
scene.fog = new THREE.FogExp2(FOG_COLOR.getHex(), 0.028);

const camera = new THREE.PerspectiveCamera(78, window.innerWidth / window.innerHeight, 0.1, 400);

// ---------------------------------------------------------------------------
// Procedural tunnel path (closed loop so the flythrough never ends)
// ---------------------------------------------------------------------------
const PATH_RADIUS = 90;
const WAYPOINTS = 18;
const pathPoints: THREE.Vector3[] = [];
for (let i = 0; i < WAYPOINTS; i++) {
  const a = (i / WAYPOINTS) * Math.PI * 2;
  pathPoints.push(
    new THREE.Vector3(
      Math.cos(a) * PATH_RADIUS + Math.sin(a * 3) * 18,
      Math.sin(a * 2) * 24,
      Math.sin(a) * PATH_RADIUS + Math.cos(a * 3) * 18,
    ),
  );
}
const curve = new THREE.CatmullRomCurve3(pathPoints, true, 'catmullrom', 0.5);

const TUBE_RADIUS = 5;
const tubeGeometry = new THREE.TubeGeometry(curve, 1200, TUBE_RADIUS, 28, true);

// Dark, slightly reflective tunnel shell rendered from the inside (BackSide).
const tubeMaterial = new THREE.MeshStandardMaterial({
  color: 0x0a0a18,
  emissive: 0x110830,
  emissiveIntensity: 0.6,
  metalness: 0.85,
  roughness: 0.35,
  side: THREE.BackSide,
});
const tube = new THREE.Mesh(tubeGeometry, tubeMaterial);
scene.add(tube);

// A wireframe overlay traces the tube surface with faint neon lines.
const tubeWire = new THREE.Mesh(
  new THREE.TubeGeometry(curve, 600, TUBE_RADIUS * 0.99, 14, true),
  new THREE.MeshBasicMaterial({
    color: 0x2266ff,
    wireframe: true,
    transparent: true,
    opacity: 0.18,
    side: THREE.BackSide,
  }),
);
scene.add(tubeWire);

// ---------------------------------------------------------------------------
// Emissive neon ring segments spaced along the tunnel
// ---------------------------------------------------------------------------
const RING_COUNT = 160;
const ringGroup = new THREE.Group();
scene.add(ringGroup);

const up = new THREE.Vector3(0, 1, 0);
const tmpQuat = new THREE.Quaternion();
const ringMaterials: THREE.MeshBasicMaterial[] = [];

for (let i = 0; i < RING_COUNT; i++) {
  const u = i / RING_COUNT;
  const point = curve.getPointAt(u);
  const tangent = curve.getTangentAt(u).normalize();

  const hue = (u * 3) % 1; // multiple hue sweeps around the loop
  const color = new THREE.Color().setHSL(hue, 1.0, 0.6);

  const mat = new THREE.MeshBasicMaterial({
    color,
    fog: true,
    toneMapped: false, // keep neon at full intensity so bloom catches it
  });
  ringMaterials.push(mat);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(TUBE_RADIUS * 0.86, 0.16, 10, 40),
    mat,
  );
  ring.position.copy(point);
  // Orient the ring so its plane is perpendicular to the path tangent.
  tmpQuat.setFromUnitVectors(up, tangent);
  ring.quaternion.copy(tmpQuat);
  ring.rotateX(Math.PI / 2);
  ringGroup.add(ring);
}

// Longitudinal neon strips running down the tunnel for extra streaking glow.
const STRIP_COUNT = 6;
for (let s = 0; s < STRIP_COUNT; s++) {
  const stripPoints: THREE.Vector3[] = [];
  const angleOffset = (s / STRIP_COUNT) * Math.PI * 2;
  const samples = 1400;
  const pos = new THREE.Vector3();
  const tan = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const binormal = new THREE.Vector3();
  for (let i = 0; i <= samples; i++) {
    const u = i / samples;
    curve.getPointAt(u, pos);
    curve.getTangentAt(u, tan).normalize();
    normal.crossVectors(tan, up).normalize();
    binormal.crossVectors(tan, normal).normalize();
    const r = TUBE_RADIUS * 0.97;
    const offset = new THREE.Vector3()
      .addScaledVector(normal, Math.cos(angleOffset) * r)
      .addScaledVector(binormal, Math.sin(angleOffset) * r);
    stripPoints.push(pos.clone().add(offset));
  }
  const stripGeo = new THREE.BufferGeometry().setFromPoints(stripPoints);
  const stripColor = new THREE.Color().setHSL((s / STRIP_COUNT), 1.0, 0.55);
  const strip = new THREE.Line(
    stripGeo,
    new THREE.LineBasicMaterial({ color: stripColor, toneMapped: false, transparent: true, opacity: 0.7 }),
  );
  scene.add(strip);
}

// ---------------------------------------------------------------------------
// Lighting (so the standard tube shell reads with depth)
// ---------------------------------------------------------------------------
scene.add(new THREE.AmbientLight(0x223355, 0.6));
const travelLight = new THREE.PointLight(0x66aaff, 40, 60, 2);
scene.add(travelLight);

// ---------------------------------------------------------------------------
// Postprocessing: bloom
// ---------------------------------------------------------------------------
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  1.4, // strength
  0.75, // radius
  0.0, // threshold
);
composer.addPass(bloomPass);
composer.setSize(window.innerWidth, window.innerHeight);
composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

// ---------------------------------------------------------------------------
// Resize
// ---------------------------------------------------------------------------
window.addEventListener('resize', () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer.setSize(w, h);
});

// ---------------------------------------------------------------------------
// Camera flythrough animation
// ---------------------------------------------------------------------------
const camPos = new THREE.Vector3();
const lookPos = new THREE.Vector3();
const clock = new THREE.Clock();

function animate(): void {
  const elapsed = clock.getElapsedTime();

  // Travel fraction around the closed loop.
  const t = (elapsed * 0.018) % 1;
  const lookAhead = (t + 0.012) % 1;

  curve.getPointAt(t, camPos);
  curve.getPointAt(lookAhead, lookPos);

  camera.position.copy(camPos);
  camera.lookAt(lookPos);
  // Subtle banking roll for a sense of motion.
  camera.rotateZ(Math.sin(elapsed * 0.6) * 0.12);

  travelLight.position.copy(camPos);

  // Pulse the neon rings (brightness sweeps along the tunnel).
  for (let i = 0; i < ringMaterials.length; i++) {
    const pulse = 0.55 + 0.45 * Math.sin(elapsed * 2.0 + i * 0.35);
    ringMaterials[i].color.setHSL(((i / ringMaterials.length) * 3) % 1, 1.0, 0.35 + pulse * 0.35);
  }

  composer.render();
}

renderer.setAnimationLoop(animate);
