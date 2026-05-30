import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

const root = document.querySelector<HTMLElement>("#app");
if (!root) {
  throw new Error("Missing #app root element.");
}

document.title = "Sneaker Product Viewer";
document.body.style.margin = "0";
document.body.style.overflow = "hidden";
document.body.style.background = "#f4f1eb";
root.style.width = "100vw";
root.style.height = "100vh";

const overlay = document.createElement("div");
overlay.textContent = "Drag to orbit";
overlay.style.cssText = [
  "position:fixed",
  "left:18px",
  "bottom:16px",
  "padding:8px 11px",
  "border:1px solid rgba(20,24,30,.16)",
  "border-radius:6px",
  "font:500 12px/1.2 system-ui,-apple-system,Segoe UI,sans-serif",
  "color:#25282d",
  "background:rgba(255,255,255,.72)",
  "backdrop-filter:blur(10px)",
  "pointer-events:none",
].join(";");
document.body.appendChild(overlay);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf4f1eb);

const camera = new THREE.PerspectiveCamera(
  38,
  window.innerWidth / window.innerHeight,
  0.01,
  100,
);
camera.position.set(3.3, 1.85, 4.1);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
root.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.055;
controls.minDistance = 2.7;
controls.maxDistance = 8;
controls.maxPolarAngle = Math.PI * 0.49;
controls.target.set(0, 0.72, 0);

const turntable = new THREE.Group();
scene.add(turntable);

const plinthMaterial = new THREE.MeshStandardMaterial({
  color: 0xded9cf,
  roughness: 0.54,
  metalness: 0.04,
});
const plinth = new THREE.Mesh(
  new THREE.CylinderGeometry(1.65, 1.72, 0.34, 96),
  plinthMaterial,
);
plinth.position.y = 0.17;
plinth.receiveShadow = true;
plinth.castShadow = true;
turntable.add(plinth);

const topDisc = new THREE.Mesh(
  new THREE.CylinderGeometry(1.49, 1.49, 0.025, 96),
  new THREE.MeshStandardMaterial({
    color: 0xf8f6f0,
    roughness: 0.36,
    metalness: 0.02,
  }),
);
topDisc.position.y = 0.355;
topDisc.receiveShadow = true;
turntable.add(topDisc);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(18, 18),
  new THREE.ShadowMaterial({ color: 0x1f2328, opacity: 0.16 }),
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.005;
floor.receiveShadow = true;
scene.add(floor);

const hemi = new THREE.HemisphereLight(0xffffff, 0xc8beb1, 1.6);
scene.add(hemi);

const keyLight = new THREE.DirectionalLight(0xffffff, 3.9);
keyLight.position.set(3.8, 5.2, 3.2);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.near = 0.5;
keyLight.shadow.camera.far = 14;
keyLight.shadow.camera.left = -5;
keyLight.shadow.camera.right = 5;
keyLight.shadow.camera.top = 5;
keyLight.shadow.camera.bottom = -5;
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0xd9e8ff, 1.45);
fillLight.position.set(-4.5, 3.2, 2.4);
scene.add(fillLight);

const rimLight = new THREE.DirectionalLight(0xfff2de, 2.3);
rimLight.position.set(-2.4, 3.8, -4.2);
scene.add(rimLight);

const loader = new GLTFLoader();
const sneakerGroup = new THREE.Group();
turntable.add(sneakerGroup);

const status = document.createElement("div");
status.textContent = "Loading sneaker";
status.style.cssText = [
  "position:fixed",
  "inset:0",
  "display:grid",
  "place-items:center",
  "font:600 14px system-ui,-apple-system,Segoe UI,sans-serif",
  "color:#25282d",
  "pointer-events:none",
].join(";");
document.body.appendChild(status);

// Resolves to the only allowed model: benchmark/assets/sneaker.glb.
const sneakerUrl = new URL(
  "../../../../../../assets/sneaker.glb",
  import.meta.url,
).href;

loader.load(
  sneakerUrl,
  (gltf) => {
    const sneaker = gltf.scene;
    sneaker.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.castShadow = true;
        object.receiveShadow = true;
        const material = object.material;
        if (Array.isArray(material)) {
          material.forEach((item) => improveMaterial(item));
        } else {
          improveMaterial(material);
        }
      }
    });

    const box = new THREE.Box3().setFromObject(sneaker);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const largestDimension = Math.max(size.x, size.y, size.z);
    const scale = 2.55 / largestDimension;

    sneaker.position.sub(center);
    sneaker.scale.setScalar(scale);

    const scaledBox = new THREE.Box3().setFromObject(sneaker);
    sneaker.position.y += 0.39 - scaledBox.min.y;

    sneaker.rotation.y = -Math.PI * 0.16;
    sneakerGroup.add(sneaker);
    status.remove();
  },
  undefined,
  (error) => {
    status.textContent = "Could not load benchmark/assets/sneaker.glb";
    console.error("Failed to load benchmark/assets/sneaker.glb", error);
  },
);

function improveMaterial(material: THREE.Material): void {
  if (material instanceof THREE.MeshStandardMaterial) {
    material.envMapIntensity = 0.9;
    material.roughness = Math.min(material.roughness + 0.08, 0.82);
    material.needsUpdate = true;
  }
}

function onResize(): void {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

window.addEventListener("resize", onResize);

renderer.setAnimationLoop((time) => {
  turntable.rotation.y = time * 0.00034;
  controls.update();
  renderer.render(scene, camera);
});
