import * as THREE from 'three';

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

const canvas = document.getElementById('app') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(640, 360, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

const BG = 0xd9dce1;
const scene = new THREE.Scene();
scene.background = new THREE.Color(BG);
scene.fog = new THREE.Fog(BG, 12, 28);

const camera = new THREE.PerspectiveCamera(38, 640 / 360, 0.1, 100);
camera.position.set(5.2, 4.6, 6.4);
camera.lookAt(0, 0.85, 0);

// Lighting
scene.add(new THREE.HemisphereLight(0xffffff, 0x9a9da4, 0.9));
const key = new THREE.DirectionalLight(0xffffff, 2.2);
key.position.set(-4, 9, 5);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = -5;
key.shadow.camera.right = 5;
key.shadow.camera.top = 5;
key.shadow.camera.bottom = -5;
key.shadow.camera.near = 1;
key.shadow.camera.far = 25;
key.shadow.radius = 5;
key.shadow.bias = -0.0005;
key.shadow.normalBias = 0.02;
scene.add(key);
const rim = new THREE.DirectionalLight(0xdde6ff, 0.6);
rim.position.set(6, 4, -6);
scene.add(rim);

// Ground
const ground = new THREE.Mesh(
  new THREE.CircleGeometry(30, 64),
  new THREE.MeshStandardMaterial({ color: 0xe8e9ec, roughness: 0.95, metalness: 0 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// Materials
const bodyMat = new THREE.MeshStandardMaterial({ color: 0x5a2a20, roughness: 0.5, metalness: 0.1 });
const abdomenMat = new THREE.MeshStandardMaterial({ color: 0x3b1d18, roughness: 0.45, metalness: 0.1 });
const legMat = new THREE.MeshStandardMaterial({ color: 0x2a2220, roughness: 0.6, metalness: 0.1 });
const jointMat = new THREE.MeshStandardMaterial({ color: 0xc8512f, roughness: 0.4, metalness: 0.1 });
const eyeMat = new THREE.MeshStandardMaterial({ color: 0x0b0b0b, roughness: 0.15, metalness: 0.3 });
const markMat = new THREE.MeshStandardMaterial({ color: 0xd9a441, roughness: 0.5 });

function shadowed<T extends THREE.Mesh>(m: T): T {
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// Spider body
const spider = new THREE.Group();
scene.add(spider);

const thorax = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.5, 32, 24), bodyMat));
thorax.scale.set(1, 0.8, 1.1);
thorax.position.set(0, 0, 0.35);
spider.add(thorax);

const abdomen = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.8, 32, 24), abdomenMat));
abdomen.scale.set(0.95, 0.9, 1.3);
abdomen.position.set(0, 0.12, -0.85);
spider.add(abdomen);

const mark = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.28, 20, 14), markMat));
mark.scale.set(0.8, 0.35, 1.5);
mark.position.set(0, 0.7, -0.85);
spider.add(mark);

const head = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.3, 24, 18), bodyMat));
head.position.set(0, -0.02, 0.85);
spider.add(head);

for (const sx of [-1, 1]) {
  const big = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.075, 14, 10), eyeMat));
  big.position.set(sx * 0.1, 0.1, 1.1);
  spider.add(big);
  const small = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), eyeMat));
  small.position.set(sx * 0.2, 0.17, 1.0);
  spider.add(small);
  const fang = shadowed(new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.22, 10), jointMat));
  fang.position.set(sx * 0.1, -0.22, 1.02);
  fang.rotation.x = Math.PI;
  spider.add(fang);
}

// Legs
const L1 = 1.5;
const L2 = 1.95;
const LEG_R = 0.065;
const JOINT_R = 0.1;
const PERIOD = 2;
const STRIDE = 0.4;
const LIFT = 0.5;
const REACH = 2.35;
const FOOT_R = 0.07;
const AZ = [55, 20, -20, -55].map((d) => (d * Math.PI) / 180);

const segGeo = new THREE.CylinderGeometry(0.75, 1, 1, 14, 1);
const jointGeo = new THREE.SphereGeometry(1, 16, 12);

interface Leg {
  side: number;
  dir: THREE.Vector3;
  group: number;
  hipLocal: THREE.Vector3;
  upper: THREE.Mesh;
  lower: THREE.Mesh;
  hipJ: THREE.Mesh;
  kneeJ: THREE.Mesh;
  footJ: THREE.Mesh;
}

const legs: Leg[] = [];
const legRoot = new THREE.Group(); // world-space children so IK can use world coords
scene.add(legRoot);

