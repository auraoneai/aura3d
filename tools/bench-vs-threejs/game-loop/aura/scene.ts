import { camera, createAuraApp, createCountedRng, createFixedStepLoop, installQaHooks, lights, material, primitives, scene } from "@aura3d/engine";
import { ARENA, createState, scriptedInput, stateHash, step, type Input, type State } from "../../shared/coin-sim";
import { createHud } from "../../shared/hud";
import type { SceneHandle } from "../../shared/glue";

export async function start(canvas: HTMLCanvasElement): Promise<SceneHandle> {
  const rng = createCountedRng(42);
  let state: State = createState(() => rng.next());
  const hud = createHud();
  const keys = new Set<string>();
  let paused = false;
  let clock = 0;

  const coinNodes = state.coins.map((c, i) => primitives.cylinder({ name: `coin-${i}`, size: [0.8, 0.1, 0.8], material: material.pbr({ color: "#ffd24a", metallic: 0.8, roughness: 0.3 }), castShadow: true }).position(c.x, 0.5, c.z).runtime({ id: `coin-${i}` }));
  const app = createAuraApp(canvas, {
    autoStart: false,
    resize: false,
    pixelRatio: 1,
    output: { toneMapping: "aces" },
    scene: coinNodes.reduce((world, coin) => world.add(coin), scene()
      .background("#0d2230")
      .camera(camera.perspective({ fov: 50, near: 0.1, far: 100, position: [0, 16, 14], target: [0, 0, 0] }))
      .add(lights.hemisphere({ skyColor: "#eef6ff", groundColor: "#4d6358", intensity: 1.2 }))
      .add(lights.directional({ color: "#fff6e5", intensity: 2.2, position: [8, 16, 6], shadow: true }))
      .add(primitives.plane({ name: "ground", size: [ARENA * 2 + 2, 1, ARENA * 2 + 2], material: material.pbr({ color: "#2b678e", roughness: 0.9 }) }))
      .add(primitives.box({ name: "player", size: [1, 1, 1], material: material.pbr({ color: "#f3f0dc", roughness: 0.6 }), castShadow: true }).runtime({ id: "player" })))
  });
  await app.ready();
  const player = app.nodes.require("player");
  const coins = state.coins.map((_, i) => app.nodes.require(`coin-${i}`));

  const readInput = (): Input => ({
    x: (keys.has("KeyD") || keys.has("ArrowRight") ? 1 : 0) - (keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : 0),
    z: (keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0) - (keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0)
  });
  const draw = (): void => {
    player.setPosition(state.px, 0.5, state.pz);
    state.coins.forEach((c, i) => coins[i]!.setVisible(!c.taken).setPosition(c.x, 0.5, c.z).setRotation(0, state.frame * 0.05, 0));
    hud.update(state.score, state.timeLeft);
    if (state.status !== "playing") hud.showResults(`${state.status === "won" ? "YOU WIN" : "TIME UP"} - score ${state.score}`);
    app.step(1 / 60);
  };
  const restart = (): void => { rng.reset(); state = createState(() => rng.next()); hud.hideResults(); };
  const loop = createFixedStepLoop({ step: () => step(state, readInput()), render: draw, isActive: () => !paused });
  const replay = (_script: string, frames = 600): string => {
    restart();
    for (let i = 0; i < frames; i++) step(state, scriptedInput(i));
    draw();
    return stateHash(state);
  };
  installQaHooks("coin-dash", { ready: () => true, state: () => stateHash(state), reset: restart, replay: (script, frames) => replay(script, frames), app });

  addEventListener("keydown", (e) => {
    keys.add(e.code);
    if (e.code === "KeyP") { paused = !paused; hud.setPaused(paused); }
    if (e.code === "KeyR") restart();
  });
  addEventListener("keyup", (e) => keys.delete(e.code));

  return {
    frame(dt) { clock += dt * 1000; loop.tick(clock); },
    replay: (frames) => replay("scripted", frames),
    state: () => stateHash(state)
  };
}
