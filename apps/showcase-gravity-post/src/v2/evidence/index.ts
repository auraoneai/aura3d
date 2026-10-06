// apps/showcase-gravity-post/src/v2/evidence/index.ts — §7.2.1 evidence.
// Publishes `window.__AURA3D_GAME_EVIDENCE__["showcase-gravity-post"]` with
// lazy section getters. The required condition reads `pod.state` (normalized
// "in-flight" while the authored integrator is coasting) and `pod.launchedBy`
// ("keyboard" when the Enter-key launch path fired, "pointer" for the drag).
import type { AuraCameraPose, Game } from "@aura3d/engine";
import type { ContractSpec } from "../../gameplay/contracts";
import type { PodRuntimeState } from "../../gameplay/pod";
import type { ScoreBreakdown } from "../../gameplay/scoring";
import type { StationWorld } from "../../gameplay/stations";

export const GRAVITY_EVIDENCE_ID = "showcase-gravity-post";

export type PodEvidenceState = "aiming" | "in-flight" | "docked" | "lost" | "paused";
export type LaunchedBy = "pointer" | "keyboard" | "autopilot" | null;

export interface GravityRunSnapshot {
  readonly contractIndex: number;
  readonly contract: ContractSpec;
  readonly pod: PodRuntimeState;
  readonly score: number;
  readonly failedContracts: number;
  readonly completedContracts: number;
  readonly shiftOver: boolean;
  readonly campaignComplete: boolean;
  readonly paused: boolean;
  readonly aiming: boolean;
  readonly warping: boolean;
  readonly launchedBy: LaunchedBy;
  readonly lastScoreCard: ScoreBreakdown | null;
  readonly lastFailReason: string | null;
  readonly dockEventCount: number;
  readonly dockEvents: readonly string[];
  readonly flybyBeatsRun: number;
  readonly flybyActive: boolean;
  readonly visitedFlybys: readonly string[];
  readonly predictionSteps: number;
  readonly predictionComparedSamples: number;
  readonly predictionMaxDivergence: number;
  readonly predictionTolerance: number;
  readonly actualPathPoints: number;
}

export interface GravityEvidenceBindings {
  readonly game: Game;
  readonly run: () => GravityRunSnapshot;
  readonly stations: () => readonly StationWorld[];
  readonly lastRigPose: () => AuraCameraPose | null;
  readonly sceneSwaps: () => number;
  readonly appliedLook: Record<string, unknown>;
  readonly frameCount: () => number;
  readonly bootedAtMs: number;
  readonly audioCueLog: () => readonly string[];
}

function podEvidenceState(run: GravityRunSnapshot): PodEvidenceState {
  if (run.paused) return "paused";
  switch (run.pod.state) {
    case "coasting": return "in-flight";
    case "docked": return "docked";
    case "lost": return "lost";
    default: return "aiming";
  }
}

export function publishGravityEvidence(b: GravityEvidenceBindings): void {
  const w = window as unknown as Record<string, Record<string, unknown>>;
  w.__AURA3D_GAME_EVIDENCE__ ??= {};
  w.__AURA3D_GAME_EVIDENCE__[GRAVITY_EVIDENCE_ID] = {
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
        contractIndex: r.contractIndex,
        contractId: r.contract.id,
        contractTitle: r.contract.title,
        score: r.score,
        failedContracts: r.failedContracts,
        completedContracts: r.completedContracts,
        shiftOver: r.shiftOver,
        campaignComplete: r.campaignComplete,
        aiming: r.aiming,
        warping: r.warping,
        lastScore: r.lastScoreCard,
        lastFailReason: r.lastFailReason
      };
    },
    get pod() {
      const r = b.run();
      const speed = Math.hypot(r.pod.kinematic.velocity[0], r.pod.kinematic.velocity[1]);
      return {
        state: podEvidenceState(r),
        rawState: r.pod.state,
        x: r.pod.kinematic.position[0],
        z: r.pod.kinematic.position[1],
        speed,
        propellant: r.pod.propellant,
        launchedBy: r.launchedBy,
        assists: [...r.pod.assists],
        flybys: [...r.pod.flybys],
        correctionsUsed: r.pod.correctionsUsed,
        correctionTokensRemaining: r.pod.correctionTokensRemaining,
        adriftSeconds: r.pod.adriftSeconds,
        flightSeconds: r.pod.flightSeconds
      };
    },
    get contracts() {
      const r = b.run();
      return {
        active: r.contract.id,
        index: r.contractIndex,
        origin: r.contract.originStationId,
        destination: r.contract.destinationStationId,
        bonusBody: r.contract.bonusBodyId,
        captureLimit: r.contract.captureLimit,
        dockEvents: r.dockEvents,
        dockEventCount: r.dockEventCount
      };
    },
    get prediction() {
      const r = b.run();
      return {
        steps: r.predictionSteps,
        comparedSamples: r.predictionComparedSamples,
        maxDivergence: r.predictionMaxDivergence,
        tolerance: r.predictionTolerance,
        withinTolerance: r.predictionComparedSamples > 0 && r.predictionMaxDivergence <= r.predictionTolerance,
        actualPathPoints: r.actualPathPoints
      };
    },
    get framing() {
      const pose = b.lastRigPose();
      const ev = b.game.app.camera?.evidence?.();
      return {
        rig: ev?.rig ?? "gravity-post.orbit",
        subjectScreenHeightFraction: ev?.subjectScreenHeightFraction ?? null,
        pose: pose ?? ev?.pose ?? null
      };
    },
    get flyby() {
      const r = b.run();
      return { beatsRun: r.flybyBeatsRun, active: r.flybyActive, visited: r.visitedFlybys };
    },
    get stations() {
      return b.stations().map((station) => ({
        id: station.id,
        name: station.name,
        x: station.x,
        z: station.z,
        dockRadius: station.dockRadius
      }));
    },
    get loading() {
      return { sceneSwaps: b.sceneSwaps() };
    },
    get fx() {
      return { liveCount: b.game.fx.liveCount, backend: b.game.fx.backend };
    },
    get render() {
      let drawCalls = 0;
      try {
        drawCalls = Number((b.game.app.diagnostics() as { drawCalls?: number }).drawCalls ?? 0);
      } catch {
        drawCalls = 0;
      }
      return {
        drawCalls,
        backend: b.game.app.backend ?? "webgl2",
        readbacksThisFrame: 0
      };
    },
    get appliedLook() {
      return b.appliedLook;
    },
    get audio() {
      return { cues: [...b.audioCueLog()] };
    },
    get boot() {
      return { startedAtMs: b.bootedAtMs };
    }
  };
}
