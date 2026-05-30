import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CSS2DObject, CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";

type BarMesh = THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial> & {
  userData: {
    gridX: number;
    gridZ: number;
    height: number;
    targetHeight: number;
    baseColor: THREE.Color;
  };
};

const root = document.querySelector<HTMLElement>("#app");

if (!root) {
  throw new Error("Missing #app root element");
}

root.innerHTML = `
  <main class="scene-shell">
    <div id="viewport" class="viewport"></div>
    <section class="hud" aria-label="Visualization details">
      <h1>6x6 Height Matrix</h1>
      <p>36 animated bars. Color shifts from cool blue to warm red as height increases.</p>
      <div id="readout" class="readout">Hover a bar to inspect its value.</div>
    </section>
  </main>
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
    color: #f7fafc;
    background: #111827;
  }

  .scene-shell {
    position: relative;
    width: 100%;
    height: 100%;
    background:
      radial-gradient(circle at 18% 16%, rgba(34, 197, 94, 0.18), transparent 28%),
      linear-gradient(135deg, #101827 0%, #1f2937 48%, #0f172a 100%);
  }

  .viewport {
    position: absolute;
    inset: 0;
  }

  .viewport canvas {
    display: block;
  }

  .hud {
    position: absolute;
    top: 20px;
    left: 20px;
    width: min(320px, calc(100vw - 40px));
    padding: 16px 18px;
    border: 1px solid rgba(255, 255, 255, 0.16);
    border-radius: 8px;
    background: rgba(15, 23, 42, 0.78);
    box-shadow: 0 18px 42px rgba(0, 0, 0, 0.28);
    backdrop-filter: blur(12px);
    pointer-events: none;
  }

  .hud h1 {
    margin: 0 0 6px;
    font-size: 20px;
    line-height: 1.15;
    letter-spacing: 0;
  }

  .hud p,
  .readout {
    margin: 0;
    font-size: 13px;
    line-height: 1.45;
    color: #dbeafe;
  }

  .readout {
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px solid rgba(255, 255, 255, 0.14);
    color: #ffffff;
    min-height: 19px;
  }

  .axis-label,
  .tick-label,
  .bar-label {
    padding: 4px 7px;
    border-radius: 5px;
    color: #0f172a;
    background: rgba(255, 255, 255, 0.88);
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.22);
    font-size: 12px;
    font-weight: 700;
    white-space: nowrap;
    pointer-events: none;
  }

  .axis-label {
    color: #ffffff;
    background: rgba(15, 23, 42, 0.88);
    border: 1px solid rgba(255, 255, 255, 0.2);
  }

  .bar-label {
    color: #ffffff;
    background: rgba(2, 6, 23, 0.92);
    border: 1px solid rgba(255, 255, 255, 0.2);
    opacity: 0;
    transform: translateY(-8px);
    transition: opacity 140ms ease;
  }

  .bar-label.is-visible {
    opacity: 1;
  }
`;
document.head.appendChild(style);

const viewport = document.querySelector<HTMLElement>("#viewport");
const readout = document.querySelector<HTMLElement>("#readout");

if (!viewport || !readout) {
  throw new Error("Missing visualization elements");
}

const viewportElement = viewport;
const readoutElement = readout;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x111827, 18, 46);

const camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(8.8, 10.6, 12.8);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.02;
viewportElement.appendChild(renderer.domElement);

const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(window.innerWidth, window.innerHeight);
labelRenderer.domElement.style.position = "absolute";
labelRenderer.domElement.style.inset = "0";
labelRenderer.domElement.style.pointerEvents = "none";
viewportElement.appendChild(labelRenderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 1.35, 0);
controls.minDistance = 9;
controls.maxDistance = 26;
controls.maxPolarAngle = Math.PI * 0.47;
controls.update();

scene.add(new THREE.HemisphereLight(0xdbeafe, 0x1e293b, 1.6));

