import * as THREE from 'three';

declare global {
  interface Window {
    __TASK_STATE__: {
      spheres: { name: string }[];
      keyLightX: number;
      selected: 'glass' | 'metal' | 'fabric' | null;
    };
    __EVAL_READY__?: boolean;
  }
}

const canvas = document.getElementById('app') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(640, 360, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xc9cacc);

// ---------- helpers ----------
function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2d context unavailable');
  return [c, ctx];
}

// deterministic random
let seed = 1234567;
function rand(): number {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
}

// ---------- studio environment (generated) ----------
function buildEnvironment(): THREE.Texture {
  const envScene = new THREE.Scene();

  const [gc, g] = makeCanvas(4, 256);
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0.0, '#9a9a9c');
  grad.addColorStop(0.45, '#d8d8da');
  grad.addColorStop(0.55, '#b8b8ba');
  grad.addColorStop(1.0, '#3c3c40');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  const gradTex = new THREE.CanvasTexture(gc);
  gradTex.colorSpace = THREE.SRGBColorSpace;
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(40, 32, 16),
    new THREE.MeshBasicMaterial({ map: gradTex, side: THREE.BackSide }),
  );
  envScene.add(dome);

  const addBox = (x: number, y: number, z: number, w: number, h: number, intensity: number, tint = 0xffffff) => {
    const m = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false });
    m.color.set(tint).multiplyScalar(intensity);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
    mesh.position.set(x, y, z);
    mesh.lookAt(0, 0, 0);
    envScene.add(mesh);
  };
  addBox(-9, 7, 7, 7, 9, 14, 0xfff4e8); // key softbox
  addBox(0, 14, 0, 12, 8, 7); // overhead
  addBox(10, 3, 5, 3, 8, 3.5, 0xe6eeff); // fill strip
  addBox(0, 5, -12, 14, 1.6, 10); // rim strip
  addBox(-6, 4, -10, 1.5, 7, 6);
  addBox(7, 4, -10, 1.5, 7, 6);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(envScene, 0.02);
  pmrem.dispose();
  return rt.texture;
}
scene.environment = buildEnvironment();
scene.environmentIntensity = 0.85;

