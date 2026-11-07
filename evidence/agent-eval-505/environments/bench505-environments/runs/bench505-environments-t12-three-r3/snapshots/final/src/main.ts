import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CABIN_X, CABIN_Z, clamp01, fbm, groundHeight, lerp, mulberry32, ss, trailX, valleyC } from './terrain';

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

// ---------------------------------------------------------------- renderer
const canvas = document.getElementById('app') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(640, 360, false);

const FOG_COLOR = new THREE.Color(0xc6cbd2);
const scene = new THREE.Scene();
scene.background = FOG_COLOR;
scene.fog = new THREE.Fog(FOG_COLOR, 10, 230);

const camera = new THREE.PerspectiveCamera(58, 640 / 360, 0.1, 600);
scene.add(camera);

// ---------------------------------------------------------------- lights
const hemi = new THREE.HemisphereLight(0xeef2f8, 0x8e9bb0, 2.3);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 0.9);
sun.position.set(-30, 60, 20);
scene.add(sun);

// ---------------------------------------------------------------- textures
function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d') as CanvasRenderingContext2D;
  return [c, ctx];
}

function finishTex(c: HTMLCanvasElement, repeat = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
  }
  t.anisotropy = 4;
  return t;
}

function woodTexture(kind: 'logs' | 'grain'): THREE.CanvasTexture {
  const rng = mulberry32(kind === 'logs' ? 11 : 22);
  const [c, ctx] = makeCanvas(128, 128);
  if (kind === 'logs') {
    const rows = 6;
    const rh = 128 / rows;
    for (let r = 0; r < rows; r++) {
      const l = 32 + rng() * 10;
      ctx.fillStyle = `hsl(${24 + rng() * 6}, ${38 + rng() * 10}%, ${l}%)`;
      ctx.fillRect(0, r * rh, 128, rh);
      ctx.fillStyle = 'rgba(255,220,170,0.18)';
      ctx.fillRect(0, r * rh + 1, 128, 3);
      ctx.fillStyle = 'rgba(20,10,4,0.55)';
      ctx.fillRect(0, r * rh + rh - 3, 128, 3);
      for (let k = 0; k < 14; k++) {
        ctx.strokeStyle = `rgba(40,20,8,${0.1 + rng() * 0.15})`;
        ctx.beginPath();
        const y = r * rh + 4 + rng() * (rh - 9);
        const x = rng() * 128;
        ctx.moveTo(x, y);
        ctx.lineTo(x + 20 + rng() * 40, y + (rng() - 0.5) * 2);
        ctx.stroke();
      }
    }
  } else {
    ctx.fillStyle = '#6a5136';
    ctx.fillRect(0, 0, 128, 128);
    for (let k = 0; k < 90; k++) {
      const x = rng() * 128;
      const dark = rng() < 0.6;
      ctx.strokeStyle = dark ? `rgba(30,18,8,${0.15 + rng() * 0.3})` : `rgba(190,160,120,${0.1 + rng() * 0.2})`;
      ctx.lineWidth = 1 + rng() * 1.5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + (rng() - 0.5) * 6, 128);
      ctx.stroke();
    }
  }
  return finishTex(c);
}

function snowDetailTexture(): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(256, 256);
  const img = ctx.createImageData(256, 256);
  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 256; x++) {
      // tileable-ish: blend noise with shifted copy
      const f = 6;
      const u = (x / 256) * f;
      const v = (y / 256) * f;
      const n = fbm(u, v, 4);
      const n2 = fbm(u - f, v, 4);
      const n3 = fbm(u, v - f, 4);
      const n4 = fbm(u - f, v - f, 4);
      const a = x / 256;
      const b = y / 256;
      const nn = lerp(lerp(n, n2, a), lerp(n3, n4, a), b);
      const val = 215 + (nn - 0.5) * 70 + (Math.random() - 0.5) * 8;
      const i = (y * 256 + x) * 4;
      img.data[i] = val;
      img.data[i + 1] = val;
      img.data[i + 2] = Math.min(255, val + 6);
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return finishTex(c);
}

