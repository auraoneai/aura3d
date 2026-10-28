import { createCountedRng, createFixedStepLoop, installQaHooks, looks, readQaParams } from "@aura3d/engine";
import { createGame } from "@aura3d/engine/game";
import { STEP, createState, scriptedInput, stateHash, step, type Input, type State } from "../../../shared/coin-sim";
import { createAudio } from "./audio";
import { buildScene } from "./scene";
import { createScreens } from "./screens";

export async function start(): Promise<{ dispose(): Promise<void> }> {
  // @concern replay-qa
  const qa = readQaParams({ seed: { type: "number", default: 42 }, manual: { type: "flag" } });
  const rng = createCountedRng(qa.seed);
  let state: State = createState(() => rng.next());

  // @concern glue
  const audio = createAudio();
  const screens = createScreens(() => togglePause(), () => restart());

  // @concern scene
  const game = createGame({
    id: "coin-dash",
    target: "#app",
    scene: () => buildScene(state.coins),
    ...looks.appOptions("outdoor-day"),
    // @concern input-touch
    input: {
      actions: {
        left: ["KeyA", "ArrowLeft"],
        right: ["KeyD", "ArrowRight"],
        up: ["KeyW", "ArrowUp"],
        down: ["KeyS", "ArrowDown"],
        restart: ["KeyR"]
      }
    },
    // twin-stick would suit best, but its stick only updates through touch.update(), which the public type omits.
    touch: { preset: "dpad-2btn", bindings: { left: "left", right: "right", jump: "up", attack: "down" } },
    // @concern hud-screens
    hud: {
      theme: "arcade-neon",
      widgets: [
        { id: "score", kind: "score", anchor: "top-left", label: "Score" },
        { id: "time", kind: "objective", anchor: "top-right", label: "Time" }
      ]
    }
  });
  game.start();
  await game.ready();
  game.touch?.setVisible(true);
  const player = game.app.nodes.require("player");
  const coins = state.coins.map((_, i) => game.app.nodes.require(`coin-${i}`));

  // @concern input-touch
  const input = game.input;
  if (!input) throw new Error("createGame returned no input controller");
  const readInput = (): Input => ({
    x: Number(input.held("right")) - Number(input.held("left")),
    z: Number(input.held("down")) - Number(input.held("up"))
  });

  // @concern loop
  const advance = (input: Input): void => {
    const { score, status } = state;
    step(state, input);
    if (state.score > score) audio.play("pickup");
    if (status === "playing" && state.status !== "playing") audio.play(state.status === "won" ? "win" : "lose");
  };
  const draw = (): void => {
    player.setPosition(state.px, 0.5, state.pz);
    state.coins.forEach((c, i) => coins[i]!.setVisible(!c.taken).setPosition(c.x, 0.5, c.z).setRotation(0, state.frame * 0.05, 0));
    game.hud.set("score", state.score);
    game.hud.set("time", state.timeLeft.toFixed(1));
    if (state.status === "playing") screens.hideResults();
    else screens.showResults(`${state.status === "won" ? "YOU WIN" : "TIME UP"} - score ${state.score}`);
  };
  const loop = createFixedStepLoop({
    stepSeconds: STEP,
    manual: qa.manual,
    isActive: () => !game.session.paused,
    step: () => advance(readInput()),
    render: draw
  });
  // The kit already pauses on P, Escape and tab hide; the button calls the same session.
  const togglePause = (): void => (game.session.paused ? game.session.resume() : game.session.pause());
  const offState = game.session.on("state", (session) => screens.setPaused(session.paused));
  const restart = (seed?: number): void => {
    rng.reset(seed);
    state = createState(() => rng.next());
    game.session.resume();
    loop.resetAccumulator();
    draw();
  };
  const offFrame = game.app.onFrame(() => {
    if (input.consume("restart")) restart();
  });
  loop.start();
  draw();

  // @concern replay-qa
  const snapshot = () => ({
    hash: stateHash(state),
    status: state.status,
    score: state.score,
    frame: state.frame,
    timeLeft: state.timeLeft,
    px: state.px,
    pz: state.pz,
    paused: game.session.paused,
    coins: state.coins.map((c) => ({ x: c.x, z: c.z, taken: c.taken }))
  });
  const qaHooks = installQaHooks("coin-dash", {
    ready: () => true,
    seed: qa.seed,
    state: snapshot,
    stepFrames: (n, input) => {
      for (let i = 0; i < n; i++) advance({ ...readInput(), ...input });
      draw();
    },
    reset: (seed) => restart(seed),
    replay: (_script, frames = 600) => {
      restart();
      for (let i = 0; i < frames; i++) step(state, scriptedInput(i));
      draw();
      return stateHash(state);
    },
    app: game.app
  });

  // @concern resize-teardown
  return {
    async dispose() {
      loop.stop();
      offFrame();
      offState();
      qaHooks.uninstall();
      audio.dispose();
      screens.dispose();
      await game.dispose();
      document.querySelector("#app canvas")?.remove(); // app.dispose() leaves the canvas it appended to the target
    }
  };
}
