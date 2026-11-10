import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

declare global {
  interface Window {
    __TASK_STATE__?: { portalActive: boolean; particleCount: number; time: number };
    __EVAL_READY__?: boolean;
  }
}

const W = 640;
const H = 360;
const canvas = document.getElementById('app') as HTMLCanvasElement;

// ---------- deterministic rng ----------
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(1337);
const rr = (a: number, b: number) => a + (b - a) * rnd();

// ---------- renderer ----------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
const FOG_COLOR = new THREE.Color(0x1b1331);
scene.fog = new THREE.FogExp2(FOG_COLOR, 0.04);

const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 200);

// ---------- procedural stone texture ----------
function makeStoneTexture(seed: number, tint: [number, number, number]): THREE.CanvasTexture {
  const size = 256;
  const r = mulberry32(seed);
  const grid = 32;
  const lattice = new Float32Array(grid * grid);
  for (let i = 0; i < lattice.length; i++) lattice[i] = r();
  const noise = (x: number, y: number, period: number): number => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const sx = xf * xf * (3 - 2 * xf);
    const sy = yf * yf * (3 - 2 * yf);
    const g = (ix: number, iy: number) => lattice[(((iy % period) + period) % period) * grid + (((ix % period) + period) % period)];
    const a = g(xi, yi) + (g(xi + 1, yi) - g(xi, yi)) * sx;
    const b = g(xi, yi + 1) + (g(xi + 1, yi + 1) - g(xi, yi + 1)) * sx;
    return a + (b - a) * sy;
  };
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d') as CanvasRenderingContext2D;
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let v = 0;
      let amp = 0.5;
      let per = 4;
      for (let o = 0; o < 5; o++) {
        v += amp * noise((x / size) * per, (y / size) * per, per);
        amp *= 0.55;
        per *= 2;
      }
      v = Math.min(1, Math.max(0, v * 1.15));
      // mortar/crack lines
      const bx = (x / size) * 4;
      const by = (y / size) * 4 + (Math.floor(bx) % 2) * 0.5;
      const fx = Math.abs(bx - Math.round(bx));
      const fy = Math.abs(by - Math.round(by));
      const crack = Math.min(fx, fy) < 0.012 ? 0.55 : 1;
      const l = (0.35 + v * 0.6) * crack;
      const i = (y * size + x) * 4;
      img.data[i] = Math.min(255, l * tint[0] * 255);
      img.data[i + 1] = Math.min(255, l * tint[1] * 255);
      img.data[i + 2] = Math.min(255, l * tint[2] * 255);
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

const stoneTex = makeStoneTexture(7, [0.62, 0.6, 0.68]);
const mossTex = makeStoneTexture(21, [0.5, 0.58, 0.55]);

function stoneMat(tex: THREE.CanvasTexture, rx: number, ry: number, color = 0xffffff): THREE.MeshStandardMaterial {
  const t = tex.clone();
  t.repeat.set(rx, ry);
  t.needsUpdate = true;
  return new THREE.MeshStandardMaterial({ map: t, bumpMap: t, bumpScale: 3, color, roughness: 0.92, metalness: 0.02 });
}

// ---------- sky ----------
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(90, 32, 16),
  new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
    fragmentShader: `
      varying vec3 vP;
      void main(){
        float h = normalize(vP).y;
        vec3 top = vec3(0.02,0.015,0.07);
        vec3 mid = vec3(0.16,0.07,0.26);
        vec3 hor = vec3(0.75,0.28,0.30);
        vec3 c = mix(hor, mid, smoothstep(-0.02,0.22,h));
        c = mix(c, top, smoothstep(0.18,0.8,h));
        c = mix(c, vec3(0.05,0.03,0.10), smoothstep(0.0,-0.15,h));
        gl_FragColor = vec4(c*0.8,1.0);
      }`,
  }),
);
scene.add(sky);

