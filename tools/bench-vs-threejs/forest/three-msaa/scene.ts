import * as THREE from "three";
import type { SceneHandle } from "../../shared/glue";

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export async function start(canvas: HTMLCanvasElement): Promise<SceneHandle> {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(1);
  renderer.setSize(640, 360, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#aab8c4");
  scene.fog = new THREE.FogExp2("#aab8c4", 0.012);
  const camera = new THREE.PerspectiveCamera(50, 640 / 360, 0.1, 400);
  camera.position.set(0, 9, 34);
  camera.lookAt(0, 3, 0);

  scene.add(new THREE.HemisphereLight("#dce8f2", "#4d6358", 1.1));
  const sun = new THREE.DirectionalLight("#fff4e0", 2.4);
  sun.position.set(30, 50, 20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 140 });
  scene.add(sun);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: "#566b4a", roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const TREES = 8000, ROCKS = 2000;
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18, 0.18, 1.2, 6), new THREE.MeshStandardMaterial({ color: "#6b4a32", roughness: 0.95 }), TREES);
  const canopies = new THREE.InstancedMesh(new THREE.ConeGeometry(0.9, 2.2, 7), new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.85 }), TREES);
  const rocks = new THREE.InstancedMesh(new THREE.SphereGeometry(0.5, 10, 8), new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.9 }), ROCKS);
  for (const mesh of [trunks, canopies, rocks]) { mesh.castShadow = true; mesh.receiveShadow = true; scene.add(mesh); }

  const rng = mulberry32(7);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const tint = new THREE.Color();
  const put = (mesh: THREE.InstancedMesh, i: number, x: number, y: number, z: number, s: number, yaw: number) => {
    m.compose(new THREE.Vector3(x, y, z), q.setFromAxisAngle(up, yaw), new THREE.Vector3(s, s, s));
    mesh.setMatrixAt(i, m);
  };
  for (let i = 0; i < TREES; i++) {
    const x = (rng() - 0.5) * 160, z = (rng() - 0.5) * 160, s = 0.7 + rng() * 0.9, yaw = rng() * Math.PI * 2;
    put(trunks, i, x, 0.6 * s, z, s, yaw);
    put(canopies, i, x, 2.1 * s, z, s, yaw);
    canopies.setColorAt(i, tint.setHSL(0.27 + rng() * 0.08, 0.45, 0.2 + rng() * 0.12));
  }
  for (let i = 0; i < ROCKS; i++) {
    const s = 0.3 + rng() * 0.8;
    put(rocks, i, (rng() - 0.5) * 160, 0.25 * s, (rng() - 0.5) * 160, s, rng() * Math.PI * 2);
    rocks.setColorAt(i, tint.setHSL(0.08, 0.05, 0.3 + rng() * 0.2));
  }
  for (const mesh of [trunks, canopies, rocks]) mesh.computeBoundingSphere();

  let t = 0;
  return {
    frame(dt) {
      t += dt;
      camera.position.x = Math.sin(t * 0.15) * 12;
      camera.lookAt(0, 3, 0);
      renderer.render(scene, camera);
    }
  };
}
