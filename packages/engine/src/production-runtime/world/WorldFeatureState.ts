/**
 * PRD-10 #1143 follow-up — feeds the generated-path (Path G) world shader
 * features. `prd10.wind` and `prd10.caustics` (rendering/world) compile on the
 * generated path since #1170, but only reach a draw when (a) the item opts in
 * through its label prefix and (b) the per-frame state was published through
 * `setPrd10WindState` / `setPrd10CausticsState`. The prd10 frame contributor
 * calls `publishWorldFeatureState` and `optInWorldFeatures` in `collect`.
 */
import type { RenderItem } from "@aura3d/rendering";
import type { FrameContributorContext } from "@aura3d/rendering/contracts";
import { setPrd10CausticsState, setPrd10WindState } from "@aura3d/rendering/world";
import { windRecords } from "../../agent-api/compiler/world.js";
import { normalizeWind } from "../../agent-api/world/wind.js";
import { allWaterStates } from "./WaterRuntime.js";

/** Label prefixes of world-owned draws that bend with the wind (foliage, grass, scatter). */
const WIND_LABEL_PREFIXES = ["prd10.scatter", "prd10.grass", "prd10.foliage", "prd10.impostor"] as const;
/** Label prefixes of world-owned draws that receive caustics under water (terrain beds). */
const CAUSTICS_LABEL_PREFIXES = ["prd10.terrain"] as const;

const WIND_PREFIX = "prd10.wind:";
const CAUSTICS_PREFIX = "prd10.caustics:";

const CAUSTIC_STRENGTH = 0.6;

interface WorldFeatureFrame {
  readonly wind: boolean;
  readonly caustics: boolean;
}

/**
 * Publish this frame's wind (the first `world.wind` node, else the §7.1.3
 * defaults) and caustics (the first water body with caustics enabled, else
 * strength 0) for generated-path draws. Returns which features have state.
 */
export function publishWorldFeatureState(ctx: Pick<FrameContributorContext, "timeSeconds">): WorldFeatureFrame {
  const windNode = windRecords.values().next().value;
  setPrd10WindState(windNode?.wind ?? normalizeWind(), ctx.timeSeconds);
  const water = allWaterStates().find((st) => st.record.options.caustics !== false);
  if (water) {
    setPrd10CausticsState({
      strength: CAUSTIC_STRENGTH,
      waterHeight: water.record.height,
      atlas: water.causticTex ?? null
    });
  } else {
    setPrd10CausticsState({ strength: 0 });
  }
  return { wind: true, caustics: water !== undefined };
}

function withPrefix(item: RenderItem, prefix: string): RenderItem {
  const label = item.label ?? "";
  return label.startsWith(prefix) ? item : { ...item, label: `${prefix}${label}` };
}

/**
 * Opt world-owned items into the generated-path features via the label
 * contract (`prd10.wind:<label>`, `prd10.caustics:<label>`). Items that are
 * not world draws are returned unchanged, so non-world scenes are untouched.
 */
export function optInWorldFeatures(items: RenderItem[], frame: WorldFeatureFrame): RenderItem[] {
  let changed = false;
  const out = items.map((item) => {
    const label = item.label ?? "";
    let next = item;
    if (frame.wind && WIND_LABEL_PREFIXES.some((p) => label.startsWith(p))) next = withPrefix(next, WIND_PREFIX);
    if (frame.caustics && CAUSTICS_LABEL_PREFIXES.some((p) => label.startsWith(p))) next = withPrefix(next, CAUSTICS_PREFIX);
    if (next !== item) changed = true;
    return next;
  });
  return changed ? out : items;
}
