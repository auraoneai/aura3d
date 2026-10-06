// apps/showcase-pulse-tunnel/src/v2/evidence/index.ts — §7.2.1 evidence.
// Publishes `window.__AURA3D_GAME_EVIDENCE__["showcase-pulse-tunnel"]` with
// lazy section getters. The required conditions read `gates.passedOnBeat`,
// `fx.liveCount` and `framing.canvasMatchesViewport` here.
import type { Game } from "@aura3d/engine";
import type { PulsePlayerState } from "../../gameplay/player";
import type { BeatClockSample } from "../../gameplay/beat-clock";
import type { StyleSnapshot } from "../../gameplay/style";

export const PULSE_EVIDENCE_ID = "showcase-pulse-tunnel";

export interface PulseRunSnapshot {
  readonly state: string;
  readonly sectionId: string;
  readonly beat: number;
  readonly elapsed: number;
  readonly shields: number;
  readonly passed: number;
  readonly passedOnBeat: number;
  readonly grazes: number;
  readonly collisions: number;
  readonly finishedReason: string | null;
}

export interface PulseEvidenceBindings {
  readonly game: Game;
  readonly run: () => PulseRunSnapshot;
  readonly player: () => PulsePlayerState;
  readonly style: () => StyleSnapshot;
  readonly gates: () => { active: number; pending: number };
  readonly clockSample: () => BeatClockSample;
  readonly appliedLook: Record<string, unknown>;
  readonly frameCount: () => number;
  readonly bootedAtMs: number;
  readonly audioCueLog: () => readonly string[];
}

export function publishPulseEvidence(b: PulseEvidenceBindings): void {
  const w = window as unknown as Record<string, Record<string, unknown>>;
  w.__AURA3D_GAME_EVIDENCE__ ??= {};
  w.__AURA3D_GAME_EVIDENCE__[PULSE_EVIDENCE_ID] = {
    get playback() {
      return {
        state: b.game.session.state,
        paused: b.game.session.paused,
        simTime: b.game.session.simTime,
        timeScale: b.game.session.timeScale,
        frame: b.frameCount()
      };
    },
    get run() {
      return { ...b.run() };
    },
    get gates() {
      const r = b.run();
      const g = b.gates();
      return {
        active: g.active,
        pending: g.pending,
        passed: r.passed,
        passedOnBeat: r.passedOnBeat,
        grazes: r.grazes,
        collisions: r.collisions
      };
    },
    get player() {
      const p = b.player();
      return {
        lane: p.lane,
        x: p.x,
        y: p.y,
        airborne: p.airborne,
        sliding: p.sliding,
        colliderTop: p.colliderTop,
        invulnerable: p.invulnRemaining > 0
      };
    },
    get style() {
      const s = b.style();
      return {
        heat: s.heat,
        multiplier: s.multiplier,
        score: s.score,
        distance: s.distance,
        grazes: s.grazes
      };
    },
    get sync() {
      const c = b.clockSample();
      return {
        mode: c.mode,
        time: c.time,
        driftMs: c.driftMs,
        driftChecksFailed: c.driftChecksFailed,
        flipped: c.flippedAtTime !== null
      };
    },
    get fx() {
      return { liveCount: b.game.fx.liveCount, backend: b.game.fx.backend };
    },
    get framing() {
      const ev = b.game.app.camera?.evidence?.();
      const canvas = b.game.app.canvas;
      const renderSize = b.game.app.diagnostics().renderSize;
      const dpr = window.devicePixelRatio || 1;
      return {
        rig: ev?.rig ?? "pulse-tunnel.chase",
        subjectScreenHeightFraction: ev?.subjectScreenHeightFraction ?? null,
        pose: ev?.pose ?? null,
        canvasMatchesViewport:
          canvas !== undefined &&
          renderSize !== undefined &&
          Math.abs(renderSize[0] - window.innerWidth * dpr) <= 2 &&
          Math.abs(renderSize[1] - window.innerHeight * dpr) <= 2
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
