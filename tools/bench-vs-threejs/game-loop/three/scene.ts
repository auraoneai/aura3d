import * as THREE from "three";
import { ARENA, STEP, createState, scriptedInput, stateHash, step, type State } from "../../shared/coin-sim";
import { createHud } from "../../shared/hud";
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
  const renderer = new THREE.WebGLRenderer({ canvas });
  renderer.setPixelRatio(1);
  renderer.setSize(640, 360, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#0d2230");
  const camera = new THREE.PerspectiveCamera(50, 640 / 360, 0.1, 100);
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

  const hud = createHud();
  const keys = new Set<string>();
  let paused = false;
  let acc = 0;
  let state: State = createState(mulberry32(42));
  const coinMeshes = state.coins.map(() => { const m = new THREE.Mesh(coinGeometry, coinMaterial); m.castShadow = true; scene.add(m); return m; });
  const restart = (): void => { state = createState(mulberry32(42)); acc = 0; hud.hideResults(); };
  addEventListener("keydown", (e) => {
    keys.add(e.code);
    if (e.code === "KeyP") { paused = !paused; hud.setPaused(paused); }
    if (e.code === "KeyR") restart();
  });
  addEventListener("keyup", (e) => keys.delete(e.code));
  const readInput = () => ({
    x: (keys.has("KeyD") || keys.has("ArrowRight") ? 1 : 0) - (keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : 0),
    z: (keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0) - (keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0)
  });

  const draw = (): void => {
    player.position.set(state.px, 0.5, state.pz);
    state.coins.forEach((c, i) => { coinMeshes[i]!.visible = !c.taken; coinMeshes[i]!.position.set(c.x, 0.5, c.z); coinMeshes[i]!.rotation.y = state.frame * 0.05; });
    hud.update(state.score, state.timeLeft);
    if (state.status !== "playing") hud.showResults(`${state.status === "won" ? "YOU WIN" : "TIME UP"} - score ${state.score}`);
    renderer.render(scene, camera);
  };

  return {
    frame(dt) {
      if (!paused) {
        acc += Math.min(dt, 0.1);
        while (acc >= STEP) { acc -= STEP; step(state, readInput()); }
      }
      draw();
    },
    replay(frames) {
      restart();
      for (let i = 0; i < frames; i++) step(state, scriptedInput(i));
      draw();
      return stateHash(state);
    },
    state: () => stateHash(state)
  };
}
