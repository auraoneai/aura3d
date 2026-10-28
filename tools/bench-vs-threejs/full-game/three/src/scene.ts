import * as THREE from "three";
import { ARENA, type Coin } from "../../../shared/coin-sim";

// Benchmark game: primitives stand in for the player, coins and ground, as in the Aura3D build.
export function createWorld(container: HTMLElement, coins: readonly Coin[]) {
  // @concern scene
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  container.append(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#0d2230");
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.set(0, 16, 14);
  camera.lookAt(0, 0, 0);
  scene.add(new THREE.HemisphereLight("#eef6ff", "#4d6358", 1.2));
  const sun = new THREE.DirectionalLight("#fff6e5", 2.2);
  sun.position.set(8, 16, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 50 });
  scene.add(sun);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(ARENA * 2 + 2, ARENA * 2 + 2), new THREE.MeshStandardMaterial({ color: "#2b678e", roughness: 0.9 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  const player = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: "#f3f0dc", roughness: 0.6 }));
  player.castShadow = true;
  scene.add(player);
  const coinGeometry = new THREE.CylinderGeometry(0.4, 0.4, 0.1, 16);
  const coinMaterial = new THREE.MeshStandardMaterial({ color: "#ffd24a", metalness: 0.8, roughness: 0.3 });
  const coinMeshes = coins.map((coin) => {
    const mesh = new THREE.Mesh(coinGeometry, coinMaterial);
    mesh.castShadow = true;
    mesh.position.set(coin.x, 0.5, coin.z);
    scene.add(mesh);
    return mesh;
  });

  // @concern resize-teardown
  const resize = (): void => {
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
  };
  resize();
  addEventListener("resize", resize);

  return {
    player,
    coinMeshes,
    render: () => renderer.render(scene, camera),
    dispose() {
      removeEventListener("resize", resize);
      scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.geometry.dispose();
        object.material.dispose();
      });
      renderer.dispose();
      renderer.domElement.remove();
    }
  };
}
