import * as THREE from 'three';

// ---------------------------------------------------------------- utilities
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

const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

function hash2(ix: number, iz: number): number {
  const s = Math.sin(ix * 127.1 + iz * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function vnoise(x: number, z: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz);
  const b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1);
  const d = hash2(ix + 1, iz + 1);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}
function fbm(x: number, z: number): number {
  let v = 0;
  let amp = 0.5;
  let f = 1;
  for (let i = 0; i < 4; i++) {
    v += amp * vnoise(x * f + i * 17.3, z * f - i * 9.1);
    amp *= 0.5;
    f *= 2.03;
  }
  return v / 0.9375;
}

// ---------------------------------------------------------------- terrain function
const trailX = (z: number): number => 6 * Math.sin(z * 0.035) + 2 * Math.sin(z * 0.09 + 1);

const CABIN_Z = -52;
const CABIN_XP = 9;

function baseH(xp: number, z: number): number {
  const x = trailX(z) + xp;
  const ax = Math.abs(xp);
  const rise = -z * 0.2;
  const valley = (Math.sqrt(xp * xp + 16) - 4) * 0.62 + Math.max(ax - 25, 0) * 0.35;
  const r = 1 - Math.abs(2 * fbm(x * 0.012, z * 0.012) - 1);
  const peaks = smoothstep(20, 130, ax) * r * r * 75;
  const detail = (fbm(x * 0.12, z * 0.12) - 0.5) * 2.4 * smoothstep(1.6, 6, ax);
  const large = (fbm(x * 0.035, z * 0.035) - 0.5) * 10 * smoothstep(3, 28, ax);
  const endWall = smoothstep(-200, -400, z) * 80 * (0.5 + fbm(x * 0.025, z * 0.025));
  return rise + valley + peaks + detail + large + endWall;
}
const SHELF_H = baseH(CABIN_XP, CABIN_Z);
const CABIN_WX = trailX(CABIN_Z) + CABIN_XP;

function H(xp: number, z: number): number {
  const h = baseH(xp, z);
  const x = trailX(z) + xp;
  const d = Math.hypot(x - CABIN_WX, z - CABIN_Z);
  const w = 1 - smoothstep(3.8, 7.5, d);
  return h + (SHELF_H - h) * w;
}

// ---------------------------------------------------------------- renderer / scene
const canvas = document.getElementById('app') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(640, 360, false);

const FOG_COLOR = 0xc7ccd2;
const scene = new THREE.Scene();
scene.background = new THREE.Color(FOG_COLOR);
const fog = new THREE.Fog(FOG_COLOR, 10, 330);
scene.fog = fog;

const camera = new THREE.PerspectiveCamera(60, 640 / 360, 0.1, 700);
scene.add(camera);

scene.add(new THREE.HemisphereLight(0xe4eaf2, 0x8e9db4, 2.2));
const sun = new THREE.DirectionalLight(0xffffff, 0.9);
sun.position.set(-0.4, 0.8, 0.35);
scene.add(sun);

