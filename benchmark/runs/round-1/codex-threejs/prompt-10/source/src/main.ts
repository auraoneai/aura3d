import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Missing #app mount point");
}

const MODEL_URL = "/benchmark/assets/sneaker.glb";

document.body.style.margin = "0";
document.body.style.overflow = "hidden";
document.body.style.background = "#eef0ed";
app.style.width = "100vw";
app.style.height = "100vh";
app.style.position = "relative";
app.style.fontFamily =
  "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf2f3ef);

const camera = new THREE.PerspectiveCamera(
  38,
  window.innerWidth / window.innerHeight,
  0.01,
  100,
);
camera.position.set(4.2, 2.4, 4.8);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.target.set(0, 0.72, 0);
controls.minDistance = 2.6;
controls.maxDistance = 8;
controls.maxPolarAngle = Math.PI * 0.48;
controls.update();

const turntable = new THREE.Group();
scene.add(turntable);

const plinthHeight = 0.34;
const plinthRadius = 1.85;
const plinth = new THREE.Mesh(
  new THREE.CylinderGeometry(plinthRadius, plinthRadius, plinthHeight, 96),
  new THREE.MeshPhysicalMaterial({
    color: 0xd8d7cf,
    roughness: 0.42,
    metalness: 0.02,
    clearcoat: 0.2,
    clearcoatRoughness: 0.38,
  }),
);
plinth.position.y = plinthHeight / 2;
plinth.castShadow = true;
plinth.receiveShadow = true;
turntable.add(plinth);

const bevelRing = new THREE.Mesh(
  new THREE.TorusGeometry(plinthRadius * 0.995, 0.035, 12, 128),
  new THREE.MeshStandardMaterial({
    color: 0xf3f0e7,
    roughness: 0.34,
    metalness: 0.08,
  }),
);
bevelRing.position.y = plinthHeight + 0.012;
bevelRing.rotation.x = Math.PI / 2;
bevelRing.castShadow = true;
turntable.add(bevelRing);

const floor = new THREE.Mesh(
  new THREE.CircleGeometry(7, 128),
  new THREE.ShadowMaterial({ color: 0x9aa09a, opacity: 0.2 }),
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const backWall = new THREE.Mesh(
  new THREE.PlaneGeometry(12, 7),
  new THREE.MeshBasicMaterial({ color: 0xf7f7f3 }),
);
backWall.position.set(0, 3.2, -3.5);
scene.add(backWall);

scene.add(new THREE.HemisphereLight(0xffffff, 0x8c8f84, 1.7));

const keyLight = new THREE.DirectionalLight(0xffffff, 4.2);
keyLight.position.set(3.4, 5.5, 3.1);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.near = 0.5;
keyLight.shadow.camera.far = 12;
keyLight.shadow.camera.left = -4;
keyLight.shadow.camera.right = 4;
keyLight.shadow.camera.top = 4;
keyLight.shadow.camera.bottom = -4;
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0xdde8ff, 1.55);
fillLight.position.set(-3.8, 2.6, 2.8);
scene.add(fillLight);

const rimLight = new THREE.DirectionalLight(0xffffff, 2.6);
rimLight.position.set(-2.2, 3.4, -4.2);
scene.add(rimLight);

const loader = new GLTFLoader();
const sneakerRoot = new THREE.Group();
turntable.add(sneakerRoot);

const status = document.createElement("div");
status.textContent = "Loading sneaker";
status.style.position = "absolute";
status.style.left = "24px";
status.style.bottom = "20px";
status.style.color = "#2f352f";
status.style.fontSize = "13px";
status.style.letterSpacing = "0";
status.style.padding = "8px 10px";
status.style.background = "rgba(255, 255, 255, 0.7)";
status.style.border = "1px solid rgba(47, 53, 47, 0.18)";
status.style.borderRadius = "6px";
status.style.backdropFilter = "blur(8px)";
app.appendChild(status);

loader.load(
  MODEL_URL,
  (gltf) => {
    const sneaker = gltf.scene;

    sneaker.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        const materials = Array.isArray(child.material)
          ? child.material
          : [child.material];
        for (const material of materials) {
          material.needsUpdate = true;
        }
      }
    });

    sneakerRoot.add(sneaker);

    const initialBox = new THREE.Box3().setFromObject(sneaker);
    const initialSize = initialBox.getSize(new THREE.Vector3());
    const initialCenter = initialBox.getCenter(new THREE.Vector3());
    const maxDimension = Math.max(initialSize.x, initialSize.y, initialSize.z);
    const scale = maxDimension > 0 ? 3.05 / maxDimension : 1;

    sneaker.position.sub(initialCenter);
    sneaker.scale.setScalar(scale);
    sneaker.rotation.y = -Math.PI * 0.08;

    const scaledBox = new THREE.Box3().setFromObject(sneakerRoot);
    const scaledCenter = scaledBox.getCenter(new THREE.Vector3());
    const scaledMin = scaledBox.min.clone();

    sneakerRoot.position.set(
      -scaledCenter.x,
      plinthHeight + 0.035 - scaledMin.y,
      -scaledCenter.z,
    );

    const finalBox = new THREE.Box3().setFromObject(sneakerRoot);
    const finalSize = finalBox.getSize(new THREE.Vector3());
    controls.target.set(0, plinthHeight + finalSize.y * 0.52, 0);
    camera.lookAt(controls.target);
    controls.update();

    status.textContent = "Drag to orbit";
  },
  undefined,
  (error) => {
    console.error(error);
    status.textContent = "Could not load sneaker";
  },
);

const clock = new THREE.Clock();

function animate() {
  const delta = clock.getDelta();
  turntable.rotation.y += delta * 0.38;
  controls.update();
  renderer.render(scene, camera);
}

renderer.setAnimationLoop(animate);

window.addEventListener("resize", () => {
  const { innerWidth, innerHeight } = window;
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
