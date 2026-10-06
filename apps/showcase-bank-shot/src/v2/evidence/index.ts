// apps/showcase-bank-shot/src/v2/evidence/index.ts — §7.2.1 evidence sections.
// Publishes `window.__AURA3D_GAME_EVIDENCE__["showcase-bank-shot"]` with lazy
// section getters (no per-frame allocation > 1 KB). The §7.2.1 required
// conditions read `table.pottedThisShot` and `balls.maxAngularSpeed` here.
import type { Game } from "@aura3d/engine";
import type { CueController } from "../../gameplay/cue";
import type { RulesEngine } from "../../gameplay/rules";
import type { createTableSimulation } from "../../gameplay/table";

export const BANK_SHOT_EVIDENCE_ID = "showcase-bank-shot";

type Sim = ReturnType<typeof createTableSimulation>;

export interface BankShotEvidenceBindings {
  readonly game: Game;
  readonly sim: Sim;
  readonly rules: RulesEngine;
  readonly cue: CueController;
  readonly rigState: { readonly rolling: boolean };
  readonly appliedLook: Record<string, unknown>;
  readonly fxLiveCount: () => number;
  readonly pottedThisShot: () => readonly number[];
  readonly maxAngularSpeed: () => number;
  readonly bootedAtMs: number;
  readonly frameCount: () => number;
  readonly audioCueLog: () => readonly string[];
}

export function publishBankShotEvidence(b: BankShotEvidenceBindings): void {
  const w = window as unknown as Record<string, Record<string, unknown>>;
  w.__AURA3D_GAME_EVIDENCE__ ??= {};
  w.__AURA3D_GAME_EVIDENCE__["showcase-bank-shot"] = {
    // `session` is a shell-owned section name (§7.2.1); the route republishes
    // playback state as `playback` (spec reads paused via `__AURA3D_GAME__.session`).
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
      return { liveCount: b.fxLiveCount(), backend: b.game.fx.backend };
    },
    get framing() {
      const ev = b.game.app.camera?.evidence?.();
      return {
        rig: ev?.rig ?? "bank-shot.aim-orbit",
        rolling: b.rigState.rolling,
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
    // T2.6 parity: identical between the play URL and every ?scenario= URL —
    // scenarios set state only, never touch the authored look.
    get appliedLook() {
      return b.appliedLook;
    },
    get loading() {
      return { bootedAtMs: b.bootedAtMs, playingAtMs: performance.now() - b.bootedAtMs };
    },
    get table() {
      const snap = b.rules.snapshot();
      return {
        rack: snap.rack,
        phase: snap.phase,
        score: snap.score,
        suit: snap.suit,
        fouls: snap.fouls,
        ballsRemaining: snap.ballsRemaining,
        clockMs: snap.clockMs,
        potted: [...snap.potted],
        pottedThisShot: b.pottedThisShot().length,
        sessionComplete: snap.sessionComplete
      };
    },
    get balls() {
      // maxAngularSpeed is measured from pose-quaternion deltas in the frame
      // loop (BallInfo carries speed, not spin) and supplied via the binding.
      return { maxAngularSpeed: b.maxAngularSpeed(), liveCount: b.sim.liveBallCount() };
    },
    get audio() {
      return { cues: [...b.audioCueLog()] };
    },
    get aim() {
      const s = b.cue.state();
      return { aimAngle: s.aimAngle, spin: s.spin, charge: s.charge, charging: s.charging };
    }
  };
}
