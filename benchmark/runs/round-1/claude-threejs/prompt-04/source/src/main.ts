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
renderer.toneMappingExposure = 0.85;

const app = document.getElementById('app') ?? document.body;
app.appendChild(renderer.domElement);
// Pin the canvas to the full viewport so it is always visible regardless of
// the host page's default layout.
Object.assign(renderer.domElement.style, {
  display: 'block',
  position: 'fixed',
  top: '0',
  left: '0',
  width: '100%',
  height: '100%',
});
document.documentElement.style.margin = '0';
document.body.style.margin = '0';
document.body.style.background = '#05000f';
document.body.style.overflow = 'hidden';

// ---------------------------------------------------------------------------
// Scene + fog falloff
// ---------------------------------------------------------------------------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05000f);
// Exponential fog gives a strong depth falloff down the length of the tunnel.
scene.fog = new THREE.FogExp2(0x06001a, 0.022);

const camera = new THREE.PerspectiveCamera(
  78,
  window.innerWidth / window.innerHeight,
  0.1,
  500
);

// ---------------------------------------------------------------------------
// Procedural tunnel path — a smooth, winding 3D curve.
// ---------------------------------------------------------------------------
const pathPoints: THREE.Vector3[] = [];
const PATH_LENGTH = 220;
const SEGMENTS = 60;
for (let i = 0; i <= SEGMENTS; i++) {
  const t = i / SEGMENTS;
  const z = -t * PATH_LENGTH;
  const x = Math.sin(t * Math.PI * 4) * 14 + Math.sin(t * Math.PI * 1.3) * 6;
  const y = Math.cos(t * Math.PI * 3) * 9 + Math.sin(t * Math.PI * 2.1) * 4;
  pathPoints.push(new THREE.Vector3(x, y, z));
}
const curve = new THREE.CatmullRomCurve3(pathPoints, false, 'catmullrom', 0.5);

const TUBE_RADIUS = 6;
const TUBULAR_SEGMENTS = 1400;
const RADIAL_SEGMENTS = 48;
const tubeGeometry = new THREE.TubeGeometry(
  curve,
  TUBULAR_SEGMENTS,
  TUBE_RADIUS,
  RADIAL_SEGMENTS,
  false
);

// ---------------------------------------------------------------------------
// Tunnel wall material — custom shader with emissive neon ring segments.
// We see the *inside* of the tube (BackSide). Bright bands are emitted at
// regular intervals along the tube length, with dark structural wall between
// them so the glowing segments read clearly.
// ---------------------------------------------------------------------------
const wallUniforms = {
  uTime: { value: 0 },
  uColorA: { value: new THREE.Color(0x00e5ff) }, // cyan
  uColorB: { value: new THREE.Color(0xff1f8f) }, // magenta
  uColorC: { value: new THREE.Color(0x7a00ff) }, // violet
  uRings: { value: 80.0 }, // number of emissive bands along the tube
};

const wallMaterial = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  fog: true,
  uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, wallUniforms]),
  vertexShader: /* glsl */ `
    #include <fog_pars_vertex>
    varying vec2 vUv;
    void main() {
      vUv = uv;
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
    }
  `,
  fragmentShader: /* glsl */ `
    #include <fog_pars_fragment>
    uniform float uTime;
    uniform float uRings;
    uniform vec3 uColorA;
    uniform vec3 uColorB;
    uniform vec3 uColorC;
    varying vec2 vUv;

    void main() {
      // along-tube coordinate, scrolling toward the camera
      float along = vUv.x * uRings - uTime * 1.5;
      float band = fract(along);

      // bright thin emissive ring within each segment
      float ring = smoothstep(0.42, 0.5, band) - smoothstep(0.5, 0.58, band);

      // longitudinal neon strips around the circumference
      float strips = abs(sin(vUv.y * 3.14159 * 12.0));
      strips = smoothstep(0.85, 1.0, strips);

      // cycle colors segment-to-segment
      float seg = floor(along);
      float hue = fract(seg * 0.137);
      vec3 ringColor = mix(uColorA, uColorB, smoothstep(0.0, 0.5, hue));
      ringColor = mix(ringColor, uColorC, smoothstep(0.5, 1.0, hue));

      // dark structural wall + glowing elements
      vec3 base = vec3(0.015, 0.01, 0.04);
      vec3 color = base;
      color += ringColor * ring * 3.2;
      color += mix(uColorA, uColorC, vUv.x) * strips * 0.9;

      // subtle pulse
      color *= 0.85 + 0.15 * sin(uTime * 2.0 + seg);

      gl_FragColor = vec4(color, 1.0);
      #include <fog_fragment>
    }
  `,
});

