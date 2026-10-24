import { clamp } from "../ui/format";

/**
 * The live page's adapter-side player controller, ported verbatim from `stepTopTennisPlayerControl` and
 * `installManualAndAutoplayControls` in apps/showcase-top-tennis/src/main.ts. It is not part of the simulation: the live
 * page runs it once per `render()` (after `update()`), with a constant `dt` of 1/60, and it mutates the engine state
 * directly. Baseline replays (evidence/aura-slam/reference.json) include its effects, so the native shell calls it from
 * `render()` exactly once per presented frame and keeps the same arithmetic, clamps and ordering.
 */
export interface ControllerEngine {
  requestSwing?(side: "player" | "ai", time: number, forcePower?: boolean): unknown;
  selectShot?(shot: string, side?: "player" | "ai"): unknown;
}

interface ActorLike { x: number; y: number; vx: number; vy: number; swing: number; swingCooldown: number; moveBlend?: number; stride?: number }
interface BallLike {
  x: number; y: number; z: number; vz: number; vy: number; active: boolean; lastHit: string | null; isServe?: boolean; bounceCount: number;
  targetX?: number; targetY?: number;
}
export interface ControllerState {
  mode: string; paused: boolean; phase: string; server: string; time: number;
  player?: ActorLike; ball?: BallLike;
  serveAttempt?: { swingAt?: number | null } | null;
}

export interface AdapterController {
  /** The "Auto" demo player (`?autoplay=1`, `?demo=1` or the Auto toggle). */
  enabled: boolean;
  readonly keysHeld: ReadonlySet<string>;
  /** One controller step; the live page calls it from `render()` with `dt = 1/60`. */
  step(state: ControllerState | null | undefined, dt?: number): void;
  keyDown(event: { code: string; target?: unknown }): void;
  keyUp(event: { code: string }): void;
  /** Window listeners equivalent to the adapter's; returns the uninstall function. */
  install(target?: Pick<Window, "addEventListener" | "removeEventListener">): () => void;
  reset(): void;
}

const isTextField = (target: unknown): boolean => {
  const tag = (target as { tagName?: string } | null | undefined)?.tagName;
  return typeof tag === "string" && ["INPUT", "SELECT", "TEXTAREA"].includes(tag);
};

export function createAdapterController(options: { engine: () => ControllerEngine | null | undefined; state: () => ControllerState | null | undefined; autoplay?: boolean }): AdapterController {
  const held = new Set<string>();
  let autoServeTimer = 0;

  function step(state: ControllerState | null | undefined, dt = 1 / 60): void {
    if (!state || state.mode !== "playing" || state.paused) return;
    const eng = options.engine();
    const p = state.player;
    const b = state.ball;
    if (!p || !b) return;

    const mx = (held.has("KeyD") || held.has("ArrowRight") ? 1 : 0) - (held.has("KeyA") || held.has("ArrowLeft") ? 1 : 0);
    const my = (held.has("KeyS") || held.has("ArrowDown") ? 1 : 0) - (held.has("KeyW") || held.has("ArrowUp") ? 1 : 0);

    if (!controller.enabled) {
      // Immediate baseline movement and leg stride during serve setup as well as rally.
      if ((state.phase === "serve" || state.phase === "serveToss") && state.server === "player" && (mx !== 0 || my !== 0)) {
        const len = Math.hypot(mx, my) || 1;
        p.vx = (mx / len) * 1.35;
        p.vy = (my / len) * 1.05;
        p.x = clamp((p.x ?? 0) + p.vx * dt, -0.95, 0.95);
        p.y = clamp((p.y ?? 1.035) + p.vy * dt, 0.72, 1.12);
        p.moveBlend = Math.min(1, (p.moveBlend ?? 0) + dt * 9.5);
        p.stride = ((p.stride ?? 0) + dt * 11.5) % (Math.PI * 2);
        if (state.phase === "serve") {
          b.x = p.x + 0.035;
          b.y = p.y - 0.04;
        }
      }
      // Assist completing the overhead serve swing at toss apex after the user starts the toss.
      if (state.phase === "serveToss" && state.server === "player" && state.serveAttempt?.swingAt === null && b.z >= 0.8 && b.vz <= 0.55) {
        eng?.requestSwing?.("player", state.time, false);
      }
      return;
    }

    if (state.phase === "serve" && state.server === "player") {
      autoServeTimer += dt;
      if (autoServeTimer >= 0.45) {
        autoServeTimer = 0;
        eng?.requestSwing?.("player", state.time, false);
      }
      return;
    }
    autoServeTimer = 0;

    if (state.phase === "serveToss" && state.server === "player" && state.serveAttempt?.swingAt === null && b.z >= 0.82 && b.vz <= 0.55) {
      eng?.requestSwing?.("player", state.time, false);
      return;
    }

    if (state.phase === "rally" && b.active && b.lastHit === "ai" && b.vy > 0) {
      const targetX = clamp(b.targetX ?? b.x ?? 0, -0.92, 0.92);
      const targetY = clamp(Math.max(0.68, (b.targetY ?? 0.82) + 0.08), 0.62, 1.06);
      const dx = targetX - p.x;
      const dy = targetY - p.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 0.04) {
        const spd = Math.min(1.32, dist * 6.5);
        p.vx = (dx / dist) * spd;
        p.vy = (dy / dist) * spd;
        p.x = clamp(p.x + p.vx * dt, -1.02, 1.02);
        p.y = clamp(p.y + p.vy * dt, 0.18, 1.18);
        p.moveBlend = Math.min(1, (p.moveBlend ?? 0) + dt * 9);
        p.stride = ((p.stride ?? 0) + dt * 11) % (Math.PI * 2);
      } else {
        p.vx *= 0.8;
        p.vy *= 0.8;
        p.moveBlend = Math.max(0, (p.moveBlend ?? 0) - dt * 6);
      }
      const ballDist = Math.hypot((b.x - p.x) * 1.05, b.y - p.y);
      if ((!b.isServe || b.bounceCount >= 1) && ballDist <= 0.34 && b.y > 0.12 && p.swing <= 0 && p.swingCooldown <= 0) {
        eng?.selectShot?.("deep", "player");
        eng?.requestSwing?.("player", state.time, false);
      }
    }
  }

  function keyDown(event: { code: string; target?: unknown }): void {
    if (isTextField(event.target)) return;
    held.add(event.code);
    if (event.code === "KeyJ" || event.code === "KeyK" || event.code === "KeyL") {
      const eng = options.engine();
      const st = options.state();
      if (eng && st && st.mode === "playing" && !st.paused) {
        const shot = event.code === "KeyJ" ? "short" : event.code === "KeyL" ? "lob" : "deep";
        eng.selectShot?.(shot, "player");
        eng.requestSwing?.("player", st.time, event.code === "KeyK");
      }
    }
  }
  const keyUp = (event: { code: string }): void => { held.delete(event.code); };

  const controller: AdapterController = {
    enabled: options.autoplay ?? false,
    keysHeld: held,
    step, keyDown, keyUp,
    install(target = window) {
      const down = (event: KeyboardEvent): void => keyDown(event);
      const up = (event: KeyboardEvent): void => keyUp(event);
      const blur = (): void => { held.clear(); };
      target.addEventListener("keydown", down as EventListener);
      target.addEventListener("keyup", up as EventListener);
      target.addEventListener("blur", blur);
      return () => {
        target.removeEventListener("keydown", down as EventListener);
        target.removeEventListener("keyup", up as EventListener);
        target.removeEventListener("blur", blur);
      };
    },
    reset() { held.clear(); autoServeTimer = 0; }
  };
  return controller;
}
