// apps/showcase-courier-rush/src/v2/evidence/index.ts — §7.2.1 evidence.
// Publishes `window.__AURA3D_GAME_EVIDENCE__["showcase-courier-rush"]` with
// lazy section getters (no per-frame allocation > 1 KB). The required
// condition reads `delivery.completed` here; van/traffic/fx sections feed the
// capture reports.
import type { Game } from "@aura3d/engine";
import type { DispatchState } from "../../gameplay/dispatch";
import type { TrafficCarSnapshot } from "../../gameplay/traffic";

export const COURIER_EVIDENCE_ID = "showcase-courier-rush";

export interface CourierEvidenceBindings {
  readonly game: Game;
  readonly dispatch: () => DispatchState;
  readonly van: () => { x: number; z: number; heading: number; speed: number };
  readonly traffic: () => readonly TrafficCarSnapshot[];
  readonly autopilot: () => { enabled: boolean; aim: { x: number; z: number; left: number } };
  readonly appliedLook: Record<string, unknown>;
  readonly frameCount: () => number;
  readonly bootedAtMs: number;
  readonly audioCueLog: () => readonly string[];
}

export function publishCourierEvidence(b: CourierEvidenceBindings): void {
  const w = window as unknown as Record<string, Record<string, unknown>>;
  w.__AURA3D_GAME_EVIDENCE__ ??= {};
  w.__AURA3D_GAME_EVIDENCE__[COURIER_EVIDENCE_ID] = {
    get playback() {
      return {
        state: b.game.session.state,
        paused: b.game.session.paused,
        simTime: b.game.session.simTime,
        timeScale: b.game.session.timeScale,
        frame: b.frameCount()
      };
    },
    get delivery() {
      const d = b.dispatch();
      return {
        completed: d.deliveriesCompleted,
        phase: d.phase,
        deliveryIndex: d.deliveryIndex,
        score: d.score,
        strikes: d.strikes,
        combo: d.combo,
        timerMs: d.timerMs,
        failReason: d.failReason
      };
    },
    get van() {
      const v = b.van();
      return { x: v.x, z: v.z, heading: v.heading, speed: v.speed };
    },
    get traffic() {
      const cars = b.traffic();
      return {
        count: cars.length,
        moving: cars.filter((c) => c.speed > 0.4).length,
        courtesyStopped: cars.some((c) => c.courtesyStopped)
      };
    },
    get autopilot() {
      const ap = b.autopilot();
      return { enabled: ap.enabled, aim: ap.aim };
    },
    get fx() {
      return { liveCount: b.game.fx.liveCount, backend: b.game.fx.backend };
    },
    get framing() {
      const ev = b.game.app.camera?.evidence?.();
      return {
        rig: ev?.rig ?? "courier-rush.chase",
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