// ---------------------------------------------------------------- terrain mesh
{
  const NX = 100;
  const COLS = 2 * NX + 1;
  const ROWS = 330;
  const Z0 = 40;
  const DZ = 1.5;
  const positions = new Float32Array(COLS * ROWS * 3);
  const xps = new Float32Array(COLS * ROWS);
  for (let i = 0; i < ROWS; i++) {
    const z = Z0 - i * DZ;
    const c = trailX(z);
    for (let j = 0; j < COLS; j++) {
      const u = (j - NX) / NX;
      const xp = 160 * Math.sign(u) * u * u;
      const k = i * COLS + j;
      positions[k * 3] = c + xp;
      positions[k * 3 + 1] = H(xp, z);
      positions[k * 3 + 2] = z;
      xps[k] = xp;
    }
  }
  const idx = new Uint32Array((COLS - 1) * (ROWS - 1) * 6);
  let p = 0;
  for (let i = 0; i < ROWS - 1; i++) {
    for (let j = 0; j < COLS - 1; j++) {
      const a = i * COLS + j;
      idx[p++] = a;
      idx[p++] = a + 1;
      idx[p++] = a + COLS;
      idx[p++] = a + 1;
      idx[p++] = a + COLS + 1;
      idx[p++] = a + COLS;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  const nrm = geo.getAttribute('normal') as THREE.BufferAttribute;

  const colors = new Float32Array(COLS * ROWS * 3);
  const white = new THREE.Color(0.95, 0.97, 1.0);
  const blue = new THREE.Color(0.6, 0.69, 0.82);
  const rockA = new THREE.Color(0.17, 0.18, 0.21);
  const rockB = new THREE.Color(0.34, 0.35, 0.38);
  const trail = new THREE.Color(0.7, 0.75, 0.83);
  const col = new THREE.Color();
  const tmp = new THREE.Color();
  for (let k = 0; k < COLS * ROWS; k++) {
    const x = positions[k * 3];
    const z = positions[k * 3 + 2];
    const xp = xps[k];
    const ax = Math.abs(xp);
    const ny = nrm.getY(k);
    const n1 = fbm(x * 0.05, z * 0.05);
    const n2 = fbm(x * 0.09 + 40, z * 0.09 - 12);
    col.copy(white).lerp(blue, clamp01(n1 * 0.9 + smoothstep(0.93, 0.78, ny) * 0.6));
    // exposed rock on steep ground and in noise patches
    let rock = smoothstep(0.86, 0.72, ny + (n2 - 0.5) * 0.25);
    rock = Math.max(rock, smoothstep(0.64, 0.76, n2) * smoothstep(5, 12, ax) * 0.9);
    rock *= smoothstep(3, 8, ax);
    tmp.copy(rockA).lerp(rockB, fbm(x * 0.3, z * 0.3));
    col.lerp(tmp, clamp01(rock));
    const tr = 1 - smoothstep(1.0, 2.0, ax);
    if (tr > 0) col.lerp(trail, tr * 0.85);
    colors[k * 3] = col.r;
    colors[k * 3 + 1] = col.g;
    colors[k * 3 + 2] = col.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  scene.add(mesh);
}

// ---------------------------------------------------------------- rock outcrops
{
  const rng = mulberry32(1234);
  const geos: THREE.BufferGeometry[] = [];
  const rockDark = new THREE.Color(0.2, 0.21, 0.24);
  const rockLight = new THREE.Color(0.36, 0.37, 0.4);
  const snowTop = new THREE.Color(0.93, 0.96, 1.0);
  for (let g = 0; g < 6; g++) {
    const geo = new THREE.IcosahedronGeometry(1, 1);
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    const seed = g * 13.7;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const f = 0.7 + 0.6 * hash2(Math.round(x * 50) + seed, Math.round((y * 31 + z * 17) * 50));
      pos.setXYZ(i, x * f, y * f * 0.85, z * f);
    }
    geo.computeVertexNormals();
    const n = geo.getAttribute('normal') as THREE.BufferAttribute;
    const cols = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const ny = n.getY(i);
      c.copy(rockDark).lerp(rockLight, hash2(Math.floor(i / 3) + seed, g));
      c.lerp(snowTop, smoothstep(0.55, 0.8, ny));
      cols[i * 3] = c.r;
      cols[i * 3 + 1] = c.g;
      cols[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    geos.push(geo);
  }
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  for (let i = 0; i < 110; i++) {
    const z = 25 - rng() * 190;
    const side = rng() < 0.5 ? -1 : 1;
    const near = i < 40;
    const ax = near ? 3.8 + rng() * 14 : 12 + rng() * 60;
    const xp = side * ax;
    const wx = trailX(z) + xp;
    if (Math.hypot(wx - CABIN_WX, z - CABIN_Z) < 9) continue;
    const s = (near ? 0.7 + rng() * 1.8 : 2 + rng() * 7) * (1 + ax / 40);
    const m = new THREE.Mesh(geos[Math.floor(rng() * geos.length)], mat);
    m.scale.set(s * (0.8 + rng() * 0.8), s * (0.7 + rng() * 0.7), s * (0.8 + rng() * 0.8));
    m.position.set(wx, H(xp, z) + s * 0.1, z);
    m.rotation.y = rng() * Math.PI * 2;
    scene.add(m);
  }
}

// ---------------------------------------------------------------- wood texture
function makeWoodTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  g.fillStyle = '#74512f';
  g.fillRect(0, 0, 128, 128);
  const rng = mulberry32(77);
  for (let i = 0; i < 160; i++) {
    const y = rng() * 128;
    g.fillStyle = `rgba(${40 + rng() * 40},${25 + rng() * 25},10,${0.12 + rng() * 0.15})`;
    g.fillRect(rng() * 128, y, 20 + rng() * 80, 1 + rng() * 2);
  }
  for (let i = 0; i < 4; i++) {
    g.fillStyle = 'rgba(30,18,8,0.75)';
    g.fillRect(0, i * 32, 128, 2);
    g.fillStyle = 'rgba(160,115,70,0.35)';
    g.fillRect(0, i * 32 + 2, 128, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const woodTex = makeWoodTexture();
const wallMat = new THREE.MeshLambertMaterial({ map: woodTex });
const poleMat = new THREE.MeshLambertMaterial({ color: 0x6d4c2e });
const snowMat = new THREE.MeshLambertMaterial({ color: 0xf3f7fb });

// ---------------------------------------------------------------- trail poles
{
  const rng = mulberry32(55);
  const poleGeo = new THREE.CylinderGeometry(0.05, 0.065, 2.5, 8);
  poleGeo.translate(0, 1.25 - 0.3, 0);
  const bandGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.22, 8);
  const bandMat = new THREE.MeshLambertMaterial({ color: 0xb8362a });
  const capGeo = new THREE.SphereGeometry(0.09, 8, 6);
  capGeo.scale(1, 0.55, 1);
  for (let i = 0; i < 19; i++) {
    const z = -2 - i * 7.5;
    const xp = (i % 2 ? 1 : -1) * 1.8;
    const grp = new THREE.Group();
    grp.add(new THREE.Mesh(poleGeo, poleMat));
    const band = new THREE.Mesh(bandGeo, bandMat);
    band.position.y = 1.85;
    grp.add(band);
    const cap = new THREE.Mesh(capGeo, snowMat);
    cap.position.y = 1.97;
    grp.add(cap);
    grp.position.set(trailX(z) + xp, H(xp, z), z);
    grp.rotation.z = (rng() - 0.5) * 0.08;
    grp.rotation.x = (rng() - 0.5) * 0.08;
    scene.add(grp);
  }
}

// ---------------------------------------------------------------- cabin
let cabinLight: THREE.PointLight;
{
  const W = 4.6;
  const D = 3.4;
  const WH = 2.4;
  const a = 0.5;
  const cabin = new THREE.Group();

  const wallTexA = woodTex.clone();
  wallTexA.repeat.set(2, 0.6);
  wallTexA.needsUpdate = true;
  const walls = new THREE.Mesh(
    new THREE.BoxGeometry(W, WH, D),
    new THREE.MeshLambertMaterial({ map: wallTexA })
  );
  walls.position.y = WH / 2;
  cabin.add(walls);

  // gable triangles
  const shape = new THREE.Shape();
  shape.moveTo(-D / 2, 0);
  shape.lineTo(D / 2, 0);
  shape.lineTo(0, (D / 2) * Math.tan(a));
  shape.closePath();
  const gableGeo = new THREE.ExtrudeGeometry(shape, { depth: W - 0.05, bevelEnabled: false });
  gableGeo.translate(0, 0, -(W - 0.05) / 2);
  gableGeo.rotateY(Math.PI / 2);
  const gable = new THREE.Mesh(gableGeo, wallMat);
  gable.position.y = WH;
  cabin.add(gable);

  // roof panels with snow caps
  const s = D / 2 + 0.35;
  const L = s / Math.cos(a);
  const ridgeY = WH + (D / 2) * Math.tan(a);
  const roofWood = new THREE.MeshLambertMaterial({ color: 0x4a3322 });
  for (const sgn of [1, -1]) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(W + 0.6, 0.12, L), roofWood);
    const cy = ridgeY - (s / 2) * Math.tan(a);
    panel.position.set(0, cy, (sgn * s) / 2);
    panel.rotation.x = sgn * a;
    cabin.add(panel);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(W + 0.75, 0.26, L + 0.08), snowMat);
    const nrm = new THREE.Vector3(0, Math.cos(a), sgn * Math.sin(a));
    cap.position.copy(panel.position).addScaledVector(nrm, 0.18);
    cap.rotation.x = sgn * a;
    cabin.add(cap);
  }
  // ridge snow
  const ridge = new THREE.Mesh(new THREE.BoxGeometry(W + 0.75, 0.2, 0.5), snowMat);
  ridge.position.set(0, ridgeY + 0.22, 0);
  cabin.add(ridge);

  // chimney
  const chim = new THREE.Mesh(
    new THREE.BoxGeometry(0.55, 1.2, 0.55),
    new THREE.MeshLambertMaterial({ color: 0x3d3a3a })
  );
  chim.position.set(1.4, ridgeY + 0.1, -0.35);
  cabin.add(chim);
  const chimCap = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.14, 0.7), snowMat);
  chimCap.position.set(1.4, ridgeY + 0.75, -0.35);
  cabin.add(chimCap);

  // door
  const door = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 1.8, 0.08),
    new THREE.MeshLambertMaterial({ color: 0x3e2815 })
  );
  door.position.set(1.2, 0.9, D / 2 + 0.03);
  cabin.add(door);

  // window: frame + glowing pane
  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(1.1, 0.9, 0.08),
    new THREE.MeshLambertMaterial({ color: 0x2e1d10 })
  );
  frame.position.set(-0.9, 1.45, D / 2 + 0.03);
  cabin.add(frame);
  const pane = new THREE.Mesh(
    new THREE.PlaneGeometry(0.92, 0.72),
    new THREE.MeshBasicMaterial({ color: 0xffb54a })
  );
  pane.position.set(-0.9, 1.45, D / 2 + 0.08);
  cabin.add(pane);
  const mull = new THREE.Mesh(
    new THREE.BoxGeometry(0.05, 0.72, 0.03),
    new THREE.MeshLambertMaterial({ color: 0x2e1d10 })
  );
  mull.position.set(-0.9, 1.45, D / 2 + 0.1);
  cabin.add(mull);
  const sill = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.12, 0.3), snowMat);
  sill.position.set(-0.9, 0.95, D / 2 + 0.15);
  cabin.add(sill);

  // glow sprite
  const gc = document.createElement('canvas');
  gc.width = gc.height = 64;
  const gg = gc.getContext('2d') as CanvasRenderingContext2D;
  const grad = gg.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,190,90,0.9)');
  grad.addColorStop(0.4, 'rgba(255,160,60,0.3)');
  grad.addColorStop(1, 'rgba(255,140,40,0)');
  gg.fillStyle = grad;
  gg.fillRect(0, 0, 64, 64);
  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(gc),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    })
  );
  glow.scale.set(3.6, 3.0, 1);
  glow.position.set(-0.9, 1.45, D / 2 + 0.3);
  cabin.add(glow);

  cabinLight = new THREE.PointLight(0xffa447, 30, 20, 2);
  cabinLight.position.set(-0.9, 1.5, D / 2 + 1.0);
  cabin.add(cabinLight);

  // snow drifts around the base
  const drift = (x: number, z: number, sx: number, sz: number): void => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), snowMat);
    m.scale.set(sx, 0.45, sz);
    m.position.set(x, 0.05, z);
    cabin.add(m);
  };
  drift(0, D / 2 + 0.25, W * 0.6, 0.7);
  drift(0, -D / 2 - 0.2, W * 0.6, 0.7);
  drift(W / 2 + 0.2, 0, 0.8, D * 0.6);
  drift(-W / 2 - 0.2, 0, 0.8, D * 0.6);

  cabin.position.set(CABIN_WX, SHELF_H, CABIN_Z);
  cabin.rotation.y = -Math.PI / 2 + 0.35;
  scene.add(cabin);
}

