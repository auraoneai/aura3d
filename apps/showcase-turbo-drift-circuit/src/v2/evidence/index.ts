// apps/showcase-turbo-drift-circuit/src/v2/evidence/index.ts — T2.5 evidence.
// §7.2.1 sections for showcase-turbo-drift-circuit under
// window.__AURA3D_GAME_EVIDENCE__["showcase-turbo-drift-circuit"], lazily
// computed, no per-frame allocation > 1KB. `session` is shell-owned — the
// route republishes playback as `playback` (spec reads paused via
// __AURA3D_GAME__.session).
import type {
  AuraApp, GameRacingSnapshot, GameSession
} from "@aura3d/engine";

export const TURBO_DRIFT_EVIDENCE_ID = "showcase-turbo-drift-circuit";

export interface TurboDriftEvidenceBindings {
  readonly game: {
    readonly session: GameSession;
    readonly fx: { readonly liveCount: number; readonly backend: string };
  };
  readonly app: () => AuraApp | undefined;
  readonly snapshot: () => GameRacingSnapshot;
  // T2.2-post: appliedLook is the C-31 runtime look manifest — a varying shape.
  readonly appliedLook: Record<string, unknown>;
  readonly raceStatus: () => string;
  readonly opponentGap: () => number;
  readonly audioCueLog: () => readonly string[];
  readonly bootedAtMs: number;
  readonly frameCount: () => number;
}

export function publishTurboDriftEvidence(b: TurboDriftEvidenceBindings): void {
  const w = window as unknown as Record<string, Record<string, unknown>>;
  w.__AURA3D_GAME_EVIDENCE__ ??= {};
  w.__AURA3D_GAME_EVIDENCE__[TURBO_DRIFT_EVIDENCE_ID] = {
    get playback() {
      return {
        state: b.game.session.state,
        paused: b.game.session.paused,
        simTime: b.game.session.simTime,
        timeScale: b.game.session.timeScale,
        frame: b.frameCount()
      };
    },
    get fx() {
      return { liveCount: b.game.fx.liveCount, backend: b.game.fx.backend };
    },
    get framing() {
      const ev = b.app()?.camera?.evidence?.();
      return {
        rig: ev?.rig ?? "turbo-drift.chase",
        subjectScreenHeightFraction: ev?.subjectScreenHeightFraction ?? null,
        fov: ev?.pose.fov ?? null
      };
    },
    get render() {
      const d = b.app()?.diagnostics?.();
      return {
        backend: d?.backend ?? null,
        drawCalls: d?.drawCalls ?? null,
        renderSize: d?.renderSize ?? null,
        fps: d?.fps ?? null,
        errors: d?.errors ?? [],
        warnings: d?.warnings ?? []
      };
    },
    get appliedLook() { return { ...b.appliedLook }; },
    get loading() {
      return { bootedAtMs: b.bootedAtMs, bootMs: performance.now() - b.bootedAtMs };
    },
    // §7.2.1 gameplay section: car.speedKph (03-mid ≥ 120), car.drifting
    // (04-action true) drive the required conditions.
    get car() {
      const s = b.snapshot();
      return {
        speedKph: Math.round(Math.abs(s.speed) * 3.6),
        drifting: Math.min(1, Math.abs(s.drift)) > 0.2,
        offTrack: s.offTrack,
        heading: s.heading,
        position: { x: s.position.x, y: s.position.y }
      };
    },
    get race() {
      const s = b.snapshot();
      return {
        lap: s.lap,
        lapsToWin: s.lapsToWin,
        checkpoint: s.checkpoint,
        checkpointCount: s.checkpointCount,
        lapTime: s.lapTime,
        bestTime: s.bestTime ?? null,
        progress: s.progress,
        status: s.status,
        hudStatus: b.raceStatus(),
        opponentGap: b.opponentGap()
      };
    },
    get audio() {
      return { cueLog: b.audioCueLog() };
    }
  };
}
