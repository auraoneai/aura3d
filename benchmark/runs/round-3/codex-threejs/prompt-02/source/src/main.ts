import * as THREE from "three";

const root = document.querySelector<HTMLElement>("#app");

if (!root) {
  throw new Error("Missing #app root element");
}

root.innerHTML = `
  <div class="viewport"></div>
  <section class="controls" aria-label="Particle fountain controls">
    <label for="emissionRate">Emission rate</label>
    <div class="controlRow">
      <input id="emissionRate" type="range" min="25" max="520" step="5" value="240" />
      <output id="rateValue" for="emissionRate">240 / sec</output>
    </div>
  </section>
`;

const style = document.createElement("style");
style.textContent = `
  html,
  body,
  #app {
    width: 100%;
    height: 100%;
    margin: 0;
    overflow: hidden;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    background: #101214;
  }

  .viewport {
    position: fixed;
    inset: 0;
  }

  .controls {
    position: fixed;
    left: 20px;
    bottom: 18px;
    width: min(360px, calc(100vw - 40px));
    box-sizing: border-box;
    padding: 14px 16px 16px;
    color: #eef5f7;
    background: rgba(16, 18, 20, 0.76);
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 8px;
    backdrop-filter: blur(10px);
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.34);
  }

  .controls label {
    display: block;
    margin-bottom: 10px;
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0;
  }

  .controlRow {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: center;
    gap: 12px;
  }

  input[type="range"] {
    width: 100%;
    accent-color: #49d2ff;
  }

  output {
    min-width: 82px;
    font-size: 12px;
    color: #bdeefa;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
`;
document.head.appendChild(style);

const viewport = root.querySelector<HTMLElement>(".viewport");
const slider = root.querySelector<HTMLInputElement>("#emissionRate");
const rateValue = root.querySelector<HTMLOutputElement>("#rateValue");

if (!viewport || !slider || !rateValue) {
  throw new Error("Control markup failed to initialize");
}

const emissionRateSlider = slider;
const emissionRateOutput = rateValue;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x101214);
scene.fog = new THREE.Fog(0x101214, 9, 24);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(5.6, 4.1, 7.0);
camera.lookAt(0, 1.35, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
viewport.appendChild(renderer.domElement);

const hemiLight = new THREE.HemisphereLight(0xbfefff, 0x20252a, 2.1);
scene.add(hemiLight);

const keyLight = new THREE.DirectionalLight(0xffffff, 2.4);
keyLight.position.set(-4, 7, 4);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(1024, 1024);
scene.add(keyLight);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(16, 16, 32, 32),
  new THREE.MeshStandardMaterial({
    color: 0x263136,
    roughness: 0.78,
    metalness: 0.05,
    side: THREE.DoubleSide,
  }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const grid = new THREE.GridHelper(16, 32, 0x6a8088, 0x354249);
grid.position.y = 0.012;
scene.add(grid);

const emitterGroup = new THREE.Group();
const emitterBase = new THREE.Mesh(
  new THREE.CylinderGeometry(0.28, 0.44, 0.22, 36),
  new THREE.MeshStandardMaterial({ color: 0x3b4650, roughness: 0.48, metalness: 0.52 }),
);
emitterBase.position.y = 0.11;
emitterBase.castShadow = true;
emitterGroup.add(emitterBase);

const emitterNozzle = new THREE.Mesh(
  new THREE.ConeGeometry(0.2, 0.48, 36),
  new THREE.MeshStandardMaterial({ color: 0x72e6ff, roughness: 0.24, metalness: 0.38, emissive: 0x0a4f66 }),
);
emitterNozzle.position.y = 0.46;
emitterNozzle.castShadow = true;
emitterGroup.add(emitterNozzle);

const emitterRing = new THREE.Mesh(
  new THREE.TorusGeometry(0.28, 0.018, 10, 48),
  new THREE.MeshBasicMaterial({ color: 0x98f0ff }),
);
emitterRing.position.y = 0.72;
emitterRing.rotation.x = Math.PI / 2;
emitterGroup.add(emitterRing);
scene.add(emitterGroup);

const maxParticles = 1800;
const positions = new Float32Array(maxParticles * 3);
const colors = new Float32Array(maxParticles * 3);
const sizes = new Float32Array(maxParticles);
const velocities = Array.from({ length: maxParticles }, () => new THREE.Vector3());
const ages = new Float32Array(maxParticles);
const lifetimes = new Float32Array(maxParticles);
const alive = new Uint8Array(maxParticles);

const particleGeometry = new THREE.BufferGeometry();
particleGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
particleGeometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
particleGeometry.setAttribute("size", new THREE.BufferAttribute(sizes, 1));

const particleMaterial = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  vertexColors: true,
  uniforms: {
    pixelRatio: { value: renderer.getPixelRatio() },
  },
  vertexShader: `
    attribute float size;
    varying vec3 vColor;

    void main() {
      vColor = color;
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = size * (240.0 / -mvPosition.z);
      gl_Position = projectionMatrix * mvPosition;
    }
  `,
  fragmentShader: `
    varying vec3 vColor;

    void main() {
      vec2 centered = gl_PointCoord - vec2(0.5);
      float falloff = 1.0 - smoothstep(0.12, 0.5, length(centered));
      gl_FragColor = vec4(vColor, falloff * 0.92);
    }
  `,
});

