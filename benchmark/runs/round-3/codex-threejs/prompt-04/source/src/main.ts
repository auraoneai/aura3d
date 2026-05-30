import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

declare global {
  interface Window {
    __NEON_TUNNEL_STATE__?: {
      cameraDistance: number;
      cameraPosition: [number, number, number];
      frame: number;
    };
  }
}

const root = document.querySelector<HTMLElement>("#app");
if (!root) {
  throw new Error("Missing #app mount node");
}

document.body.style.margin = "0";
document.body.style.overflow = "hidden";
document.body.style.background = "#02030a";
root.style.width = "100vw";
root.style.height = "100vh";

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18;
renderer.outputColorSpace = THREE.SRGBColorSpace;
root.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x02030a);
scene.fog = new THREE.FogExp2(0x02030a, 0.027);

const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.03, 190);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  1.35,
  0.52,
  0.08,
);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

const tunnelPath = new THREE.CatmullRomCurve3(
  [
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(2.6, 0.8, -12),
    new THREE.Vector3(-3.1, -1.1, -25),
    new THREE.Vector3(3.3, 1.7, -39),
    new THREE.Vector3(-2.4, 0.2, -55),
    new THREE.Vector3(1.7, -2.0, -73),
    new THREE.Vector3(0, 0.4, -93),
  ],
  false,
  "catmullrom",
  0.48,
);

const tunnelRadius = 4.25;
const tubularSegments = 520;
const radialSegments = 48;

const tunnelMaterial = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  transparent: true,
  depthWrite: false,
  uniforms: {
    uTime: { value: 0 },
    uFogColor: { value: new THREE.Color(0x02030a) },
  },
  vertexShader: `
    varying vec2 vUv;
    varying float vDepth;

    void main() {
      vUv = uv;
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      vDepth = -mvPosition.z;
      gl_Position = projectionMatrix * mvPosition;
    }
  `,
  fragmentShader: `
    uniform float uTime;
    uniform vec3 uFogColor;
    varying vec2 vUv;
    varying float vDepth;

    void main() {
      float ribs = smoothstep(0.965, 1.0, sin(vUv.x * 228.0 - uTime * 3.0) * 0.5 + 0.5);
      float scan = smoothstep(0.80, 1.0, sin(vUv.x * 42.0 + vUv.y * 18.0 + uTime * 1.8) * 0.5 + 0.5);
      float lanes = pow(abs(sin(vUv.y * 18.8496)), 17.0);
      vec3 base = vec3(0.008, 0.012, 0.040);
      vec3 violet = vec3(0.95, 0.08, 1.0);
      vec3 cyan = vec3(0.0, 0.95, 1.0);
      vec3 color = base + ribs * mix(violet, cyan, sin(vUv.x * 12.0) * 0.5 + 0.5) * 1.9;
      color += scan * vec3(0.16, 0.55, 1.0) * 0.34;
      color += lanes * vec3(0.75, 0.04, 1.0) * 0.46;

      float fogFactor = 1.0 - exp(-vDepth * 0.030);
      color = mix(color, uFogColor, clamp(fogFactor, 0.0, 0.86));
      gl_FragColor = vec4(color, 0.97);
    }
  `,
});

const tunnel = new THREE.Mesh(
  new THREE.TubeGeometry(tunnelPath, tubularSegments, tunnelRadius, radialSegments, false),
  tunnelMaterial,
);
scene.add(tunnel);

const centerLine = new THREE.Line(
  new THREE.BufferGeometry().setFromPoints(tunnelPath.getPoints(220)),
  new THREE.LineBasicMaterial({ color: 0x27f4ff, transparent: true, opacity: 0.26 }),
);
scene.add(centerLine);

const cyanPanel = new THREE.MeshBasicMaterial({
  color: 0x20f6ff,
  transparent: true,
  opacity: 0.82,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  side: THREE.DoubleSide,
});
const pinkPanel = new THREE.MeshBasicMaterial({
  color: 0xff2bd6,
  transparent: true,
  opacity: 0.78,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  side: THREE.DoubleSide,
});
const amberPanel = new THREE.MeshBasicMaterial({
  color: 0xffd35a,
  transparent: true,
  opacity: 0.54,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  side: THREE.DoubleSide,
});

const panelGeometry = new THREE.PlaneGeometry(1.15, 2.05);
const scratch = {
  tangent: new THREE.Vector3(),
  up: new THREE.Vector3(0, 1, 0),
  normal: new THREE.Vector3(),
  binormal: new THREE.Vector3(),
  radial: new THREE.Vector3(),
  angular: new THREE.Vector3(),
  position: new THREE.Vector3(),
  lookAhead: new THREE.Vector3(),
  matrix: new THREE.Matrix4(),
};

function frameAt(t: number) {
  tunnelPath.getTangentAt(t, scratch.tangent).normalize();
  scratch.binormal.crossVectors(scratch.tangent, scratch.up);
  if (scratch.binormal.lengthSq() < 0.001) {
    scratch.binormal.set(1, 0, 0);
  } else {
    scratch.binormal.normalize();
  }
  scratch.normal.crossVectors(scratch.binormal, scratch.tangent).normalize();
}