const tunnel = new THREE.Mesh(tubeGeometry, wallMaterial);
scene.add(tunnel);

// ---------------------------------------------------------------------------
// Discrete emissive ring meshes placed along the path. These solid neon
// torus rings are the strongest bloom sources and clearly read as
// "emissive segments" running along the tunnel.
// ---------------------------------------------------------------------------
const ringPalette = [0x00e5ff, 0xff1f8f, 0x7a00ff, 0x00ff9d, 0xffaa00];
const RING_COUNT = 70;
const ringGroup = new THREE.Group();
const up = new THREE.Vector3(0, 1, 0);
for (let i = 0; i < RING_COUNT; i++) {
  const t = (i + 0.5) / RING_COUNT;
  const pos = curve.getPointAt(t);
  const tangent = curve.getTangentAt(t).normalize();

  const color = new THREE.Color(ringPalette[i % ringPalette.length]);
  const ringGeo = new THREE.TorusGeometry(TUBE_RADIUS - 0.25, 0.12, 8, 64);
  const ringMat = new THREE.MeshBasicMaterial({ color, fog: true });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.position.copy(pos);
  // orient the ring so its plane is perpendicular to the path tangent
  ring.quaternion.setFromUnitVectors(up, tangent);
  ring.rotateX(Math.PI / 2);
  ringGroup.add(ring);
}
scene.add(ringGroup);

// A travelling point light keeps the interior from being pitch black, plus
// faint ambient so the dark wall structure is just visible.
const travelLight = new THREE.PointLight(0x88aaff, 40, 60, 2);
scene.add(travelLight);
scene.add(new THREE.AmbientLight(0x202040, 1.5));

// ---------------------------------------------------------------------------
// Postprocessing — bloom
// ---------------------------------------------------------------------------
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  1.1, // strength
  0.55, // radius
  0.7 // threshold — only the bright neon elements bloom, dark wall stays dark
);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

// ---------------------------------------------------------------------------
// Resize handling
// ---------------------------------------------------------------------------
function onResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer.setSize(w, h);
}
window.addEventListener('resize', onResize);

// ---------------------------------------------------------------------------
// Camera flythrough animation
// ---------------------------------------------------------------------------
const FLIGHT_SECONDS = 30; // time for one full pass through the tunnel
const camPos = new THREE.Vector3();
const lookPos = new THREE.Vector3();
const clock = new THREE.Clock();

function animate() {
  const elapsed = clock.getElapsedTime();

  // loop progress 0..1 along the curve. Start partway in so the opening
  // frame already reads as being inside the tunnel.
  const START_T = 0.1;
  const t = (START_T + elapsed / FLIGHT_SECONDS) % 1;

  curve.getPointAt(t, camPos);
  // look a little ahead down the tube for a proper flythrough feel
  const ahead = Math.min(t + 0.012, 1);
  curve.getPointAt(ahead, lookPos);

  camera.position.copy(camPos);
  // gentle roll for a dynamic ride — set up vector before lookAt so it applies
  camera.up.set(Math.sin(elapsed * 0.4) * 0.15, 1, 0).normalize();
  camera.lookAt(lookPos);

  travelLight.position.copy(camPos);
  wallMaterial.uniforms.uTime.value = elapsed;

  composer.render();
  requestAnimationFrame(animate);
}

clock.start();
animate();
