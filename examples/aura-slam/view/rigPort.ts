import type { AuraApp, scene } from "@aura3d/engine";
import type { PoseResult } from "../contract/modules";
import type { ActorState } from "../contract/sim";

/** A node as accepted by `scene().add/addMany` (a builder or a built node). */
export type NodeInput = Parameters<ReturnType<typeof scene>["addMany"]>[0][number];

/** Seam between the scene renderer and the athlete rig module (M-POSE). */
export interface AthleteRigPort<Handles = unknown> {
  /** Scene nodes for one athlete; names are prefixed (`player-*`, `rival-*`). */
  build(prefix: "player" | "rival", isPlayer: boolean): NodeInput[];
  /** Resolve the runtime handles once the app is ready. */
  resolve(app: AuraApp, prefix: "player" | "rival"): Handles;
  /** Pose the rig for this frame (never touches gameplay state). */
  update(handles: Handles, actor: Readonly<ActorState>, pose: PoseResult, ctx: { isPlayer: boolean; isMoon: boolean }): void;
}