const starGeo = new THREE.BufferGeometry();
{
  const n = 260;
  const p = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const th = rnd() * Math.PI * 2;
    const ph = Math.acos(1 - rnd() * 0.85);
    p[i * 3] = 80 * Math.sin(ph) * Math.cos(th);
    p[i * 3 + 1] = 80 * Math.cos(ph) * 0.9 + 6;
    p[i * 3 + 2] = 80 * Math.sin(ph) * Math.sin(th);
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(p, 3));
}
scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xbfc4ff, size: 1.3, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.7 })));

// ---------- ground & platform ----------
const ground = new THREE.Mesh(new THREE.CircleGeometry(60, 48), stoneMat(mossTex, 24, 24, 0x6a6a78));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const platform = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 5.5, 0.5, 48), stoneMat(stoneTex, 6, 1));
platform.position.y = 0.25;
platform.receiveShadow = true;
platform.castShadow = true;
scene.add(platform);

const step = new THREE.Mesh(new THREE.CylinderGeometry(3.9, 4.1, 0.3, 40), stoneMat(stoneTex, 5, 1));
step.position.y = 0.65;
step.receiveShadow = true;
step.castShadow = true;
scene.add(step);
const PLAT_TOP = 0.8;

const runeCircleMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 0.2, 1.2), fog: false });
const runeCircle = new THREE.Mesh(new THREE.RingGeometry(3.15, 3.23, 96), runeCircleMat);
runeCircle.rotation.x = -Math.PI / 2;
runeCircle.position.y = PLAT_TOP + 0.01;
scene.add(runeCircle);
const runeCircle2 = new THREE.Mesh(new THREE.RingGeometry(2.7, 2.73, 96), runeCircleMat);
runeCircle2.rotation.x = -Math.PI / 2;
runeCircle2.position.y = PLAT_TOP + 0.01;
scene.add(runeCircle2);

// ---------- portal ring ----------
const portal = new THREE.Group();
const CENTER_Y = PLAT_TOP + 2.3;
portal.position.set(0, CENTER_Y, 0);
scene.add(portal);

const ringMat = stoneMat(stoneTex, 1, 1, 0xb8b4c8);
const runeMats: THREE.MeshBasicMaterial[] = [];
const BLOCKS = 16;
const RING_R = 2.3;
for (let i = 0; i < BLOCKS; i++) {
  const th = (i / BLOCKS) * Math.PI * 2;
  const depth = rr(0.75, 0.9);
  const thick = rr(0.55, 0.65);
  const g = new THREE.BoxGeometry(0.93, thick, depth);
  const m = new THREE.Mesh(g, ringMat);
  const rad = RING_R + (thick - 0.6) * 0.5;
  m.position.set(Math.cos(th) * rad, Math.sin(th) * rad, rr(-0.03, 0.03));
  m.rotation.z = th + Math.PI / 2 + rr(-0.012, 0.012);
  m.castShadow = true;
  m.receiveShadow = true;
  portal.add(m);
  // rune on front and back faces
  if (i % 2 === 0) {
    const rm = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 1.2, 1.6), fog: false });
    runeMats.push(rm);
    for (const s of [1, -1]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.07, thick * 0.55, 0.02), rm);
      bar.position.set(0, 0, s * (depth / 2 + 0.005));
      m.add(bar);
      const bar2 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.02), rm);
      bar2.position.set(0.0, thick * 0.12, s * (depth / 2 + 0.005));
      bar2.rotation.z = 0.5 * (i % 4 === 0 ? 1 : -1);
      m.add(bar2);
    }
  }
}
const rimMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 1.6, 2.2), fog: false });
portal.add(new THREE.Mesh(new THREE.TorusGeometry(2.0, 0.035, 8, 128), rimMat));

// base feet for the ring
for (const sx of [-1, 1]) {
  const foot = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.5, 1.1), stoneMat(stoneTex, 1, 1, 0xa8a4b8));
  foot.position.set(sx * 0.9, PLAT_TOP + 0.2, 0);
  foot.castShadow = true;
  foot.receiveShadow = true;
  scene.add(foot);
}