function trailTexture(): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(64, 128);
  const rng = mulberry32(5);
  const g = ctx.createLinearGradient(0, 0, 64, 0);
  g.addColorStop(0, 'rgba(120,134,158,0)');
  g.addColorStop(0.2, 'rgba(120,134,158,0.85)');
  g.addColorStop(0.5, 'rgba(100,114,140,1)');
  g.addColorStop(0.8, 'rgba(120,134,158,0.85)');
  g.addColorStop(1, 'rgba(120,134,158,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 128);
  for (let k = 0; k < 40; k++) {
    ctx.fillStyle = `rgba(70,82,108,${0.25 + rng() * 0.25})`;
    ctx.beginPath();
    ctx.ellipse(16 + rng() * 32, rng() * 128, 3, 5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  return finishTex(c);
}

function glowTexture(): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(128, 128);
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,190,100,1)');
  g.addColorStop(0.3, 'rgba(255,150,60,0.45)');
  g.addColorStop(1, 'rgba(255,120,40,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return finishTex(c, false);
}

// ---------------------------------------------------------------- terrain
const snowWhite = new THREE.Color(0xf4f7fb);
const snowBlue = new THREE.Color(0x9fb1cc);
const rockDark = new THREE.Color(0x26272b);
const rockMid = new THREE.Color(0x4b4c53);
const tmpA = new THREE.Color();
const tmpB = new THREE.Color();

{
  const NX = 240;
  const NZ = 272;
  const X0 = -150;
  const X1 = 150;
  const Z0 = 40;
  const Z1 = -300;
  const count = (NX + 1) * (NZ + 1);
  const pos = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  const col = new Float32Array(count * 3);
  for (let j = 0; j <= NZ; j++) {
    const z = Z0 + ((Z1 - Z0) * j) / NZ;
    for (let i = 0; i <= NX; i++) {
      const x = X0 + ((X1 - X0) * i) / NX;
      const k = j * (NX + 1) + i;
      pos[k * 3] = x;
      pos[k * 3 + 1] = groundHeight(x, z);
      pos[k * 3 + 2] = z;
      uv[k * 2] = x / 7;
      uv[k * 2 + 1] = z / 7;
    }
  }
  const idx: number[] = [];
  for (let j = 0; j < NZ; j++) {
    for (let i = 0; i < NX; i++) {
      const a = j * (NX + 1) + i;
      const b = a + NX + 1;
      const c = a + 1;
      const d = b + 1;
      idx.push(a, c, b, c, d, b);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const nrm = geo.getAttribute('normal') as THREE.BufferAttribute;
  for (let k = 0; k < count; k++) {
    const x = pos[k * 3];
    const z = pos[k * 3 + 2];
    const steep = 1 - nrm.getY(k);
    const t = fbm(x * 0.06 + 3, z * 0.06);
    const blue = clamp01(ss(0.35, 0.75, t) * 0.75 + steep * 1.3);
    tmpA.lerpColors(snowWhite, snowBlue, blue);
    const rockiness = ss(0.2, 0.42, steep + 0.14 * (fbm(x * 0.12 + 9, z * 0.12) - 0.5) * 2);
    tmpB.lerpColors(rockDark, rockMid, fbm(x * 0.5, z * 0.5, 3));
    tmpA.lerp(tmpB, rockiness);
    col[k * 3] = tmpA.r;
    col[k * 3 + 1] = tmpA.g;
    col[k * 3 + 2] = tmpA.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, map: snowDetailTexture() });
  scene.add(new THREE.Mesh(geo, mat));
}

// ---------------------------------------------------------------- trail ribbon
{
  const zStart = 30;
  const zEnd = -175;
  const step = 1;
  const n = Math.floor((zStart - zEnd) / step);
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= n; i++) {
    const z = zStart - i * step;
    const tx = trailX(z);
    for (const s of [-1, 1]) {
      const x = tx + s * 1.25;
      pos.push(x, groundHeight(x, z) + 0.07, z);
      uv.push(s < 0 ? 0 : 1, i / 4);
    }
    if (i < n) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({
    map: trailTexture(),
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = 1;
  scene.add(m);
}

// ---------------------------------------------------------------- poles
{
  const grain = woodTexture('grain');
  const woodMat = new THREE.MeshLambertMaterial({ map: grain });
  const snowMat = new THREE.MeshLambertMaterial({ color: 0xf6f8fc });
  const poleGeo = new THREE.CylinderGeometry(0.055, 0.075, 2.6, 8);
  const barGeo = new THREE.BoxGeometry(0.55, 0.07, 0.05);
  const capGeo = new THREE.SphereGeometry(0.1, 8, 6);
  capGeo.scale(1, 0.55, 1);
  const moundGeo = new THREE.SphereGeometry(0.28, 8, 6);
  moundGeo.scale(1, 0.4, 1);
  const rng = mulberry32(77);
  for (let i = 0; i < 24; i++) {
    const z = -6 - i * 6;
    const side = i % 2 === 0 ? -1 : 1;
    const x = trailX(z) + side * 1.9;
    const y = groundHeight(x, z);
    const g = new THREE.Group();
    const pole = new THREE.Mesh(poleGeo, woodMat);
    pole.position.y = 1.1;
    g.add(pole);
    const bar = new THREE.Mesh(barGeo, woodMat);
    bar.position.y = 2.0;
    bar.rotation.y = rng() * 0.8;
    g.add(bar);
    const cap = new THREE.Mesh(capGeo, snowMat);
    cap.position.y = 2.42;
    g.add(cap);
    const mound = new THREE.Mesh(moundGeo, snowMat);
    mound.position.set(0.08, 0.02, 0);
    g.add(mound);
    g.position.set(x, y, z);
    g.rotation.z = (rng() - 0.5) * 0.08;
    g.rotation.x = (rng() - 0.5) * 0.08;
    scene.add(g);
  }
}

// ---------------------------------------------------------------- cabin
{
  const logs = woodTexture('logs');
  const grain = woodTexture('grain');
  grain.repeat.set(1, 1);
  const wallMat = new THREE.MeshLambertMaterial({ map: logs });
  const roofMat = new THREE.MeshLambertMaterial({ map: grain, color: 0xb0a090 });
  const snowMat = new THREE.MeshLambertMaterial({ color: 0xf8faff });
  const stoneMat = new THREE.MeshLambertMaterial({ color: 0x565b62 });
  const darkWood = new THREE.MeshLambertMaterial({ color: 0x3a2818 });

  const cabin = new THREE.Group();
  const shape = new THREE.Shape();
  shape.moveTo(-2, -0.5);
  shape.lineTo(2, -0.5);
  shape.lineTo(2, 2.2);
  shape.lineTo(0, 3.4);
  shape.lineTo(-2, 2.2);
  shape.closePath();
  const bodyGeo = new THREE.ExtrudeGeometry(shape, { depth: 3.6, bevelEnabled: false });
  bodyGeo.translate(0, 0, -1.8);
  cabin.add(new THREE.Mesh(bodyGeo, wallMat));

  // roof: two wooden slabs and snow caps
  const slabGeo = new THREE.BoxGeometry(2.7, 0.12, 4.3);
  const snowGeo = new THREE.BoxGeometry(2.55, 0.26, 4.2);
  const ang = Math.atan2(1.2, 2.0);
  for (const s of [-1, 1]) {
    const slab = new THREE.Mesh(slabGeo, roofMat);
    slab.rotation.z = -s * ang;
    slab.position.set(s * 1.17, 2.76, 0);
    cabin.add(slab);
    const snow = new THREE.Mesh(snowGeo, snowMat);
    snow.rotation.z = -s * ang;
    const nx = Math.sin(ang) * s;
    const ny = Math.cos(ang);
    snow.position.set(s * 1.17 + nx * 0.18, 2.76 + ny * 0.18, 0);
    cabin.add(snow);
  }
  const ridgeSnow = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 4.2), snowMat);
  ridgeSnow.position.set(0, 3.58, 0);
  cabin.add(ridgeSnow);

  // chimney
  const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.3, 0.55), stoneMat);
  chimney.position.set(-0.9, 3.5, -1.0);
  cabin.add(chimney);
  const chimneySnow = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.12, 0.62), snowMat);
  chimneySnow.position.set(-0.9, 4.2, -1.0);
  cabin.add(chimneySnow);

  // door and window on the +z face (turned to face the trail)
  const door = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 1.7), darkWood);
  door.position.set(0.85, 0.35, 1.81);
  cabin.add(door);
  const winCenter = new THREE.Vector3(-0.8, 1.35, 1.82);
  const win = new THREE.Mesh(
    new THREE.PlaneGeometry(0.95, 0.75),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.62, 0.22), toneMapped: false }),
  );
  win.position.copy(winCenter);
  cabin.add(win);
  const frameMat = darkWood;
  const fw = 0.07;
  const frames: [number, number, number, number][] = [
    [0, 0.4, 1.05, fw],
    [0, -0.4, 1.05, fw],
    [-0.5, 0, fw, 0.85],
    [0.5, 0, fw, 0.85],
    [0, 0, fw * 0.7, 0.75],
    [0, 0, 0.95, fw * 0.7],
  ];
  for (const [ox, oy, w, h] of frames) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.05), frameMat);
    f.position.set(winCenter.x + ox, winCenter.y + oy, 1.84);
    cabin.add(f);
  }
  // snow drift against the wall
  const drift = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), snowMat);
  drift.scale.set(2.3, 0.45, 0.9);
  drift.position.set(0, -0.15, 2.0);
  cabin.add(drift);

  const light = new THREE.PointLight(0xffa24a, 22, 16, 2);
  light.position.set(winCenter.x, winCenter.y, 2.6);
  cabin.add(light);
  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture(),
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
      opacity: 0.55,
      fog: false,
    }),
  );
  glow.scale.set(4.2, 3.4, 1);
  glow.position.set(winCenter.x, winCenter.y, 2.1);
  cabin.add(glow);

  cabin.rotation.y = -Math.PI / 2;
  cabin.position.set(CABIN_X, groundHeight(CABIN_X, CABIN_Z) + 0.05, CABIN_Z);
  scene.add(cabin);
}

