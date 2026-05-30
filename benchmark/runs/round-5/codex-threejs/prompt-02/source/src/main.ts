import "./style.css";
import * as THREE from "three";

type Particle = {
  active: boolean;
  age: number;
  life: number;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
};

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
  <div class="hud">
    <label for="rate">Emission rate</label>
    <div class="rate-row">
      <input id="rate" type="range" min="30" max="420" value="185" />
      <output id="rateValue">185 / sec</output>
    </div>
  </div>
`;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x08101d);
scene.fog = new THREE.Fog(0x08101d, 9, 24);

const camera = new THREE.PerspectiveCamera(
  55,
  window.innerWidth / window.innerHeight,
  0.1,
  100,
);
camera.position.set(5.5, 4.2, 7.4);
camera.lookAt(0, 1.6, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

const keyLight = new THREE.DirectionalLight(0xffffff, 2.4);
keyLight.position.set(4, 7, 3);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(1024, 1024);
scene.add(keyLight);
scene.add(new THREE.HemisphereLight(0x8fb6ff, 0x1b2430, 1.3));

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(14, 14, 1, 1),
  new THREE.MeshStandardMaterial({
    color: 0x263241,
    roughness: 0.9,
    metalness: 0.05,
  }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const grid = new THREE.GridHelper(14, 28, 0x7ba7b8, 0x31414f);
grid.position.y = 0.006;
scene.add(grid);

const emitter = new THREE.Group();
const pedestal = new THREE.Mesh(
  new THREE.CylinderGeometry(0.42, 0.55, 0.22, 48),
  new THREE.MeshStandardMaterial({
    color: 0x404f5f,
    roughness: 0.46,
    metalness: 0.35,
  }),
);
pedestal.position.y = 0.11;
pedestal.castShadow = true;
emitter.add(pedestal);

const nozzle = new THREE.Mesh(
  new THREE.CylinderGeometry(0.13, 0.22, 0.42, 32),
  new THREE.MeshStandardMaterial({
    color: 0x72ffe0,
    emissive: 0x125949,
    roughness: 0.22,
    metalness: 0.55,
  }),
);
nozzle.position.y = 0.43;
nozzle.castShadow = true;
emitter.add(nozzle);

const ring = new THREE.Mesh(
  new THREE.TorusGeometry(0.31, 0.018, 12, 56),
  new THREE.MeshStandardMaterial({
    color: 0xffd16a,
    emissive: 0x4e2e06,
    roughness: 0.35,
  }),
);
ring.rotation.x = Math.PI / 2;
ring.position.y = 0.58;
emitter.add(ring);
scene.add(emitter);

const maxParticles = 1800;
const particles: Particle[] = Array.from({ length: maxParticles }, () => ({
  active: false,
  age: 0,
  life: 0,
  position: new THREE.Vector3(),
  velocity: new THREE.Vector3(),
}));
const positions = new Float32Array(maxParticles * 3);
const colors = new Float32Array(maxParticles * 3);
const particleGeometry = new THREE.BufferGeometry();
particleGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
particleGeometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
particleGeometry.setDrawRange(0, maxParticles);

const particleMaterial = new THREE.PointsMaterial({
  size: 0.075,
  vertexColors: true,
  transparent: true,
  opacity: 0.92,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});
const fountain = new THREE.Points(particleGeometry, particleMaterial);
scene.add(fountain);

const birthColor = new THREE.Color(0x7dfffb);
const midColor = new THREE.Color(0xffd56c);
const oldColor = new THREE.Color(0xe35dff);
const deadColor = new THREE.Color(0x121824);
const gravity = new THREE.Vector3(0, -6.8, 0);
const clock = new THREE.Clock();
let spawnCarry = 0;

const rateInput = document.querySelector<HTMLInputElement>("#rate")!;
const rateValue = document.querySelector<HTMLOutputElement>("#rateValue")!;

function emitParticle(): void {
  const particle = particles.find((candidate) => !candidate.active);
  if (!particle) return;

  const angle = Math.random() * Math.PI * 2;
  const radius = Math.random() * 0.075;
  const horizontalSpeed = 0.95 + Math.random() * 1.55;
  const upwardSpeed = 5.1 + Math.random() * 2.0;

  particle.active = true;
  particle.age = 0;
  particle.life = 2.25 + Math.random() * 1.0;
  particle.position.set(Math.cos(angle) * radius, 0.67, Math.sin(angle) * radius);
  particle.velocity.set(
    Math.cos(angle) * horizontalSpeed,
    upwardSpeed,
    Math.sin(angle) * horizontalSpeed,
  );
}

function colorForAge(t: number, target: THREE.Color): THREE.Color {
  if (t < 0.48) {
    return target.copy(birthColor).lerp(midColor, t / 0.48);
  }
  return target.copy(midColor).lerp(oldColor, (t - 0.48) / 0.52);
}

function animate(): void {
  const dt = Math.min(clock.getDelta(), 0.033);
  const rate = Number(rateInput.value);
  rateValue.value = `${rate} / sec`;

  spawnCarry += rate * dt;
  while (spawnCarry >= 1) {
    emitParticle();
    spawnCarry -= 1;
  }

  const tempColor = new THREE.Color();
  for (let i = 0; i < particles.length; i += 1) {
    const particle = particles[i];
    const offset = i * 3;

    if (particle.active) {
      particle.age += dt;
      particle.velocity.addScaledVector(gravity, dt);
      particle.position.addScaledVector(particle.velocity, dt);

      if (particle.position.y < 0.055) {
        particle.position.y = 0.055;
        particle.velocity.y = Math.abs(particle.velocity.y) * 0.28;
        particle.velocity.x *= 0.62;
        particle.velocity.z *= 0.62;
      }

      if (particle.age >= particle.life) {
        particle.active = false;
      }
    }

    if (particle.active) {
      const lifeT = THREE.MathUtils.clamp(particle.age / particle.life, 0, 1);
      const fade = 1 - Math.max(0, lifeT - 0.78) / 0.22;
      colorForAge(lifeT, tempColor).multiplyScalar(Math.max(fade, 0.12));
      positions[offset] = particle.position.x;
      positions[offset + 1] = particle.position.y;
      positions[offset + 2] = particle.position.z;
      colors[offset] = tempColor.r;
      colors[offset + 1] = tempColor.g;
      colors[offset + 2] = tempColor.b;
    } else {
      positions[offset] = 0;
      positions[offset + 1] = -20;
      positions[offset + 2] = 0;
      colors[offset] = deadColor.r;
      colors[offset + 1] = deadColor.g;
      colors[offset + 2] = deadColor.b;
    }
  }

  ring.rotation.z += dt * 1.9;
  particleGeometry.attributes.position.needsUpdate = true;
  particleGeometry.attributes.color.needsUpdate = true;
  renderer.render(scene, camera);
}

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

renderer.setAnimationLoop(animate);
