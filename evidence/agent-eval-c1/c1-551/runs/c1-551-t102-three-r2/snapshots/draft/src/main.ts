import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import {
  makeCircleTexture,
  makeGlowTexture,
  makeRuneTexture,
  makeStoneTexture,
  mulberry32,
} from './textures';
import { PortalParticles, PARTICLE_TOTAL } from './particles';

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
    __TASK_STATE__?: { portalActive: boolean; particleCount: number; time: number };
  }
}

const W = 640;
const H = 360;
const FOV = 45;
const PORTAL_Y = 2.75;
const RING_R = 2.3;

const canvas = document.getElementById('app') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const FOG_COLOR = 0x2a1c40;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x120c22);
scene.fog = new THREE.FogExp2(FOG_COLOR, 0.04);

const camera = new THREE.PerspectiveCamera(FOV, W / H, 0.1, 200);

const CYAN = new THREE.Color(0.2, 0.85, 1.0);
const VIOLET = new THREE.Color(0.6, 0.25, 1.0);

// ---------------------------------------------------------------- sky
{
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(100, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `
        varying vec3 vDir;
        void main(){
          float h = clamp(vDir.y, -0.2, 1.0);
          vec3 horizon = vec3(0.50, 0.17, 0.30);
          vec3 mid = vec3(0.13, 0.08, 0.30);
          vec3 top = vec3(0.015, 0.02, 0.07);
          vec3 c = mix(horizon, mid, smoothstep(0.0, 0.25, h));
          c = mix(c, top, smoothstep(0.2, 0.8, h));
          c = mix(c, vec3(0.09,0.05,0.14), smoothstep(0.0, -0.2, vDir.y));
          gl_FragColor = vec4(c, 1.0);
        }`,
    }),
  );
  scene.add(sky);

  const rnd = mulberry32(99);
  const n = 220;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2;
    const y = 0.25 + rnd() * 0.75;
    const r = Math.sqrt(1 - y * y);
    arr[i * 3] = Math.cos(a) * r * 90;
    arr[i * 3 + 1] = y * 90;
    arr[i * 3 + 2] = Math.sin(a) * r * 90;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  scene.add(
    new THREE.Points(
      g,
      new THREE.PointsMaterial({ color: 0xbfc4ff, size: 1.3, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.7 }),
    ),
  );
}

// ---------------------------------------------------------------- lights
const hemi = new THREE.HemisphereLight(0x5a56a8, 0x150f22, 0.55);
scene.add(hemi);

const dusk = new THREE.DirectionalLight(0xff8f70, 1.0);
dusk.position.set(-14, 7, -12);
dusk.castShadow = true;
dusk.shadow.mapSize.set(1024, 1024);
dusk.shadow.camera.left = -13;
dusk.shadow.camera.right = 13;
dusk.shadow.camera.top = 13;
dusk.shadow.camera.bottom = -13;
dusk.shadow.camera.near = 1;
dusk.shadow.camera.far = 50;
dusk.shadow.bias = -0.0008;
scene.add(dusk);

const fill = new THREE.DirectionalLight(0x4660b0, 0.35);
fill.position.set(10, 6, 12);
scene.add(fill);

const cyanLight = new THREE.PointLight(0x35d9ff, 40, 18, 2);
cyanLight.position.set(0, PORTAL_Y, 2.4);
scene.add(cyanLight);
const violetLight = new THREE.PointLight(0x9a4dff, 40, 18, 2);
violetLight.position.set(0, PORTAL_Y, -2.4);
scene.add(violetLight);
const groundLight = new THREE.PointLight(0x7a6dff, 18, 12, 2);
groundLight.position.set(0, 1.0, 3.2);
scene.add(groundLight);