const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
keyLight.position.set(5, 11, 6);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.near = 2;
keyLight.shadow.camera.far = 26;
keyLight.shadow.camera.left = -10;
keyLight.shadow.camera.right = 10;
keyLight.shadow.camera.top = 10;
keyLight.shadow.camera.bottom = -10;
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0x60a5fa, 0.9);
fillLight.position.set(-7, 6, -5);
scene.add(fillLight);

const group = new THREE.Group();
scene.add(group);

const gridSize = 6;
const spacing = 1.5;
const minHeight = 0.45;
const maxHeight = 5.1;
const halfGridSpan = ((gridSize - 1) * spacing) / 2;
const bars: BarMesh[] = [];
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2(-10, -10);
let hoveredBar: BarMesh | null = null;

const base = new THREE.Mesh(
  new THREE.BoxGeometry(gridSize * spacing + 1.15, 0.16, gridSize * spacing + 1.15),
  new THREE.MeshStandardMaterial({
    color: 0x1f2937,
    roughness: 0.86,
    metalness: 0.05,
  }),
);
base.position.y = -0.08;
base.receiveShadow = true;
group.add(base);

const gridHelper = new THREE.GridHelper(gridSize * spacing + 1.1, gridSize, 0xf8fafc, 0x64748b);
gridHelper.position.y = 0.012;
gridHelper.material.transparent = true;
gridHelper.material.opacity = 0.42;
group.add(gridHelper);

const barGeometry = new THREE.BoxGeometry(0.56, 1, 0.56);

function seededRandom(index: number) {
  const x = Math.sin(index * 47.123 + 11.7) * 10000;
  return x - Math.floor(x);
}

function makeHeight(index: number, timeOffset = 0) {
  const wave = Math.sin(index * 1.27 + timeOffset) * 0.5 + 0.5;
  const jitter = seededRandom(index + Math.floor(timeOffset * 13)) * 0.34;
  return THREE.MathUtils.lerp(minHeight, maxHeight, Math.min(1, wave * 0.72 + jitter));
}

function colorForHeight(height: number) {
  const t = THREE.MathUtils.clamp((height - minHeight) / (maxHeight - minHeight), 0, 1);
  const color = new THREE.Color();
  if (t < 0.5) {
    color.lerpColors(new THREE.Color(0x2563eb), new THREE.Color(0x22c55e), t / 0.5);
  } else {
    color.lerpColors(new THREE.Color(0x22c55e), new THREE.Color(0xf97316), (t - 0.5) / 0.5);
  }
  return color;
}

for (let z = 0; z < gridSize; z += 1) {
  for (let x = 0; x < gridSize; x += 1) {
    const index = z * gridSize + x;
    const initialHeight = makeHeight(index);
    const material = new THREE.MeshStandardMaterial({
      color: colorForHeight(initialHeight),
      roughness: 0.48,
      metalness: 0.16,
      emissive: 0x000000,
    });
    const bar = new THREE.Mesh(barGeometry, material) as BarMesh;
    bar.position.set(x * spacing - halfGridSpan, initialHeight / 2, z * spacing - halfGridSpan);
    bar.scale.y = initialHeight;
    bar.castShadow = true;
    bar.receiveShadow = true;
    bar.userData = {
      gridX: x + 1,
      gridZ: z + 1,
      height: initialHeight,
      targetHeight: makeHeight(index, 2.4),
      baseColor: colorForHeight(initialHeight),
    };
    group.add(bar);
    bars.push(bar);
  }
}

function makeLabel(text: string, className: string, position: THREE.Vector3) {
  const element = document.createElement("div");
  element.className = className;
  element.textContent = text;
  const label = new CSS2DObject(element);
  label.position.copy(position);
  scene.add(label);
  return label;
}

makeLabel("X Axis: columns 1-6", "axis-label", new THREE.Vector3(0, 0.22, halfGridSpan + 1.45));
makeLabel("Z Axis: rows 1-6", "axis-label", new THREE.Vector3(halfGridSpan + 1.45, 0.22, 0));
makeLabel("Height / value", "axis-label", new THREE.Vector3(-halfGridSpan - 1.25, maxHeight + 0.5, -halfGridSpan - 0.45));

