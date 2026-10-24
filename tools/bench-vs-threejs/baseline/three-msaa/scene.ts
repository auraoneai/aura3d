import * as THREE from "three";
import type { SceneHandle } from "../../shared/glue";

export async function start(canvas: HTMLCanvasElement): Promise<SceneHandle> {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(1);
  renderer.setSize(640, 360, false);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 640 / 360, 0.1, 100);
  camera.position.set(2, 2, 4);
  camera.lookAt(0, 0.5, 0);
  scene.add(new THREE.AmbientLight("#ffffff", 1));
  const cube = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: "#d86a3a" }));
  scene.add(cube);
  return { frame(dt) { cube.rotation.y += dt; renderer.render(scene, camera); } };
}
