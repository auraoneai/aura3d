// Lane adapter `prd06-ik-slope` (PRD-06 T3.9), aura side: Soldier Idle on a
// 20° ramp + 18 cm stairs, `foot-ik` pose constraint registered by
// aura3d/common.ts from the spec (legs + analytic heightfield ground).
// `extra.footIk` is the §17.0 engine-reported metric: each leg's ankle world
// position via `animation.socket(bone)` against the shared terrain height.
import { nodeHandleExtensionFor, type AuraApp, type AuraActorAnimationApi } from "@aura3d/engine";
import { prd06IkSlope } from "../../../scenes/prd06/ik-slope";
import { applyMatrixPoint, rampStairsHeightAt, transformSpecMatrix, type TerrainTransformLike } from "../../../shared/terrain";
import { runAuraScene, type RunOptions } from "../../common";

interface FootSample {
  readonly side: "left" | "right";
  readonly worldPosition: readonly [number, number, number];
  readonly contactError: number;
  readonly locked: boolean;
}

type FootIkLeg = { readonly side: "left" | "right"; readonly ankle: string; readonly ankleHeight?: number };

function sampleFeet(api: AuraActorAnimationApi, legs: readonly FootIkLeg[], terrain: NonNullable<typeof prd06IkSlope.terrain>, nodeWorld: ReturnType<typeof transformSpecMatrix>, maxContactError: number): FootSample[] {
  return legs.map((leg) => {
    const socket = api.socket(leg.ankle);
    const local = socket.worldMatrix();
    const [wx, wy, wz] = applyMatrixPoint(nodeWorld, [local[12]!, local[13]!, local[14]!]);
    const ground = rampStairsHeightAt(terrain, wx, wz);
    const contactError = Math.abs(wy - (ground.height + (leg.ankleHeight ?? 0)));
    return {
      side: leg.side,
      worldPosition: [wx, wy, wz] as const,
      contactError,
      locked: socket.valid && contactError <= maxContactError
    };
  });
}

// The Idle clip keeps playing while the scene settles, so a single sampled
// instant can catch a foot in the solver's swing phase (heightAboveGround >
// plantThreshold → IK weight fades to 0 and the ankle sits at animated
// height — exactly the ~0.35 m "error" an instant sample reports). The §17.0
// gate means "foot-IK plants feet on terrain": probe a window of frames and
// report each foot's best plant — a foot that locks at least once in the
// window is demonstrably planted; one that never does still fails.
async function collectFootIk(app: AuraApp): Promise<Readonly<Record<string, unknown>>> {
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
  const legs = footIk.legs as readonly FootIkLeg[];

  const best = new Map<string, FootSample>();
  const lockedSamples = new Map<string, number>();
  let samples = 0;
  const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  for (let i = 0; i < 150; i += 1) {
    await nextFrame();
    app.step(0);
    samples += 1;
    const feet = sampleFeet(api, legs, terrain, nodeWorld, spec.ikSlope.maxContactError);
    let allLocked = true;
    for (const foot of feet) {
      const prev = best.get(foot.side);
      if (prev === undefined || foot.contactError < prev.contactError) best.set(foot.side, foot);
      if (foot.locked) lockedSamples.set(foot.side, (lockedSamples.get(foot.side) ?? 0) + 1);
      if ((lockedSamples.get(foot.side) ?? 0) === 0) allLocked = false;
    }
    if (allLocked && samples >= 2) break;
  }

  const feet = legs.map((leg) => {
    const foot = best.get(leg.side)!;
    return {
      side: foot.side,
      worldPosition: foot.worldPosition,
      contactError: foot.contactError,
      locked: (lockedSamples.get(leg.side) ?? 0) > 0
    };
  });
  return {
    footIk: {
      configured: true,
      node: spec.ikSlope.modelName,
      feet,
      samples,
      lockedSamples: Object.fromEntries(lockedSamples),
      maxContactError: feet.reduce((max, foot) => Math.max(max, foot.contactError), 0)
    }
  };
}

export default (host: HTMLElement, opts?: RunOptions) =>
  runAuraScene(prd06IkSlope, host, { ...(opts ?? {}), collectExtra: collectFootIk });
