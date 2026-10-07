/**
 * PRD-02 §6.4 / item 1923: lane-fixture `collect` contributor that stamps
 * `receiveShadow` on selected `RenderItem`s so the flag-path
 * `u_shadowMapEnabled = 0` binding (`forward/Lighting.ts`,
 * `receiveShadowDisabled`) can be exercised before Q-15-5
 * (`compiler/primitives.ts` → `node.receiveShadow`) and Q-04-2
 * (`TypedGLBActor` items) land.
 *
 * Fixture-only helper — the lane scene registers it explicitly; production
 * items get `receiveShadow` from the compiler/actor seams above.
 */
import type { FrameContributor, FrameContributorContext } from "../contracts/frameGraph";
import type { RenderItem } from "../contracts/renderItem";

export interface Prd02ReceiveShadowOverrideOptions {
  /** Items matching get `receiveShadow` set to `value` (default false). */
  readonly predicate: (item: RenderItem, index: number) => boolean;
  readonly value?: boolean;
}

export function createPrd02ReceiveShadowContributor(
  options: Prd02ReceiveShadowOverrideOptions
): FrameContributor {
  const value = options.value ?? false;
  return {
    id: "prd02.receiveShadowFixture",
    owner: "prd02",
    flag: "A3D_QR_LIGHTING",
    phases: ["collect"],
    collect(items: RenderItem[], _ctx: FrameContributorContext): RenderItem[] {
      let changed = false;
      const next = items.map((item, index) => {
        if (!options.predicate(item, index) || item.receiveShadow === value) return item;
        changed = true;
        return { ...item, receiveShadow: value };
      });
      return changed ? next : items;
    }
  };
}