// vortex disc
const vortexMat = new THREE.ShaderMaterial({
  uniforms: { uTime: { value: 0 }, uPulse: { value: 0 } },
  side: THREE.DoubleSide,
  fog: false,
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
  fragmentShader: `
    varying vec2 vUv;
    uniform float uTime;
    uniform float uPulse;
    void main(){
      vec2 p = vUv*2.0-1.0;
      float r = length(p);
      float a = atan(p.y, p.x);
      float t = uTime;
      float wob = 0.7*sin(r*8.0 - t*1.4 + a*2.0);
      float s1 = a*3.0 + r*8.0 - t*2.2 + wob;
      float band = pow(0.5+0.5*sin(s1), 1.4);
      float s2 = a*5.0 - r*14.0 + t*1.6 + 0.5*sin(a*3.0 + t);
      float band2 = pow(0.5+0.5*sin(s2), 3.0);
      vec3 violet = vec3(0.50,0.10,1.10);
      vec3 cyan = vec3(0.08,0.95,1.35);
      vec3 col = mix(violet, cyan, band);
      col += band2*vec3(0.35,0.55,0.9)*(0.4+r);
      col *= 0.55 + 0.65*smoothstep(0.0,0.9,r);
      float core = exp(-r*r*16.0);
      col += vec3(1.0,0.92,1.0)*core*(2.6+0.8*uPulse);
      col += vec3(0.1,0.6,0.9)*smoothstep(0.72,1.0,r)*1.1;
      gl_FragColor = vec4(col*(1.0+0.15*uPulse), 1.0);
    }`,
});
const disc = new THREE.Mesh(new THREE.CircleGeometry(2.1, 96), vortexMat);
portal.add(disc);

// glow halo sprite
function radialTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d') as CanvasRenderingContext2D;
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const radTex = radialTexture();
const haloMat = new THREE.SpriteMaterial({
  map: radTex,
  color: new THREE.Color(0.25, 0.55, 1.0),
  blending: THREE.AdditiveBlending,
  transparent: true,
  opacity: 0.55,
  depthWrite: false,
  fog: false,
});
const halo = new THREE.Sprite(haloMat);
halo.scale.set(8.5, 8.5, 1);
halo.position.set(0, 0, -0.1);
portal.add(halo);

// ---------- ruins ----------
const pillarMat = stoneMat(stoneTex, 2, 3, 0xa8a4b4);
function addPillar(x: number, z: number, h: number, broken: boolean, tilt = 0): void {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.52, h, 10), pillarMat);
  body.position.y = h / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.3, 1.3), pillarMat);
  base.position.y = 0.15;
  base.castShadow = true;
  base.receiveShadow = true;
  g.add(base);
  if (broken) {
    const chunk = new THREE.Mesh(new THREE.DodecahedronGeometry(0.4, 0), pillarMat);
    chunk.position.set(0.15, h + 0.05, -0.05);
    chunk.scale.set(1, 0.5, 1);
    chunk.rotation.set(rr(0, 3), rr(0, 3), rr(0, 3));
    g.add(chunk);
  } else {
    const cap = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.3, 1.15), pillarMat);
    cap.position.y = h + 0.15;
    cap.castShadow = true;
    g.add(cap);
  }
  g.position.set(x, 0, z);
  g.rotation.z = tilt;
  scene.add(g);
}
addPillar(-6.2, 1.5, 4.6, false);
addPillar(6.4, -0.5, 3.0, true, 0.03);
addPillar(-4.6, -5.0, 3.8, true);
addPillar(4.8, -5.8, 5.2, false, -0.02);
addPillar(7.5, 4.5, 2.0, true);
addPillar(-8.5, -2.5, 2.4, true);

// fallen pillar and rubble
{
  const fp = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 3.4, 10), pillarMat);
  fp.rotation.z = Math.PI / 2;
  fp.rotation.y = 0.5;
  fp.position.set(3.4, 0.45, 5.4);
  fp.castShadow = true;
  fp.receiveShadow = true;
  scene.add(fp);
  const rockMat = stoneMat(mossTex, 1, 1, 0x9a98a8);
  for (let i = 0; i < 26; i++) {
    const a = rnd() * Math.PI * 2;
    const d = rr(5.8, 13);
    const s = rr(0.15, 0.6);
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), rockMat);
    rock.position.set(Math.cos(a) * d, s * 0.35, Math.sin(a) * d);
    rock.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
    rock.scale.y = 0.65;
    rock.castShadow = true;
    rock.receiveShadow = true;
    scene.add(rock);
  }
  // a broken arch lintel resting on two pillars at the back
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.5, 1.0), pillarMat);
  lintel.position.set(0.0, 5.55, -5.4);
  lintel.rotation.z = 0.05;
  lintel.castShadow = true;
  lintel.receiveShadow = true;
  scene.add(lintel);
}
addPillar(-2.6, -5.4, 5.3, false);
addPillar(2.6, -5.4, 5.3, false);

