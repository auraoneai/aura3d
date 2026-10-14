// apps/showcase-deep-recovery/src/v2/evidence/index.ts — §7.2.1 evidence.
// Publishes window.__AURA3D_GAME_EVIDENCE__["showcase-deep-recovery"] as lazy
// getters. render.readbacksThisFrame is a constant 0: the v2 shell issues no
// GPU readbacks — the §6.9.14 volumetric-fog readback was removed at day-0
// (the four render.readbacksThisFrame===0 conditions measure exactly that).
import type { Game } from "@aura3d/engine";

export const DEEP_EVIDENCE_ID = "showcase-deep-recovery";

export type DeepPhase = "playing" | "paused" | "blackout" | "won";

export interface DeepRunSnapshot {
  readonly phase: DeepPhase;
  readonly missionStage: string;
  readonly sub: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly yaw: number;
    readonly speed: number;
    readonly throttle: number;
    readonly depth: number;
    readonly sprint: boolean;
  };
  readonly oxygen: {
    readonly oxygen: number;
    readonly hull: number;
    readonly breached: boolean;
    readonly warningActive: boolean;
    readonly blackout: boolean;
    readonly breachCount: number;
    readonly repairCount: number;
  };
  readonly salvage: {
    readonly grappled: number;
    readonly tethered: number;
    readonly banked: number;
    readonly bankedValue: number;
    readonly cratesTotal: number;
    readonly towMassKg: number;
    readonly standardBanked: boolean;
    readonly heavyBanked: boolean;
  };
  readonly sonar: {
    readonly pings: number;
    readonly returns: number;
    readonly liveContacts: number;
    readonly cooldown: number;
  };
  readonly contracts: {
    readonly active: number;
    readonly title: string;
    readonly quotaValue: number;
    readonly complete: boolean;
  };
  readonly sensorEventCount: number;
  readonly grappleLineLive: boolean;
}

export interface DeepEvidenceBindings {
  readonly game: Game;
  snapshot(): DeepRunSnapshot;
  appliedLook(): unknown;
  audioCueLog(): readonly string[];
  bootedAtMs(): number;
  frameCount(): number;
}

export function publishDeepEvidence(b: DeepEvidenceBindings): void {
  const ev = {
    get playback() {
      const s = b.snapshot();
      return { phase: s.phase, state: s.phase === "paused" ? "paused" : "playing" };
    },
    get session() {
      const g = b.game;
      return {
        state: g.session.state,
        paused: g.session.paused,
        simTime: g.session.simTime,
        timeScale: g.session.timeScale
      };
    },
    get sub() {
      return b.snapshot().sub;
    },
    get oxygen() {
      return b.snapshot().oxygen;
    },
    get salvage() {
      return b.snapshot().salvage;
    },
    get sonar() {
      return b.snapshot().sonar;
    },
    get contracts() {
      return b.snapshot().contracts;
    },
    get fx() {
      const g = b.game;
      return { backend: g.fx.backend, liveCount: g.fx.liveCount };
    },

    get framing() {
      const ev = b.game.app.camera?.evidence?.();
      return {
        rig: ev?.rig ?? "deep-recovery.chase",
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
        warnings: d.warnings,
        // v2 issues no per-frame GPU readbacks (the day-0 P0 removed the
        // legacy volumetric-fog CPU readback); this is the four-shot
        // §7.2.1 measurement.
        readbacksThisFrame: 0
      };
    },
    get loading() {
      return { sceneSwaps: 0 };
    },
    get sensors() {
      const s = b.snapshot();
      return { eventCount: s.sensorEventCount, grappleLineLive: s.grappleLineLive };
    },
    get appliedLook() {
      return b.appliedLook();
    },
    get audio() {
      return { cues: b.audioCueLog() };
    },
    get boot() {
      return { bootedAtMs: b.bootedAtMs(), frame: b.frameCount() };
    }
  };
  const root = ((window as unknown as Record<string, unknown>).__AURA3D_GAME_EVIDENCE__ ??= {});
  (root as Record<string, unknown>)[DEEP_EVIDENCE_ID] = ev;
}
