// apps/showcase-blockfall-reactor/src/v2/evidence/index.ts — §7.2.1 evidence.
// games.json required conditions:
//   board.linesClearedThisRound >= 1 && fx.liveCount > 0   (shot 04-action, 20s)
//   board.stackHeight >= 4                                  (shot 03-mid, 20s)
// Plus the lane-standard sections: loading.sceneSwaps, appliedLook parity,
// audio cue log, touchEngaged, boardView parity, beat/clearFx proofs.
import type { BlockfallAudioProof } from "../../gameplay/reactor-audio";
import type { ClearFxProof } from "../../legacy/clear-fx";
import type { CameraFeelProof } from "../../legacy/camera-feel";

export interface BlockfallEvidenceBindings {
  gameplay: () => {
    paused: boolean;
    gameOver: boolean;
    replayActive: boolean;
    touchEngaged: boolean;
    lastMove: string;
    replayIndex: number;
    replayTotal: number;
  };
  board: () => {
    lines: number;
    linesClearedThisRound: number;
    stackHeight: number;
    score: number;
    level: number;
    combo: number;
    backToBack: boolean;
    reactor: number;
    piecesPlaced: number;
    lockedCells: number;
    activeKind: string | null;
    hold: string | null;
    queue: readonly string[];
  };
  boardView: () => {
    lastParityMatch: boolean;
    capacityRespected: boolean;
    lockedGroups: number;
    lockedSubPools: number;
    perCellNodesDeleted: true;
  };
  fx: () => { liveCount: number; backend: string };
  clearFx: () => ClearFxProof;
  cameraFeel: () => CameraFeelProof;
  audio: () => BlockfallAudioProof;
  render: () => { frame: number; bootedAtMs: number; firstFrameAt: number | null };
  loading: () => { sceneSwaps: number; lazyLoadedCount: number };
  physics: () => { backend: string; bodyCount: number; sensorCount: number };
  appliedLook: Record<string, unknown>;
  rig: () => { id: string; driftDeg: number; punch: number };
  scenario: () => string | null;
}

export function publishBlockfallEvidence(b: BlockfallEvidenceBindings): void {
  const root = (window as unknown as { __AURA3D_GAME_EVIDENCE__?: Record<string, unknown> });
  root.__AURA3D_GAME_EVIDENCE__ ??= {};
  root.__AURA3D_GAME_EVIDENCE__["showcase-blockfall-reactor"] = {
    get board() { return b.board(); },
    get boardView() { return b.boardView(); },
    get gameplay() { return b.gameplay(); },
    get fx() { return b.fx(); },
    get clearFx() { return b.clearFx(); },
    get cameraFeel() { return b.cameraFeel(); },
    get audio() { return b.audio(); },
    get render() { return b.render(); },
    get loading() { return b.loading(); },
    get physics() { return b.physics(); },
    get appliedLook() { return b.appliedLook; },
    get rig() { return b.rig(); },
    get scenario() { return b.scenario(); }
  };
}