for (let i = 0; i < gridSize; i += 1) {
  makeLabel(`X${i + 1}`, "tick-label", new THREE.Vector3(i * spacing - halfGridSpan, 0.18, halfGridSpan + 0.78));
  makeLabel(`Z${i + 1}`, "tick-label", new THREE.Vector3(halfGridSpan + 0.78, 0.18, i * spacing - halfGridSpan));
}

const hoverElement = document.createElement("div");
hoverElement.className = "bar-label";
const hoverLabel = new CSS2DObject(hoverElement);
scene.add(hoverLabel);

const verticalAxisMaterial = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 });
const verticalAxis = new THREE.Line(
  new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-halfGridSpan - 0.75, 0, -halfGridSpan - 0.75),
    new THREE.Vector3(-halfGridSpan - 0.75, maxHeight + 0.15, -halfGridSpan - 0.75),
  ]),
  verticalAxisMaterial,
);
scene.add(verticalAxis);

function updatePointer(event: PointerEvent) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}

renderer.domElement.addEventListener("pointermove", updatePointer);
renderer.domElement.addEventListener("pointerleave", () => {
  pointer.set(-10, -10);
});

function setHover(bar: BarMesh | null) {
  if (hoveredBar === bar) return;

  if (hoveredBar) {
    hoveredBar.material.emissive.setHex(0x000000);
    hoveredBar.material.color.copy(hoveredBar.userData.baseColor);
  }

  hoveredBar = bar;

  if (!hoveredBar) {
    readoutElement.textContent = "Hover a bar to inspect its value.";
    hoverElement.classList.remove("is-visible");
    return;
  }

  hoveredBar.material.emissive.setHex(0xffffff);
  hoveredBar.material.emissiveIntensity = 0.34;
  hoveredBar.material.color.setHex(0xffffff);
  readoutElement.textContent = `Column ${hoveredBar.userData.gridX}, row ${hoveredBar.userData.gridZ}: value ${hoveredBar.userData.height.toFixed(2)}`;
  hoverElement.classList.add("is-visible");
}

const clock = new THREE.Clock();
let targetRefresh = 0;

function animate() {
  const delta = clock.getDelta();
  const elapsed = clock.elapsedTime;

  targetRefresh += delta;
  if (targetRefresh > 2.1) {
    targetRefresh = 0;
    bars.forEach((bar, index) => {
      bar.userData.targetHeight = makeHeight(index, elapsed + seededRandom(index) * 3);
    });
  }

  bars.forEach((bar) => {
    const nextHeight = THREE.MathUtils.lerp(bar.userData.height, bar.userData.targetHeight, 1 - Math.pow(0.025, delta));
    bar.userData.height = nextHeight;
    bar.scale.y = nextHeight;
    bar.position.y = nextHeight / 2;
    const baseColor = colorForHeight(nextHeight);
    bar.userData.baseColor.copy(baseColor);
    if (bar !== hoveredBar) {
      bar.material.color.copy(baseColor);
    }
  });

  raycaster.setFromCamera(pointer, camera);
  const intersections = raycaster.intersectObjects(bars, false);
  setHover((intersections[0]?.object as BarMesh | undefined) ?? null);

  if (hoveredBar) {
    hoverLabel.position.set(hoveredBar.position.x, hoveredBar.userData.height + 0.38, hoveredBar.position.z);
    hoverElement.textContent = `${hoveredBar.userData.height.toFixed(2)}`;
    readoutElement.textContent = `Column ${hoveredBar.userData.gridX}, row ${hoveredBar.userData.gridZ}: value ${hoveredBar.userData.height.toFixed(2)}`;
  }

  controls.update();
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
}

renderer.setAnimationLoop(animate);

window.addEventListener("resize", () => {
  const width = window.innerWidth;
  const height = window.innerHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
  labelRenderer.setSize(width, height);
});
