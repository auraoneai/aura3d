// Walking spider built only from primitives (spheres and tapered cylinders), with a looping 2 s gait clip.
export const params = { period: 2, body: "#3a2a24", leg: "#4a352c", joint: "#d9792b" };

export default function createScene({ THREE, params: p }) {
  const scene = new THREE.Scene();
  const T = p.period;

  const bodyMat = new THREE.MeshStandardMaterial({ color: p.body, roughness: 0.55, metalness: 0.05 });
  const legMat = new THREE.MeshStandardMaterial({ color: p.leg, roughness: 0.5, metalness: 0.05 });
  const jointMat = new THREE.MeshStandardMaterial({ color: p.joint, roughness: 0.4 });
  const eyeMat = new THREE.MeshStandardMaterial({ color: "#f2f2f2", roughness: 0.2 });
  const stripeMat = new THREE.MeshStandardMaterial({ color: p.joint, roughness: 0.6 });

  const HIP_Y = 0.79; // body height above the ground
  const L1 = 0.95; // femur
  const L2 = 1.45; // tibia
  const ELEV = 0.65; // femur elevation (rad)
  const KNEE = -2.0; // knee bend relative to femur (rad)
  const SWING = 0.3; // gait swing amplitude (rad)
  const LIFT = 0.45; // extra femur lift during swing
  const KNEE_LIFT = 0.5; // extra knee bend during swing

  const body = new THREE.Group();
  body.name = "body";
  body.position.set(0, HIP_Y, 0);
  scene.add(body);

  const mesh = (geo, mat, name, pos, scl) => {
    const m = new THREE.Mesh(geo, mat);
    m.name = name;
    m.castShadow = true;
    m.receiveShadow = true;
    if (pos) m.position.set(...pos);
    if (scl) m.scale.set(...scl);
    return m;
  };

  // body: cephalothorax + abdomen + stripe + eyes
  body.add(mesh(new THREE.SphereGeometry(0.5, 32, 20), bodyMat, "thorax", [0, 0.05, 0.35], [1, 0.75, 1.1]));
  body.add(mesh(new THREE.SphereGeometry(0.75, 32, 24), bodyMat, "abdomen", [0, 0.2, -0.85], [0.9, 0.85, 1.2]));
  body.add(mesh(new THREE.SphereGeometry(0.3, 24, 16), stripeMat, "mark", [0, 0.82, -0.85], [0.8, 0.25, 1.4]));
  body.add(mesh(new THREE.SphereGeometry(0.09, 16, 12), eyeMat, "eye_l", [-0.15, 0.2, 0.84]));
  body.add(mesh(new THREE.SphereGeometry(0.09, 16, 12), eyeMat, "eye_r", [0.15, 0.2, 0.84]));
  body.add(mesh(new THREE.SphereGeometry(0.06, 16, 12), eyeMat, "eye_l2", [-0.3, 0.3, 0.76]));
  body.add(mesh(new THREE.SphereGeometry(0.06, 16, 12), eyeMat, "eye_r2", [0.3, 0.3, 0.76]));

  const segGeo = (len, r0, r1) => {
    const g = new THREE.CylinderGeometry(r1, r0, len, 14);
    g.rotateZ(-Math.PI / 2);
    g.translate(len / 2, 0, 0);
    return g;
  };
  const femurGeo = segGeo(L1, 0.1, 0.075);
  const tibiaGeo = segGeo(L2, 0.075, 0.025);
  const ballGeo = new THREE.SphereGeometry(0.1, 16, 12);
  const hipBallGeo = new THREE.SphereGeometry(0.13, 16, 12);

  // leg layout: [side, outward angle phi0 from +X toward +Z, hip z, gait group]
  const spec = [];
  const phiR = [0.95, 0.4, -0.3, -0.85];
  const zs = [0.5, 0.25, 0.0, -0.25];
  for (let i = 0; i < 4; i++) {
    spec.push({ id: `R${i}`, side: 1, phi0: phiR[i], z: zs[i], group: i % 2 });
    spec.push({ id: `L${i}`, side: -1, phi0: Math.PI - phiR[i], z: zs[i], group: (i + 1) % 2 });
  }

  const legs = spec.map((s) => {
    const hip = new THREE.Group();
    hip.name = `hip_${s.id}`;
    hip.position.set(s.side * 0.3, 0.05, s.z);
    body.add(hip);
    hip.add(mesh(hipBallGeo, jointMat, `hipball_${s.id}`));

    const femur = new THREE.Group();
    femur.name = `femur_${s.id}`;
    hip.add(femur);
    femur.add(mesh(femurGeo, legMat, `femurseg_${s.id}`));

    const knee = new THREE.Group();
    knee.name = `knee_${s.id}`;
    knee.position.set(L1, 0, 0);
    femur.add(knee);
    knee.add(mesh(ballGeo, jointMat, `kneeball_${s.id}`));
    knee.add(mesh(tibiaGeo, legMat, `tibiaseg_${s.id}`));
    return { ...s, hip, femur, knee };
  });

  // gait clip
  const N = 48;
  const times = [];
  for (let k = 0; k <= N; k++) times.push((k / N) * T);

  const qY = (a) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a);
  const qZ = (a) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), a);
  const push = (arr, q) => arr.push(q.x, q.y, q.z, q.w);

  const tracks = [];
  for (const leg of legs) {
    const hipQ = [];
    const femQ = [];
    const kneeQ = [];
    for (let k = 0; k <= N; k++) {
      const ph = (((k / N) + leg.group * 0.5) % 1 + 1) % 1;
      let s;
      let lift = 0;
      if (ph < 0.5) {
        s = SWING - (2 * SWING * ph) / 0.5; // stance: foot slides back
      } else {
        const u = (ph - 0.5) / 0.5;
        s = -SWING * Math.cos(Math.PI * u); // swing: forward
        lift = Math.sin(Math.PI * u);
      }
      const phi = leg.phi0 + leg.side * s;
      push(hipQ, qY(-phi));
      push(femQ, qZ(ELEV + LIFT * lift));
      push(kneeQ, qZ(KNEE - KNEE_LIFT * lift));
    }
    tracks.push(new THREE.QuaternionKeyframeTrack(`${leg.hip.name}.quaternion`, times, hipQ));
    tracks.push(new THREE.QuaternionKeyframeTrack(`${leg.femur.name}.quaternion`, times, femQ));
    tracks.push(new THREE.QuaternionKeyframeTrack(`${leg.knee.name}.quaternion`, times, kneeQ));
  }

  // body bob (two steps per period) and a slight sway
  const bobPos = [];
  const bobQ = [];
  for (let k = 0; k <= N; k++) {
    const a = (k / N) * Math.PI * 2;
    bobPos.push(0, HIP_Y - 0.015 + 0.025 * Math.cos(2 * a), 0);
    const roll = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0.02 * Math.sin(a));
    push(bobQ, roll);
  }
  tracks.push(new THREE.VectorKeyframeTrack("body.position", times, bobPos));
  tracks.push(new THREE.QuaternionKeyframeTrack("body.quaternion", times, bobQ));

  const clip = new THREE.AnimationClip("spider_walk", T, tracks);

  const camera = new THREE.PerspectiveCamera(38, 16 / 9, 0.1, 100);
  camera.position.set(5.2, 3.6, 6);

  return { scene, camera, cameraTarget: [0, 0.8, 0], clips: [clip] };
}
