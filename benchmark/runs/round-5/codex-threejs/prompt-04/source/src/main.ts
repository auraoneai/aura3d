import "./style.css";

import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) {
  throw new Error("Missing #app element");
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x03040a);
scene.fog = new THREE.FogExp2(0x081022, 0.052);

const camera = new THREE.PerspectiveCamera(
  74,
  window.innerWidth / window.innerHeight,
  0.02,
  240,
);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.8;
renderer.outputColorSpace = THREE.SRGBColorSpace;
app.appendChild(renderer.domElement);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const bloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  1.45,
  0.72,
  0.05,
);
composer.addPass(bloom);

const curvePoints: THREE.Vector3[] = [];
const pointCount = 34;
for (let i = 0; i < pointCount; i += 1) {
  const z = -i * 8.6;
  const angle = i * 0.56;
  const radius = 4.4 + Math.sin(i * 0.37) * 1.35;
  curvePoints.push(new THREE.Vector3(Math.sin(angle) * radius, Math.cos(angle * 0.83) * 2.7, z));
}

const path = new THREE.CatmullRomCurve3(curvePoints);
path.curveType = "catmullrom";
path.tension = 0.42;

const tunnelGeometry = new THREE.TubeGeometry(path, 680, 3.25, 48, false);
const tunnelMaterial = new THREE.MeshStandardMaterial({
  color: 0x111827,
  roughness: 0.82,
  metalness: 0.15,
  side: THREE.BackSide,
});
const tunnel = new THREE.Mesh(tunnelGeometry, tunnelMaterial);
scene.add(tunnel);

const ambient = new THREE.AmbientLight(0x142035, 0.35);
scene.add(ambient);

const neonColors = [0x00f5ff, 0xff2bd6, 0xfff15a, 0x50ff8a, 0x8c5cff];
const ringGroup = new THREE.Group();
scene.add(ringGroup);

const ringGeometry = new THREE.TorusGeometry(3.16, 0.055, 8, 96);
const radialGeometry = new THREE.BoxGeometry(0.085, 1.15, 0.075);
const markerGeometry = new THREE.BoxGeometry(0.2, 0.5, 0.12);

function orientedFrameAt(t: number) {
  const position = path.getPointAt(t);
  const tangent = path.getTangentAt(t).normalize();
  const normalSeed = Math.abs(tangent.y) > 0.86 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const binormal = new THREE.Vector3().crossVectors(tangent, normalSeed).normalize();
  const normal = new THREE.Vector3().crossVectors(binormal, tangent).normalize();
  const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), tangent);
  return { position, tangent, normal, binormal, quaternion };
}

for (let i = 2; i < 112; i += 1) {
  const t = i / 118;
  const frame = orientedFrameAt(t);
  const color = neonColors[i % neonColors.length];
  const material = new THREE.MeshBasicMaterial({ color, toneMapped: false });

  const ring = new THREE.Mesh(ringGeometry, material);
  ring.position.copy(frame.position);
  ring.quaternion.copy(frame.quaternion);
  ring.rotateZ(i * 0.2);
  ringGroup.add(ring);

  if (i % 2 === 0) {
    for (let spoke = 0; spoke < 6; spoke += 1) {
      const angle = (spoke / 6) * Math.PI * 2 + i * 0.18;
      const spokeMesh = new THREE.Mesh(radialGeometry, material);
      const offset = frame.normal
        .clone()
        .multiplyScalar(Math.cos(angle) * 2.62)
        .add(frame.binormal.clone().multiplyScalar(Math.sin(angle) * 2.62));
      spokeMesh.position.copy(frame.position).add(offset);
      spokeMesh.quaternion.copy(frame.quaternion);
      spokeMesh.rotateZ(angle);
      ringGroup.add(spokeMesh);
    }
  } else {
    for (let block = 0; block < 10; block += 1) {
      if ((block + i) % 3 === 0) continue;
      const angle = (block / 10) * Math.PI * 2 + i * 0.11;
      const marker = new THREE.Mesh(markerGeometry, material);
      const offset = frame.normal
        .clone()
        .multiplyScalar(Math.cos(angle) * 3.07)
        .add(frame.binormal.clone().multiplyScalar(Math.sin(angle) * 3.07));
      marker.position.copy(frame.position).add(offset);
      marker.quaternion.copy(frame.quaternion);
      marker.rotateZ(angle);
      ringGroup.add(marker);
    }
  }

  if (i % 5 === 0) {
    const pointLight = new THREE.PointLight(color, 7.5, 18, 2);
    pointLight.position.copy(frame.position);
    ringGroup.add(pointLight);
  }
}

const stripeMaterialA = new THREE.MeshBasicMaterial({ color: 0x00e7ff, toneMapped: false });
const stripeMaterialB = new THREE.MeshBasicMaterial({ color: 0xff3bd4, toneMapped: false });
const stripeGeometry = new THREE.BoxGeometry(0.085, 0.085, 4.2);
for (let i = 0; i < 90; i += 1) {
  const t = i / 96;
  const frame = orientedFrameAt(t);
  const material = i % 2 === 0 ? stripeMaterialA : stripeMaterialB;
  const stripe = new THREE.Mesh(stripeGeometry, material);
  const angle = i * 0.78;
  const offset = frame.normal
    .clone()
    .multiplyScalar(Math.cos(angle) * 3.01)
    .add(frame.binormal.clone().multiplyScalar(Math.sin(angle) * 3.01));
  stripe.position.copy(frame.position).add(offset);
  stripe.quaternion.copy(frame.quaternion);
  stripe.rotateZ(angle);
  ringGroup.add(stripe);
}

const starGeometry = new THREE.BufferGeometry();
const starPositions: number[] = [];
for (let i = 0; i < 900; i += 1) {
  starPositions.push(
    (Math.random() - 0.5) * 150,
    (Math.random() - 0.5) * 80,
    -Math.random() * 260,
  );
}
starGeometry.setAttribute("position", new THREE.Float32BufferAttribute(starPositions, 3));
const stars = new THREE.Points(
  starGeometry,
  new THREE.PointsMaterial({ color: 0x335477, size: 0.035, transparent: true, opacity: 0.55 }),
);
scene.add(stars);

const clock = new THREE.Clock();
const forward = new THREE.Vector3();

function animate() {
  const elapsed = clock.getElapsedTime();
  const travel = (elapsed * 0.036) % 0.82;
  const wobble = Math.sin(elapsed * 1.7) * 0.012;
  const t = 0.025 + travel;
  const lookT = Math.min(t + 0.026 + wobble, 0.985);
  const frame = orientedFrameAt(t);
  const lookAt = path.getPointAt(lookT);

  camera.position.copy(frame.position);
  camera.position.add(frame.normal.clone().multiplyScalar(Math.sin(elapsed * 2.4) * 0.28));
  camera.position.add(frame.binormal.clone().multiplyScalar(Math.cos(elapsed * 1.9) * 0.24));
  camera.lookAt(lookAt);
  camera.getWorldDirection(forward);
  camera.rotateZ(Math.sin(elapsed * 0.9) * 0.17);

  ringGroup.rotation.z = Math.sin(elapsed * 0.33) * 0.04;
  stars.position.z = (elapsed * 6.5) % 48;
  composer.render();
}

renderer.setAnimationLoop(animate);

window.addEventListener("resize", () => {
  const { innerWidth, innerHeight } = window;
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  bloom.setSize(innerWidth, innerHeight);
});