// ---------------------------------------------------------------- blizzard particles
const VERT = /* glsl */ `
uniform vec3 uCenter;
uniform vec3 uBox;
uniform vec3 uVel;
uniform float uPhase;
uniform float uGust;
uniform float uSize;
uniform float uScale;
uniform float uAspect;
attribute vec3 aBase;
attribute vec3 aRand;
varying vec2 vDir;
varying float vAlpha;

void main() {
  float sp = 0.8 + 0.4 * aRand.x;
  vec3 w = aBase * uBox + uVel * (uPhase * sp);
  w.x += sin(uPhase * 0.6 + aRand.z * 40.0) * 0.6;
  w.y += sin(uPhase * 0.5 + aRand.x * 30.0) * 0.4;
  vec3 rel = mod(w - uCenter, uBox) - 0.5 * uBox;
  vec3 world = uCenter + rel;
  vec4 mv = viewMatrix * vec4(world, 1.0);
  vec4 clip = projectionMatrix * mv;
  gl_Position = clip;

  vec4 clip2 = projectionMatrix * (viewMatrix * vec4(world + uVel * 0.08, 1.0));
  vec2 d = clip2.xy / clip2.w - clip.xy / clip.w;
  d.x *= uAspect;
  float l = length(d);
  vDir = l > 1e-6 ? d / l : vec2(1.0, 0.0);

  vec3 e = abs(rel) / (0.5 * uBox);
  float edge = (1.0 - smoothstep(0.82, 1.0, e.x)) * (1.0 - smoothstep(0.82, 1.0, e.y)) * (1.0 - smoothstep(0.82, 1.0, e.z));
  float depth = -mv.z;
  float thr = 0.5 + 0.5 * uGust;
  float vis = 1.0 - smoothstep(thr - 0.04, thr, aRand.y);
  vAlpha = edge * vis * smoothstep(0.6, 2.5, depth) * (0.75 + 0.25 * uGust);
  float size = uSize * (0.75 + 0.5 * aRand.z) * uScale / max(depth, 0.1);
  gl_PointSize = clamp(size, 3.0, 80.0);
}
`;
const FRAG = /* glsl */ `
varying vec2 vDir;
varying float vAlpha;
void main() {
  vec2 pc = gl_PointCoord - 0.5;
  pc.y = -pc.y;
  float a = dot(pc, vDir);
  float b = dot(pc, vec2(-vDir.y, vDir.x));
  float e = (a * a) / 0.25 + (b * b) / 0.0121;
  float alpha = (1.0 - smoothstep(0.25, 1.0, e)) * vAlpha;
  if (alpha < 0.01) discard;
  gl_FragColor = vec4(0.96, 0.98, 1.0, alpha * 0.9);
}
`;

