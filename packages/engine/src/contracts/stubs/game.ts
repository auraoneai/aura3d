/**
 * C-24 — createGame stub (CONTRACTS.md). Owner: PRD 15 (custodian) until PRD 09
 * creates @aura3d/game, which binds its own implementation.
 */

import { createGameApp } from "../../agent-api/index";
import type { AuraApp, AuraSceneSnapshot } from "../../agent-api/index";
import type {
  CaptureContext,
  CreateGameOptions,
  Game,
  GameFxLayer,
  GameSession,
  GameSessionState,
  GameShell,
  Hud,
  TouchControls,
  TransitionSpec
} from "../game";
import { captureFromUrl } from "../game";

class StubGameSession implements GameSession {
  public state: GameSessionState = "booting";
  public paused = false;
  public timeScale = 1;
  public simTime = 0;
  public seed = 0;
  public reducedMotion = false;
  public reducedFlash = false;
  public highContrast = false;
  private readonly listeners = new Map<string, Set<(s: GameSession) => void>>();

  pause(_reason?: string): void { this.paused = true; this.emit("pause"); }
  resume(): void { this.paused = false; this.emit("resume"); }
  setTimeScale(scale: number, _o?: { rampMs?: number }): void { this.timeScale = scale; }
  hitStop(_seconds: number, _o?: { actors?: readonly string[] }): void { /* engine-side stub: no hit-stop until prd08/prd09 land */ }
  slowMo(scale: number, _ms: number, _o?: { ease?: string }): void { this.timeScale = scale; }
  scaledDt(rawDt: number, _actorId?: string): number { return rawDt * this.timeScale; }
  isFrozen(_actorId?: string): boolean { return this.paused; }
  on(event: "state" | "pause" | "resume" | "settings", cb: (s: GameSession) => void): () => void {
    let set = this.listeners.get(event);
    if (!set) { set = new Set(); this.listeners.set(event, set); }
    set.add(cb);
    return () => set!.delete(cb);
  }
  emit(event: string): void {
    for (const cb of this.listeners.get(event) ?? []) cb(this);
  }
}

class StubGameShell implements GameShell {
  constructor(private readonly session: StubGameSession) {}
  get state(): GameSessionState { return this.session.state; }
  async showResults(_values: Readonly<Record<string, number>>): Promise<"retry" | "title" | "next"> {
    this.session.state = "results";
    this.session.emit("state");
    return "retry";
  }
  async transition<T>(run: () => T | Promise<T>, _spec?: TransitionSpec): Promise<T> {
    this.session.state = "transitioning";
    this.session.emit("state");
    const result = await run();
    this.session.state = "playing";
    this.session.emit("state");
    return result;
  }
  openMenu(_id: "pause" | "settings" | "about"): void { /* engine stub has no DOM */ }
  closeMenus(): void { /* noop */ }
  setLoadingProgress(_fraction: number, _label?: string): void { /* noop */ }
  track(_promise: Promise<unknown>, _weight: number): void { /* noop */ }
}

class StubHud implements Hud {
  private readonly values = new Map<string, unknown>();
  set(id: string, value: unknown): void { this.values.set(id, value); }
  async banner(_text: string, _o?: { holdMs?: number; style?: string }): Promise<void> { /* noop */ }
  toast(_text: string, _o?: { ms?: number }): void { /* noop */ }
  damageNumber(_value: number, _world: readonly [number, number, number], _o?: { color?: string; crit?: boolean }): void { /* noop */ }
  setVisible(_v: boolean): void { /* noop */ }
  snapshot(): { readonly widgets: readonly { readonly id: string; readonly value: unknown; readonly screenFraction: number }[] } {
    return { widgets: [...this.values.entries()].map(([id, value]) => ({ id, value, screenFraction: 0 })) };
  }
  dispose(): void { this.values.clear(); }
}

class StubGameFxLayer implements GameFxLayer {
  private live = 0;
  burst(_kind: string, _position: readonly [number, number, number], _o?: { count?: number; speed?: number; color?: string; normal?: readonly [number, number, number]; seed?: number }): void {
    this.live += 1;
  }
  trail(_target: string, _o: { width: number; life: number; color?: string }): { stop(): void } {
    this.live += 1;
    return { stop: () => { this.live = Math.max(0, this.live - 1); } };
  }
  get liveCount(): number { return this.live; }
  get backend(): "primitive-pool" | "particle-pass" { return "primitive-pool"; }
}

function currentUrl(): URL | undefined {
  return typeof window !== "undefined" && typeof location !== "undefined"
    ? new URL(location.href)
    : undefined;
}

/**
 * Engine-side stub (CONTRACTS.md C-24): wraps `createGameApp` (index.ts:11818).
 * session/pause/resume/setTimeScale map onto `app.time`, `app.pause`,
 * `app.resume`; scene is set via `app.setScene`; dispose via `app.dispose`.
 * DOM and sound members raise `FEATURE_UNIMPLEMENTED` (`GAME_SHELL_NOT_IN_ENGINE`).
 * Transitions are immediate cuts. It never deadlocks and real `app.ready()`
 * resolve is wired before `state` reaches "playing".
 */
export function createGame<TCue extends string, TEvent extends string>(options: CreateGameOptions<TCue, TEvent>): Game<TCue, TEvent> {
  const runtime = createGameApp(options.target as HTMLElement, {
    scene: options.scene() as AuraSceneSnapshot
  });
  const app = runtime.app as AuraApp;
  const session = new StubGameSession();
  const shell = new StubGameShell(session);
  const hud = new StubHud();
  const fx = new StubGameFxLayer();
  const capture: CaptureContext = captureFromUrl(currentUrl());
  let disposed = false;
  let readyPromise: Promise<void> | null = null;

  const game: Game<TCue, TEvent> = {
    id: options.id,
    app,
    session,
    shell,
    hud,
    touch: null as TouchControls | null,
    fx,
    capture,
    juice: {
      fire: () => {
        // Stub surface: no fx/audio/rumble drivers exist here; firing is a no-op.
      }
    },
    sound: undefined,
    ready(): Promise<void> {
      if (!readyPromise) {
        readyPromise = app.ready().then(() => {
          if (session.state === "booting" || session.state === "loading") {
            session.state = "playing";
            session.emit("state");
          }
        });
      }
      return readyPromise;
    },
    start(): void {
      session.state = "loading";
      session.emit("state");
      runtime.start();
      void game.ready();
    },
    async setScene(scene: AuraSceneSnapshot, o?: { transition?: TransitionSpec | false }): Promise<void> {
      if (disposed) return;
      if (o?.transition) {
        await shell.transition(() => app.setScene(scene), o.transition);
      } else {
        await app.setScene(scene);
      }
    },
    async dispose(): Promise<void> {
      if (disposed) return;
      disposed = true;
      session.state = "disposed";
      session.emit("state");
      hud.dispose();
      runtime.dispose();
      await app.dispose();
    }
  };

  if (typeof window !== "undefined") {
    (window as unknown as Record<string, unknown>).__AURA3D_GAME__ = {
      route: typeof location !== "undefined" ? location.pathname : "",
      get state() { return session.state; },
      get frame() { return 0; },
      firstFrameAt: null,
      sessionStartedAt: Date.now()
    };
  }

  return game;
}
