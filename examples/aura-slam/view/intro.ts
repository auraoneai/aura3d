/**
 * GU47 WP-11 TT-C2: the broadcast director's cut-aways. A 4 s, 3-shot match intro (establishing crane, low far-baseline
 * shot, net cam) and a 2 s changeover shot of the stands, framed by letterbox bars; both end on the TT-C1 broadcast pose.
 * Skippable: any key, pointer or touch ends the shot on the next frame (the renderer re-sends the broadcast pose at once),
 * and the shot also ends as soon as the ball is in play (`phase === "rally"`), so a serve is never played under it.
 * Reduced motion: every shot holds its opening framing (cuts only, no camera travel).
 * Presentation only: reads the sim state, never writes it.
 */
import type { Vec3 } from "../contract/units";
import type { CameraPose } from "./camera";

export interface DirectorShot {
  readonly name: string;
  readonly seconds: number;
  readonly from: CameraPose;
  readonly to: CameraPose;
  readonly fovFrom: number;
  readonly fovTo: number;
}

export type DirectorCut = "intro" | "changeover";

/** TT-C2 match intro: 4 s over three shots. The second shot (1.4-2.8 s) sits behind the far baseline, > 40 m from the broadcast eye. */
export const INTRO_SHOTS: readonly DirectorShot[] = [
  { name: "establishing", seconds: 1.4, from: { eye: [-14, 22, 30], target: [0, 0, -2] }, to: { eye: [-6, 18, 27], target: [0, 0, -2] }, fovFrom: 34, fovTo: 30 },
  { name: "far-baseline", seconds: 1.4, from: { eye: [3, 1.6, -10.2], target: [0, 1, 6] }, to: { eye: [1.5, 1.7, -9.6], target: [0, 1, 6] }, fovFrom: 32, fovTo: 30 },
  { name: "net-cam", seconds: 1.2, from: { eye: [7.6, 1.2, 0.6], target: [0, 0.8, 0] }, to: { eye: [6.6, 1.4, 0.3], target: [0, 0.8, 0] }, fovFrom: 42, fovTo: 38 }
];

/** TT-C2 changeover: 2 s slow push across the rear stand. */
export const CHANGEOVER_SHOTS: readonly DirectorShot[] = [
  { name: "changeover-stands", seconds: 2, from: { eye: [-9, 3, 9], target: [0, 2.5, -11.7] }, to: { eye: [-6, 4, 12], target: [0, 2.5, -11.7] }, fovFrom: 32, fovTo: 28 }
];

export const INTRO_SECONDS = INTRO_SHOTS.reduce((s, x) => s + x.seconds, 0);
export const CHANGEOVER_SECONDS = CHANGEOVER_SHOTS.reduce((s, x) => s + x.seconds, 0);

/**
 * A cut may run at most this many times its nominal length in wall-clock time. At normal frame rates the frame clock
 * (dt clamped to 0.25 s) drives the shot; on a renderer that presents one frame every few seconds (software WebGL2, an
 * old phone) the clamped clock would hold a 4 s intro on screen for minutes, so the cut ends and the broadcast camera
 * takes the frame instead.
 */
export const CUT_WALL_SLACK = 2;

/** Letterbox bar height as a fraction of the canvas height (each bar). */
export const LETTERBOX_FRACTION = 0.1;

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const lerp3 = (a: Vec3, b: Vec3, k: number): Vec3 => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
const ease = (k: number) => k * k * (3 - 2 * k);

export interface DirectorFrame { readonly pose: CameraPose; readonly fov: number; readonly shot: string }

/** The framing `t` seconds into a cut, or null once it is over. */
export function shotAt(shots: readonly DirectorShot[], t: number, reducedMotion = false): DirectorFrame | null {
  if (!Number.isFinite(t) || t < 0) return null;
  let start = 0;
  for (const shot of shots) {
    if (t < start + shot.seconds) {
      const k = reducedMotion ? 0 : ease((t - start) / shot.seconds);
      return { pose: { eye: lerp3(shot.from.eye, shot.to.eye, k), target: lerp3(shot.from.target, shot.to.target, k) }, fov: lerp(shot.fovFrom, shot.fovTo, k), shot: shot.name };
    }
    start += shot.seconds;
  }
  return null;
}

export interface DirectorStateLike {
  readonly mode?: string;
  readonly phase?: string;
  readonly score?: { readonly playerGames?: number; readonly aiGames?: number } | null;
}

