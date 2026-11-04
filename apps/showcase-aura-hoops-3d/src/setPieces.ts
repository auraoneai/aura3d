/**
 * H47-A2 (GU47 wave 2): per-court Meshy set-pieces, new look only (`?look=original` keeps the 4.6 venue). Presentation
 * only: nothing collides, nothing casts a shadow, and every piece stands outside the play area and the camera
 * obstacle list. One model node per piece (instanced where a court shows a pair).
 *
 *   Rucker   - the graffiti brick mural wall behind the far baseline
 *   Venice   - the lifeguard tower on the sand beside the far corner
 *   Manila   - two corrugated lean-to roofs over the far corners
 *   Shanghai - two dock containers beside the far stand
 */
import { instances, model, type AuraAssetRef, type AuraNodeBuilder, type AuraSceneNode, type AuraVec3 } from "@aura3d/engine";

export interface SetPieceAssets {
  readonly mural: AuraAssetRef<"model">;
  readonly lifeguardTower: AuraAssetRef<"model">;
  readonly corrugatedRoof: AuraAssetRef<"model">;
  readonly container: AuraAssetRef<"model">;
}

/** The centre of the court the pieces face. */
const COURT_CENTRE: readonly [number, number] = [0, 4];
const facing = (x: number, z: number): number => Math.atan2(COURT_CENTRE[0] - x, COURT_CENTRE[1] - z);

export interface SetPiecePlacement {
  readonly name: string;
  readonly position: AuraVec3;
  readonly yaw: number;
}

/** Where each court's pieces stand (x, z on the ground; yaw so the model front faces the court). Exported for tests. */
export const SET_PIECE_PLACEMENTS: Readonly<Record<string, readonly SetPiecePlacement[]>> = {
  rucker: [{ name: "mural-wall", position: [0, 0, -24], yaw: 0 }],
  venice: [{ name: "lifeguard-tower", position: [-15, 0, -13], yaw: facing(-15, -13) }],
  manila: [-1, 1].map((s) => ({ name: `corrugated-roof-${s < 0 ? "w" : "e"}`, position: [s * 24, 0, -10] as AuraVec3, yaw: facing(s * 24, -10) })),
  shanghai: [-1, 1].map((s) => ({ name: `dock-container-${s < 0 ? "w" : "e"}`, position: [s * 15, 0, -12] as AuraVec3, yaw: facing(s * 15, -12) }))
};

export function courtSetPieceNodes(courtId: string, refs: SetPieceAssets): AuraNodeBuilder<AuraSceneNode>[] {
  const at = SET_PIECE_PLACEMENTS[courtId] ?? [];
  if (at.length === 0) return [];
  const common = { castShadow: false, receiveShadow: true, role: "setDressing" } as const;
  switch (courtId) {
    case "rucker":
      return at.map((p) => model(refs.mural, { name: p.name, targetMaxDimension: 11, scaleMode: "fit", ...common }).position(...p.position).rotate(0, p.yaw, 0) as unknown as AuraNodeBuilder<AuraSceneNode>);
    case "venice":
      return at.map((p) => model(refs.lifeguardTower, { name: p.name, targetHeight: 4.4, scaleMode: "fit", ...common }).position(...p.position).rotate(0, p.yaw, 0) as unknown as AuraNodeBuilder<AuraSceneNode>);
    case "manila":
      return [instances.model(refs.corrugatedRoof, { name: "corrugated-roofs", targetHeight: 6.5, scaleMode: "fit", ...common, transforms: at.map((p) => ({ position: p.position, rotation: [0, p.yaw, 0] as AuraVec3 })) }) as unknown as AuraNodeBuilder<AuraSceneNode>];
    case "shanghai":
      return [instances.model(refs.container, { name: "dock-containers", targetMaxDimension: 5, scaleMode: "fit", ...common, transforms: at.map((p) => ({ position: p.position, rotation: [0, p.yaw, 0] as AuraVec3 })) }) as unknown as AuraNodeBuilder<AuraSceneNode>];
    default:
      return [];
  }
}
