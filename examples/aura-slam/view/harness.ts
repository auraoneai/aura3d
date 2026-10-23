import { createSceneRenderer } from "./renderer";
import { STANDING_POSE } from "../main";
import type { MatchState } from "../contract/sim";

/**
 * Render-only harness for the parity specs: window.__AURA_SLAM_RENDER__.show(venue, patch) draws one fixed state.
 * No simulation runs here, so frames are repeatable.
 */
const canvas = document.getElementById("court") as HTMLCanvasElement;
const params = new URLSearchParams(location.search);
const renderer = createSceneRenderer({ pose: STANDING_POSE, safety: params.get("safety") === "1" });

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
void renderer.mount(canvas).then(() => api.show(params.get("venue") ?? "hard"));