// ---------------------------------------------------------------- rock outcrops
{
  const rng = mulberry32(2024);
  const geos: THREE.BufferGeometry[] = [];
  const addRock = (x: number, z: number, size: number): void => {
    const g = new THREE.IcosahedronGeometry(1, 2);
    const p = g.getAttribute('position') as THREE.BufferAttribute;
    const seed = rng() * 100;
    for (let i = 0; i < p.count; i++) {
      const vx = p.getX(i);
      const vy = p.getY(i);
      const vz = p.getZ(i);
      const r = 0.75 + 0.55 * fbm(vx * 1.6 + seed, vy * 1.6 + vz * 2.1 + seed, 3);
      p.setXYZ(i, vx * r, vy * r, vz * r);
    }
    g.deleteAttribute('uv');
    g.deleteAttribute('normal');
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler((rng() - 0.5) * 0.6, rng() * 6.28, (rng() - 0.5) * 0.6));
    const sc = new THREE.Vector3(size * (0.9 + rng() * 0.6), size * (0.55 + rng() * 0.5), size * (0.9 + rng() * 0.6));
    const y = groundHeight(x, z) + sc.y * 0.2;
    m.compose(new THREE.Vector3(x, y, z), q, sc);
    g.applyMatrix4(m);
    g.computeVertexNormals();
    const n = g.getAttribute('normal') as THREE.BufferAttribute;
    const colors = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i += 3) {
      const ny = (n.getY(i) + n.getY(i + 1) + n.getY(i + 2)) / 3;
      tmpA.lerpColors(rockDark, rockMid, rng());
      const snowAmt = ss(0.45, 0.8, ny + (rng() - 0.5) * 0.25);
      tmpA.lerp(snowWhite, snowAmt * 0.9);
      for (let k = 0; k < 3; k++) {
        colors[(i + k) * 3] = tmpA.r;
        colors[(i + k) * 3 + 1] = tmpA.g;
        colors[(i + k) * 3 + 2] = tmpA.b;
      }
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geos.push(g);
  };
  let placed = 0;
  let tries = 0;
  while (placed < 110 && tries < 2000) {
    tries++;
    const z = 25 - rng() * 215;
    const side = rng() < 0.5 ? -1 : 1;
    const dx = 6 + Math.pow(rng(), 1.4) * 45;
    const x = valleyC(z) + side * dx;
    if (Math.abs(x - trailX(z)) < 4.5) continue;
    if (Math.hypot(x - CABIN_X, z - CABIN_Z) < 9) continue;
    const size = 0.8 + Math.pow(rng(), 2) * 3.2;
    addRock(x, z, size);
    placed++;
    if (rng() < 0.6) {
      for (let k = 0; k < 2; k++) {
        const x2 = x + (rng() - 0.5) * size * 3;
        const z2 = z + (rng() - 0.5) * size * 3;
        if (Math.abs(x2 - trailX(z2)) < 4.5 || Math.hypot(x2 - CABIN_X, z2 - CABIN_Z) < 9) continue;
        addRock(x2, z2, size * (0.4 + rng() * 0.4));
      }
    }
  }
  const merged = mergeGeometries(geos, false);
  if (merged) {
    scene.add(new THREE.Mesh(merged, new THREE.MeshLambertMaterial({ vertexColors: true })));
  }
}

