import * as THREE from 'three';

declare global {
  interface Window {
    __TASK_STATE__: { spheres: { name: string }[]; keyLightX: number };
    __EVAL_READY__?: boolean;
  }
}

const canvas = document.getElementById('app') as HTMLCanvasElement;
const W = 640;
const H = 360;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const maxAniso = renderer.capabilities.getMaxAnisotropy();

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x6e6e70);

const camera = new THREE.PerspectiveCamera(30, W / H, 0.1, 100);
camera.position.set(2.3, 2.5, 7.6);
camera.lookAt(0, 0.7, 0);

// ---------------------------------------------------------------- environment
function buildEnvironment(): THREE.Scene {
  const env = new THREE.Scene();
  const mat = (v: number) => new THREE.MeshBasicMaterial({ color: new THREE.Color().setScalar(v), side: THREE.DoubleSide });

  const room = new THREE.Mesh(new THREE.BoxGeometry(50, 30, 50), mat(0.1));
  (room.material as THREE.MeshBasicMaterial).side = THREE.BackSide;
  room.position.y = 8;
  env.add(room);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(50, 50), mat(0.45));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1;
  env.add(floor);

  const box = (w: number, h: number, intensity: number, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat(intensity));
    m.position.set(x, y, z);
    m.lookAt(0, 0, 0);
    env.add(m);
  };
  box(5, 6, 14, -8, 6, 6); // key softbox
  box(10, 4, 6, 0, 10, 1); // overhead strip
  box(3, 7, 4, 9, 3, 4); // fill card
  box(1.5, 8, 9, -6, 4, -10); // rim strips
  box(1.5, 8, 9, 7, 4, -10);
  box(8, 3, 2.5, 0, 2, 12); // soft front bounce

  return env;
}
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(buildEnvironment(), 0.02, 0.1, 100).texture;
scene.environmentIntensity = 0.9;
pmrem.dispose();

// ---------------------------------------------------------------- floor
const SPHERE_R = 0.8;
const SPACING = 2.1;
const sphereX = [-SPACING, 0, SPACING];

