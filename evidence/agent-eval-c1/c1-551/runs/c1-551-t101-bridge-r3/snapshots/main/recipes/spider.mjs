// Walking spider built only from primitives. Legs and body bob are driven by one looping 2 s clip.
export const params = { period: 2, bodyColor: "#3b2a24", legColor: "#5a3d30" };

const DEG = Math.PI / 180;
const HIP_X = [0.3, 0.12, -0.06, -0.24]; // along body (x is forward)
const PHI0 = [46, 76, 106, 136].map((d) => d * DEG); // leg direction measured from forward axis
const SWING = 0.34; // yaw sweep (radians)
const UP = 40 * DEG; // upper segment elevation
const DOWN = 66 * DEG; // lower segment depression
const L1 = 1.0;
const L2 = 1.6;
const BODY_H = L2 * Math.sin(DOWN) - L1 * Math.sin(UP);

export default function createScene({ THREE, params: p }) {
  const scene = new THREE.Scene();

  const bodyMat = new THREE.MeshStandardMaterial({ color: p.bodyColor, roughness: 0.55, metalness: 0.05 });
  const legMat = new THREE.MeshStandardMaterial({ color: p.legColor, roughness: 0.6, metalness: 0.05 });
  const jointMat = new THREE.MeshStandardMaterial({ color: "#c2552f", roughness: 0.45 });
  const eyeMat = new THREE.MeshStandardMaterial({ color: "#f2f2f2", roughness: 0.2 });
  const groundMat = new THREE.MeshStandardMaterial({ color: "#d9dbe0", roughness: 0.95 });

  // Ground
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), groundMat);
  ground.name = "ground";
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Body root (bobs)
  const body = new THREE.Group();
  body.name = "spider_body";
  body.position.set(0, BODY_H, 0);
  scene.add(body);

  const abdomen = new THREE.Mesh(new THREE.SphereGeometry(0.62, 32, 20), bodyMat);
  abdomen.name = "abdomen";
  abdomen.scale.set(1.2, 0.9, 1.0);
  abdomen.position.set(-0.78, 0.08, 0);
  abdomen.castShadow = true;
  body.add(abdomen);

  const thorax = new THREE.Mesh(new THREE.SphereGeometry(0.46, 32, 20), bodyMat);
  thorax.name = "thorax";
  thorax.scale.set(1.0, 0.8, 0.95);
  thorax.position.set(0.15, 0, 0);
  thorax.castShadow = true;
  body.add(thorax);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 24, 16), bodyMat);
  head.name = "head";
  head.position.set(0.58, -0.02, 0);
  head.castShadow = true;
  body.add(head);

  for (const side of [1, -1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.075, 16, 12), eyeMat);
    eye.name = `eye_${side > 0 ? "r" : "l"}`;
    eye.position.set(0.8, 0.1, side * 0.12);
    body.add(eye);
    const eye2 = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), eyeMat);
    eye2.name = `eye2_${side > 0 ? "r" : "l"}`;
    eye2.position.set(0.74, 0.2, side * 0.07);
    body.add(eye2);
    const fang = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.22, 12), jointMat);
    fang.name = `fang_${side > 0 ? "r" : "l"}`;
    fang.position.set(0.8, -0.22, side * 0.1);
    fang.castShadow = true;
    body.add(fang);
  }

  // Legs: yaw group -> lift group (upper segment) -> knee group (lower segment)
  const legs = [];
  const sideNames = { 1: "r", "-1": "l" };
  for (const side of [1, -1]) {
    for (let i = 0; i < 4; i++) {
      const id = `${sideNames[side]}${i + 1}`;
      const yaw = new THREE.Group();
      yaw.name = `yaw_${id}`;
      yaw.position.set(HIP_X[i] + 0.0, -0.02, side * 0.3);
      body.add(yaw);

      const lift = new THREE.Group();
      lift.name = `lift_${id}`;
      yaw.add(lift);

      const hipBall = new THREE.Mesh(new THREE.SphereGeometry(0.115, 16, 12), jointMat);
      hipBall.name = `hip_${id}`;
      lift.add(hipBall);

      const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.065, L1, 14), legMat);
      upper.name = `upper_${id}`;
      upper.rotation.z = -Math.PI / 2; // cylinder axis -> local +x
      upper.position.set(L1 / 2, 0, 0);
      upper.castShadow = true;
      lift.add(upper);

      const knee = new THREE.Group();
      knee.name = `knee_${id}`;
      knee.position.set(L1, 0, 0);
      lift.add(knee);

      const kneeBall = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), jointMat);
      kneeBall.name = `kneeball_${id}`;
      kneeBall.castShadow = true;
      knee.add(kneeBall);

      const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.03, L2, 14), legMat);
      lower.name = `lower_${id}`;
      lower.rotation.z = -Math.PI / 2;
      lower.position.set(L2 / 2, 0, 0);
      lower.castShadow = true;
      knee.add(lower);

      const foot = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10), jointMat);
      foot.name = `foot_${id}`;
      foot.position.set(L2, 0, 0);
      knee.add(foot);

      // Alternating gait: diagonal pairs (l1,r2,l3,r4) vs (r1,l2,r3,l4)
      const groupA = (side === -1 && i % 2 === 0) || (side === 1 && i % 2 === 1);
      legs.push({ id, side, i, phase0: groupA ? 0 : 0.5 });
    }
  }

  // Sampling the clip
  const period = p.period;
  const N = 60;
  const times = [];
  for (let k = 0; k <= N; k++) times.push((k / N) * period);

  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const tracks = [];

  const gait = (phase) => {
    const ph = ((phase % 1) + 1) % 1;
    if (ph < 0.5) return { swing: 1 - 4 * ph, lift: 0 }; // stance: sweep rear
    const u = (ph - 0.5) * 2;
    return { swing: -Math.cos(Math.PI * u), lift: Math.sin(Math.PI * u) }; // swing: forward + lifted
  };

  for (const leg of legs) {
    const yawVals = [];
    const liftVals = [];
    const kneeVals = [];
    for (let k = 0; k <= N; k++) {
      const t = k / N;
      const g = gait(t + leg.phase0);
      const phi = leg.side * (PHI0[leg.i] - g.swing * SWING);
      e.set(0, -phi, 0);
      q.setFromEuler(e);
      yawVals.push(q.x, q.y, q.z, q.w);
      e.set(0, 0, UP + g.lift * 0.5);
      q.setFromEuler(e);
      liftVals.push(q.x, q.y, q.z, q.w);
      e.set(0, 0, -(UP + DOWN) - g.lift * 0.35);
      q.setFromEuler(e);
      kneeVals.push(q.x, q.y, q.z, q.w);
    }
    tracks.push(new THREE.QuaternionKeyframeTrack(`yaw_${leg.id}.quaternion`, times, yawVals));
    tracks.push(new THREE.QuaternionKeyframeTrack(`lift_${leg.id}.quaternion`, times, liftVals));
    tracks.push(new THREE.QuaternionKeyframeTrack(`knee_${leg.id}.quaternion`, times, kneeVals));
  }

  // Body bob: two steps per period, so two dips
  const bob = [];
  for (let k = 0; k <= N; k++) {
    const t = k / N;
    bob.push(0, BODY_H + 0.05 * Math.cos(4 * Math.PI * t) - 0.02, 0);
  }
  tracks.push(new THREE.VectorKeyframeTrack("spider_body.position", times, bob));

  const clip = new THREE.AnimationClip("walk", period, tracks);

  // Lights
  scene.add(new THREE.HemisphereLight("#ffffff", "#9a9ca3", 0.7));
  const key = new THREE.DirectionalLight("#fff4e6", 2.2);
  key.name = "key";
  key.position.set(4, 8, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  scene.add(key);
  const fill = new THREE.DirectionalLight("#dfe8ff", 0.6);
  fill.name = "fill";
  fill.position.set(-5, 4, -3);
  scene.add(fill);

  scene.background = new THREE.Color("#cfd2d8");

  const camera = new THREE.PerspectiveCamera(36, 640 / 360, 0.1, 100);
  camera.position.set(3.6, 4.3, 4.6);
  camera.lookAt(0, 0.55, 0);

  return {
    scene,
    camera,
    cameraTarget: [0, 0.55, 0],
    clips: [clip],
    renderer: { toneMapping: "aces", exposure: 1 }
  };
}
