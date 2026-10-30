/**
 * IRON CROWN flares and K.O. scorch (GU47 WP-15 IC47-V3).
 *
 * - Flares: a lens flare on the Crown's follow-spot rig and on the low suns of the Dock (8 deg) and the Airstrip
 *   (10 deg), the venues where the key light can sit in frame. `occlusion: "frustum"` hides a flare whose light is
 *   behind the camera and fades it toward the screen edge, so an off-frame light adds nothing. Additive sprites, no
 *   draws beyond one sprite batch per flare. Low tier drops them.
 * - Scorch: one decal per scene (`KO_SCORCH_ID`), parked below the floor until a K.O., then moved under the loser and
 *   left there until the next scene (a new bout rebuilds it). Texture `assets.ironcrownKoScorch` from
 *   scripts/make-scorch.mjs. Static, so reduced motion and reduced flash keep it.
 *
 * Pure node builders: tests read them without an app.
 */
import { decals, lights, type AuraSceneNode, type AuraVec3 } from "@aura3d/engine";
import { assets } from "../aura-assets";
import { followSpotPose, type StageLookRow } from "./look";

export const KO_SCORCH_ID = "ic-ko-scorch";
/** Where the scorch waits until a K.O. (under the floor, never in frame). */
export const SCORCH_PARKED: AuraVec3 = [0, -40, 0];
export const SCORCH = { size: 1.7, opacity: 0.82, lift: 0.006 } as const;

/** Elevation (deg) at or below which a venue's sun gets a flare. */
export const FLARE_MAX_SUN_ELEVATION = 12;
const SUN_FLARE_DISTANCE = 60;

/** Same convention as the look's sun (E-A `sunPosition`): azimuth from +Z toward +X. */
export function sunFlarePosition(elevationDeg: number, azimuthDeg: number, distance = SUN_FLARE_DISTANCE): AuraVec3 {
  const el = (elevationDeg * Math.PI) / 180;
  const az = (azimuthDeg * Math.PI) / 180;
  return [distance * Math.cos(el) * Math.sin(az), distance * Math.sin(el), distance * Math.cos(el) * Math.cos(az)];
}

export function stageFlareNodes(row: StageLookRow, lowTier = false): AuraSceneNode[] {
  if (lowTier) return [];
  const key = row.key;
  if (key.kind === "follow-spot") {
    return [
      lights
        .lensFlare({
          name: "crown follow-spot flare",
          light: "crown follow-spot",
          position: followSpotPose(key, 0).position,
          intensity: 0.55,
          edgeFade: 0.2,
          elements: [
            { size: 360, distance: 0, color: key.color },
            { size: 60, distance: 0.45, color: "#d9a441" },
            { size: 90, distance: 0.7, color: "#9e1b22" },
            { size: 40, distance: 1, color: "#d9a441" }
          ]
        })
        .toJSON()
    ];
  }
  if (key.elevationDeg > FLARE_MAX_SUN_ELEVATION) return [];
  return [
    lights
      .lensFlare({
        name: `${row.stage} sun flare`,
        position: sunFlarePosition(key.elevationDeg, key.azimuthDeg),
        intensity: 0.45,
        edgeFade: 0.25,
        elements: [
          { size: 420, distance: 0, color: key.color },
          { size: 70, distance: 0.5, color: row.accent },
          { size: 110, distance: 0.8, color: key.color }
        ]
      })
      .toJSON()
  ];
}

export function koScorchNode(): AuraSceneNode {
  return decals
    .project({
      name: "ko scorch",
      texture: assets.ironcrownKoScorch,
      color: "#ffffff",
      size: SCORCH.size,
      opacity: SCORCH.opacity,
      position: SCORCH_PARKED,
      normal: [0, 1, 0],
      roughness: 0.95
    })
    .runtime({ id: KO_SCORCH_ID })
    .toJSON();
}

/** The scorch's position under a knocked-out fighter (feet on the floor plane). */
export function scorchAt(loser: readonly number[]): AuraVec3 {
  return [loser[0] ?? 0, SCORCH.lift, loser[2] ?? 0];
}