// ---------- cove floor/backdrop ----------
function buildCove(): THREE.Mesh {
  const profile: [number, number][] = []; // [y, z]
  const R = 5;
  const zFront = 18;
  const zArc = -4;
  for (let i = 0; i <= 10; i++) profile.push([0, zFront + (zArc - zFront) * (i / 10)]);
  const N = 24;
  for (let i = 1; i <= N; i++) {
    const a = (i / N) * (Math.PI / 2);
    profile.push([R - R * Math.cos(a), zArc - R * Math.sin(a)]);
  }
  profile.push([R + 12, zArc - R]);
  profile.push([R + 30, zArc - R]);

  const xs = [-40, 40];
  const pos: number[] = [];
  for (const [y, z] of profile) for (const x of xs) pos.push(x, y, z);
  const idx: number[] = [];
  for (let i = 0; i < profile.length - 1; i++) {
    const a = i * 2;
    const b = a + 1;
    const c = a + 2;
    const d = a + 3;
    idx.push(a, c, b, b, c, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({
    color: 0xcfd0d2,
    roughness: 0.85,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}
scene.add(buildCove());

// ---------- textures ----------
function brushedTexture(): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(1024, 512);
  ctx.fillStyle = 'rgb(128,128,128)';
  ctx.fillRect(0, 0, 1024, 512);
  for (let i = 0; i < 5000; i++) {
    const y = rand() * 512;
    const v = Math.floor(70 + rand() * 150);
    ctx.strokeStyle = `rgba(${v},${v},${v},${0.15 + rand() * 0.45})`;
    ctx.lineWidth = 0.5 + rand() * 1.2;
    const x0 = rand() * 1024;
    const len = 80 + rand() * 500;
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x0 + len, y + (rand() - 0.5) * 1.5);
    ctx.stroke();
    if (x0 + len > 1024) {
      ctx.beginPath();
      ctx.moveTo(x0 - 1024, y);
      ctx.lineTo(x0 + len - 1024, y);
      ctx.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

function weaveTextures(): { color: THREE.CanvasTexture; bump: THREE.CanvasTexture } {
  const S = 256;
  const cells = 8;
  const cs = S / cells;
  const [c, ctx] = makeCanvas(S, S);
  const [b, bctx] = makeCanvas(S, S);
  ctx.fillStyle = '#2a0508';
  ctx.fillRect(0, 0, S, S);
  bctx.fillStyle = '#000';
  bctx.fillRect(0, 0, S, S);
  for (let j = 0; j < cells; j++) {
    for (let i = 0; i < cells; i++) {
      const x = i * cs;
      const y = j * cs;
      const horizontal = (i + j) % 2 === 0;
      const gc = horizontal ? ctx.createLinearGradient(0, y, 0, y + cs) : ctx.createLinearGradient(x, 0, x + cs, 0);
      const gb = horizontal ? bctx.createLinearGradient(0, y, 0, y + cs) : bctx.createLinearGradient(x, 0, x + cs, 0);
      const base = horizontal ? [122, 18, 30] : [96, 12, 24];
      gc.addColorStop(0, `rgb(${base[0] * 0.35},${base[1] * 0.35},${base[2] * 0.35})`);
      gc.addColorStop(0.5, `rgb(${base[0]},${base[1]},${base[2]})`);
      gc.addColorStop(1, `rgb(${base[0] * 0.35},${base[1] * 0.35},${base[2] * 0.35})`);
      gb.addColorStop(0, '#202020');
      gb.addColorStop(0.5, '#ffffff');
      gb.addColorStop(1, '#202020');
      ctx.fillStyle = gc;
      ctx.fillRect(x + 1, y + 1, cs - 2, cs - 2);
      bctx.fillStyle = gb;
      bctx.fillRect(x + 1, y + 1, cs - 2, cs - 2);
    }
  }
  // fibre noise
  for (let i = 0; i < 9000; i++) {
    const x = rand() * S;
    const y = rand() * S;
    const l = rand() > 0.5 ? 1 : 0;
    ctx.fillStyle = rand() > 0.5 ? 'rgba(255,90,100,0.12)' : 'rgba(0,0,0,0.2)';
    ctx.fillRect(x, y, l ? 3 : 1, l ? 1 : 3);
  }
  const color = new THREE.CanvasTexture(c);
  color.colorSpace = THREE.SRGBColorSpace;
  const bump = new THREE.CanvasTexture(b);
  for (const t of [color, bump]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(7, 3.5);
    t.anisotropy = 8;
  }
  return { color, bump };
}

// ---------- spheres ----------
const RADIUS = 1;
const SPACING = 2.7;
const sphereGeo = new THREE.SphereGeometry(RADIUS, 96, 64);

const glassMat = new THREE.MeshPhysicalMaterial({
  color: 0xf2fbff,
  metalness: 0,
  roughness: 0.02,
  transmission: 1,
  thickness: 1.6,
  ior: 1.5,
  attenuationColor: new THREE.Color(0xbfeee4),
  attenuationDistance: 5,
  specularIntensity: 1,
  envMapIntensity: 1.6,
  clearcoat: 1,
  clearcoatRoughness: 0,
});
const glass = new THREE.Mesh(sphereGeo, glassMat);
glass.position.set(-SPACING, RADIUS, 0);

const brushed = brushedTexture();
const metalMat = new THREE.MeshPhysicalMaterial({
  color: 0xd4d7dc,
  metalness: 1,
  roughness: 0.62,
  roughnessMap: brushed,
  bumpMap: brushed,
  bumpScale: 0.6,
  anisotropy: 0.9,
  anisotropyRotation: 0,
  envMapIntensity: 1.3,
});
const metal = new THREE.Mesh(sphereGeo, metalMat);
metal.position.set(0, RADIUS, 0);
metal.castShadow = true;

const weave = weaveTextures();
const fabricMat = new THREE.MeshPhysicalMaterial({
  color: 0xffffff,
  map: weave.color,
  bumpMap: weave.bump,
  bumpScale: 3,
  roughness: 1,
  metalness: 0,
  sheen: 1,
  sheenColor: new THREE.Color(0xff6a78),
  sheenRoughness: 0.35,
  envMapIntensity: 0.35,
});
const fabric = new THREE.Mesh(sphereGeo, fabricMat);
fabric.position.set(SPACING, RADIUS, 0);
fabric.castShadow = true;

glass.castShadow = true;
scene.add(glass, metal, fabric);

// ---------- contact shadows (soft blobs) ----------
function blobTexture(): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(128, 128);
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(0,0,0,0.75)');
  g.addColorStop(0.35, 'rgba(0,0,0,0.45)');
  g.addColorStop(0.7, 'rgba(0,0,0,0.12)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
const blobTex = blobTexture();
for (const [m, o] of [[glass, 0.55], [metal, 0.9], [fabric, 0.95]] as [THREE.Mesh, number][]) {
  const blob = new THREE.Mesh(
    new THREE.PlaneGeometry(RADIUS * 3.2, RADIUS * 3.2),
    new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, opacity: o, depthWrite: false, toneMapped: false }),
  );
  blob.rotation.x = -Math.PI / 2;
  blob.position.set(m.position.x, 0.01, m.position.z);
  scene.add(blob);
}

// ---------- lights ----------
const key = new THREE.DirectionalLight(0xfff1e0, 2.6);
key.position.set(-6, 9, 7);
key.target.position.set(0, 0.8, 0);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = -8;
key.shadow.camera.right = 8;
key.shadow.camera.top = 8;
key.shadow.camera.bottom = -8;
key.shadow.camera.near = 1;
key.shadow.camera.far = 30;
key.shadow.radius = 6;
key.shadow.bias = -0.0005;
key.shadow.normalBias = 0.02;
scene.add(key, key.target);

const fill = new THREE.DirectionalLight(0xdde8ff, 0.7);
fill.position.set(8, 4, 6);
fill.target.position.set(0, 1, 0);
scene.add(fill, fill.target);

const rim = new THREE.DirectionalLight(0xffffff, 2.4);
rim.position.set(1, 5, -9);
rim.target.position.set(0, 1, 0);
scene.add(rim, rim.target);

scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8a8e, 0.25));

// ---------- camera ----------
const camera = new THREE.PerspectiveCamera(30, 640 / 360, 0.1, 100);
camera.position.set(0, 3.6, 12.5);
camera.lookAt(0, 0.95, 0);

// ---------- loop ----------
window.__TASK_STATE__ = {
  spheres: [{ name: 'glass' }, { name: 'metal' }, { name: 'fabric' }],
  keyLightX: key.position.x,
  selected: null,
};

const selectable: Record<string, { name: 'glass' | 'metal' | 'fabric'; mesh: THREE.Mesh }> = {
  '1': { name: 'glass', mesh: glass },
  '2': { name: 'metal', mesh: metal },
  '3': { name: 'fabric', mesh: fabric },
};
let selectedMesh: THREE.Mesh | null = null;
window.addEventListener('keydown', (e: KeyboardEvent) => {
  const s = selectable[e.key];
  if (!s) return;
  selectedMesh = s.mesh;
  window.__TASK_STATE__.selected = s.name;
});

const SPIN_SPEED = 0.6; // rad/s
const t0 = performance.now();
let last = t0;
let first = true;
function frame(): void {
  const now = performance.now();
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  if (selectedMesh) selectedMesh.rotation.y += SPIN_SPEED * dt;
  const t = (now - t0) / 1000;
  const s = Math.sin(t * 0.5);
  key.position.x = -3 + 4.5 * s;
  scene.environmentRotation.y = -0.5 * s;
  window.__TASK_STATE__.keyLightX = key.position.x;
  renderer.render(scene, camera);
  if (first) {
    first = false;
    window.__EVAL_READY__ = true;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
