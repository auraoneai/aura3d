/**
 * Idol wow pass (render layer only): the district's town houses, watchtowers, teahouses, market stalls, town gates,
 * stone lanterns, pines and maples, the evening set-pieces (castle pagoda, shrine gate, water wheel) and the katana /
 * kanabo weapons are high-detail Idol GLBs: hand-built painted wood, clay-tile and stone miniatures in the woodblock
 * palette. Placement stays in `scenery.ts` / `setpieces.ts`; each Idol model is fitted to the footprint the procedural
 * prop was normalised to (`MESHY_MANIFEST` size, base 5% under the placement like `normalizePropParts`), with the
 * per-axis stretch held within +-28% of uniform so the carved detail keeps its proportions. `?idol=0` restores the
 * procedural batches.
 */
import { group, instances, model, type AuraAssetRef, type AuraNodeBuilder, type AuraSceneNode, type AuraTransformSpec } from "@aura3d/engine";
import { IDOL_ASSETS } from "../../../apps/showcase-ninja-runner-port/src/idol-assets";
import { MESHY_MANIFEST, type PropId } from "../assets/meshy/manifest";
import type { ModelPlacement, ModelSink } from "../scenery";
import { IDOL_ACTORS } from "./idolActors";
import { qFromTo, qRot, qToEngineEuler, type V3 } from "./idolRig";

/** Same switch as the actors: `?idol=0` keeps every procedural prop. */
export const IDOL_SCENERY = IDOL_ACTORS;

export const IDOL_PROP_KEYS = {
  houseA: "nrHouseA",
  houseB: "nrHouseB",
  houseC: "nrHouseC",
  houseD: "nrHouseD",
  teahouse: "nrTeahouse",
  tower: "nrTower",
  lantern: "nrLantern",
  marketStall: "nrMarketStall",
  pine: "nrPine",
  oak: "nrMaple"
} as const satisfies Partial<Record<PropId, string>>;
type IdolPropId = keyof typeof IDOL_PROP_KEYS;
const SHADOW_IDS: ReadonlySet<IdolPropId> = new Set(["houseA", "houseB", "houseC", "houseD", "teahouse", "tower", "pine", "oak"]);

type ModelRef = AuraAssetRef<"model">;
/** Admitted Idol model by key, or undefined (that piece then stays procedural). */
export const idolAsset = (key: string): ModelRef | undefined => IDOL_ASSETS[key];
const boundsOf = (key: string): readonly [number, number, number] => {
  const b = (idolAsset(key) as { bounds?: readonly number[] } | undefined)?.bounds;
  return b && b.length >= 3 ? [b[0]!, b[1]!, b[2]!] : [1, 1, 1];
};

export const IDOL_PROP_SINK = 0.06;
/** Idol props that are buildings (their proportions are held tight; see `idolPropTransform`). */
export const BUILDING_IDS: ReadonlySet<IdolPropId> = new Set(["houseA", "houseB", "houseC", "houseD", "teahouse", "tower", "marketStall"]);
/** Instance transform fitting the Idol model to the procedural prop's normalised footprint. */
export function idolPropTransform(id: IdolPropId, p: ModelPlacement): AuraTransformSpec {
  const m = MESHY_MANIFEST[id].size;
  const b = boundsOf(IDOL_PROP_KEYS[id]);
  let sx = (p.scale[0] * m[0]) / b[0], sy = (p.scale[1] * m[1]) / b[1], sz = (p.scale[2] * m[2]) / b[2];
  // Buildings keep their carved proportions within +-10% (at +-28% the rooftop district's houses were drawn up to 1.64x
  // wider than tall against their model: warped, "melted" roofs); trees and props keep the looser fit.
  const k = BUILDING_IDS.has(id) ? 0.1 : 0.28;
  const g = Math.cbrt(sx * sy * sz), lo = g * (1 - k), hi = g * (1 + k);
  sx = Math.min(hi, Math.max(lo, sx)); sy = Math.min(hi, Math.max(lo, sy)); sz = Math.min(hi, Math.max(lo, sz));
  return {
    // Idol GLBs are grounded at their lowest vertex (no Meshy-style 5% padding under the base): a fixed 0.06 m sink
    // under the placement height (scenery.ts already sinks 0.15-0.2 m below the lowest ground under the footprint), which scenery.ts already takes at the lowest ground under the footprint.
    position: [p.position[0], p.position[1] - IDOL_PROP_SINK, p.position[2]],
    rotation: [0, p.yaw, 0],
    scale: [sx, sy, sz]
  };
}