// baked soft contact shadows (kept in the floor texture so they also show through the glass)
function makeFloorShadowTexture(): THREE.CanvasTexture {
  const cw = 1024;
  const ch = 1152;
  const c = document.createElement('canvas');
  c.width = cw;
  c.height = ch;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  g.fillStyle = '#fff';
  g.fillRect(0, 0, cw, ch);
  const px = (x: number) => ((x + 8) / 16) * cw;
  const py = (z: number) => (1 - (z + 6) / 18) * ch;
  const scale = cw / 16;
  const blob = (x: number, radius: number, alpha: number) => {
    const cx = px(x);
    const cy = py(0);
    const r = radius * scale;
    const grad = g.createRadialGradient(cx, cy, 0, cx, cy, r);
    grad.addColorStop(0, `rgba(0,0,0,${alpha})`);
    grad.addColorStop(0.35, `rgba(0,0,0,${alpha * 0.6})`);
    grad.addColorStop(0.7, `rgba(0,0,0,${alpha * 0.18})`);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.fill();
  };
  // [wide ambient occlusion alpha, tight contact alpha]
  const strengths: [number, number][] = [
    [0.18, 0.4],
    [0.3, 0.7],
    [0.3, 0.7],
  ];
  sphereX.forEach((x, i) => {
    blob(x, 1.9, strengths[i][0]);
    blob(x, 1.1, strengths[i][1]);
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;
  return tex;
}

function makeCycloramaGeometry(): THREE.BufferGeometry {
  const profile: { z: number; y: number }[] = [];
  const zFront = 14;
  const zCurve = -2;
  const R = 4;
  for (let i = 0; i <= 14; i++) profile.push({ z: zFront + (zCurve - zFront) * (i / 14), y: 0 });
  const arcSegs = 28;
  for (let i = 1; i <= arcSegs; i++) {
    const a = (i / arcSegs) * (Math.PI / 2);
    profile.push({ z: zCurve - R * Math.sin(a), y: R - R * Math.cos(a) });
  }
  const zWall = zCurve - R;
  for (let i = 1; i <= 4; i++) profile.push({ z: zWall, y: R + i * 2.5 });

  const xs = 12;
  const xMin = -30;
  const xMax = 30;
  const positions: number[] = [];
  const uvs: number[] = [];
  for (const p of profile) {
    for (let j = 0; j <= xs; j++) {
      const x = xMin + ((xMax - xMin) * j) / xs;
      positions.push(x, p.y, p.z);
      uvs.push((x + 8) / 16, (p.z + 6) / 18);
    }
  }
  const indices: number[] = [];
  const cols = xs + 1;
  for (let i = 0; i < profile.length - 1; i++) {
    for (let j = 0; j < xs; j++) {
      const a = i * cols + j;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

const floor = new THREE.Mesh(
  makeCycloramaGeometry(),
  new THREE.MeshStandardMaterial({
    color: 0xc4c4c4,
    roughness: 0.92,
    metalness: 0,
    map: makeFloorShadowTexture(),
    side: THREE.DoubleSide,
  }),
);
floor.receiveShadow = true;
scene.add(floor);

// ---------------------------------------------------------------- materials
function canvasTexture(c: HTMLCanvasElement, srgb: boolean): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = maxAniso;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  return t;
}

// Brushed metal: long streaks running around the sphere (along u).
function makeBrushedTexture(): THREE.CanvasTexture {
  const size = 512;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const img = g.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    const rowBase = Math.random();
    const line = new Float32Array(size);
    let s = 0.5;
    // two passes around the loop so the streaks tile seamlessly
    for (let pass = 0; pass < 2; pass++) {
      for (let x = 0; x < size; x++) {
        s = s * 0.93 + Math.random() * 0.07;
        if (pass === 1) line[x] = s;
      }
    }
    for (let x = 0; x < size; x++) {
      const v = 0.55 + 0.25 * rowBase + 0.45 * (line[x] - 0.5) * 2 * 0.5 + (Math.random() - 0.5) * 0.12;
      const b = Math.max(0, Math.min(1, v)) * 255;
      const k = (y * size + x) * 4;
      img.data[k] = b;
      img.data[k + 1] = b;
      img.data[k + 2] = b;
      img.data[k + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return canvasTexture(c, false);
}

// Woven fabric: plain weave with fibre noise, greyscale (tinted by material colour).
function makeWeaveTexture(): THREE.CanvasTexture {
  const size = 256;
  const cell = 8;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const img = g.createImageData(size, size);
  const threadNoiseX = Array.from({ length: size }, () => Math.random());
  const threadNoiseY = Array.from({ length: size }, () => Math.random());
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const ci = Math.floor(x / cell);
      const cj = Math.floor(y / cell);
      const fx = (x % cell) / cell;
      const fy = (y % cell) / cell;
      const warpOnTop = (ci + cj) % 2 === 0;
      let shade: number;
      if (warpOnTop) {
        shade = (0.55 + 0.45 * Math.sin(Math.PI * fx)) * (0.75 + 0.25 * Math.sin(Math.PI * fy));
        shade *= 0.9 + 0.2 * threadNoiseX[x];
      } else {
        shade = (0.55 + 0.45 * Math.sin(Math.PI * fy)) * (0.75 + 0.25 * Math.sin(Math.PI * fx));
        shade *= 0.9 + 0.2 * threadNoiseY[y];
      }
      shade *= 0.88 + 0.24 * Math.random();
      const b = Math.max(0, Math.min(1, 0.15 + 0.85 * shade)) * 255;
      const k = (y * size + x) * 4;
      img.data[k] = b;
      img.data[k + 1] = b;
      img.data[k + 2] = b;
      img.data[k + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = canvasTexture(c, true);
  t.repeat.set(2, 1);
  return t;
}

const glassMat = new THREE.MeshPhysicalMaterial({
  color: 0xffffff,
  metalness: 0,
  roughness: 0.0,
  transmission: 1,
  thickness: 1.4,
  ior: 1.5,
  specularIntensity: 1,
  attenuationColor: new THREE.Color(0xbfeee4),
  attenuationDistance: 2.2,
  envMapIntensity: 1,
  clearcoat: 1,
  clearcoatRoughness: 0,
});

const brushedTex = makeBrushedTexture();
const metalMat = new THREE.MeshPhysicalMaterial({
  color: 0xcfd3d8,
  metalness: 1,
  roughness: 0.55,
  roughnessMap: brushedTex,
  bumpMap: brushedTex,
  bumpScale: 0.6,
  anisotropy: 0.85,
  anisotropyRotation: 0,
});

const weaveTex = makeWeaveTexture();
const fabricMat = new THREE.MeshPhysicalMaterial({
  color: 0xa01428,
  roughness: 1,
  metalness: 0,
  map: weaveTex,
  bumpMap: weaveTex,
  bumpScale: 1.5,
  sheen: 1,
  sheenRoughness: 0.45,
  sheenColor: new THREE.Color(0xff7a86),
});

// ---------------------------------------------------------------- spheres
const sphereGeo = new THREE.SphereGeometry(SPHERE_R, 128, 80);
const mats = [glassMat, metalMat, fabricMat];
const names = ['glass', 'metal', 'fabric'];
mats.forEach((m, i) => {
  const mesh = new THREE.Mesh(sphereGeo, m);
  mesh.name = names[i];
  mesh.position.set(sphereX[i], SPHERE_R, 0);
  mesh.castShadow = i !== 0; // glass lets most light through; its contact shadow is baked lighter
  mesh.receiveShadow = i !== 0;
  scene.add(mesh);
});

// ---------------------------------------------------------------- lights
const target = new THREE.Object3D();
target.position.set(0, 0.6, 0);
scene.add(target);

const key = new THREE.SpotLight(0xfff3e4, 330, 0, 0.5, 1, 2);
key.position.set(-3.5, 6, 5.5);
key.target = target;
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.near = 3;
key.shadow.camera.far = 20;
key.shadow.bias = -0.0003;
key.shadow.normalBias = 0.02;
key.shadow.radius = 6;
key.shadow.blurSamples = 16;
scene.add(key);

const fill = new THREE.DirectionalLight(0xdfe8ff, 0.9);
fill.position.set(6, 3, 5);
fill.target = target;
scene.add(fill);

const rim = new THREE.SpotLight(0xffffff, 260, 0, 0.7, 0.8, 2);
rim.position.set(2.5, 3.6, -4.2);
rim.target = target;
scene.add(rim);

// ---------------------------------------------------------------- loop
window.__TASK_STATE__ = {
  spheres: [{ name: 'glass' }, { name: 'metal' }, { name: 'fabric' }],
  keyLightX: key.position.x,
};

function frame(now: number) {
  const t = now / 1000;
  const s = Math.sin(t * 0.45);
  key.position.x = -3.5 + s * 3;
  scene.environmentRotation.y = s * 0.2;
  window.__TASK_STATE__.keyLightX = key.position.x;

  renderer.render(scene, camera);
  if (!window.__EVAL_READY__) window.__EVAL_READY__ = true;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
