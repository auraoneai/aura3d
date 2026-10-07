/**
 * C-24 — GameShell, Session, HUD, Touch, capture context (CONTRACTS.md). Provider: PRD 09.
 * Flag: A3D_QR_GAME. The stub lives in `./stubs/game.ts`.
 */

import type { AuraVec3, AuraSceneSnapshot, AuraApp } from "../agent-api/index";
import type { GameAudio } from "../game/GameAudio";

export type GameSessionState = "booting" | "loading" | "title" | "playing" | "paused" | "results" | "transitioning" | "context-lost" | "disposed";
export type PauseReason = "user" | "blur" | "visibility" | "menu" | "context-lost";
export interface TransitionSpec { readonly kind: "fade" | "cut" | "wipe"; readonly ms?: number; readonly color?: string; }
export interface GameSession { readonly state: GameSessionState; readonly paused: boolean; readonly timeScale: number; readonly simTime: number; readonly seed: number; readonly reducedMotion: boolean; readonly reducedFlash: boolean; readonly highContrast: boolean; pause(reason?: PauseReason): void; resume(): void; setTimeScale(scale: number, o?: { rampMs?: number }): void; hitStop(seconds: number, o?: { actors?: readonly string[] }): void; slowMo(scale: number, ms: number, o?: { ease?: string }): void; scaledDt(rawDt: number, actorId?: string): number; isFrozen(actorId?: string): boolean; on(event: "state" | "pause" | "resume" | "settings", cb: (s: GameSession) => void): () => void; }
export interface GameShell { readonly state: GameSessionState; showResults(values: Readonly<Record<string, number>>): Promise<"retry" | "title" | "next">; transition<T>(run: () => T | Promise<T>, spec?: TransitionSpec): Promise<T>; openMenu(id: "pause" | "settings" | "about"): void; closeMenus(): void; setLoadingProgress(fraction: number, label?: string): void; track(promise: Promise<unknown>, weight: number): void; }
export type GameShellLayout = "full-bleed" | "letterbox-16x9" | "letterbox-4x3";
export interface HudWidgetSpec { readonly id: string; readonly kind: string; readonly anchor: "top-left" | "top" | "top-right" | "left" | "center" | "right" | "bottom-left" | "bottom" | "bottom-right"; readonly label?: string; }
export interface Hud { set(id: string, value: unknown): void; banner(text: string, o?: { holdMs?: number; style?: string }): Promise<void>; toast(text: string, o?: { ms?: number }): void; damageNumber(value: number, world: AuraVec3, o?: { color?: string; crit?: boolean }): void; setVisible(v: boolean): void; snapshot(): { readonly widgets: readonly { readonly id: string; readonly value: unknown; readonly screenFraction: number }[] }; dispose(): void; }
export interface HudMountOptions { readonly theme?: "arcade-neon" | "motorsport" | "sports-broadcast" | "sci-fi-telemetry" | "fighting" | "tabletop" | "plain" | Readonly<Record<`--a3g-${string}`, string>>; readonly widgets: readonly HudWidgetSpec[]; readonly maxScreenFraction?: number; }
export type TouchPreset = "twin-stick" | "dpad-2btn" | "dpad-4btn" | "steer-pedals" | "aim-drag" | "flight" | "lane-swipe" | "flippers";
export interface TouchControls { readonly visible: boolean; setVisible(v: boolean): void; dispose(): void; }
export type GameFxKind = "spark" | "dust" | "debris" | "ring" | "streak" | "pickup" | "explosion-small" | "muzzle" | "splash" | "bubble";
export interface GameFxLayer { burst(kind: GameFxKind, position: AuraVec3, o?: { count?: number; speed?: number; color?: string; normal?: AuraVec3; seed?: number }): void; trail(target: string, o: { width: number; life: number; color?: string }): { stop(): void }; readonly liveCount: number; readonly backend: "primitive-pool" | "particle-pass"; }
export interface CaptureContext { readonly mode: "play" | "scenario"; readonly scenario?: string; readonly seed?: number; readonly freezeAt?: number; readonly cameraPose?: string; }
export interface GameScenario { readonly description: string; setup(game: unknown /* Game */): void | Promise<void>; }
export interface GameBeacon { readonly route: string; readonly state: GameSessionState; readonly frame: number; readonly firstFrameAt: number | null; readonly sessionStartedAt: number; }
// window.__AURA3D_GAME__: GameBeacon; readiness: window.__AURA3D_GAME__?.state === "playing"
// window.__AURA3D_GAME_EVIDENCE__[route]: lazy getter object with sections session/sound/juice/hud/perf/capture (+ route sections)
export interface CreateGameOptions<TCue extends string, TEvent extends string> { readonly id: string; readonly target: HTMLElement; readonly scene: () => unknown; readonly layout?: GameShellLayout; readonly hud?: HudMountOptions; readonly touch?: { readonly preset: TouchPreset; readonly bindings: Readonly<Record<string, string>> }; readonly sound?: unknown /* C-25 GameSoundOptions<TCue> */; readonly juice?: Readonly<Record<TEvent, unknown>>; readonly qualityRebuild?: { readonly flags?: readonly string[] }; }
/** Juice driver facade (PRD-09 §7.6): `fire(event)` maps a game event to synchronized fx/audio/rumble. */
export interface GameJuice<TEvent extends string = string> { fire(event: TEvent, at?: { position?: AuraVec3; strength?: number; actors?: readonly string[] }): void; }
export interface Game<TCue extends string = string, TEvent extends string = string> { readonly id: string; readonly app: AuraApp; readonly session: GameSession; readonly shell: GameShell; readonly hud: Hud; readonly touch: TouchControls | null; readonly fx: GameFxLayer; readonly capture: CaptureContext; /** Juice driver built from `options.juice`. */ readonly juice: GameJuice<TEvent>; /** C-25 audio facade; present only when `options.sound` was provided. */ readonly sound?: GameAudio<TCue>; ready(): Promise<void>; start(): void; setScene(scene: AuraSceneSnapshot, o?: { transition?: TransitionSpec | false }): Promise<void>; dispose(): Promise<void>; }
export { createGame } from "./stubs/game";

/** PR 0a: real — pure URL parsing. `?capture=review|overview` warns and is ignored. */
export function captureFromUrl(url?: URL): CaptureContext {
  if (url === undefined || typeof URL === "undefined") return { mode: "play" };
  const capture = url.searchParams.get("capture");
  if (capture === "review" || capture === "overview") {
    if (typeof console !== "undefined") console.warn(`capture:${capture} is ignored`);
    return { mode: "play" };
  }
  const scenario = url.searchParams.get("scenario") ?? undefined;
  const seedRaw = url.searchParams.get("seed");
  const freezeAtRaw = url.searchParams.get("freezeAt");
  const cameraPose = url.searchParams.get("cameraPose") ?? undefined;
  if (scenario === undefined && seedRaw === null && freezeAtRaw === null && cameraPose === undefined) {
    return { mode: "play" };
  }
  return {
    mode: "scenario",
    scenario,
    seed: seedRaw !== null ? Number(seedRaw) : undefined,
    freezeAt: freezeAtRaw !== null ? Number(freezeAtRaw) : undefined,
    cameraPose
  };
}
