// apps/showcase-aurora-lander/src/v2/evidence/index.ts — §7.2.1 evidence.
// Publishes `window.__AURA3D_GAME_EVIDENCE__["showcase-aurora-lander"]` with
// lazy section getters. The required conditions read `lander.touchdown`
// ("landed" once a graded touchdown holds), `lander.altitude` (feet-plane AGL)
// and `framing.padInFrame` (active pad inside the rig's cone) here.
import type { AuraCameraPose, Game } from "@aura3d/engine";
import { pointInRigFrame } from "../scene/camera";
import type { LanderSite } from "../../gameplay/sites";
import type { LandingPrediction } from "../../gameplay/prediction";
import type { LandingGrade } from "../../gameplay/touchdown";
import type { TerrainField } from "../../gameplay/terrain";

export const AURORA_EVIDENCE_ID = "showcase-aurora-lander";

export interface AuroraRunSnapshot {
  readonly siteIndex: number;
  readonly phase: "flying" | "landed" | "crashed" | "campaign-clear";
  readonly paused: boolean;
  readonly lastGrade: LandingGrade | null;
  readonly crashReason: string;
  readonly state: { x: number; y: number; z: number; vy: number; hspeed: number; tiltDeg: number; fuel: number };
  readonly altitude: number;
  readonly prediction: LandingPrediction | null;
  readonly hull: number;
  readonly campaignScore: number;
  readonly completedSites: number;
  readonly siteScores: readonly number[];
}

export interface AuroraEvidenceBindings {
  readonly game: Game;
  readonly run: () => AuroraRunSnapshot;
  readonly site: () => LanderSite;
  readonly field: () => TerrainField | undefined;
  readonly padWorldY: () => number;
  readonly lastRigPose: () => AuraCameraPose | null;
  readonly contact: () => { seen: number; queryAgreement: boolean | null; padSensorArmed: boolean };
  readonly ghost: () => { active: boolean; replayHash: string | null };
  readonly sceneSwaps: () => number;
  readonly appliedLook: Record<string, unknown>;
  readonly frameCount: () => number;
  readonly bootedAtMs: number;
  readonly audioCueLog: () => readonly string[];
}

export function publishAuroraEvidence(b: AuroraEvidenceBindings): void {
  const w = window as unknown as Record<string, Record<string, unknown>>;
  w.__AURA3D_GAME_EVIDENCE__ ??= {};
  w.__AURA3D_GAME_EVIDENCE__[AURORA_EVIDENCE_ID] = {
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
    get lander() {
      const r = b.run();
      return {
        x: r.state.x,
        y: r.state.y,
        z: r.state.z,
        vy: r.state.vy,
        hspeed: r.state.hspeed,
        tiltDeg: r.state.tiltDeg,
        fuelFraction: r.state.fuel,
        altitude: r.altitude,
        touchdown: r.paused
          ? "paused"
          : r.phase === "crashed"
            ? "crashed"
            : r.phase === "landed" || r.phase === "campaign-clear"
              ? "landed"
              : "in-flight",
        lastGrade: r.lastGrade,
        crashReason: r.crashReason
      };
    },
    get framing() {
      const r = b.run();
      const site = b.site();
      const pose = b.lastRigPose();
      const pad = site.pads[0]!;
      const ev = b.game.app.camera?.evidence?.();
      return {
        rig: ev?.rig ?? "aurora-lander.altitude",
        subjectScreenHeightFraction: ev?.subjectScreenHeightFraction ?? null,
        pose: pose ?? ev?.pose ?? null,
        padInFrame: pose ? pointInRigFrame(pose, [pad.x, b.padWorldY(), pad.z]) : false,
        pad: { x: pad.x, y: b.padWorldY(), z: pad.z, radius: pad.radius },
        altitude: r.altitude
      };
    },
    get touchdown() {
      const c = b.contact();
      return {
        contactEventSeen: c.seen > 0,
        contactEvents: c.seen,
        contactQueryAgreement: c.queryAgreement,
        padSensorArmed: c.padSensorArmed
      };
    },
    get sites() {
      const r = b.run();
      const site = b.site();
      return {
        siteId: site.id,
        name: site.name,
        multiplier: site.multiplier,
        completedSites: r.completedSites,
        campaignScore: r.campaignScore,
        hull: r.hull,
        siteScores: [...r.siteScores]
      };
    },
    get terrain() {
      const f = b.field();
      return f
        ? {
            colliderKind: "heightfield-static",
            rows: f.rows,
            columns: f.columns,
            cellSize: f.cellSize,
            minHeight: f.minHeight,
            maxHeight: f.maxHeight
          }
        : null;
    },
    get ghost() {
      return { ...b.ghost() };
    },
    get loading() {
      return { sceneSwaps: b.sceneSwaps() };
    },
    get fx() {
      return { liveCount: b.game.fx.liveCount, backend: b.game.fx.backend };
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
