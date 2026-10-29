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

const MUTE_KEY = "roadsterRush.muted";

function readMuted(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

function saveMuted(muted: boolean): void {
  try {
    localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    /* storage unavailable */
  }
}

/** Build the native Apex Overdrive game (simulation + HUD + audio + keyboard) and boot it into the title state. */
export function createNativeRoadster(options: NativeRoadsterOptions = {}): RoadsterGame {
  const player = new Player();
  const traffic = new Traffic();
  const world = new FreewayWorld();
  const input = new KeyboardInput(window);
  const audio = new RoadsterAudio();
  audio.setMuted(readMuted());
  let game!: RoadsterGame;
  const hud = options.hudRoot
    ? new RoadsterHud(options.hudRoot, {
        onStart: () => game.requestStart(),
        onPause: () => game.togglePause(true),
        onResume: () => game.togglePause(false),
        onRetry: () => game.start(),
        onToggleMute: () => {
          const muted = audio.setMuted(!audio.isMuted);
          saveMuted(muted);
          return muted;
        },
        onInject: (action, down) => input.inject(action, down)
      })
    : undefined;
  hud?.setMuted(audio.isMuted);
  game = new RoadsterGame({ player, traffic, world, input, hud, audio, params: options.params ?? new URLSearchParams(window.location.search), drawCalls: options.drawCalls });
  game.boot();
  if (options.harness !== false) game.installHarness();
  installAudioUnlock(audio);
  installBackgroundPause(game, audio);
  return game;
}

/**
 * Browsers start an AudioContext suspended until a user gesture, so resuming it at boot does nothing (audit RR-5: the first
 * run was silent). Every pointer, touch or key gesture tries again until the context is running, then the listeners go.
 */
function installAudioUnlock(audio: RoadsterAudio): void {
  const events = ["pointerdown", "touchend", "keydown"] as const;
  const onGesture = (): void => {
    audio.unlock();
    if (audio.state === "running") for (const name of events) window.removeEventListener(name, onGesture, true);
  };
  for (const name of events) window.addEventListener(name, onGesture, true);
}

/** Pause the run and suspend sound when the tab is hidden or the window loses focus (audit RR-9). */
function installBackgroundPause(game: RoadsterGame, audio: RoadsterAudio): void {
  if (typeof document === "undefined") return;
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      if (!game.manual) game.togglePause(true);
      audio.setBackgrounded(true);
    } else audio.setBackgrounded(false);
  });
  window.addEventListener("blur", () => {
    if (!game.manual) game.togglePause(true);
  });
}
