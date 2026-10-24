import { camera, createFixedStepLoop, game, installQaHooks, lights, primitives, readQaParams, scene } from "@aura3d/engine";
import { createGame, sfxUrl } from "@aura3d/engine/game";
import { installSafetyNet } from "@aura3d/debug";
import { assets } from "./assets";
import { createDash, FIXED_DT, type DashInput } from "./sim";

const qa = readQaParams({ seed: { type: "number", default: 1 }, manual: { type: "flag" } });
const sim = createDash(qa.seed);
let ready = false;
let frames = 0;
let scripted: Partial<DashInput> | undefined;

function buildScene() {
  return scene()
    .background("#0b1020")
    .add(lights.ambient({ color: "#dce8f5", intensity: 0.5 }))
    .add(lights.directional({ position: [-6, 9, 6], target: [0, 0, 0], intensity: 0.9 }))
    .camera(camera.perspective({ position: [0, 5, 9], target: [0, 0.5, 0], fov: 50 }))
    .addMany([
      primitives.plane({ name: "floor", size: [20, 8, 1] }).rotate(-Math.PI / 2, 0, 0),
      assets.node("hero", { name: "hero" }, () => primitives.capsule({ name: "hero-stand-in", size: [0.8, 1.6, 0.8] })).runtime(game.runtimeNode("hero")),
      primitives.sphere({ name: "coin", size: [0.5, 0.5, 0.5] }).runtime(game.runtimeNode("coin"))
    ]);
}

const g = createGame({
  id: "coin-dash",
  target: "#app",
  scene: buildScene,
  input: { actions: { left: ["KeyA", "ArrowLeft"], right: ["KeyD", "ArrowRight"], restart: ["KeyR"] }, bufferMs: 120 },
  hud: {
    theme: "arcade-neon",
    widgets: [
      { id: "score", kind: "score", anchor: "top-left", label: "Coins" },
      { id: "time", kind: "objective", anchor: "top-right", label: "Time" }
    ]
  },
  touch: { preset: "dpad-2btn", bindings: { left: "left", right: "right" } },
  sound: {
    cues: {
      coin: { id: "coin", asset: { url: sfxUrl("pickup.coin.00") }, volume: 0.7 },
      end: { id: "end", asset: { url: sfxUrl("stinger.win.00") }, volume: 0.8 }
    }
  },
  juice: {
    coin: { punch: { fovDeg: 1.4, ms: 140 }, flash: { color: "#ffd94a", peak: 0.12, ms: 160 } },
    timeout: { hitStop: 0.05, shake: 0.2 }
  }
});

const app = g.app;
const net = installSafetyNet({ safety: new URLSearchParams(location.search).has("safety"), canvas: document.querySelector("canvas") ?? undefined, app });

function readInput(): DashInput {
  const pressed = g.input;
  return {
    left: scripted?.left ?? pressed?.held("left") ?? false,
    right: scripted?.right ?? pressed?.held("right") ?? false
  };
}

function present(): void {
  const s = sim.state();
  app.nodes.require("hero").setPosition(s.playerX, 0.8, 0);
  app.nodes.require("coin").setPosition(s.coinX, 0.5, 0);
  g.hud.set("score", s.score);
  g.hud.set("time", s.timeLeft.toFixed(1));
}

function finish(): void {
  g.sound?.cue("end");
  void g.hud.banner(`Time! ${sim.state().score} coins. Press R to restart`, { holdMs: 2400 });
}

function stepOnce(input: DashInput): void {
  for (const event of sim.step(input)) {
    if (event === "coin") { g.sound?.cue("coin"); g.juice.fire("coin"); }
    if (event === "timeout") { g.juice.fire("timeout"); finish(); }
  }
}

const loop = createFixedStepLoop({
  stepSeconds: FIXED_DT,
  manual: qa.manual,
  isActive: () => ready && !g.session.paused,
  step: () => stepOnce(readInput()),
  render: () => {
    if (sim.state().over && g.input?.pressed("restart")) sim.reset();
    present();
    net.sample(++frames);
  }
});

const hooks = installQaHooks<ReturnType<typeof sim.state>, DashInput>("coin-dash", {
  ready: () => ready,
  seed: qa.seed,
  state: () => sim.state(),
  stepFrames: (n, input) => { scripted = input; loop.advance(n); scripted = undefined; },
  reset: (seed) => { sim.reset(seed); present(); },
  app: () => app
});

g.start();
g.ready().then(() => { ready = true; present(); loop.start(); }).catch((error: unknown) => { hooks.reportError(error); throw error; });