const WIND = new THREE.Vector3(-12, -5, 2.5);
const BOX = new THREE.Vector3(46, 24, 56);
const snowUniformsShared = {
  uCenter: { value: new THREE.Vector3() },
  uBox: { value: BOX },
  uVel: { value: WIND },
  uPhase: { value: 0 },
  uGust: { value: 0 },
  uScale: { value: 360 / (2 * Math.tan((60 * Math.PI) / 360)) },
  uAspect: { value: 640 / 360 },
};

function makeSnow(count: number, size: number, seed: number): THREE.Points {
  const rng = mulberry32(seed);
  const base = new Float32Array(count * 3);
  const rand = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    base[i * 3] = rng();
    base[i * 3 + 1] = rng();
    base[i * 3 + 2] = rng();
    rand[i * 3] = rng();
    rand[i * 3 + 1] = rng();
    rand[i * 3 + 2] = rng();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  geo.setAttribute('aBase', new THREE.BufferAttribute(base, 3));
  geo.setAttribute('aRand', new THREE.BufferAttribute(rand, 3));
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...snowUniformsShared, uSize: { value: size } },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return pts;
}
scene.add(makeSnow(4200, 0.26, 11)); // small flakes
scene.add(makeSnow(1800, 0.6, 22)); // large flakes

