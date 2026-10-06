// apps/showcase-siege-golf/src/v2/evidence/index.ts — §7.2.1 evidence.
// Publishes `window.__AURA3D_GAME_EVIDENCE__["showcase-siege-golf"]` with
// lazy section getters. The required conditions read
// `structures.toppledThisShot`, `loading.sceneSwaps` and `shot.power` here.
import type { Game } from "@aura3d/engine";
import type { HoleFlowSnapshot } from "../../gameplay/hole-flow";
import type { AimState } from "../../gameplay/shot";

export const SIEGE_EVIDENCE_ID = "showcase-siege-golf";

export interface SiegeRunSnapshot {
  readonly holeIndex: number;
  readonly holeName: string;
  readonly holeId: string;
  readonly phase: string;
  readonly strokes: number;
  readonly par: number;
  readonly toppledThisShot: number;
  readonly lastStrikePower: number;
  readonly roundComplete: boolean;
}

export interface SiegeEvidenceBindings {
  readonly game: Game;
  readonly run: () => SiegeRunSnapshot;
  readonly flow: () => HoleFlowSnapshot;
  readonly aim: () => AimState;
  readonly sceneSwaps: () => number;
  readonly appliedLook: Record<string, unknown>;
  readonly frameCount: () => number;
  readonly bootedAtMs: number;
  readonly audioCueLog: () => readonly string[];
}

export function publishSiegeEvidence(b: SiegeEvidenceBindings): void {
  const w = window as unknown as Record<string, Record<string, unknown>>;
  w.__AURA3D_GAME_EVIDENCE__ ??= {};
  w.__AURA3D_GAME_EVIDENCE__[SIEGE_EVIDENCE_ID] = {
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
    get structures() {
      const f = b.flow();
      const r = b.run();
      return {
        toppledThisShot: r.toppledThisShot,
        targetsDown: f.targetsDown,
        targetsSunk: f.targetsSunk,
        totalTargets: f.totalTargets,
        physicsBodyCount: f.physicsBodyCount,
        backend: f.backend,
        sensorEventCount: f.sensorEventCount
      };
    },
    get shot() {
      const a = b.aim();
      const r = b.run();
      return {
        phase: a.phase,
        angle: a.angle,
        charge: a.charge,
        power: r.lastStrikePower,
        strokes: r.strokes
      };
    },
    get loading() {
      return { sceneSwaps: b.sceneSwaps() };
    },
    get fx() {
      return { liveCount: b.game.fx.liveCount, backend: b.game.fx.backend };
    },
    get framing() {
      const ev = b.game.app.camera?.evidence?.();
      return {
        rig: ev?.rig ?? "siege-golf.altitude",
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