// ---------------------------------------------------------------- materials
const stoneMat = (seed: number, rx: number, ry: number, tint = 0xb4b0c4): THREE.MeshStandardMaterial => {
  const t = makeStoneTexture(seed, rx, ry);
  return new THREE.MeshStandardMaterial({ map: t, bumpMap: t, bumpScale: 1.2, color: tint, roughness: 0.92, metalness: 0.02 });
};
const platformMat = stoneMat(3, 4, 1, 0xa7a3ba);
const platformTopMat = stoneMat(4, 3, 3, 0x9a96b0);
const ringMat = stoneMat(5, 1, 1, 0xa09cb8);
const pillarMat = stoneMat(6, 1, 2, 0x9c98ae);
const groundMat = stoneMat(7, 40, 40, 0x4a4558);

// ---------------------------------------------------------------- ground & platform
const ground = new THREE.Mesh(new THREE.CircleGeometry(70, 48), groundMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const step = new THREE.Mesh(new THREE.CylinderGeometry(5.9, 6.1, 0.2, 40), platformMat);
step.position.y = 0.1;
step.receiveShadow = true;
step.castShadow = true;
scene.add(step);

const platform = new THREE.Mesh(
  new THREE.CylinderGeometry(5, 5.15, 0.4, 40),
  [platformMat, platformTopMat, platformTopMat],
);
platform.position.y = 0.2;
platform.receiveShadow = true;
platform.castShadow = true;
scene.add(platform);

const circleTex = makeCircleTexture();
const circleMat = new THREE.MeshBasicMaterial({
  map: circleTex,
  color: new THREE.Color(0.3, 0.9, 1.2),
  transparent: true,
  opacity: 0.5,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  fog: false,
});
const circle = new THREE.Mesh(new THREE.PlaneGeometry(8.6, 8.6), circleMat);
circle.rotation.x = -Math.PI / 2;
circle.position.y = 0.41;
scene.add(circle);

// ---------------------------------------------------------------- portal ring
const ringGroup = new THREE.Group();
ringGroup.position.set(0, PORTAL_Y, 0);
scene.add(ringGroup);

const runeMats: THREE.MeshBasicMaterial[] = [];
for (let i = 0; i < 4; i++) {
  runeMats.push(
    new THREE.MeshBasicMaterial({
      map: makeRuneTexture(11 + i * 5),
      color: new THREE.Color(0.35, 1.2, 1.6),
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    }),
  );
}
{
  const rnd = mulberry32(42);
  const N = 16;
  const tang = (2 * Math.PI * RING_R) / N;
  const runeGeo = new THREE.PlaneGeometry(0.46, 0.46);
  for (let i = 0; i < N; i++) {
    const th = (i / N) * Math.PI * 2 + Math.PI / 2;
    const radial = 0.56 + rnd() * 0.1;
    const depth = 0.85 + rnd() * 0.1;
    const block = new THREE.Mesh(new THREE.BoxGeometry(tang * 0.97, radial, depth), ringMat);
    block.position.set(Math.cos(th) * RING_R, Math.sin(th) * RING_R, (rnd() - 0.5) * 0.06);
    block.rotation.z = th - Math.PI / 2 + (rnd() - 0.5) * 0.03;
    block.castShadow = true;
    block.receiveShadow = true;
    ringGroup.add(block);
    const rune = new THREE.Mesh(runeGeo, runeMats[i % runeMats.length]);
    rune.position.z = depth / 2 + 0.004;
    block.add(rune);
    const runeBack = new THREE.Mesh(runeGeo, runeMats[(i + 1) % runeMats.length]);
    runeBack.position.z = -depth / 2 - 0.004;
    runeBack.rotation.y = Math.PI;
    block.add(runeBack);
  }
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.5, 1.5), ringMat);
  plinth.position.set(0, 0.55 - PORTAL_Y + 0.05, 0);
  plinth.castShadow = true;
  plinth.receiveShadow = true;
  ringGroup.add(plinth);
}

const innerRingMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 2.2, 2.8), fog: false });
const innerRing = new THREE.Mesh(new THREE.TorusGeometry(2.02, 0.045, 10, 96), innerRingMat);
ringGroup.add(innerRing);

const discMat = new THREE.ShaderMaterial({
  side: THREE.DoubleSide,
  fog: false,
  uniforms: { uTime: { value: 0 }, uPulse: { value: 1 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `
    uniform float uTime; uniform float uPulse; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p){
      vec2 i = floor(p), f = fract(p);
      f = f*f*(3.0-2.0*f);
      return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y);
    }
    float fbm(vec2 p){ float v = 0.0, a = 0.5; for(int i=0;i<4;i++){ v += a*noise(p); p = p*2.03 + 7.1; a *= 0.5; } return v; }
    void main(){
      vec2 p = (vUv - 0.5) * 2.0;
      float r = length(p);
      float a = atan(p.y, p.x);
      float t = uTime;
      float twist = t * 0.55 + 3.2 * pow(1.0 - min(r,1.0), 1.4) * 2.0;
      float s = cos(twist), c = sin(twist);
      vec2 q = mat2(s, -c, c, s) * p;
      float arms = sin(a * 3.0 + log(r + 0.03) * 6.0 - t * 1.6);
      float arms2 = sin(a * 5.0 - log(r + 0.05) * 9.0 + t * 1.1);
      float turb = fbm(q * 3.0 + vec2(0.0, t * 0.25));
      float band = 0.5 + 0.5 * arms + 0.35 * (turb - 0.5);
      float streak = smoothstep(0.55, 1.0, 0.5 + 0.5 * arms2) * 0.5;
      vec3 cyan = vec3(0.10, 0.80, 1.00);
      vec3 violet = vec3(0.50, 0.14, 1.00);
      vec3 col = mix(violet, cyan, smoothstep(0.25, 0.85, band));
      col *= 0.55 + 0.9 * turb;
      col += streak * vec3(0.3, 0.8, 1.0);
      float core = exp(-r * r * 22.0);
      float halo = exp(-r * 4.0);
      col += vec3(0.5, 0.35, 1.0) * halo * 0.9;
      col = mix(col, vec3(2.6, 2.6, 3.2), core);
      float edge = smoothstep(0.7, 1.0, r);
      col += vec3(0.1, 0.7, 1.0) * edge * 1.1;
      col *= uPulse * (0.95 + 0.15 * sin(t * 2.0 + r * 6.0));
      gl_FragColor = vec4(col, 1.0);
    }`,
});
const disc = new THREE.Mesh(new THREE.CircleGeometry(2.06, 96), discMat);
disc.position.copy(ringGroup.position);
// CircleGeometry uv spans 0..1 over the bounding square, as expected.
scene.add(disc);

const glowTex = makeGlowTexture();
const halo = new THREE.Sprite(
  new THREE.SpriteMaterial({
    map: glowTex,
    color: new THREE.Color(0.3, 0.55, 1.0),
    transparent: true,
    opacity: 0.4,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
  }),
);
halo.scale.set(11, 11, 1);
halo.position.set(0, PORTAL_Y, -0.6);
scene.add(halo);

// ---------------------------------------------------------------- ruins
function makePillar(x: number, z: number, h: number, broken: boolean, seed: number): THREE.Group {
  const g = new THREE.Group();
  const rnd = mulberry32(seed);
  const r = 0.42 + rnd() * 0.1;
  const base = new THREE.Mesh(new THREE.BoxGeometry(r * 2.8, 0.35, r * 2.8), pillarMat);
  base.position.y = 0.175;
  g.add(base);
  const geo = new THREE.CylinderGeometry(r * 0.88, r, h, 12, 4);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  if (broken) {
    for (let i = 0; i < pos.count; i++) {
      if (pos.getY(i) > h / 2 - 1e-4) {
        const px = pos.getX(i);
        const pz = pos.getZ(i);
        const hv = Math.abs(Math.sin(px * 12.9898 + pz * 78.233 + seed) * 43758.5453) % 1;
        const slope = (px * 0.8 + pz * 0.3) / r;
        pos.setY(i, pos.getY(i) - hv * 0.35 - Math.max(0, slope) * 0.5);
      }
    }
    geo.computeVertexNormals();
  }
  const shaft = new THREE.Mesh(geo, pillarMat);
  shaft.position.y = 0.35 + h / 2;
  shaft.castShadow = true;
  shaft.receiveShadow = true;
  g.add(shaft);
  base.castShadow = true;
  base.receiveShadow = true;
  if (!broken) {
    const cap = new THREE.Mesh(new THREE.BoxGeometry(r * 2.7, 0.3, r * 2.7), pillarMat);
    cap.position.y = 0.35 + h + 0.15;
    cap.castShadow = true;
    cap.receiveShadow = true;
    g.add(cap);
  }
  g.position.set(x, 0, z);
  g.rotation.y = rnd() * Math.PI;
  return g;
}

const pillarDefs: [number, number, number, boolean][] = [
  [-5.6, -1.2, 5.6, false],
  [5.9, -2.2, 3.4, true],
  [-7.2, 3.4, 2.4, true],
  [7.4, 3.6, 4.4, true],
  [-3.6, -6.2, 3.2, true],
  [4.0, -6.8, 5.0, false],
  [-9.5, -4.5, 3.8, true],
  [10.0, -0.5, 2.0, true],
];
pillarDefs.forEach(([x, z, h, b], i) => {
  const p = makePillar(x, z, h, b, 100 + i);
  const onPlatform = Math.hypot(x, z) < 6.2;
  if (onPlatform) p.position.y = 0.4;
  scene.add(p);
});

// fallen drums & rubble
{
  const rnd = mulberry32(7);
  const drumGeo = new THREE.CylinderGeometry(0.42, 0.42, 1.2, 12);
  const drums: [number, number, number][] = [
    [3.2, 4.6, 0.6],
    [-4.4, 4.9, -0.4],
    [6.8, 0.6, 1.9],
    [-6.0, -4.0, 0.3],
  ];
  for (const [x, z, ry] of drums) {
    const m = new THREE.Mesh(drumGeo, pillarMat);
    m.rotation.set(0, ry, Math.PI / 2);
    m.position.set(x, 0.42, z);
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
  }
  const rubbleGeo = new THREE.BoxGeometry(1, 1, 1);
  for (let i = 0; i < 34; i++) {
    const a = rnd() * Math.PI * 2;
    const d = 3.6 + rnd() * 6.5;
    const s = 0.15 + rnd() * 0.4;
    const m = new THREE.Mesh(rubbleGeo, pillarMat);
    m.scale.set(s * (0.8 + rnd() * 0.8), s * 0.7, s * (0.8 + rnd() * 0.8));
    const onPlat = d < 5;
    m.position.set(Math.cos(a) * d, (onPlat ? 0.4 : d < 6 ? 0.2 : 0) + s * 0.3, Math.sin(a) * d);
    m.rotation.set(rnd() * 0.5, rnd() * 3, rnd() * 0.5);
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
  }
}

// ---------------------------------------------------------------- haze
const hazeSprites: { s: THREE.Sprite; base: THREE.Vector3; ph: number }[] = [];
{
  const rnd = mulberry32(5);
  for (let i = 0; i < 9; i++) {
    const mat = new THREE.SpriteMaterial({
      map: glowTex,
      color: i % 2 ? new THREE.Color(0.35, 0.25, 0.7) : new THREE.Color(0.2, 0.4, 0.65),
      transparent: true,
      opacity: 0.16,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    const s = new THREE.Sprite(mat);
    const a = (i / 9) * Math.PI * 2 + rnd();
    const d = 2 + rnd() * 6;
    const base = new THREE.Vector3(Math.cos(a) * d, 0.9 + rnd() * 1.2, Math.sin(a) * d);
    s.position.copy(base);
    const sc = 7 + rnd() * 5;
    s.scale.set(sc, sc * 0.5, 1);
    scene.add(s);
    hazeSprites.push({ s, base, ph: rnd() * 6.28 });
  }
}

// ---------------------------------------------------------------- particles
const particles = new PortalParticles(new THREE.Vector3(0, PORTAL_Y, 0), H, FOV);
scene.add(particles.points);

// ---------------------------------------------------------------- post-processing
const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(1);
composer.setSize(W, H);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 1.0, 0.85, 0.7);
composer.addPass(bloom);
composer.addPass(new OutputPass());
composer.addPass(
  new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uTime: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `
      uniform sampler2D tDiffuse; uniform float uTime; varying vec2 vUv;
      void main(){
        vec4 c = texture2D(tDiffuse, vUv);
        vec2 d = vUv - 0.5;
        float v = smoothstep(0.85, 0.2, length(d * vec2(1.1, 1.3)));
        c.rgb *= mix(0.45, 1.0, v);
        c.rgb = pow(c.rgb, vec3(1.06));
        float n = fract(sin(dot(vUv * 640.0 + uTime, vec2(12.9898, 78.233))) * 43758.5453);
        c.rgb += (n - 0.5) * 0.015;
        gl_FragColor = c;
      }`,
  }),
);

// ---------------------------------------------------------------- loop
window.__TASK_STATE__ = { portalActive: true, particleCount: PARTICLE_TOTAL, time: 0 };

const startMs = performance.now();
let lastT = 0;
let readySet = false;
const lookTarget = new THREE.Vector3(0, 2.3, 0);

function frame(): void {
  const t = (performance.now() - startMs) / 1000;
  const dt = Math.min(0.05, Math.max(0, t - lastT));
  lastT = t;

  const pulse = 0.5 + 0.5 * Math.sin(t * 1.1);
  const k = 0.7 + 0.5 * pulse;
  cyanLight.intensity = 40 * k;
  violetLight.intensity = 40 * (1.2 - 0.5 * pulse);
  groundLight.intensity = 18 * k;
  discMat.uniforms.uTime.value = t;
  discMat.uniforms.uPulse.value = 0.9 + 0.2 * pulse;
  innerRingMat.color.setRGB(0.5 * (0.8 + 0.4 * pulse) * 1.2, 2.2 * (0.8 + 0.4 * pulse), 2.8 * (0.8 + 0.4 * pulse));
  circleMat.opacity = 0.3 + 0.3 * pulse;
  (halo.material as THREE.SpriteMaterial).opacity = 0.3 + 0.2 * pulse;
  runeMats.forEach((m, i) => {
    m.opacity = 0.55 + 0.4 * (0.5 + 0.5 * Math.sin(t * 1.1 - i * 0.7));
  });
  for (const h of hazeSprites) {
    h.s.position.set(
      h.base.x + Math.sin(t * 0.15 + h.ph) * 0.9,
      h.base.y + Math.sin(t * 0.2 + h.ph) * 0.15,
      h.base.z + Math.cos(t * 0.13 + h.ph) * 0.9,
    );
  }

  particles.update(dt, t);

  const ang = 0.5 * Math.sin(t * 0.13);
  const radius = 11.5 + 0.8 * Math.sin(t * 0.09);
  camera.position.set(Math.sin(ang) * radius, 3.2 + 0.4 * Math.sin(t * 0.21), Math.cos(ang) * radius);
  camera.lookAt(lookTarget);

  composer.render(dt);

  const state = window.__TASK_STATE__;
  if (state) {
    state.portalActive = true;
    state.particleCount = particles.liveCount;
    state.time = t;
  }
  if (!readySet) {
    readySet = true;
    window.__EVAL_READY__ = true;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