// ---------- lights ----------
scene.add(new THREE.HemisphereLight(0x5a4a95, 0x1a1226, 0.7));
const dusk = new THREE.DirectionalLight(0xff9a78, 0.9);
dusk.position.set(-14, 7, 10);
dusk.castShadow = true;
dusk.shadow.mapSize.set(1024, 1024);
dusk.shadow.camera.left = -14;
dusk.shadow.camera.right = 14;
dusk.shadow.camera.top = 14;
dusk.shadow.camera.bottom = -14;
dusk.shadow.camera.near = 1;
dusk.shadow.camera.far = 45;
dusk.shadow.bias = -0.0005;
scene.add(dusk);
const moon = new THREE.DirectionalLight(0x6f7fd0, 0.45);
moon.position.set(10, 12, -8);
scene.add(moon);

const lightFront = new THREE.PointLight(0x3fd8ff, 60, 22, 1.6);
lightFront.position.set(0, CENTER_Y, 1.6);
scene.add(lightFront);
const lightBack = new THREE.PointLight(0x8a4cff, 50, 20, 1.6);
lightBack.position.set(0, CENTER_Y, -1.6);
scene.add(lightBack);
const lightGround = new THREE.PointLight(0x6a6cff, 30, 14, 1.6);
lightGround.position.set(0, PLAT_TOP + 0.7, 1.2);
scene.add(lightGround);

// ---------- haze sprites ----------
const hazeSprites: { s: THREE.Sprite; baseX: number; baseZ: number; ph: number }[] = [];
for (let i = 0; i < 12; i++) {
  const m = new THREE.SpriteMaterial({
    map: radTex,
    color: i % 3 === 0 ? 0x4a3a8a : 0x3a2a60,
    transparent: true,
    opacity: rr(0.12, 0.22),
    depthWrite: false,
  });
  const s = new THREE.Sprite(m);
  const a = rnd() * Math.PI * 2;
  const d = rr(2, 11);
  s.position.set(Math.cos(a) * d, rr(0.5, 1.4), Math.sin(a) * d);
  const sc = rr(6, 11);
  s.scale.set(sc, sc * 0.45, 1);
  scene.add(s);
  hazeSprites.push({ s, baseX: s.position.x, baseZ: s.position.z, ph: rnd() * 10 });
}

// ---------- particles ----------
const SPIRAL = 620;
const MOTES = 220;
const N = SPIRAL + MOTES;
const pos = new Float32Array(N * 3);
const col = new Float32Array(N * 3);
const siz = new Float32Array(N);
const alp = new Float32Array(N);
// state
const age = new Float32Array(N);
const life = new Float32Array(N);
const p0 = new Float32Array(N); // spiral: start angle / mote: start x
const p1 = new Float32Array(N); // spiral: start radius / mote: start z
const p2 = new Float32Array(N); // spiral: z offset / mote: rise speed
const p3 = new Float32Array(N); // spiral: omega / mote: sway amp
const p4 = new Float32Array(N); // base size
const p5 = new Float32Array(N); // mote tint

