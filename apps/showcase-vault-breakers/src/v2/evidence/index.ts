// apps/showcase-vault-breakers/src/v2/evidence/index.ts — §7.2.1 evidence.
// Publishes `window.__AURA3D_GAME_EVIDENCE__["showcase-vault-breakers"]` with
// lazy section getters (no per-frame allocation > 1 KB). The §7.2.1 required
// conditions read `ball.inPlay` and `table.bumperHitsThisBall` + `fx.liveCount`.
import type { Game } from "@aura3d/engine";
import type { VaultFlow } from "../../gameplay/ball-flow";

export const VAULT_EVIDENCE_ID = "showcase-vault-breakers";

export interface VaultEvidenceBindings {
  readonly game: Game;
  readonly flow: VaultFlow;
  readonly ballInPlay: () => boolean;
  readonly bumperHitsThisBall: () => number;
  readonly liveBallPositions: () => readonly (readonly [number, number, number])[];
  readonly appliedLook: Record<string, unknown>;
  readonly fxLiveCount: () => number;
  readonly frameCount: () => number;
  readonly bootedAtMs: number;
  readonly audioCueLog: () => readonly string[];
}

export function publishVaultEvidence(b: VaultEvidenceBindings): void {
  const w = window as unknown as Record<string, Record<string, unknown>>;
  w.__AURA3D_GAME_EVIDENCE__ ??= {};
  w.__AURA3D_GAME_EVIDENCE__[VAULT_EVIDENCE_ID] = {
    get playback() {
      return {
        state: b.game.session.state,
        paused: b.game.session.paused,
        simTime: b.game.session.simTime,
        timeScale: b.game.session.timeScale,
        frame: b.frameCount()
      };
    },
    get ball() {
      const snap = b.flow.snapshot();
      return {
        inPlay: b.ballInPlay(),
        activeBalls: snap.activeBalls,
        ball: snap.ball,
        ballsRemaining: snap.ballsRemaining
      };
    },
    get table() {
      const snap = b.flow.snapshot();
      return {
        phase: snap.phase,
        score: snap.score,
        multiplier: snap.multiplier,
        banksDown: snap.banksDown,
        vaultOpen: snap.vaultOpen,
        multiball: snap.multiball,
        tiltLocked: snap.tiltLocked,
        tiltStrikes: snap.tiltStrikes,
        missionLine: snap.missionLine,
        orbitLoops: snap.orbitLoops,
        bumperHitsThisBall: b.bumperHitsThisBall(),
        sensorEventCount: snap.sensorEventCount,
        physicsBodyCount: snap.physicsBodyCount,
        backend: snap.backend
      };
    },
    get fx() {
      return { liveCount: b.fxLiveCount(), backend: b.game.fx.backend };
    },
    get framing() {
      const ev = b.game.app.camera?.evidence?.();
      return {
        rig: ev?.rig ?? "vault-breakers.static-table",
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
    get audio() {
      return { cues: b.audioCueLog() };
    },
    get boot() {
      return { bootedAtMs: b.bootedAtMs, frame: b.frameCount() };
    }
  };
}
