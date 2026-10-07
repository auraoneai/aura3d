// apps/showcase-skyline-runner/src/v2/evidence/index.ts — lazy evidence sections
// for games.json requiredConditions and the QR audits.
import { SKYLINE_SECTION_COUNT } from "../../gameplay/level";

export interface SkylineEvidenceBindings {
  player(): {
    x: number;
    y: number;
    vx: number;
    vy: number;
    airborne: boolean;
    grounded: boolean;
    facing: number;
  };
  level(): {
    act: number;
    districtIndex: number;
    checkpointId: string;
    checkpointsActivated: number;
    finishReached: boolean;
  };
  run(): {
    lives: number;
    score: number;
    deaths: number;
    collected: number;
    emberStock: number;
    runEnded: boolean;
    paused: boolean;
    replayActive: boolean;
    touchEngaged: boolean;
    solverGroundedFrames: number;
    solverAirborneFrames: number;
    desyncRecoveries: number;
  };
  fx(): { liveCount: number; backend: string };
  audio(): { lastCue: string | null; cueLog: readonly string[]; ambience: string | null };
  feel(): Record<string, unknown>;
  render(): { frame: number; firstFrameAt: number };
  loading(): { sceneSwaps: number; lazyLoadedCount: number };
  appliedLook(): Record<string, unknown>;
  rig(): { id: string; position: readonly number[]; target: readonly number[]; fov: number };
  scenario(): { name: string; appliedLook: Record<string, unknown> };
}

export function publishSkylineEvidence(bindings: SkylineEvidenceBindings) {
  const evidence = {
    get player() { return bindings.player(); },
    get level() { return bindings.level(); },
    get run() { return bindings.run(); },
    get fx() { return bindings.fx(); },
    get audio() { return bindings.audio(); },
    get feel() { return bindings.feel(); },
    get render() { return bindings.render(); },
    get loading() { return bindings.loading(); },
    get appliedLook() { return bindings.appliedLook(); },
    get rig() { return bindings.rig(); },
    get scenario() { return bindings.scenario(); },
    sections: SKYLINE_SECTION_COUNT
  };
  (window as unknown as Record<string, unknown>).__AURA3D_GAME_EVIDENCE__ = {
    ...(window as unknown as Record<string, Record<string, unknown>>).__AURA3D_GAME_EVIDENCE__,
    "showcase-skyline-runner": evidence
  };
}
