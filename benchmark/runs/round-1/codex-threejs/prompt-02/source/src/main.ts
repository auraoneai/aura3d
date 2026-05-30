import * as THREE from 'three';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('Missing #app mount point');
}

document.body.style.margin = '0';
document.body.style.overflow = 'hidden';
document.body.style.background = '#0b1018';
document.body.style.fontFamily =
  'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b1018);
scene.fog = new THREE.Fog(0x0b1018, 9, 18);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 80);
camera.position.set(5.3, 4.1, 7.2);
camera.lookAt(0, 1.55, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

const ambient = new THREE.HemisphereLight(0xb9d7ff, 0x1d2634, 1.7);
scene.add(ambient);

const keyLight = new THREE.DirectionalLight(0xffffff, 2.7);
keyLight.position.set(3.5, 8, 4);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(1536, 1536);
keyLight.shadow.camera.near = 0.5;
keyLight.shadow.camera.far = 18;
keyLight.shadow.camera.left = -7;
keyLight.shadow.camera.right = 7;
keyLight.shadow.camera.top = 7;
keyLight.shadow.camera.bottom = -7;
scene.add(keyLight);

const fillLight = new THREE.PointLight(0x50c8ff, 18, 8);
fillLight.position.set(-2.2, 2.2, 1.8);
scene.add(fillLight);

function makeCheckerTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Canvas 2D context unavailable');
  }

  context.fillStyle = '#17202b';
  context.fillRect(0, 0, canvas.width, canvas.height);

  const tile = 64;
  for (let y = 0; y < canvas.height; y += tile) {
    for (let x = 0; x < canvas.width; x += tile) {
      context.fillStyle = (x / tile + y / tile) % 2 === 0 ? '#222e3d' : '#121923';
      context.fillRect(x, y, tile, tile);
    }
  }

  context.strokeStyle = '#3f5166';
  context.lineWidth = 2;
  for (let i = 0; i <= canvas.width; i += tile) {
    context.beginPath();
    context.moveTo(i, 0);
    context.lineTo(i, canvas.height);
    context.stroke();
    context.beginPath();
    context.moveTo(0, i);
    context.lineTo(canvas.width, i);
    context.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(5, 5);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(16, 16),
  new THREE.MeshStandardMaterial({
    map: makeCheckerTexture(),
    roughness: 0.82,
    metalness: 0.04,
  }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const originMarker = new THREE.Group();
scene.add(originMarker);

const base = new THREE.Mesh(
  new THREE.CylinderGeometry(0.52, 0.68, 0.22, 48),
  new THREE.MeshStandardMaterial({ color: 0x2a3748, roughness: 0.46, metalness: 0.6 }),
);
base.position.y = 0.11;
base.castShadow = true;
originMarker.add(base);

const nozzle = new THREE.Mesh(
  new THREE.ConeGeometry(0.28, 0.55, 48, 1, true),
  new THREE.MeshStandardMaterial({
    color: 0x7fdcff,
    emissive: 0x0b5472,
    roughness: 0.25,
    metalness: 0.35,
    side: THREE.DoubleSide,
  }),
);
nozzle.position.y = 0.48;
nozzle.castShadow = true;
originMarker.add(nozzle);

const emitterGlow = new THREE.Mesh(
  new THREE.TorusGeometry(0.34, 0.022, 10, 64),
  new THREE.MeshBasicMaterial({ color: 0x75e6ff }),
);
emitterGlow.position.y = 0.74;
emitterGlow.rotation.x = Math.PI / 2;
originMarker.add(emitterGlow);

const guideArc = new THREE.Line(
  new THREE.BufferGeometry().setFromPoints(
    Array.from({ length: 48 }, (_, index) => {
      const t = index / 47;
      const x = (t - 0.5) * 2.9;
      const y = 0.78 + Math.sin(t * Math.PI) * 2.35;
      return new THREE.Vector3(x, y, -0.72);
    }),
  ),
  new THREE.LineBasicMaterial({ color: 0x28465e, transparent: true, opacity: 0.38 }),
);
scene.add(guideArc);

const maxParticles = 1500;
const positions = new Float32Array(maxParticles * 3);
const colors = new Float32Array(maxParticles * 3);
const sizes = new Float32Array(maxParticles);
const geometry = new THREE.BufferGeometry();
geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
geometry.setDrawRange(0, maxParticles);

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
      gl_PointSize = size * (220.0 / -mvPosition.z);
      gl_Position = projectionMatrix * mvPosition;
    }
  `,
  fragmentShader: `
    varying vec3 vColor;

    void main() {
      vec2 p = gl_PointCoord - vec2(0.5);
      float d = length(p);
      float alpha = smoothstep(0.5, 0.08, d);
      vec3 hotCenter = mix(vColor, vec3(1.0), smoothstep(0.34, 0.0, d) * 0.38);
      gl_FragColor = vec4(hotCenter, alpha);
    }
  `,
});

const particlePoints = new THREE.Points(geometry, particleMaterial);
scene.add(particlePoints);

type Particle = {
  active: boolean;
  age: number;
  lifetime: number;
  bounces: number;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
};

const particles: Particle[] = Array.from({ length: maxParticles }, () => ({
  active: false,
  age: 0,
  lifetime: 1,
  bounces: 0,
  position: new THREE.Vector3(),
  velocity: new THREE.Vector3(),
}));

let nextParticle = 0;
let emitAccumulator = 0;
let emissionRate = 210;
const gravity = new THREE.Vector3(0, -7.8, 0);
const spawnPosition = new THREE.Vector3(0, 0.82, 0);
const youngColor = new THREE.Color(0x9ff7ff);
const midColor = new THREE.Color(0xffe66b);
const oldColor = new THREE.Color(0xff5b7c);
const scratchColor = new THREE.Color();

function spawnParticle() {
  const particle = particles[nextParticle];
  nextParticle = (nextParticle + 1) % particles.length;

  const angle = Math.random() * Math.PI * 2;
  const spread = 0.58 + Math.random() * 1.18;
  const sideways = Math.random() * 0.2 + 0.78;

  particle.active = true;
  particle.age = 0;
  particle.lifetime = 2.1 + Math.random() * 1.4;
  particle.bounces = 0;
  particle.position.copy(spawnPosition);
  particle.position.x += (Math.random() - 0.5) * 0.08;
  particle.position.z += (Math.random() - 0.5) * 0.08;
  particle.velocity.set(
    Math.cos(angle) * spread * sideways,
    5.1 + Math.random() * 2.2,
    Math.sin(angle) * spread * sideways,
  );
}

function colorByLifetime(normalizedAge: number) {
  if (normalizedAge < 0.5) {
    scratchColor.copy(youngColor).lerp(midColor, normalizedAge / 0.5);
  } else {
    scratchColor.copy(midColor).lerp(oldColor, (normalizedAge - 0.5) / 0.5);
  }

  return scratchColor;
}

function advanceParticles(delta: number) {
  emitAccumulator += emissionRate * delta;
  const spawnCount = Math.min(90, Math.floor(emitAccumulator));
  emitAccumulator -= spawnCount;
  for (let i = 0; i < spawnCount; i += 1) {
    spawnParticle();
  }

  for (const particle of particles) {
    if (!particle.active) {
      continue;
    }

    particle.age += delta;
    if (particle.age >= particle.lifetime) {
      particle.active = false;
      continue;
    }

    particle.velocity.addScaledVector(gravity, delta);
    particle.position.addScaledVector(particle.velocity, delta);

    if (particle.position.y < 0.035) {
      particle.position.y = 0.035;
      particle.velocity.y = Math.abs(particle.velocity.y) * 0.34;
      particle.velocity.x *= 0.72;
      particle.velocity.z *= 0.72;
      particle.bounces += 1;

      if (particle.bounces > 2 || particle.velocity.y < 0.55) {
        particle.active = false;
      }
    }
  }
}

for (let i = 0; i < 110; i += 1) {
  advanceParticles(1 / 60);
}

const ui = document.createElement('section');
ui.setAttribute('aria-label', 'Particle fountain controls');
ui.style.position = 'fixed';
ui.style.left = '20px';
ui.style.top = '20px';
ui.style.width = 'min(330px, calc(100vw - 40px))';
ui.style.boxSizing = 'border-box';
ui.style.padding = '16px';
ui.style.border = '1px solid rgba(154, 220, 255, 0.28)';
ui.style.borderRadius = '8px';
ui.style.background = 'rgba(9, 14, 22, 0.78)';
ui.style.backdropFilter = 'blur(10px)';
ui.style.color = '#edf8ff';
ui.style.boxShadow = '0 16px 40px rgba(0, 0, 0, 0.28)';
ui.innerHTML = `
  <div style="display:flex;align-items:center;justify-content:space-between;gap:14px;margin-bottom:10px;">
    <strong style="font-size:15px;letter-spacing:0;">Particle Fountain</strong>
    <span id="rateValue" style="font-variant-numeric:tabular-nums;color:#9ff7ff;">210/s</span>
  </div>
  <label for="rate" style="display:block;font-size:13px;color:#b8c8d8;margin-bottom:8px;">Emission rate</label>
  <input id="rate" type="range" min="35" max="520" value="210" step="5" style="width:100%;accent-color:#64e4ff;" />
`;
document.body.appendChild(ui);

const rateInput = document.querySelector<HTMLInputElement>('#rate');
const rateValue = document.querySelector<HTMLSpanElement>('#rateValue');

rateInput?.addEventListener('input', () => {
  emissionRate = Number(rateInput.value);
  if (rateValue) {
    rateValue.textContent = `${emissionRate}/s`;
  }
});

const clock = new THREE.Clock();

function animate() {
  const delta = Math.min(clock.getDelta(), 0.033);
  const time = clock.elapsedTime;

  emitterGlow.scale.setScalar(1 + Math.sin(time * 7.5) * 0.07);
  fillLight.intensity = 16 + Math.sin(time * 5.2) * 3;

  advanceParticles(delta);

  let visibleIndex = 0;
  for (const particle of particles) {
    if (!particle.active) {
      continue;
    }

    const normalizedAge = particle.age / particle.lifetime;
    const color = colorByLifetime(normalizedAge);
    const offset = visibleIndex * 3;

    positions[offset] = particle.position.x;
    positions[offset + 1] = particle.position.y;
    positions[offset + 2] = particle.position.z;
    colors[offset] = color.r;
    colors[offset + 1] = color.g;
    colors[offset + 2] = color.b;
    sizes[visibleIndex] = 0.074 + (1 - normalizedAge) * 0.06;
    visibleIndex += 1;
  }

  geometry.setDrawRange(0, visibleIndex);
  geometry.attributes.position.needsUpdate = true;
  geometry.attributes.color.needsUpdate = true;
  geometry.attributes.size.needsUpdate = true;

  renderer.render(scene, camera);
}

renderer.setAnimationLoop(animate);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  particleMaterial.uniforms.pixelRatio.value = renderer.getPixelRatio();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