function spawn(i: number, initial: boolean): void {
  if (i < SPIRAL) {
    life[i] = rr(3.5, 7);
    age[i] = initial ? rnd() * life[i] : 0;
    p0[i] = rnd() * Math.PI * 2;
    p1[i] = rr(2.4, 5.2);
    p2[i] = rr(-2.2, 2.2);
    p3[i] = rr(4, 8) * (rnd() < 0.9 ? 1 : -0.6);
    p4[i] = rr(0.04, 0.1);
    p5[i] = rnd();
  } else {
    life[i] = rr(4, 8);
    age[i] = initial ? rnd() * life[i] : 0;
    const a = rnd() * Math.PI * 2;
    const d = Math.sqrt(rnd()) * 4.6;
    p0[i] = Math.cos(a) * d;
    p1[i] = Math.sin(a) * d;
    p2[i] = rr(0.3, 0.8);
    p3[i] = rr(0.1, 0.35);
    p4[i] = rr(0.04, 0.09);
    p5[i] = rnd();
  }
}
for (let i = 0; i < N; i++) spawn(i, true);

const pGeo = new THREE.BufferGeometry();
pGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
pGeo.setAttribute('aColor', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
pGeo.setAttribute('aSize', new THREE.BufferAttribute(siz, 1).setUsage(THREE.DynamicDrawUsage));
pGeo.setAttribute('aAlpha', new THREE.BufferAttribute(alp, 1).setUsage(THREE.DynamicDrawUsage));
const pMat = new THREE.ShaderMaterial({
  uniforms: { uScale: { value: H / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) } },
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  vertexShader: `
    attribute vec3 aColor; attribute float aSize; attribute float aAlpha;
    uniform float uScale;
    varying vec3 vC; varying float vA;
    void main(){
      vC = aColor; vA = aAlpha;
      vec4 mv = modelViewMatrix*vec4(position,1.0);
      gl_PointSize = max(2.0, aSize*uScale/-mv.z);
      gl_Position = projectionMatrix*mv;
    }`,
  fragmentShader: `
    varying vec3 vC; varying float vA;
    void main(){
      float d = length(gl_PointCoord-0.5)*2.0;
      float a = clamp(1.0-d,0.0,1.0);
      a = a*a;
      gl_FragColor = vec4(vC*1.8, a*vA);
    }`,
});
const points = new THREE.Points(pGeo, pMat);
points.frustumCulled = false;
scene.add(points);