export interface BroadcastDirector {
  /** Starts a cut now (replaces a running one). */
  start(cut: DirectorCut): void;
  /** Ends the running cut (key, pointer or touch). */
  skip(): void;
  /**
   * Per frame: starts the intro when a match begins and the changeover after every odd game, advances the running cut
   * and ends it when play goes live. Returns the cut's framing, or null when the broadcast camera has the frame.
   * `wallSeconds`: real seconds since the previous step (unclamped); a cut that has run CUT_WALL_SLACK times its length
   * in wall-clock time ends (slow renderers). Omitted: frame clock only.
   */
  step(state: Readonly<DirectorStateLike>, dt: number, reducedMotion: boolean, wallSeconds?: number): DirectorFrame | null;
  readonly active: DirectorCut | null;
  readonly time: number;
  /** Cuts played so far (debug). */
  readonly played: { intro: number; changeover: number; skipped: number };
}

/** `autoIntro`: play the intro when a match starts (`?intro=0` turns it off; `?intro=1` also plays it at boot). */
export function createBroadcastDirector(options: { autoIntro?: boolean; autoChangeover?: boolean } = {}): BroadcastDirector {
  const autoIntro = options.autoIntro ?? true;
  const autoChangeover = options.autoChangeover ?? true;
  let active: DirectorCut | null = null;
  let t = 0;
  let wall = 0;
  let lastMode: string | undefined;
  let lastGames = -1;
  const played = { intro: 0, changeover: 0, skipped: 0 };
  const shotsOf = (cut: DirectorCut) => (cut === "intro" ? INTRO_SHOTS : CHANGEOVER_SHOTS);

  const self: BroadcastDirector = {
    get active() { return active; },
    get time() { return t; },
    played,
    start(cut) {
      active = cut;
      t = 0;
      wall = 0;
      played[cut] += 1;
    },
    skip() {
      if (active) played.skipped += 1;
      active = null;
    },
    step(state, dt, reducedMotion, wallSeconds) {
      const mode = state.mode;
      const games = (state.score?.playerGames ?? 0) + (state.score?.aiGames ?? 0);
      if (autoIntro && mode === "playing" && lastMode !== undefined && lastMode !== "playing") self.start("intro");
      else if (autoChangeover && mode === "playing" && lastGames >= 0 && games > lastGames && games % 2 === 1) self.start("changeover");
      const leftMatch = mode === "menu" && lastMode !== undefined && lastMode !== "menu";
      lastMode = mode;
      lastGames = mode === "playing" ? games : -1;
      if (!active) return null;
      // Play going live or leaving the match ends the cut (a `?intro=1` boot intro over the menu plays through).
      if (state.phase === "rally" || leftMatch) { active = null; return null; }
      t += Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.25) : 1 / 60;
      if (wallSeconds !== undefined && Number.isFinite(wallSeconds) && wallSeconds > 0) wall += wallSeconds;
      const length = active === "intro" ? INTRO_SECONDS : CHANGEOVER_SECONDS;
      if (wall > length * CUT_WALL_SLACK) { active = null; return null; }
      const frame = shotAt(shotsOf(active), t, reducedMotion);
      if (!frame) active = null;
      return frame;
    }
  };
  return self;
}

/** `?intro=0` disables the cut-aways; `?intro=1` plays the intro at boot (QA). */
export function introParam(search: string): "off" | "boot" | "auto" {
  const v = new URLSearchParams(search).get("intro");
  return v === "0" ? "off" : v === "1" ? "boot" : "auto";
}

/** Two letterbox bars over the canvas (DOM, aria-hidden); `show` slides them in or out. */
export interface Letterbox { show(on: boolean): void; readonly shown: boolean; dispose(): void }

export function createLetterbox(container: HTMLElement | null | undefined, reducedMotion: () => boolean): Letterbox {
  if (!container || typeof document === "undefined") return { show() {}, shown: false, dispose() {} };
  const bars = ["top", "bottom"].map((edge) => {
    const el = document.createElement("div");
    el.setAttribute("aria-hidden", "true");
    el.dataset.slamLetterbox = edge;
    Object.assign(el.style, {
      position: "absolute", left: "0", right: "0", [edge]: "0", height: "0", background: "#000", pointerEvents: "none", zIndex: "5"
    } as Partial<CSSStyleDeclaration>);
    container.appendChild(el);
    return el;
  });
  let shown = false;
  return {
    get shown() { return shown; },
    show(on) {
      if (on === shown) return;
      shown = on;
      for (const el of bars) {
        el.style.transition = reducedMotion() ? "none" : "height 180ms ease-out";
        el.style.height = on ? `${LETTERBOX_FRACTION * 100}%` : "0";
      }
    },
    dispose() { for (const el of bars) el.remove(); }
  };
}