const points = new THREE.Points(particleGeometry, particleMaterial);
scene.add(points);

const colorStart = new THREE.Color(0x82f5ff);
const colorMid = new THREE.Color(0xfff36d);
const colorEnd = new THREE.Color(0xff5b7d);
let nextParticle = 0;
let emitCarry = 0;
let emissionRate = Number(emissionRateSlider.value);

function randomSpread(): number {
  return (Math.random() - 0.5) * 2;
}

function spawnParticle() {
  const i = nextParticle;
  nextParticle = (nextParticle + 1) % maxParticles;

  const angle = Math.random() * Math.PI * 2;
  const radius = Math.sqrt(Math.random()) * 0.12;
  positions[i * 3] = Math.cos(angle) * radius;
  positions[i * 3 + 1] = 0.78;
  positions[i * 3 + 2] = Math.sin(angle) * radius;

  velocities[i].set(randomSpread() * 0.95, 5.2 + Math.random() * 2.35, randomSpread() * 0.95);
  ages[i] = 0;
  lifetimes[i] = 2.65 + Math.random() * 1.25;
  alive[i] = 1;
  sizes[i] = 0.062 + Math.random() * 0.035;
}

function updateParticleColor(index: number, normalizedAge: number) {
  const color =
    normalizedAge < 0.5
      ? colorStart.clone().lerp(colorMid, normalizedAge * 2)
      : colorMid.clone().lerp(colorEnd, (normalizedAge - 0.5) * 2);

  colors[index * 3] = color.r;
  colors[index * 3 + 1] = color.g;
  colors[index * 3 + 2] = color.b;
}

function updateRateLabel() {
  emissionRate = Number(emissionRateSlider.value);
  emissionRateOutput.value = `${emissionRate} / sec`;
}

emissionRateSlider.addEventListener("input", updateRateLabel);
updateRateLabel();

const clock = new THREE.Clock();
const gravity = new THREE.Vector3(0, -7.9, 0);

function animate() {
  const dt = Math.min(clock.getDelta(), 0.033);
  const elapsed = clock.elapsedTime;

  emitCarry += emissionRate * dt;
  const toEmit = Math.floor(emitCarry);
  emitCarry -= toEmit;

  for (let i = 0; i < toEmit; i += 1) {
    spawnParticle();
  }

  emitterRing.scale.setScalar(1 + Math.sin(elapsed * 9) * 0.055);
  emitterRing.material.opacity = 0.7 + Math.sin(elapsed * 11) * 0.2;

  for (let i = 0; i < maxParticles; i += 1) {
    if (!alive[i]) continue;

    ages[i] += dt;
    const ageT = ages[i] / lifetimes[i];
    if (ageT >= 1) {
      alive[i] = 0;
      positions[i * 3 + 1] = -100;
      continue;
    }

    velocities[i].addScaledVector(gravity, dt);

    positions[i * 3] += velocities[i].x * dt;
    positions[i * 3 + 1] += velocities[i].y * dt;
    positions[i * 3 + 2] += velocities[i].z * dt;

    if (positions[i * 3 + 1] < 0.045) {
      positions[i * 3 + 1] = 0.045;
      if (velocities[i].y < 0) {
        velocities[i].y *= -0.28;
        velocities[i].x *= 0.62;
        velocities[i].z *= 0.62;
      }
    }

    const fade = Math.sin(ageT * Math.PI);
    sizes[i] = (0.035 + (1 - ageT) * 0.065) * Math.max(0.35, fade);
    updateParticleColor(i, ageT);
  }

  particleGeometry.attributes.position.needsUpdate = true;
  particleGeometry.attributes.color.needsUpdate = true;
  particleGeometry.attributes.size.needsUpdate = true;

  camera.position.x = Math.sin(elapsed * 0.12) * 0.45 + 5.6;
  camera.lookAt(0, 1.5, 0);
  renderer.render(scene, camera);
}

renderer.setAnimationLoop(animate);

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
