import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { SceneHandle } from "../../shared/glue";

const RADIUS = 6, RUN_SPEED = 3.2;

export async function start(canvas: HTMLCanvasElement): Promise<SceneHandle> {
  const renderer = new THREE.WebGLRenderer({ canvas });
  renderer.setPixelRatio(1);
  renderer.setSize(640, 360, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#9db4c8");
  const camera = new THREE.PerspectiveCamera(50, 640 / 360, 0.1, 100);

  scene.add(new THREE.HemisphereLight("#dce8f2", "#4d6358", 1.3));
  const sun = new THREE.DirectionalLight("#fff4e0", 2.2);
  sun.position.set(6, 12, 4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 40 });
  scene.add(sun);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color: "#6f8a5a", roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const gltf = await new GLTFLoader().loadAsync("model.glb");
  const hero = gltf.scene;
  const box = new THREE.Box3().setFromObject(hero);
  hero.scale.setScalar(1.8 / (box.max.y - box.min.y));
  hero.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
  scene.add(hero);

  const mixer = new THREE.AnimationMixer(hero);
  const idle = mixer.clipAction(THREE.AnimationClip.findByName(gltf.animations, "Idle")!);
  const run = mixer.clipAction(THREE.AnimationClip.findByName(gltf.animations, "Run")!);
  idle.play();

  let time = 0, angle = 0, running = false;
  const eye = new THREE.Vector3(0, 3, -6);
  const look = new THREE.Vector3();
  const behind = new THREE.Vector3();

  return {
    frame(dt) {
      time += dt;
      const wantRun = Math.floor(time / 3) % 2 === 1;
      if (wantRun !== running) {
        running = wantRun;
        const [from, to] = running ? [idle, run] : [run, idle];
        to.reset().play().crossFadeFrom(from, 0.25, false);
      }
      if (running) angle += (RUN_SPEED / RADIUS) * dt;
      hero.position.set(Math.cos(angle) * RADIUS, 0, Math.sin(angle) * RADIUS);
      hero.rotation.y = -angle;
      mixer.update(dt);

      behind.set(Math.sin(-angle) * -5 + hero.position.x, 3, Math.cos(-angle) * -5 + hero.position.z);
      eye.lerp(behind, 1 - Math.exp(-4 * dt));
      camera.position.copy(eye);
      look.set(hero.position.x, 1.2, hero.position.z);
      camera.lookAt(look);
      renderer.render(scene, camera);
    },
    state: () => ({ running, angle: Number(angle.toFixed(4)), clips: gltf.animations.map((a) => a.name) })
  };
}
