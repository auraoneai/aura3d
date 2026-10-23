import { RoadsterAudio } from "./audio";
import { RoadsterGame } from "./game";
import { RoadsterHud } from "./hud";
import { KeyboardInput } from "./input";
import { Player } from "./player";
import { Traffic } from "./traffic";
import { FreewayWorld } from "./world";
import "./hud.css";

export { RoadsterGame } from "./game";
export { Player } from "./player";
export { Traffic } from "./traffic";
export { FreewayWorld } from "./world";
export { createRng } from "./rng";
export * from "./constants";

/** Highest `drawCalls` figure found in an app diagnostics object (the production renderer nests it). */
export function findDrawCalls(value: unknown, depth = 0): number {
  if (!value || typeof value !== "object" || depth > 3) return 0;
  let best = 0;
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (/^drawCalls$/i.test(key) && typeof item === "number") best = Math.max(best, item);
    else if (item && typeof item === "object") best = Math.max(best, findDrawCalls(item, depth + 1));
  }
  return best;
}

export interface NativeRoadsterOptions {
  hudRoot?: HTMLElement | null;
  params?: URLSearchParams;
  drawCalls?: () => number;
  /** Install `window.__GAME__` (state/step/actions). Defaults to true. */
  harness?: boolean;
}

/** Build the native Apex Overdrive game (simulation + HUD + audio + keyboard) and boot it into the title state. */
export function createNativeRoadster(options: NativeRoadsterOptions = {}): RoadsterGame {
  const player = new Player();
  const traffic = new Traffic();
  const world = new FreewayWorld();
  const input = new KeyboardInput(window);
  const audio = new RoadsterAudio();
  let game!: RoadsterGame;
  const hud = options.hudRoot
    ? new RoadsterHud(options.hudRoot, {
        onPause: () => game.togglePause(true),
        onResume: () => game.togglePause(false),
        onRetry: () => game.start(),
        onToggleMute: () => audio.setMuted(!audio.isMuted),
        onInject: (action, down) => input.inject(action, down)
      })
    : undefined;
  game = new RoadsterGame({ player, traffic, world, input, hud, audio, params: options.params ?? new URLSearchParams(window.location.search), drawCalls: options.drawCalls });
  game.boot();
  if (options.harness !== false) game.installHarness();
  return game;
}
