// Lane adapter `prd06-ik-slope` (PRD-06 T3.9), aura side: Soldier Idle on a
// 20° ramp + 18 cm stairs, `foot-ik` pose constraint registered by
// aura3d/common.ts from the spec (legs + analytic heightfield ground).
// `extra.footIk` is the §17.0 engine-reported metric: each leg's ankle world
// position via `animation.socket(bone)` against the shared terrain height.
import { nodeHandleExtensionFor, type AuraApp, type AuraActorAnimationApi } from "@aura3d/engine";
import { prd06IkSlope } from "../../../scenes/prd06/ik-slope";
import { applyMatrixPoint, rampStairsHeightAt, transformSpecMatrix, type TerrainTransformLike } from "../../../shared/terrain";
import { runAuraScene, type RunOptions } from "../../common";

function collectFootIk(app: AuraApp): Readonly<Record<string, unknown>> {
  const spec = prd06IkSlope;
  const terrain = spec.terrain!;
  const object = spec.objects.find(
    (entry) => entry.kind === "model" && entry.name === spec.ikSlope.modelName
  );
  const footIk = object?.kind === "model" ? object.animation?.footIk : undefined;
  const handle = footIk ? app.nodes.get(footIk.runtimeId) : undefined;
  const api = handle
    ? (nodeHandleExtensionFor("animation")?.create(handle, app) as AuraActorAnimationApi | undefined)
    : undefined;
  if (!object || !footIk || !api?.socket) {
    return { footIk: { configured: false, maxContactError: null } };
  }
  // `socket.worldMatrix()` is actor-space (inside pipeline.resources.scene);
  // the model node's mount transform maps it to app world for the metric.
  const nodeWorld = transformSpecMatrix(object as TerrainTransformLike);
  const feet = footIk.legs.map((leg) => {
    const socket = api.socket(leg.ankle);
    const local = socket.worldMatrix();
    const [wx, wy, wz] = applyMatrixPoint(nodeWorld, [local[12]!, local[13]!, local[14]!]);
    const ground = rampStairsHeightAt(terrain, wx, wz);
    const contactError = Math.abs(wy - (ground.height + (leg.ankleHeight ?? 0)));
    return {
      side: leg.side,
      worldPosition: [wx, wy, wz] as const,
      contactError,
      locked: socket.valid && contactError <= spec.ikSlope.maxContactError
    };
  });
  return {
    footIk: {
      configured: true,
      node: spec.ikSlope.modelName,
      feet,
      maxContactError: feet.reduce((max, foot) => Math.max(max, foot.contactError), 0)
    }
  };
}

export default (host: HTMLElement, opts?: RunOptions) =>
  runAuraScene(prd06IkSlope, host, { ...(opts ?? {}), collectExtra: collectFootIk });
