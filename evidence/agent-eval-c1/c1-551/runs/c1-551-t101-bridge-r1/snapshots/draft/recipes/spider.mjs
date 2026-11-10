// Walking spider built from primitives only. Legs are named node chains animated by one looping 2 s clip.
export const params = { period: 2, bodyColor: "#3a2f33", legColor: "#5a3d36", samples: 40 };

export default function createScene({ THREE, params: p }) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#d9dce2");

  const mat = (color, roughness = 0.55) => new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.05 });
  const bodyMat = mat(p.bodyColor, 0.5);
  const legMat = mat(p.legColor, 0.6);
  const jointMat = mat("#c9822f", 0.45);
  const eyeMat = mat("#101010", 0.2);
  const groundMat = mat("#e6e7ea", 0.95);
  groundMat.name = "ground_mat";
  bodyMat.name = "body_mat";
  legMat.name = "leg_mat";
  jointMat.name = "joint_mat";
  eyeMat.name = "eye_mat";

  // ground
  const ground = new THREE.Mesh(new THREE.CircleGeometry(14, 64), groundMat);
  ground.name = "ground";
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // body
  const BODY_Y = 0.6;
  const body = new THREE.Group();
  body.name = "body";
  body.position.set(0, BODY_Y, 0);
  scene.add(body);

  const thorax = new THREE.Mesh(new THREE.SphereGeometry(0.4, 32, 24), bodyMat);
  thorax.name = "thorax";
  thorax.scale.set(1, 0.75, 1.1);
  thorax.position.set(0, 0, 0.25);
  thorax.castShadow = true;
  body.add(thorax);

  const abdomen = new THREE.Mesh(new THREE.SphereGeometry(0.58, 32, 24), bodyMat);
  abdomen.name = "abdomen";
  abdomen.scale.set(0.95, 0.85, 1.25);
  abdomen.position.set(0, 0.12, -0.6);
  abdomen.castShadow = true;
  body.add(abdomen);

  const stripe = new THREE.Mesh(new THREE.SphereGeometry(0.2, 20, 16), jointMat);
  stripe.name = "abdomen_mark";
  stripe.scale.set(0.9, 0.5, 1.6);
  stripe.position.set(0, 0.62, -0.62);
  stripe.castShadow = true;
  body.add(stripe);

  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 12), eyeMat);
    eye.name = `eye_${s < 0 ? "l" : "r"}`;
    eye.position.set(s * 0.16, 0.14, 0.62);
    body.add(eye);
    const eye2 = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 10), eyeMat);
    eye2.name = `eye_small_${s < 0 ? "l" : "r"}`;
    eye2.position.set(s * 0.3, 0.1, 0.5);
    body.add(eye2);
    const fang = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.22, 12), jointMat);
    fang.name = `fang_${s < 0 ? "l" : "r"}`;
    fang.position.set(s * 0.1, -0.12, 0.7);
    fang.rotation.x = Math.PI * 0.85;
    fang.castShadow = true;
    body.add(fang);
  }

  // legs
  const UPPER = 0.9, LOWER = 1.3;
  const PITCH0 = 0.7;      // upper segment elevation at rest
  const LOWER_ABS = -1.0;  // lower segment absolute angle at rest (pointing down and out)
  const AMP = 0.26;        // swing half-amplitude (rad)
  const LIFT_PITCH = 0.25, LIFT_LOWER = 0.3;
  const baseAngles = [0.75, 0.25, -0.25, -0.75];
  const hipZ = [0.45, 0.3, 0.15, 0.0];

  const segGeo = (len, r0, r1) => {
    const g = new THREE.CylinderGeometry(r1, r0, len, 14, 1);
    g.rotateZ(-Math.PI / 2);
    g.translate(len / 2, 0, 0);
    return g;
  };

  const legs = [];
  for (const side of ["l", "r"]) {
    const s = side === "l" ? -1 : 1;
    for (let j = 0; j < 4; j++) {
      const id = `leg_${side}${j}`;
      const hip = new THREE.Group();
      hip.name = `${id}_hip`;
      hip.position.set(s * 0.28, -0.05, hipZ[j]);
      const baseYaw = s > 0 ? -baseAngles[j] : Math.PI + baseAngles[j];
      hip.rotation.y = baseYaw;
      body.add(hip);

      const shoulder = new THREE.Group();
      shoulder.name = `${id}_shoulder`;
      shoulder.rotation.z = PITCH0;
      hip.add(shoulder);

      const hipBall = new THREE.Mesh(new THREE.SphereGeometry(0.085, 14, 12), jointMat);
      hipBall.name = `${id}_hipball`;
      shoulder.add(hipBall);

      const upper = new THREE.Mesh(segGeo(UPPER, 0.07, 0.05), legMat);
      upper.name = `${id}_upper`;
      upper.castShadow = true;
      shoulder.add(upper);

      const knee = new THREE.Group();
      knee.name = `${id}_knee`;
      knee.position.set(UPPER, 0, 0);
      knee.rotation.z = LOWER_ABS - PITCH0;
      shoulder.add(knee);

      const kneeBall = new THREE.Mesh(new THREE.SphereGeometry(0.075, 14, 12), jointMat);
      kneeBall.name = `${id}_kneeball`;
      knee.add(kneeBall);

      const lower = new THREE.Mesh(segGeo(LOWER, 0.05, 0.025), legMat);
      lower.name = `${id}_lower`;
      lower.castShadow = true;
      knee.add(lower);

      const foot = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 10), jointMat);
      foot.name = `${id}_foot`;
      foot.position.set(LOWER, 0, 0);
      foot.castShadow = true;
      knee.add(foot);

      // diagonal gait: l0, r1, l2, r3 in one group, the others half a cycle later
      const group = (side === "l" ? j % 2 : (j + 1) % 2);
      legs.push({ id, s, baseYaw, offset: group * 0.5 });
    }
  }

  // clip: all channels sampled at N points, last key == first key for a seamless loop
  const N = p.samples;
  const T = p.period;
  const times = [];
  for (let i = 0; i <= N; i++) times.push((i / N) * T);

  const smooth = (x) => x * x * (3 - 2 * x);
  const gait = (phase) => {
    // returns { swing: -1 (back) .. 1 (forward), lift: 0..1 }
    const q = ((phase % 1) + 1) % 1;
    if (q < 0.5) {
      const u = q / 0.5;
      return { swing: -1 + 2 * smooth(u), lift: Math.sin(Math.PI * u) };
    }
    const u = (q - 0.5) / 0.5;
    return { swing: 1 - 2 * u, lift: 0 };
  };

  const qz = new THREE.Vector3(0, 0, 1);
  const qy = new THREE.Vector3(0, 1, 0);
  const tracks = [];
  const push = (arr, q) => arr.push(q.x, q.y, q.z, q.w);
  const qa = new THREE.Quaternion();

  for (const leg of legs) {
    const hipV = [], shV = [], knV = [];
    for (let i = 0; i <= N; i++) {
      const g = gait(i / N + leg.offset);
      // positive yaw moves a right-side leg backward and a left-side leg forward
      const yaw = leg.baseYaw + (leg.s < 0 ? 1 : -1) * AMP * g.swing;
      push(hipV, qa.setFromAxisAngle(qy, yaw));
      const pitch = PITCH0 + LIFT_PITCH * g.lift;
      push(shV, qa.setFromAxisAngle(qz, pitch));
      const lowerAbs = LOWER_ABS + LIFT_LOWER * g.lift;
      push(knV, qa.setFromAxisAngle(qz, lowerAbs - pitch));
    }
    tracks.push(new THREE.QuaternionKeyframeTrack(`${leg.id}_hip.quaternion`, times, hipV));
    tracks.push(new THREE.QuaternionKeyframeTrack(`${leg.id}_shoulder.quaternion`, times, shV));
    tracks.push(new THREE.QuaternionKeyframeTrack(`${leg.id}_knee.quaternion`, times, knV));
  }

  // body bob: two steps per cycle, so two bobs per cycle; slight pitch rock too
  const bobV = [], rockV = [];
  const rockAxis = new THREE.Vector3(1, 0, 0);
  for (let i = 0; i <= N; i++) {
    const ph = i / N;
    bobV.push(0, BODY_Y + 0.035 * Math.cos(4 * Math.PI * ph), 0);
    push(rockV, qa.setFromAxisAngle(rockAxis, 0.02 * Math.sin(4 * Math.PI * ph)));
  }
  tracks.push(new THREE.VectorKeyframeTrack("body.position", times, bobV));
  tracks.push(new THREE.QuaternionKeyframeTrack("body.quaternion", times, rockV));

  const clip = new THREE.AnimationClip("walk", T, tracks);

  // lights
  const hemi = new THREE.HemisphereLight("#ffffff", "#b9bcc4", 0.6);
  hemi.name = "fill";
  scene.add(hemi);
  const key = new THREE.DirectionalLight("#fff4e6", 2.2);
  key.name = "key";
  key.position.set(3.5, 6, 3);
  key.castShadow = true;
  scene.add(key);

  const camera = new THREE.PerspectiveCamera(38, 640 / 360, 0.1, 100);
  camera.position.set(3.7, 3.4, 4.5);

  return {
    scene,
    camera,
    cameraTarget: [0, 0.35, -0.1],
    clips: [clip],
    renderer: { toneMapping: "aces", exposure: 1 }
  };
}
