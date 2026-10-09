// apps/showcase-patrol-wing/src/v2/evidence/index.ts — §7.2.1 evidence.
// Publishes `window.__AURA3D_GAME_EVIDENCE__["showcase-patrol-wing"]` with
// lazy section getters. The two games.json required conditions read:
//   - rings.inFrame: gates inside the rig's forward cone this frame (03-mid)
//   - flight.throttle: authored throttle 0..1 (> 0.4 while the sortie climbs)
//   - drones.hitsThisSortie: cumulative cannon-hit count for this sortie
//   - fx.liveCount: live fx-layer particles (trails keep it > 0 airborne)
import type { AuraCameraPose, Game } from "@aura3d/engine";
import type { RingTrackerSnapshot } from "../../gameplay/patrol";
import type { CannonSnapshot } from "../../gameplay/weapons";

export const PATROL_EVIDENCE_ID = "showcase-patrol-wing";

export type PatrolRouteState =
  | "preflight"
  | "patrol"
  | "crashed"
  | "shot-down"
  | "incomplete"
  | "graded"
  | "campaign-complete";

export interface PatrolRunSnapshot {
  readonly state: PatrolRouteState;
  readonly paused: boolean;
  readonly patrol: number;
  readonly hull: number;
  readonly timeInPatrol: number;
  readonly rings: RingTrackerSnapshot;
  readonly cannon: CannonSnapshot;
  readonly hitsThisSortie: number;
  readonly dronesDown: number;
  readonly dronesLive: number;
  readonly currentWave: number;
  readonly spawnedWaves: number;
  readonly sensorEventCount: number;
  readonly combatEventCount: number;
  readonly padSensorLatched: boolean;
  readonly ringsInFrame: number;
  readonly orbsActive: number;
  readonly ghost: {
    readonly recorded: boolean;
    readonly frames: number;
    readonly playing: boolean;
    readonly playbackFrame: number;
  };
  readonly flight: {
    readonly position: readonly [number, number, number];
    readonly euler: readonly [number, number, number];
    readonly forward: readonly [number, number, number];
    readonly throttle: number;
    readonly speed: number;
    readonly altitude: number;
    readonly stalled: boolean;
    readonly grounded: string;
    readonly trajectoryHash: string | null;
    readonly trajectoryFrames: number;
  };
  readonly lastGrade: string | null;
  readonly bestGrade: string | null;
  /** True once a canvas touch-zone interaction has driven real input. */
  readonly touchEngaged: boolean;
}

export interface PatrolEvidenceBindings {
  readonly game: Game;
  readonly run: () => PatrolRunSnapshot;
  readonly lastRigPose: () => AuraCameraPose | null;
  readonly sceneSwaps: () => number;
  readonly appliedLook: Record<string, unknown>;
  readonly frameCount: () => number;
  readonly bootedAtMs: number;
  readonly audioCueLog: () => readonly string[];
  readonly collisionBackend: () => string;
  readonly collisionBodyCount: () => number;
}

export function publishPatrolEvidence(b: PatrolEvidenceBindings): void {
  const w = window as unknown as Record<string, Record<string, unknown>>;
  w.__AURA3D_GAME_EVIDENCE__ ??= {};
  w.__AURA3D_GAME_EVIDENCE__[PATROL_EVIDENCE_ID] = {
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
      const r = b.run();
      return {
        state: r.state,
        patrol: r.patrol,
        hull: Math.round(r.hull),
        timeInPatrol: Math.round(r.timeInPatrol * 10) / 10,
        lastGrade: r.lastGrade,
        bestGrade: r.bestGrade,
        touchEngaged: r.touchEngaged
      };
    },
    get flight() {
      const r = b.run();
      return {
        position: [...r.flight.position],
        euler: [...r.flight.euler],
        forward: [...r.flight.forward],
        throttle: Math.round(r.flight.throttle * 100) / 100,
        speed: Math.round(r.flight.speed * 10) / 10,
        altitude: Math.round(r.flight.altitude * 10) / 10,
        stalled: r.flight.stalled,
        grounded: r.flight.grounded,
        trajectoryHash: r.flight.trajectoryHash,
        trajectoryFrames: r.flight.trajectoryFrames
      };
    },
    get rings() {
      const r = b.run();
      return {
        nextRing: r.rings.nextRing,
        passedCount: r.rings.passedCount,
        complete: r.rings.complete,
        validity: r.rings.validity,
        invalidAt: r.rings.invalidAt,
        inFrame: r.ringsInFrame
      };
    },
    get drones() {
      const r = b.run();
      return {
        live: r.dronesLive,
        down: r.dronesDown,
        hitsThisSortie: r.hitsThisSortie,
        combatEvents: r.combatEventCount
      };
    },
    get cannon() {
      const r = b.run();
      return {
        shotsFired: r.cannon.shotsFired,
        shotsHit: r.cannon.shotsHit,
        accuracy: Math.round(r.cannon.accuracy * 1000) / 1000,
        cooling: r.cannon.cooling
      };
    },
    get waves() {
      const r = b.run();
      return {
        current: r.currentWave,
        spawned: r.spawnedWaves,
        orbsActive: r.orbsActive
      };
    },
    get ghost() {
      const r = b.run();
      return { ...r.ghost };
    },
    get sensors() {
      const r = b.run();
      return {
        events: r.sensorEventCount,
        padLatched: r.padSensorLatched
      };
    },
    get fx() {
      return {
        liveCount: b.game.fx.liveCount,
        backend: b.game.fx.backend
      };
    },

    get framing() {
      const ev = b.game.app.camera?.evidence?.();
      return {
        rig: ev?.rig ?? "patrol-wing.flight",
        subjectScreenHeightFraction: ev?.subjectScreenHeightFraction ?? null,
        pose: ev?.pose ?? null
      };
    },
    get render() {
      return { readbacksThisFrame: 0 };
    },
    get loading() {
      return { sceneSwaps: b.sceneSwaps() };
    },
    get physics() {
      return {
        backend: b.collisionBackend(),
        bodies: b.collisionBodyCount()
      };
    },
    get appliedLook() {
      return { ...b.appliedLook };
    },
    get rig() {
      const pose = b.lastRigPose();
      return pose
        ? { position: [...pose.position], target: [...pose.target], fov: pose.fov }
        : null;
    },
    get audio() {
      return { cueLog: [...b.audioCueLog()] };
    },
    get boot() {
      return {
        sessionStartedAt: b.bootedAtMs,
        sceneSwaps: b.sceneSwaps()
      };
    }
  };
}
