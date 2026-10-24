import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import type { SceneHandle } from "../../shared/glue";

export async function start(canvas: HTMLCanvasElement): Promise<SceneHandle> {
  const renderer = new THREE.WebGLRenderer({ canvas });
  renderer.setPixelRatio(1);
  renderer.setSize(640, 360, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#1a1d24");
  const camera = new THREE.PerspectiveCamera(40, 640 / 360, 0.1, 100);
  camera.position.set(4.5, 2.2, 5.5);

  const hdr = await new RGBELoader().loadAsync("env.hdr");
  scene.environment = new THREE.PMREMGenerator(renderer).fromEquirectangular(hdr).texture;
  hdr.dispose();
  scene.environmentIntensity = 0.7;

  const sun = new THREE.DirectionalLight("#fff4e0", 1.1);
  sun.position.set(5, 8, 4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 30 });
  scene.add(sun);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshStandardMaterial({ color: "#2b2f38", roughness: 0.9 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const truck = (await new GLTFLoader().loadAsync("model.glb")).scene;
  const box = new THREE.Box3().setFromObject(truck);
  truck.scale.setScalar(2 / (box.max.y - box.min.y));
  truck.position.y = -box.min.y * truck.scale.y;
  truck.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  scene.add(truck);

  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0, 0.8, 0);

  const composer = new EffectComposer(renderer);
  composer.setSize(640, 360);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(640, 360), 0.35, 0.6, 1));
  composer.addPass(new OutputPass());

  return { frame(dt) { controls.update(dt); composer.render(dt); } };
}
