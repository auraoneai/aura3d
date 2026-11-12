/**
 * Per-court procedural set-pieces and 360° streetball perimeter enclosures (WP-07 procedural multi-material overhaul).
 * Presentation only: nothing collides, every piece stands outside the playable court and camera obstacle cylinders,
 * and compound multi-material geometry keeps per-court draw-call budgets tight.
 */
import type { AuraNodeBuilder, AuraSceneNode, AuraVec3 } from "@aura3d/engine";
import {
  buildCoveredBleacherCanopyNodes,
  buildManilaCorrugatedShedNodes,
  buildProceduralCourtsideTableNodes,
  buildProceduralEnclosureNodes,
  buildRuckerMuralWallNode,
  buildShanghaiContainerNodes,
  buildVeniceLifeguardTowerNode
} from "./art/proceduralModels";
import type { CourtId } from "./courtRigs";

/** The centre of the court the pieces face. */
const COURT_CENTRE: readonly [number, number] = [0, 4];
const facing = (x: number, z: number): number => Math.atan2(COURT_CENTRE[0] - x, COURT_CENTRE[1] - z);

export interface SetPiecePlacement {
  readonly name: string;
  readonly position: AuraVec3;
  readonly yaw: number;
}

/** Where each court's pieces stand (x, z on the ground; yaw so the piece front faces the court). Exported for tests. */
export const SET_PIECE_PLACEMENTS: Readonly<Record<string, readonly SetPiecePlacement[]>> = {
  rucker: [
    { name: "mural-wall", position: [0, 0, -24], yaw: 0 },
    // the covered bleachers flank the 10 m far stand (x -5..5) and stand behind the far light poles (+-11, -7)
    ...[-1, 1].map((s) => ({
      name: `covered-bleacher-${s < 0 ? "w" : "e"}`,
      position: [s * 10.5, 0, -16.5] as AuraVec3,
      yaw: facing(s * 10.5, -16.5)
    }))
  ],
  venice: [{ name: "lifeguard-tower", position: [-15, 0, -13], yaw: facing(-15, -13) }],
  manila: [-1, 1].map((s) => ({
    name: `corrugated-roof-${s < 0 ? "w" : "e"}`,
    position: [s * 24, 0, -10] as AuraVec3,
    yaw: facing(s * 24, -10)
  })),
  shanghai: [-1, 1].map((s) => ({
    name: `dock-container-${s < 0 ? "w" : "e"}`,
    position: [s * 15, 0, -12] as AuraVec3,
    yaw: facing(s * 15, -12)
  }))
};

export function courtSetPieceNodes(courtId: string): AuraNodeBuilder<AuraSceneNode>[] {
  const at = SET_PIECE_PLACEMENTS[courtId] ?? [];
  if (at.length === 0) return [];
  switch (courtId) {
    case "rucker":
      return [
        ...at.filter((p) => p.name === "mural-wall").map((p) => buildRuckerMuralWallNode(p.position, p.yaw)),
        ...buildCoveredBleacherCanopyNodes(at.filter((p) => p.name.startsWith("covered-bleacher")))
      ];
    case "venice":
      return at.map((p) => buildVeniceLifeguardTowerNode(p.position, p.yaw));
    case "manila":
      return buildManilaCorrugatedShedNodes(at);
    case "shanghai":
      return buildShanghaiContainerNodes(at);
    default:
      return [];
  }
}

/** Grounded scorer's table (under the championship trophy at `[9.2, 0.78, -3.4]`) + courtside team benches. */
export function courtsideTableNodes(): AuraNodeBuilder<AuraSceneNode>[] {
  return buildProceduralCourtsideTableNodes();
}

/** 360° perimeter enclosures per court: chain-link cages, layered park trees, coastal bluffs, parapets, rails & skylines. */
export function courtEnclosureNodes(courtId: CourtId): AuraNodeBuilder<AuraSceneNode>[] {
  return buildProceduralEnclosureNodes(courtId);
}