// ---------------------------------------------------------------- fade overlay for the loop
const fadeMat = new THREE.MeshBasicMaterial({
  color: FOG_COLOR,
  transparent: true,
  opacity: 0,
  depthTest: false,
  depthWrite: false,
  fog: false,
});
const fadeMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 1.2), fadeMat);
fadeMesh.position.z = -0.5;
fadeMesh.renderOrder = 999;
fadeMesh.frustumCulled = false;
camera.add(fadeMesh);

// ---------------------------------------------------------------- animation
const Z_START = 8;
const WALK_SPEED = 1.7;
const WALK_LEN = 120;
const LOOP_T = WALK_LEN / WALK_SPEED;

function gustAt(t: number): number {
  const v = 0.5 + 0.5 * Math.sin(t * 0.55) * Math.sin(t * 0.21 + 1.0);
  return smoothstep(0.5, 0.9, v);
}

const lookTarget = new THREE.Vector3();
const right = new THREE.Vector3();
let last = performance.now();
let elapsed = 0;
let phase = 0;
let ready = false;

function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  elapsed += dt;

  const gust = gustAt(elapsed);
  phase += dt * (1 + 1.4 * gust);

  const cycle = Math.floor(elapsed / LOOP_T);
  const p = elapsed - cycle * LOOP_T;
  const z = Z_START - p * WALK_SPEED;

  const bob = Math.sin(elapsed * Math.PI * 1.7) * 0.035;
  const sway = Math.sin(elapsed * Math.PI * 0.85) * 0.05;
  camera.position.set(trailX(z), H(0, z) + 1.7 + bob, z);
  const zl = z - 12;
  lookTarget.set(
    trailX(zl) + Math.sin(elapsed * 0.45) * 0.9,
    H(0, zl) + 1.5 + Math.sin(elapsed * 0.6) * 0.15,
    zl
  );
  camera.lookAt(lookTarget);
  camera.rotateZ(Math.sin(elapsed * Math.PI * 0.85 + 0.5) * 0.015);
  right.set(1, 0, 0).applyQuaternion(camera.quaternion);
  camera.position.addScaledVector(right, sway);

  // fade out at loop end, fade in after restart
  let fade = 0;
  if (p > LOOP_T - 1.2) fade = smoothstep(LOOP_T - 1.2, LOOP_T - 0.05, p);
  else if (cycle > 0 && p < 1.0) fade = 1 - smoothstep(0, 1.0, p);
  fadeMat.opacity = fade;

  fog.near = 10 - 6 * gust;
  fog.far = 330 - 140 * gust;
  cabinLight.intensity = 30 + Math.sin(elapsed * 7.3) * 1.2;

  snowUniformsShared.uCenter.value.set(
    camera.position.x,
    camera.position.y + 3,
    camera.position.z - 16
  );
  snowUniformsShared.uPhase.value = phase;
  snowUniformsShared.uGust.value = gust;

  renderer.render(scene, camera);
  if (!ready) {
    ready = true;
    (window as unknown as { __EVAL_READY__?: boolean }).__EVAL_READY__ = true;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame((t) => {
  last = t;
  frame(t);
});
