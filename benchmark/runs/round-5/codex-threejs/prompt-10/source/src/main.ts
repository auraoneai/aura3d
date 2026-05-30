import "./style.css";

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const sneakerUrl = new URL("../../../../../../assets/sneaker.glb", import.meta.url).href;

const app = document.querySelector<HTMLDivElement>("#app")!;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf4f0ea);

const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(3.4, 2.2, 4.6);

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
controls.target.set(0, 0.72, 0);
controls.minDistance = 2.2;
controls.maxDistance = 8;
controls.maxPolarAngle = Math.PI * 0.48;
controls.update();

const turntable = new THREE.Group();
scene.add(turntable);

const plinthHeight = 0.32;
const plinthRadius = 1.62;

const plinth = new THREE.Mesh(
  new THREE.CylinderGeometry(plinthRadius, plinthRadius, plinthHeight, 96),
  new THREE.MeshStandardMaterial({
    color: 0xe6ded3,
    roughness: 0.54,
    metalness: 0.02,
  }),
);
plinth.position.y = plinthHeight * 0.5;
plinth.receiveShadow = true;
plinth.castShadow = true;
scene.add(plinth);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(18, 18),
  new THREE.MeshStandardMaterial({
    color: 0xd9d5cf,
    roughness: 0.68,
  }),
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const softboxLeft = new THREE.RectAreaLight(0xffffff, 4.2, 4.2, 3.2);
softboxLeft.position.set(-2.7, 3.6, 2.4);
softboxLeft.lookAt(0, 0.8, 0);
scene.add(softboxLeft);

const keyLight = new THREE.DirectionalLight(0xffffff, 2.5);
keyLight.position.set(3.4, 4.8, 3.6);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.near = 1;
keyLight.shadow.camera.far = 12;
keyLight.shadow.camera.left = -4;
keyLight.shadow.camera.right = 4;
keyLight.shadow.camera.top = 4;
keyLight.shadow.camera.bottom = -4;
scene.add(keyLight);

const rimLight = new THREE.DirectionalLight(0xd7e8ff, 1.25);
rimLight.position.set(-3.2, 2.4, -3.8);
scene.add(rimLight);

scene.add(new THREE.HemisphereLight(0xffffff, 0x8f8276, 1.4));

new GLTFLoader().load(
  sneakerUrl,
  (gltf) => {
    const sneaker = gltf.scene;

    sneaker.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((material) => {
          if ("envMapIntensity" in material) {
            material.envMapIntensity = 0.9;
          }
        });
      }
    });

    const box = new THREE.Box3().setFromObject(sneaker);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    const largestDimension = Math.max(size.x, size.y, size.z);
    const targetSize = 2.35;
    const scale = targetSize / largestDimension;
    sneaker.scale.setScalar(scale);

    const scaledBox = new THREE.Box3().setFromObject(sneaker);
    const scaledCenter = new THREE.Vector3();
    scaledBox.getCenter(scaledCenter);
    sneaker.position.sub(scaledCenter);

    const groundedBox = new THREE.Box3().setFromObject(sneaker);
    sneaker.position.y += plinthHeight + 0.035 - groundedBox.min.y;

    turntable.add(sneaker);
  },
  undefined,
  (error) => {
    console.error("Failed to load sneaker.glb", error);
  },
);

const clock = new THREE.Clock();

function animate() {
  const delta = clock.getDelta();
  turntable.rotation.y += delta * 0.42;
  controls.update();
  renderer.render(scene, camera);
}

renderer.setAnimationLoop(animate);

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