// ---------------------------------------------------------------- blizzard
const windDir = new THREE.Vector3(-9, -3.2, 2.5);
const flakeShared = {
  uPhase: { value: 0 },
  uGust: { value: 0 },
  uCenter: { value: new THREE.Vector3() },
  uWind: { value: windDir },
  uBox: { value: new THREE.Vector3(40, 20, 40) },
};

const flakeVert = /* glsl */ `
  attribute vec3 aBase;
  attribute vec4 aRnd;
  uniform float uPhase, uGust, uSize, uLen, uAlpha, uFrac;
  uniform vec3 uCenter, uWind, uBox;
  varying vec2 vUv;
  varying float vAlpha;
  void main() {
    vec3 vel = uWind * (0.75 + 0.5 * aRnd.x);
    vec3 wob = vec3(sin(uPhase * 1.7 + aRnd.z * 40.0), sin(uPhase * 2.3 + aRnd.w * 40.0) * 0.5, cos(uPhase * 1.3 + aRnd.z * 25.0)) * 0.9;
    vec3 p = aBase + vel * uPhase + wob;
    vec3 lo = uCenter - 0.5 * uBox;
    vec3 w = lo + mod(p - lo, uBox);
    vec3 vA = (viewMatrix * vec4(w, 1.0)).xyz;
    vec3 vv = (viewMatrix * vec4(vel * (1.0 + 0.5 * uGust), 0.0)).xyz;
    vec2 d = vv.xy;
    float dl = length(d);
    d = dl > 1e-3 ? d / dl : vec2(1.0, 0.0);
    float dist = -vA.z;
    float width = max(uSize, dist * 0.0032);
    vec3 tail = vA - vv * uLen;
    vec3 pos = mix(vA, tail, position.x);
    pos.xy += vec2(-d.y, d.x) * width * position.y;
    float thr = uFrac + (1.0 - uFrac) * uGust;
    float vis = 1.0 - smoothstep(thr - 0.04, thr, aRnd.y);
    vAlpha = vis * uAlpha * (0.8 + 0.3 * uGust) * smoothstep(0.5, 2.5, dist) * (1.0 - smoothstep(20.0, 34.0, dist));
    vUv = position.xy;
    gl_Position = projectionMatrix * vec4(pos, 1.0);
  }
`;
const flakeFrag = /* glsl */ `
  varying vec2 vUv;
  varying float vAlpha;
  void main() {
    float across = 1.0 - pow(abs(vUv.y * 2.0), 2.0);
    float along = 1.0 - 0.75 * vUv.x;
    float a = vAlpha * across * along;
    if (a < 0.01) discard;
    gl_FragColor = vec4(1.0, 1.0, 1.0, a);
    #include <colorspace_fragment>
  }
`;