function makeSeg(): THREE.Mesh {
  return shadowed(new THREE.Mesh(segGeo, legMat));
}
function makeJoint(r: number): THREE.Mesh {
  const m = shadowed(new THREE.Mesh(jointGeo, jointMat));
  m.scale.setScalar(r);
  return m;
}

for (const side of [1, -1]) {
  AZ.forEach((az, i) => {
    const dir = new THREE.Vector3(side * Math.cos(az), 0, Math.sin(az)).normalize();
    const leg: Leg = {
      side,
      dir,
      group: (i + (side === 1 ? 0 : 1)) % 2,
      hipLocal: new THREE.Vector3(dir.x * 0.5, -0.05, 0.3 + dir.z * 0.45),
      upper: makeSeg(),
      lower: makeSeg(),
      hipJ: makeJoint(JOINT_R * 1.1),
      kneeJ: makeJoint(JOINT_R * 1.2),
      footJ: makeJoint(FOOT_R),
    };
    legRoot.add(leg.upper, leg.lower, leg.hipJ, leg.kneeJ, leg.footJ);
    legs.push(leg);
  });
}

const UP = new THREE.Vector3(0, 1, 0);
const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();

function place(mesh: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3, r: number): void {
  tmpA.subVectors(b, a);
  const len = tmpA.length();
  mesh.position.addVectors(a, b).multiplyScalar(0.5);
  tmpQ.setFromUnitVectors(UP, tmpA.divideScalar(len));
  mesh.quaternion.copy(tmpQ);
  mesh.scale.set(r, len, r);
}

function smooth(u: number): number {
  return u * u * (3 - 2 * u);
}

const hip = new THREE.Vector3();
const foot = new THREE.Vector3();
const knee = new THREE.Vector3();
const dirD = new THREE.Vector3();
const pole = new THREE.Vector3();

function update(t: number): void {
  const cyc = t / PERIOD;
  // Two steps per period: body dips as each diagonal set plants, rises mid-stance.
  const bob = Math.cos(cyc * Math.PI * 4) * 0.06;
  const sway = Math.sin(cyc * Math.PI * 2) * 0.025;
  const bodyY = 1.15 + bob;
  spider.position.set(0, bodyY, 0);
  spider.rotation.set(Math.sin(cyc * Math.PI * 4) * 0.015, 0, sway);
  spider.updateMatrixWorld(true);
  abdomen.position.y = 0.12 + Math.sin(cyc * Math.PI * 4) * 0.02;

  for (const leg of legs) {
    const p = (((cyc + leg.group * 0.5) % 1) + 1) % 1;
    let dz: number;
    let dy = 0;
    if (p < 0.5) {
      // swing: lift and move forward
      const u = p / 0.5;
      dz = -STRIDE + 2 * STRIDE * smooth(u);
      dy = Math.sin(u * Math.PI) * LIFT;
    } else {
      // stance: foot slides backward along ground
      const u = (p - 0.5) / 0.5;
      dz = STRIDE - 2 * STRIDE * u;
    }
    foot.set(leg.dir.x * REACH, FOOT_R + dy, leg.dir.z * REACH + 0.3 + dz);
    // spread outward slightly during swing
    foot.x += leg.dir.x * Math.sin(Math.min(1, p / 0.5) * Math.PI) * (p < 0.5 ? 0.15 : 0);

    hip.copy(leg.hipLocal).applyMatrix4(spider.matrixWorld);

    // two-bone IK
    dirD.subVectors(foot, hip);
    let D = dirD.length();
    const maxD = L1 + L2 - 0.01;
    if (D > maxD) {
      dirD.multiplyScalar(maxD / D);
      foot.addVectors(hip, dirD);
      D = maxD;
    }
    dirD.divideScalar(D);
    const a = (L1 * L1 - L2 * L2 + D * D) / (2 * D);
    const h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
    pole.copy(UP).addScaledVector(leg.dir, 0.25);
    pole.addScaledVector(dirD, -pole.dot(dirD)).normalize();
    knee.copy(hip).addScaledVector(dirD, a).addScaledVector(pole, h);

    place(leg.upper, hip, knee, LEG_R);
    place(leg.lower, knee, foot, LEG_R * 0.8);
    leg.hipJ.position.copy(hip);
    leg.kneeJ.position.copy(knee);
    leg.footJ.position.copy(foot);
  }
  void tmpB;
}

let first = true;
function frame(now: number): void {
  update(now / 1000);
  renderer.render(scene, camera);
  if (first) {
    first = false;
    window.__EVAL_READY__ = true;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