/**
 * Splits the scenery sink: Idol instanced models for the prop ids above (plus the maples among the course accents),
 * and the remaining sink for `buildProceduralDistrictBatches` (fences, bushes, rocks, cliffs, ridges).
 */
export function buildIdolDistrictProps(
  sink: ModelSink,
  extraMaples: readonly ModelPlacement[],
  options: { readonly castShadow: boolean }
): { readonly nodes: AuraNodeBuilder<AuraSceneNode>[]; readonly rest: ModelSink; readonly maplesHandled: boolean } {
  const nodes: AuraNodeBuilder<AuraSceneNode>[] = [];
  const rest: ModelSink = {};
  for (const [id, list] of Object.entries(sink)) {
    const pid = id as IdolPropId;
    const ref = id in IDOL_PROP_KEYS ? idolAsset(IDOL_PROP_KEYS[pid]) : undefined;
    if (!ref) { rest[id] = list; continue; }
    const all = pid === "oak" ? [...(list ?? []), ...extraMaples] : (list ?? []);
    if (all.length === 0) continue;
    const hasTint = all.some((p) => p.tint !== undefined);
    nodes.push(instances.model(ref, {
      name: `idol-${pid}`,
      scaleMode: "world",
      transforms: all.map((p) => idolPropTransform(pid, p)),
      ...(hasTint ? { colors: all.map((p) => p.tint ?? "#ffffff") } : {}),
      castShadow: options.castShadow && SHADOW_IDS.has(pid),
      receiveShadow: true
    }) as unknown as AuraNodeBuilder<AuraSceneNode>);
  }
  const maple = idolAsset("nrMaple");
  if (!sink.oak && maple && extraMaples.length > 0) {
    nodes.push(instances.model(maple, {
      name: "idol-oak",
      scaleMode: "world",
      transforms: extraMaples.map((p) => idolPropTransform("oak", p)),
      castShadow: false,
      receiveShadow: true
    }) as unknown as AuraNodeBuilder<AuraSceneNode>);
  }
  return { nodes, rest, maplesHandled: Boolean(maple) };
}

type SetPieceKey = "nrShrineGate" | "nrPagoda" | "nrWaterWheel";
const SET_PIECE_FIT: Readonly<Record<SetPieceKey, { readonly axis: 0 | 1 | 2; readonly size: number }>> = {
  // Procedural set-piece bounds (setpieces.ts SET_PIECE_BOUNDS): gate 11.4 m wide, pagoda 36 m tall, wheel 8 m across.
  nrShrineGate: { axis: 0, size: 11.4 },
  nrPagoda: { axis: 1, size: 36 },
  nrWaterWheel: { axis: 1, size: 8 }
};
const fitScale = (key: SetPieceKey): number => SET_PIECE_FIT[key].size / boundsOf(key)[SET_PIECE_FIT[key].axis];

/** Shrine gate / pagoda: base on the placement (both procedural pieces stand on y = 0 at `lift` 0). */
export function buildIdolSetPieceNode(key: "nrShrineGate" | "nrPagoda", p: ModelPlacement): AuraNodeBuilder<AuraSceneNode> | null {
  const ref = idolAsset(key);
  if (!ref) return null;
  const k = fitScale(key) * p.scale[1];
  return model(ref, {
    name: `idol-${key}`,
    scaleMode: "world",
    castShadow: false,
    receiveShadow: true,
    position: [p.position[0], p.position[1], p.position[2]],
    rotation: [0, p.yaw, 0],
    scale: [k, k, k]
  }) as unknown as AuraNodeBuilder<AuraSceneNode>;
}

/**
 * The water wheel rotor: the Idol wheel (disc facing +Z after normalisation, base on y = 0) turned so its axle runs
 * along local X and centred on the rotor origin, inside the `setpiece-waterWheel` node the world spins about X.
 */