function makeFlakes(count: number, size: number, len: number, alpha: number, frac: number, seed: number): THREE.Mesh {
  const rng = mulberry32(seed);
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, -0.5, 0, 1, -0.5, 0, 1, 0.5, 0, 0, 0.5, 0]), 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  const base = new Float32Array(count * 3);
  const rnd = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    base[i * 3] = rng() * 40;
    base[i * 3 + 1] = rng() * 20;
    base[i * 3 + 2] = rng() * 40;
    for (let k = 0; k < 4; k++) rnd[i * 4 + k] = rng();
  }
  geo.setAttribute('aBase', new THREE.InstancedBufferAttribute(base, 3));
  geo.setAttribute('aRnd', new THREE.InstancedBufferAttribute(rnd, 4));
  geo.instanceCount = count;
  const mat = new THREE.ShaderMaterial({
    vertexShader: flakeVert,
    fragmentShader: flakeFrag,
    transparent: true,
    depthWrite: false,
    uniforms: {
      ...flakeShared,
      uSize: { value: size },
      uLen: { value: len },
      uAlpha: { value: alpha },
      uFrac: { value: frac },
    },
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 10;
  return mesh;
}

// two sizes: 4500 small + 1400 large (about 62% shown in calm, all in gusts)
scene.add(makeFlakes(4500, 0.011, 0.04, 0.8, 0.62, 1));
scene.add(makeFlakes(1400, 0.032, 0.05, 0.95, 0.62, 2));

// ---------------------------------------------------------------- fade overlay for the loop
const fadeMat = new THREE.ShaderMaterial({
  transparent: true,
  depthTest: false,
  depthWrite: false,
  uniforms: { uOpacity: { value: 0 }, uColor: { value: FOG_COLOR.clone() } },
  vertexShader: 'void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: `
    uniform float uOpacity; uniform vec3 uColor;
    void main(){ gl_FragColor = vec4(uColor, uOpacity);
    #include <colorspace_fragment>
    }`,
});
const fade = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), fadeMat);
fade.frustumCulled = false;
fade.renderOrder = 1000;
fade.visible = false;
scene.add(fade);

// ---------------------------------------------------------------- camera walk
const LOOP_T = 76;
const Z_END = -115;
const FADE_T = 1.3;
const target = new THREE.Vector3();

function gustAt(t: number): number {
  const a = Math.sin(t * 0.45) + 0.6 * Math.sin(t * 1.13 + 2.0);
  return ss(0.55, 1.4, a);
}

let phase = 0;
let lastTime = -1;
let first = true;

function frame(ms: number): void {
  const now = ms / 1000;
  const dt = lastTime < 0 ? 0 : Math.min(0.1, now - lastTime);
  lastTime = now;

  const gust = gustAt(now);
  phase += dt * (1 + 0.5 * gust);
  flakeShared.uPhase.value = phase;
  flakeShared.uGust.value = gust;

  const fog = scene.fog as THREE.Fog;
  fog.near = lerp(10, 3, gust);
  fog.far = lerp(230, 140, gust);
  hemi.intensity = lerp(2.3, 2.1, gust);

  const lt = now % LOOP_T;
  const u = lt / LOOP_T;
  const z = lerp(0, Z_END, u);
  const sway = 1 + gust * 0.8;
  const step = lt * 10.7;
  const px = trailX(z) + 0.12 * Math.sin(lt * 0.9) + 0.03 * Math.sin(step * 0.5);
  const py = groundHeight(trailX(z), z) + 1.7 + 0.035 * Math.sin(step) * sway;
  camera.position.set(px, py, z);
  const zl = z - 11;
  target.set(trailX(zl), groundHeight(trailX(zl), zl) + 1.7, zl);
  camera.lookAt(target);
  camera.rotateY(0.03 * Math.sin(lt * 0.37) * sway + 0.008 * Math.sin(step * 0.5));
  camera.rotateX(0.008 * Math.sin(step + 1.0));
  camera.rotateZ(0.012 * Math.sin(step * 0.5) * sway);
  camera.updateMatrixWorld();

  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  flakeShared.uCenter.value.set(px + fwd.x * 12, py + 1 + fwd.y * 6, z + fwd.z * 12);

  const edge = now < LOOP_T ? LOOP_T - lt : Math.min(lt, LOOP_T - lt);
  const o = 1 - clamp01(edge / FADE_T);
  fadeMat.uniforms.uOpacity.value = o;
  fade.visible = o > 0.001;

  renderer.render(scene, camera);
  if (first) {
    first = false;
    window.__EVAL_READY__ = true;
  }
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
