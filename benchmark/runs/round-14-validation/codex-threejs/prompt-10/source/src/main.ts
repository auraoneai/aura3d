import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('Missing #app mount point');
}

document.body.style.margin = '0';
document.body.style.overflow = 'hidden';
document.body.style.background = '#eef1f4';
app.style.width = '100vw';
app.style.height = '100vh';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xeef1f4);

const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  0.1,
  100,
);
camera.position.set(3.4, 2.1, 4.2);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 0.75, 0);
controls.minDistance = 2.2;
controls.maxDistance = 8;
controls.maxPolarAngle = Math.PI * 0.48;

const turntable = new THREE.Group();
scene.add(turntable);

const plinthMaterial = new THREE.MeshStandardMaterial({
  color: 0xf7f7f5,
  roughness: 0.55,
  metalness: 0.05,
});
const plinth = new THREE.Mesh(
  new THREE.CylinderGeometry(1.45, 1.55, 0.34, 96),
  plinthMaterial,
);
plinth.position.y = 0.17;
plinth.receiveShadow = true;
plinth.castShadow = true;
turntable.add(plinth);

const bevel = new THREE.Mesh(
  new THREE.TorusGeometry(1.45, 0.025, 12, 96),
  new THREE.MeshStandardMaterial({ color: 0xd7dce0, roughness: 0.45 }),
);
bevel.position.y = 0.35;
bevel.rotation.x = Math.PI / 2;
turntable.add(bevel);

const floor = new THREE.Mesh(
  new THREE.CircleGeometry(5.8, 128),
  new THREE.ShadowMaterial({ color: 0x7f8790, opacity: 0.18 }),
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa3ad, 1.9));

const keyLight = new THREE.DirectionalLight(0xffffff, 3.0);
keyLight.position.set(3.5, 4.8, 2.8);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.near = 0.5;
keyLight.shadow.camera.far = 12;
keyLight.shadow.camera.left = -4;
keyLight.shadow.camera.right = 4;
keyLight.shadow.camera.top = 4;
keyLight.shadow.camera.bottom = -4;
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0xd8ebff, 1.5);
fillLight.position.set(-4, 2.8, -3);
scene.add(fillLight);

const rimLight = new THREE.DirectionalLight(0xffffff, 2.2);
rimLight.position.set(-1.5, 3.2, 4.5);
scene.add(rimLight);

const sneakerRoot = new THREE.Group();
sneakerRoot.position.y = 0.38;
turntable.add(sneakerRoot);

const loader = new GLTFLoader();
loader.load(
  '/benchmark/assets/sneaker.glb',
  (gltf) => {
    const model = gltf.scene;

    model.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;

        const materials = Array.isArray(child.material)
          ? child.material
          : [child.material];
        materials.forEach((material) => {
          if ('envMapIntensity' in material) {
            material.envMapIntensity = 0.7;
          }
        });
      }
    });

    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const largestAxis = Math.max(size.x, size.y, size.z);
    const scale = largestAxis > 0 ? 2.35 / largestAxis : 1;

    model.position.sub(center);
    model.scale.setScalar(scale);

    const scaledBox = new THREE.Box3().setFromObject(model);
    model.position.y -= scaledBox.min.y;

    sneakerRoot.add(model);
  },
  undefined,
  (error) => {
    console.error('Failed to load benchmark/assets/sneaker.glb', error);
  },
);

const clock = new THREE.Clock();

function render(): void {
  const delta = clock.getDelta();
  turntable.rotation.y += delta * 0.42;
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(render);
}

function resize(): void {
  const width = window.innerWidth;
  const height = window.innerHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}

window.addEventListener('resize', resize);
render();
