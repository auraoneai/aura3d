import { createSceneRenderer } from "./renderer";
import { STANDING_POSE } from "../main";
import { createAthletePose } from "./pose";
import type { MatchState } from "../contract/sim";

/**
 * Render-only harness for the parity specs: window.__AURA_SLAM_RENDER__.show(venue, patch) draws one fixed state.
 * No simulation runs here, so frames are repeatable.
 */
const canvas = document.getElementById("court") as HTMLCanvasElement;
const params = new URLSearchParams(location.search);
const bad: string[] = [];
const hasBad = (v: unknown): boolean => (typeof v === "number" ? !Number.isFinite(v) : Array.isArray(v) ? v.some(hasBad) : false);
const renderer = createSceneRenderer({
  wrapHandle: params.get("trace") === "1"
    ? (id, handle) => new Proxy(handle as object, { get: (target, key) => { const value = Reflect.get(target, key); return typeof value === "function" ? (...args: unknown[]) => { if (args.some(hasBad) && bad.length < 40) bad.push(`${id}.${String(key)}(${JSON.stringify(args)})`); const out = value.apply(target, args); return out === target ? handle : out; } : value; } }) as typeof handle
    : undefined, pose: params.get("pose") === "real" ? createAthletePose() : STANDING_POSE, safety: params.get("safety") === "1" });

function baseState(venue: string): MatchState {
  const actor = (side: "player" | "ai", y: number, end: 1 | -1) => ({ side, id: side === "player" ? "p1" : "p2", end, x: 0, y }) as unknown as MatchState["player"];
  return {
    mode: "playing", paused: false, phase: "serve", venue, time: 1.5, tick: 90, server: "player", serveCourt: "deuce",
    score: { playerPoints: 0, aiPoints: 0, playerGames: 0, aiGames: 0 },
    player: actor("player", 0.86, 1), ai: actor("ai", -0.86, -1),
    ball: { x: 0.1, y: 0.7, z: 0.35, vx: 0, vy: 0, vz: 0, active: true, trail: [] } as unknown as MatchState["ball"],
    retiringBall: null, marks: [], serveAttempt: null, outFeedback: null
  } as unknown as MatchState;
}

const api = {
  ready: () => renderer.isReady(),
  frames: () => renderer.framesRendered(),
  debug: () => renderer.debug(),
  async show(venue: string, patch: Partial<MatchState> = {}): Promise<void> {
    renderer.setVenue(venue);
    renderer.render({ ...baseState(venue), ...patch } as MatchState, 1 / 60);
  },
  /** Draw a complete sim state captured from another build (the live page's `getState()`), unchanged. */
  async showState(state: MatchState): Promise<void> {
    renderer.setVenue(state.venue || "hard");
    renderer.render(state, 1 / 60);
  },
  /** Debug: where a captured state would produce non-finite render inputs. */
  scan(state: MatchState): Record<string, unknown> {
    const bad = (v: unknown, path: string): string[] => typeof v === "number" ? (Number.isFinite(v) ? [] : [path]) : Array.isArray(v) ? v.flatMap((x, i) => bad(x, `${path}[${i}]`)) : v && typeof v === "object" ? Object.entries(v as Record<string, unknown>).flatMap(([k, x]) => bad(x, `${path}.${k}`)) : [];
    const pose = createAthletePose();
    const s = state as unknown as Record<string, any>;
    return {
      playerKeys: Object.keys(s.player ?? {}), aiKeys: Object.keys(s.ai ?? {}), ballKeys: Object.keys(s.ball ?? {}),
      serveAim: s.serveAttempt?.lockedAim ?? s.serveAttempt?.aim ?? null, phase: s.phase, mode: s.mode, time: s.time, server: s.server,
      badState: bad(s, "state").slice(0, 12),
      badPlayerPose: bad(pose.pose(s.player, s as MatchState), "pose.player").slice(0, 12),
      badAiPose: bad(pose.pose(s.ai, s as MatchState), "pose.ai").slice(0, 12),
      marks: Array.isArray(s.marks) ? s.marks.slice(0, 2) : s.marks, trailLen: Array.isArray(s.ball?.trail) ? s.ball.trail.length : null, trail0: Array.isArray(s.ball?.trail) ? s.ball.trail[0] : null,
      retiring: s.retiringBall ?? null
    };
  },
  traced: () => bad.slice(),
  diag: () => {
    const d = (renderer.app as unknown as { diagnostics?: () => Record<string, unknown> } | null)?.diagnostics?.() ?? {};
    const pick = (o: unknown, depth: number, path: string, out: Record<string, unknown>): void => {
      if (!o || typeof o !== "object" || depth > 3) return;
      for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
        const p2 = path ? `${path}.${k}` : k;
        if (typeof v === "number" && /draw|pass|shadow|instance|triangle|node|batch|cascade|mesh/i.test(p2)) out[p2] = v;
        else if (v && typeof v === "object" && !Array.isArray(v)) pick(v, depth + 1, p2, out);
      }
    };
    const out: Record<string, unknown> = {};
    pick(d, 0, "", out);
    return out;
  },
  drawCalls: () => (renderer.app as unknown as { diagnostics?: () => { drawCalls?: number } } | null)?.diagnostics?.()?.drawCalls ?? null
};
(window as unknown as { __AURA_SLAM_RENDER__: typeof api }).__AURA_SLAM_RENDER__ = api;

const resize = () => {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(2, Math.round(canvas.clientWidth * ratio));
  canvas.height = Math.max(2, Math.round(canvas.clientHeight * ratio));
  renderer.resize(canvas.clientWidth, canvas.clientHeight, ratio);
};
resize();
window.addEventListener("resize", resize);
// The real pose solver needs a complete sim state (stride, facing, ...); a captured state arrives through showState().
void renderer.mount(canvas).then(() => (params.get("pose") === "real" ? undefined : api.show(params.get("venue") ?? "hard")));
