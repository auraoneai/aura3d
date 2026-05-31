import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('Missing #app root element.');
}

const css = document.createElement('style');
css.textContent = `
  html,
  body,
  #app {
    width: 100%;
    height: 100%;
    margin: 0;
    overflow: hidden;
    background: #eef0f2;
  }

  body {
    font-family:
      Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
      "Segoe UI", sans-serif;
  }

  .viewer {
    position: relative;
    width: 100%;
    height: 100%;
  }

  .label {
    position: absolute;
    left: 24px;
    bottom: 22px;
    color: #1b1f24;
    letter-spacing: 0;
    pointer-events: none;
  }

  .label strong {
    display: block;
    font-size: 15px;
    font-weight: 650;
  }

  .label span {
    display: block;
    margin-top: 4px;
    font-size: 12px;
    color: #59616a;
  }
`;
document.head.appendChild(css);

const viewer = document.createElement('div');
viewer.className = 'viewer';
app.appendChild(viewer);

const label = document.createElement('div');
label.className = 'label';
label.innerHTML = '<strong>Studio Sneaker Viewer</strong><span>Drag to orbit. Scroll to zoom.</span>';
viewer.appendChild(label);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xeef0f2);

const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
camera.position.set(4.2, 2.5, 5.2);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(viewer.clientWidth, viewer.clientHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
viewer.prepend(renderer.domElement);

const pmremGenerator = new THREE.PMREMGenerator(renderer);
scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 0.9, 0);
controls.minDistance = 2.8;
controls.maxDistance = 9;
controls.maxPolarAngle = Math.PI * 0.47;

const floor = new THREE.Mesh(
  new THREE.CircleGeometry(7, 96),
  new THREE.MeshStandardMaterial({
    color: 0xd8dce0,
    roughness: 0.72,
    metalness: 0.02,
  }),
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const plinth = new THREE.Mesh(
  new THREE.CylinderGeometry(1.85, 1.85, 0.42, 96),
  new THREE.MeshStandardMaterial({
    color: 0xf8f8f6,
    roughness: 0.44,
    metalness: 0.04,
  }),
);
plinth.position.y = 0.21;
plinth.castShadow = true;
plinth.receiveShadow = true;
scene.add(plinth);

const bevelRing = new THREE.Mesh(
  new THREE.TorusGeometry(1.85, 0.035, 12, 128),
  new THREE.MeshStandardMaterial({
    color: 0xc4cbd2,
    roughness: 0.38,
    metalness: 0.15,
  }),
);
bevelRing.position.y = 0.43;
bevelRing.rotation.x = Math.PI / 2;
bevelRing.castShadow = true;
scene.add(bevelRing);

const turntable = new THREE.Group();
scene.add(turntable);

const hemiLight = new THREE.HemisphereLight(0xffffff, 0xb4bdc7, 1.6);
scene.add(hemiLight);

const keyLight = new THREE.DirectionalLight(0xffffff, 3.6);
keyLight.position.set(3.5, 5.2, 4.2);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.near = 0.5;
keyLight.shadow.camera.far = 12;
keyLight.shadow.camera.left = -5;
keyLight.shadow.camera.right = 5;
keyLight.shadow.camera.top = 5;
keyLight.shadow.camera.bottom = -5;
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0xdde8ff, 1.15);
fillLight.position.set(-4.5, 2.6, 2.2);
scene.add(fillLight);

const rimLight = new THREE.DirectionalLight(0xffffff, 1.8);
rimLight.position.set(-2.4, 3.8, -4.5);
scene.add(rimLight);

const loader = new GLTFLoader();
loader.load(
  '/benchmark/assets/sneaker.glb',
  (gltf) => {
    const sneaker = gltf.scene;

    sneaker.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;

        if (child.material) {
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          for (const material of materials) {
            material.needsUpdate = true;
          }
        }
      }
    });

    const initialBox = new THREE.Box3().setFromObject(sneaker);
    const initialSize = initialBox.getSize(new THREE.Vector3());
    const largestDimension = Math.max(initialSize.x, initialSize.y, initialSize.z);
    const scale = largestDimension > 0 ? 2.7 / largestDimension : 1;
    sneaker.scale.setScalar(scale);

    const scaledBox = new THREE.Box3().setFromObject(sneaker);
    const center = scaledBox.getCenter(new THREE.Vector3());
    const minY = scaledBox.min.y;
    sneaker.position.set(-center.x, 0.46 - minY, -center.z);

    turntable.add(sneaker);
    controls.target.set(0, 1.1, 0);
    controls.update();
  },
  undefined,
  (error) => {
    console.error('Failed to load benchmark/assets/sneaker.glb', error);
  },
);

const clock = new THREE.Clock();

function resize() {
  const { clientWidth, clientHeight } = viewer;
  camera.aspect = clientWidth / Math.max(clientHeight, 1);
  camera.updateProjectionMatrix();
  renderer.setSize(clientWidth, clientHeight, false);
}

function animate() {
  const delta = clock.getDelta();
  turntable.rotation.y += delta * 0.42;
  controls.update();
  renderer.render(scene, camera);
}

window.addEventListener('resize', resize);
resize();
renderer.setAnimationLoop(animate);
