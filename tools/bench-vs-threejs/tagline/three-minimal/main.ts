import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.shadowMap.enabled = true;
document.querySelector("#app")!.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color("#2b2f36");
const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.1, 100);
const pmrem = new THREE.PMREMGenerator(renderer);
new HDRLoader().load("/hdri/studio_small_08_1k.hdr", (hdr) => {
  scene.environment = pmrem.fromEquirectangular(hdr).texture;
  scene.environmentIntensity = 1.1;
  hdr.dispose();
});

const key = new THREE.DirectionalLight("#ffffff", 2.4);
key.position.set(6.52, 18.39, 13.98);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
scene.add(key);

new GLTFLoader().load("/aura-assets/product-fixture.glb", (gltf) => {
  gltf.scene.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = o.receiveShadow = true; });
  scene.add(gltf.scene);
  const box = new THREE.Box3().setFromObject(gltf.scene);
  const center = box.getCenter(new THREE.Vector3());
  const dist = box.getSize(new THREE.Vector3()).length() / (2 * Math.tan((camera.fov * Math.PI) / 360));
  camera.position.copy(center).add(new THREE.Vector3(0.5, 0.35, 1).normalize().multiplyScalar(dist));
  camera.lookAt(center);
});

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
renderer.setAnimationLoop(() => renderer.render(scene, camera));