const glowPanels: THREE.Mesh[] = [];
for (let i = 0; i < 138; i += 1) {
  const t = 0.018 + (i / 138) * 0.954;
  frameAt(t);
  const ringOffset = (i % 6) * (Math.PI / 3);
  const stagger = Math.sin(i * 1.91) * 0.22;
  const angle = ringOffset + stagger + (i % 2) * 0.55;
  scratch.radial
    .copy(scratch.normal)
    .multiplyScalar(Math.cos(angle))
    .addScaledVector(scratch.binormal, Math.sin(angle))
    .normalize();
  scratch.angular.crossVectors(scratch.tangent, scratch.radial).normalize();
  scratch.position.copy(tunnelPath.getPointAt(t)).addScaledVector(scratch.radial, tunnelRadius - 0.08);

  const material = i % 5 === 0 ? amberPanel : i % 2 === 0 ? cyanPanel : pinkPanel;
  const panel = new THREE.Mesh(panelGeometry, material);
  panel.scale.set(1.0 + (i % 3) * 0.35, 1.2 + (i % 4) * 0.52, 1);
  scratch.matrix.makeBasis(scratch.angular, scratch.tangent, scratch.radial.clone().multiplyScalar(-1));
  panel.quaternion.setFromRotationMatrix(scratch.matrix);
  panel.position.copy(scratch.position);
  panel.userData.phase = i * 0.37;
  glowPanels.push(panel);
  scene.add(panel);
}

const haloMaterial = new THREE.MeshBasicMaterial({
  color: 0x77f7ff,
  transparent: true,
  opacity: 0.18,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  side: THREE.DoubleSide,
});
const ringGeometry = new THREE.TorusGeometry(tunnelRadius * 0.985, 0.018, 8, 160);
const halos: THREE.Mesh[] = [];
for (let i = 0; i < 34; i += 1) {
  const t = 0.025 + (i / 34) * 0.95;
  frameAt(t);
  const halo = new THREE.Mesh(ringGeometry, haloMaterial);
  halo.position.copy(tunnelPath.getPointAt(t));
  scratch.matrix.makeBasis(scratch.binormal, scratch.normal, scratch.tangent);
  halo.quaternion.setFromRotationMatrix(scratch.matrix);
  halo.userData.phase = i * 0.83;
  halos.push(halo);
  scene.add(halo);
}

scene.add(new THREE.AmbientLight(0x1a2444, 0.7));
const cameraLight = new THREE.PointLight(0x77dfff, 2.4, 18, 2.0);
scene.add(cameraLight);

const vignette = document.createElement("div");
vignette.style.position = "fixed";
vignette.style.inset = "0";
vignette.style.pointerEvents = "none";
vignette.style.background =
  "radial-gradient(circle at center, transparent 0%, transparent 48%, rgba(0,0,0,0.46) 100%)";
root.appendChild(vignette);

let frame = 0;

function animate(ms: number) {
  const time = ms * 0.001;
  const progress = (time * 0.055) % 0.91;
  const cameraT = 0.035 + progress;
  const lookT = Math.min(cameraT + 0.026, 0.992);

  tunnelMaterial.uniforms.uTime.value = time;
  tunnel.rotation.z = Math.sin(time * 0.23) * 0.045;

  camera.position.copy(tunnelPath.getPointAt(cameraT));
  scratch.lookAhead.copy(tunnelPath.getPointAt(lookT));
  frameAt(cameraT);
  camera.position.addScaledVector(scratch.normal, Math.sin(time * 1.35) * 0.28);
  camera.position.addScaledVector(scratch.binormal, Math.cos(time * 1.1) * 0.22);
  camera.lookAt(scratch.lookAhead);
  camera.rotateZ(Math.sin(time * 0.8) * 0.1);
  cameraLight.position.copy(camera.position);

  glowPanels.forEach((panel, index) => {
    const pulse = 0.72 + Math.sin(time * 4.2 + panel.userData.phase) * 0.22;
    panel.scale.z = 1;
    (panel.material as THREE.MeshBasicMaterial).opacity = (index % 5 === 0 ? 0.46 : 0.72) * pulse;
  });
  halos.forEach((halo) => {
    (halo.material as THREE.MeshBasicMaterial).opacity = 0.12 + Math.sin(time * 3.1 + halo.userData.phase) * 0.055;
  });

  window.__NEON_TUNNEL_STATE__ = {
    cameraDistance: tunnelPath.getLength() * cameraT,
    cameraPosition: [camera.position.x, camera.position.y, camera.position.z],
    frame,
  };
  frame += 1;

  composer.render();
}

renderer.setAnimationLoop(animate);

window.addEventListener("resize", () => {
  const width = window.innerWidth;
  const height = window.innerHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
  composer.setSize(width, height);
  bloomPass.setSize(width, height);
});
