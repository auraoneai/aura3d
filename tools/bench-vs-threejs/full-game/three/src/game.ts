import { STEP, createState, scriptedInput, stateHash, step, type Input, type State } from "../../../shared/coin-sim";
import { createAudio } from "./audio";
import { createWorld } from "./scene";
import { createTouchPad } from "./touch";
import { createUi } from "./ui";

// @concern replay-qa
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function start(): { dispose(): void } {
  // @concern replay-qa
  const params = new URLSearchParams(location.search);
  const manual = params.has("manual");
  let seed = Number(params.get("seed") ?? 42);
  let state: State = createState(mulberry32(seed));

  // @concern glue
  const container = document.querySelector<HTMLElement>("#app")!;
  const world = createWorld(container, state.coins);
  const audio = createAudio();
  const ui = createUi(() => togglePause(), () => restart());
  const pad = createTouchPad();
  let paused = false;

  // @concern input-touch
  const keys = new Set<string>();
  const readInput = (): Input => {
    const touch = pad.read();
    return {
      x: Number(keys.has("KeyD") || keys.has("ArrowRight")) - Number(keys.has("KeyA") || keys.has("ArrowLeft")) || touch.x,
      z: Number(keys.has("KeyS") || keys.has("ArrowDown")) - Number(keys.has("KeyW") || keys.has("ArrowUp")) || touch.z
    };
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    keys.add(event.code);
    if (event.repeat) return;
    if (event.code === "KeyP") togglePause();
    if (event.code === "KeyR") restart();
  };
  const onKeyUp = (event: KeyboardEvent): void => void keys.delete(event.code);
  addEventListener("keydown", onKeyDown);
  addEventListener("keyup", onKeyUp);

  // @concern loop
  const advance = (input: Input): void => {
    const { score, status } = state;
    step(state, input);
    if (state.score > score) audio.play("pickup");
    if (status === "playing" && state.status !== "playing") audio.play(state.status === "won" ? "win" : "lose");
  };
  const draw = (): void => {
    world.player.position.set(state.px, 0.5, state.pz);
    state.coins.forEach((c, i) => {
      const mesh = world.coinMeshes[i]!;
      mesh.visible = !c.taken;
      mesh.position.set(c.x, 0.5, c.z);
      mesh.rotation.y = state.frame * 0.05;
    });
    ui.update(state.score, state.timeLeft);
    if (state.status === "playing") ui.hideResults();
    else ui.showResults(`${state.status === "won" ? "YOU WIN" : "TIME UP"} - score ${state.score}`);
    world.render();
  };
  let accumulator = 0;
  let last = performance.now();
  let handle = 0;
  const frame = (now: number): void => {
    handle = requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    if (!manual && !paused) {
      accumulator += dt;
      for (let steps = 0; accumulator >= STEP && steps < 6; steps++) {
        accumulator -= STEP;
        advance(readInput());
      }
      if (accumulator >= STEP) accumulator = 0;
    }
    draw();
  };
  const togglePause = (): void => {
    paused = !paused;
    ui.setPaused(paused);
  };
  const restart = (nextSeed = seed): void => {
    seed = nextSeed;
    state = createState(mulberry32(seed));
    paused = false;
    ui.setPaused(false);
    accumulator = 0;
    draw();
  };
  handle = requestAnimationFrame(frame);

  // @concern replay-qa
  const snapshot = () => ({
    hash: stateHash(state),
    status: state.status,
    score: state.score,
    frame: state.frame,
    timeLeft: state.timeLeft,
    px: state.px,
    pz: state.pz,
    paused,
    coins: state.coins.map((c) => ({ x: c.x, z: c.z, taken: c.taken }))
  });
  const hooks = {
    ready: () => true,
    seed,
    state: snapshot,
    stepFrames(n: number, input?: Partial<Input>) {
      for (let i = 0; i < n; i++) advance({ ...readInput(), ...input });
      draw();
      return snapshot();
    },
    reset: (nextSeed?: number) => restart(nextSeed),
    replay(_script: string, frames = 600) {
      restart();
      for (let i = 0; i < frames; i++) step(state, scriptedInput(i));
      draw();
      return stateHash(state);
    }
  };
  Object.assign(window, { __COIN_DASH__: hooks });

  // @concern resize-teardown
  return {
    dispose() {
      cancelAnimationFrame(handle);
      removeEventListener("keydown", onKeyDown);
      removeEventListener("keyup", onKeyUp);
      Reflect.deleteProperty(window, "__COIN_DASH__");
      audio.dispose();
      pad.dispose();
      ui.dispose();
      world.dispose();
    }
  };
}