const cCyan = new THREE.Color(0.2, 0.95, 1.2);
const cViolet = new THREE.Color(0.65, 0.3, 1.2);
const cWhite = new THREE.Color(1.1, 1.0, 1.3);
const tmpC = new THREE.Color();
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function updateParticles(dt: number, time: number): number {
  let live = 0;
  for (let i = 0; i < N; i++) {
    age[i] += dt;
    if (age[i] >= life[i]) spawn(i, false);
    const t = age[i] / life[i];
    let x: number, y: number, z: number, a: number;
    if (i < SPIRAL) {
      const k = 1 - t;
      const r = 0.15 + p1[i] * Math.pow(k, 1.5);
      const ang = p0[i] + p3[i] * t * (1 + t) + time * 0.15;
      x = Math.cos(ang) * r;
      y = CENTER_Y + Math.sin(ang) * r;
      z = p2[i] * Math.pow(k, 1.3);
      a = smooth(0, 0.1, t) * (1 - smooth(0.88, 1, t));
      if (t < 0.5) tmpC.copy(cCyan).lerp(cViolet, t * 2);
      else tmpC.copy(cViolet).lerp(cWhite, (t - 0.5) * 2);
      if (p5[i] > 0.7) tmpC.lerp(cCyan, 0.5);
      siz[i] = p4[i] * (0.8 + 0.8 * t);
    } else {
      const age_ = age[i];
      x = p0[i] + Math.sin(age_ * 0.9 + p5[i] * 6) * p3[i];
      z = p1[i] + Math.cos(age_ * 0.7 + p5[i] * 6) * p3[i];
      y = PLAT_TOP + 0.05 + p2[i] * age_;
      a = Math.sin(Math.PI * t);
      a = a * a * 0.9;
      if (p5[i] < 0.5) tmpC.copy(cCyan).lerp(cWhite, 0.3);
      else tmpC.copy(cViolet).lerp(cWhite, 0.2);
      siz[i] = p4[i];
    }
    pos[i * 3] = x;
    pos[i * 3 + 1] = y;
    pos[i * 3 + 2] = z;
    col[i * 3] = tmpC.r;
    col[i * 3 + 1] = tmpC.g;
    col[i * 3 + 2] = tmpC.b;
    alp[i] = a;
    if (age[i] < life[i]) live++;
  }
  (pGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  (pGeo.attributes.aColor as THREE.BufferAttribute).needsUpdate = true;
  (pGeo.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;
  (pGeo.attributes.aAlpha as THREE.BufferAttribute).needsUpdate = true;
  return live;
}

// ---------- post processing ----------
const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(1);
composer.setSize(W, H);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 1.0, 0.75, 0.7);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// ---------- open/close control ----------
let portalActive = true;
const toggleBtn = document.createElement('button');
toggleBtn.id = 'portal-toggle';
toggleBtn.type = 'button';
toggleBtn.textContent = 'Close portal';
toggleBtn.style.cssText = 'display:block;margin:8px;padding:6px 14px;font:inherit;cursor:pointer;';
canvas.insertAdjacentElement('afterend', toggleBtn);
toggleBtn.addEventListener('click', () => {
  portalActive = !portalActive;
  toggleBtn.textContent = portalActive ? 'Close portal' : 'Open portal';
  disc.visible = portalActive;
  halo.visible = portalActive;
  rimMat.visible = portalActive;
  points.visible = portalActive;
  if (portalActive) for (let i = 0; i < N; i++) spawn(i, true);
  if (window.__TASK_STATE__) {
    window.__TASK_STATE__.portalActive = portalActive;
    if (!portalActive) window.__TASK_STATE__.particleCount = 0;
  }
});

// ---------- loop ----------
const clock = new THREE.Clock();
let elapsed = 0;
let first = true;
const lookTarget = new THREE.Vector3(0, CENTER_Y - 0.3, 0);

function frame(): void {
  const dt = Math.min(clock.getDelta(), 0.05);
  elapsed += dt;
  const t = elapsed;

  const pulse = 0.5 + 0.5 * Math.sin(t * 0.9);
  vortexMat.uniforms.uTime.value = t;
  vortexMat.uniforms.uPulse.value = pulse;
  const on = portalActive ? 1 : 0.04;
  lightFront.intensity = (45 + 40 * pulse) * on;
  lightBack.intensity = (40 + 35 * (1 - pulse)) * on;
  lightGround.intensity = (22 + 18 * pulse) * on;
  lightFront.color.setHSL(0.52 + 0.04 * Math.sin(t * 0.4), 1, 0.6);
  lightBack.color.setHSL(0.74 + 0.03 * Math.sin(t * 0.5), 1, 0.6);
  haloMat.opacity = 0.45 + 0.2 * pulse;
  const rg = 0.8 + 0.7 * pulse;
  runeCircleMat.color.setRGB(0.25 * rg, 0.16 * rg, 1.0 * rg);
  for (let i = 0; i < runeMats.length; i++) {
    const k = 0.7 + 0.6 * (0.5 + 0.5 * Math.sin(t * 1.3 + i * 0.7));
    runeMats[i].color.setRGB(0.2 * k, 1.1 * k, 1.5 * k);
  }
  bloom.strength = 0.95 + 0.25 * pulse;

  for (const h of hazeSprites) {
    h.s.position.x = h.baseX + Math.sin(t * 0.07 + h.ph) * 1.5;
    h.s.position.z = h.baseZ + Math.cos(t * 0.05 + h.ph) * 1.2;
  }

  const live = portalActive ? updateParticles(dt, t) : 0;

  const ang = 0.35 + Math.sin(t * 0.13) * 0.55;
  const rad = 10.5 + Math.sin(t * 0.21) * 0.6;
  camera.position.set(Math.sin(ang) * rad, 3.3 + Math.sin(t * 0.17) * 0.45, Math.cos(ang) * rad);
  camera.lookAt(lookTarget);

  composer.render();

  window.__TASK_STATE__ = { portalActive, particleCount: live, time: t };
  if (first) {
    first = false;
    window.__EVAL_READY__ = true;
  }
  requestAnimationFrame(frame);
}
window.__TASK_STATE__ = { portalActive: true, particleCount: N, time: 0 };
requestAnimationFrame(frame);
