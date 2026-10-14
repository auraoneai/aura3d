// apps/showcase-rooftop-buckets/src/v2/evidence/index.ts — §7.2.1 evidence.
// Publishes `window.__AURA3D_GAME_EVIDENCE__["showcase-rooftop-buckets"]` with
// lazy section getters (no per-frame allocation > 1 KB). Required conditions
// read `shot.result`, `shot.meter`, `characters.skinnedVisible`,
// `characters.tracksApplied` and `fx.liveCount` here.
import type { Game } from "@aura3d/engine";
import type { BallState } from "../../gameplay/shot";
import type { GameScoreState } from "../../gameplay/scoring";
import type { HoopState } from "../../gameplay/rim";

export const ROOFTOP_EVIDENCE_ID = "showcase-rooftop-buckets";

export interface RooftopEvidenceBindings {
  readonly game: Game;
  readonly ball: () => BallState;
  readonly score: () => GameScoreState;
  readonly hoop: () => HoopState;
  readonly chargePower: () => number;
  readonly spotIndex: () => number;
  readonly lastResult: () => "make" | "miss" | null;
  readonly skinnedActors: () => readonly { readonly id: string; readonly tracksApplied: number }[];
  readonly appliedLook: Record<string, unknown>;
  readonly frameCount: () => number;
  readonly bootedAtMs: number;
  readonly audioCueLog: () => readonly string[];
}

export function publishRooftopEvidence(b: RooftopEvidenceBindings): void {
  const w = window as unknown as Record<string, Record<string, unknown>>;
  w.__AURA3D_GAME_EVIDENCE__ ??= {};
  w.__AURA3D_GAME_EVIDENCE__[ROOFTOP_EVIDENCE_ID] = {
    get playback() {
      return {
        state: b.game.session.state,
        paused: b.game.session.paused,
        simTime: b.game.session.simTime,
        timeScale: b.game.session.timeScale,
        frame: b.frameCount()
      };
    },
    get shot() {
      const ball = b.ball();
      return {
        result: b.lastResult(),
        meter: b.chargePower(),
        inFlight: ball.inFlight,
        hasScored: ball.hasScored,
        hitDefender: ball.hitDefender,
        spot: b.spotIndex()
      };
    },
    get characters() {
      const actors = b.skinnedActors();
      return {
        skinnedVisible: actors.length,
        tracksApplied: actors.reduce((sum, a) => sum + a.tracksApplied, 0),
        actors: actors.map((a) => a.id)
      };
    },
    get score() {
      const s = b.score();
      return {
        score: s.score,
        heat: s.heat,
        state: s.state,
        onFire: s.onFire,
        streak: s.streak,
        possession: s.possession,
        madeSpotIds: s.madeSpotIds
      };
    },
    get hoop() {
      const h = b.hoop();
      return { x: h.x, y: h.y, z: h.z, mode: h.mode, defenderTelegraph: h.defenderTelegraph };
    },
    get fx() {
      return { liveCount: b.game.fx.liveCount, backend: b.game.fx.backend };
    },
    get framing() {
      const ev = b.game.app.camera?.evidence?.();
      return {
        rig: ev?.rig ?? "rooftop-buckets.shoulder",
        subjectScreenHeightFraction: ev?.subjectScreenHeightFraction ?? null,
        pose: ev?.pose ?? null
      };
    },
    get render() {
      const d = b.game.app.diagnostics();
      return {
        backend: d.backend,
        drawCalls: d.drawCalls,
        renderSize: d.renderSize,
        fps: d.fps,
        errors: d.errors,
        warnings: d.warnings
      };
    },
    // T2.6 parity: identical between the play URL and every ?scenario= URL.
    get appliedLook() {
      return b.appliedLook;
    },
    get audio() {
      return { cues: b.audioCueLog() };
    },
    get boot() {
      return { bootedAtMs: b.bootedAtMs, frame: b.frameCount() };
    }
  };
}