export function buildIdolWaterWheelRotor(): AuraNodeBuilder<AuraSceneNode> | null {
  const ref = idolAsset("nrWaterWheel");
  if (!ref) return null;
  const b = boundsOf("nrWaterWheel");
  const k = fitScale("nrWaterWheel");
  return group("setpiece-waterWheel", [
    model(ref, {
      name: "idol-nrWaterWheel",
      scaleMode: "world",
      castShadow: false,
      receiveShadow: true,
      position: [0, -(b[1] * k) / 2, 0],
      // the axle must run along local X: a wheel reconstructed facing +Z (thin along Z) is turned a quarter
      rotation: [0, b[2] < b[0] ? Math.PI / 2 : 0, 0],
      scale: [k, k, k]
    })
  ]).runtime({ id: "setpiece-waterWheel" }) as unknown as AuraNodeBuilder<AuraSceneNode>;
}

/**
 * Katana / kanabo: the Idol weapon re-aimed so it runs grip (-Z) to tip (+Z), centred in a unit length, matching the
 * procedural weapon frame the world aims and stretches (`aim()`: `setScale([1, 1, length])`, Z in [-0.5, +0.5]).
 * Centre, grip-to-tip axis and length were measured on each normalised GLB (principal axis of the vertices; the thin
 * end is the grip) — re-measure after a re-roll.
 */
export const IDOL_WEAPON_FRAME: Readonly<Record<"nrKatana" | "nrKanabo", { readonly centre: V3; readonly axis: V3; readonly length: number }>> = {
  nrKatana: { centre: [0.0019, 0.5225, 0.0043], axis: [-0.9998, 0.016, 0.0121], length: 8.0396 },
  nrKanabo: { centre: [0.0386, 0.155, 0.1073], axis: [0.6716, 0.019, 0.7407], length: 1.2901 }
};
export function buildIdolWeaponNode(key: "nrKatana" | "nrKanabo", id: string): AuraNodeBuilder<AuraSceneNode> | null {
  const ref = idolAsset(key);
  if (!ref) return null;
  const f = IDOL_WEAPON_FRAME[key];
  const k = 1 / f.length;
  const q = qFromTo(f.axis, [0, 0, 1]);
  const c = qRot(q, f.centre);
  return group(id, [
    model(ref, {
      name: `${id}-idol`,
      scaleMode: "world",
      castShadow: false,
      receiveShadow: false,
      position: [-c[0] * k, -c[1] * k, -c[2] * k],
      rotation: qToEngineEuler(q),
      scale: [k, k, k]
    })
  ], { position: [0, -500, 0] }).runtime({ id }) as unknown as AuraNodeBuilder<AuraSceneNode>;
}

/**
 * Lane barricade (QA: the procedural barrier read as a red stall box): the Idol roadblock crate (nrBarricade, 2.1 m wide,
 * generated front-on-+Z, base on y = 0) inside `barrier-<i>`, which world.ts lifts 0.75 m and turns to the path heading;
 * the model drops back to the ground and turns its front to the oncoming runner. `barrier-band-<i>` / `barrier-top-<i>`
 * stay as empty groups so the world's per-frame placement is untouched. Null (procedural barrier) until it is admitted.
 */
export const IDOL_BARRIER_LIFT = 0.75;
/**
 * The crate came out 2.1 x 0.91 x 1.56 m. It is drawn 1.45 m wide and 0.82 m tall so it matches the sim's hit box
 * (`hazards.ts`: hit within 0.88 m of the lane centre, cleared above 0.85 m): wider, the runner ran through the end of a
 * crate in the next lane; taller, a cleared jump passed through its top (stretch held under 1.33x).
 */
export const IDOL_BARRIER_SCALE = [0.69, 0.9, 0.72] as const;
export function buildIdolBarrierNodes(index: number): AuraNodeBuilder<AuraSceneNode>[] | null {
  const ref = idolAsset("nrBarricade");
  if (!ref) return null;
  const hidden = { position: [0, -500, 0] as [number, number, number] };
  return [
    group(`barrier-${index}`, [
      model(ref, { name: `barrier-${index}-idol`, scaleMode: "world", castShadow: true, receiveShadow: true, position: [0, -IDOL_BARRIER_LIFT, 0], rotation: [0, Math.PI, 0], scale: [...IDOL_BARRIER_SCALE] })
    ], hidden).runtime({ id: `barrier-${index}` }),
    group(`barrier-band-${index}`, [], hidden).runtime({ id: `barrier-band-${index}` }),
    group(`barrier-top-${index}`, [], hidden).runtime({ id: `barrier-top-${index}` })
  ] as unknown as AuraNodeBuilder<AuraSceneNode>[];
}
