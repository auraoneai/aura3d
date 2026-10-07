/**
 * `camera/OccluderFade.ts` — C-11 occluder screen-door fade manager.
 *
 * Per frame, whoever owns the probe (the camera extension, or a rig) calls
 * `setOccluders()` with the node ids `probe.occluders(eye, subject)` reported —
 * minus the subject itself and anything tagged `cameraOpaque`. Each tracked
 * node eases toward `fadeTarget` (0.3) while occluding and back toward 1
 * otherwise; nodes back at ~1 are forgotten, so fully restored geometry pays
 * nothing.
 *
 * The `prd08.occluderFade` C-01 `collect` contributor then stamps
 * `RenderItem.cameraFade` on draws whose `item.label` names a fading node and
 * advances `u_cameraFadeOffset` per S-2: cycles (0,0)(2,2)(2,0)(0,2) by
 * `FrameContributorContext.frameIndex` only when a registered C-13 pass has
 * "taa" in its id — a static Bayer pattern does not resolve under TAA, so
 * without TAA the offset holds (0,0) and the stipple is accepted.
 *
 * With `A3D_QR_CAMERA` off the contributor returns the input array untouched
 * (C-11 acceptance).
 */
import type { FrameContributor, FrameContributorContext, RenderItem } from "@aura3d/rendering/contracts";
import { springDamp } from "./Spring.js";

export interface AuraOccluderFadeOptions {
  /** Fade floor for occluders (§8.2). Default 0.3. */
  readonly fadeTarget?: number;
  /** Spring half-life (s) toward either target. Default 0.08. */
  readonly halflife?: number;
}

export interface AuraOccluderFade {
  /** Replace the per-frame occluder-id set (already subject/cameraOpaque filtered). */
  setOccluders(ids: readonly string[]): void;
  /** Advance fade springs; call once per presented frame. */
  update(dt: number): void;
  /** Current fade for a node id: 1 (opaque) when untracked. */
  fadeFor(id: string): number;
  /** Render item label → node id, default `item.label`. */
  readonly itemToNodeId?: (item: RenderItem) => string | undefined;
}

export function createOccluderFade(options: AuraOccluderFadeOptions = {}): AuraOccluderFade {
  const fadeTarget = options.fadeTarget ?? 0.3;
  const halflife = Math.max(1e-4, options.halflife ?? 0.08);
  const fades = new Map<string, number>();
  let occluders = new Set<string>();

  return {
    setOccluders(ids) {
      occluders = new Set(ids);
      for (const id of ids) {
        if (!fades.has(id)) fades.set(id, 1);
      }
    },
    update(dt) {
      for (const [id, v] of fades) {
        const target = occluders.has(id) ? fadeTarget : 1;
        const next = springDamp(v, target, halflife, dt);
        if (next > 0.999 && !occluders.has(id)) fades.delete(id);
        else fades.set(id, Math.min(1, Math.max(fadeTarget, next)));
      }
    },
    fadeFor(id) {
      return fades.get(id) ?? 1;
    }
  };
}

/**
 * The C-01 collect contributor. `itemToNodeId` maps a draw to a scene node id
 * (default `item.label`); the camera extension supplies one when runtime node
 * ids differ from draw labels.
 */
export function createOccluderFadeContributor(
  fade: AuraOccluderFade,
  deps: { readonly itemToNodeId?: (item: RenderItem) => string | undefined } = {}
): FrameContributor {
  const itemToNodeId = deps.itemToNodeId ?? ((item) => item.label);
  return {
    id: "prd08.occluderFade",
    owner: "prd08",
    flag: "A3D_QR_CAMERA",
    phases: ["collect"],
    collect(items: RenderItem[], ctx: FrameContributorContext): RenderItem[] {
      if (!ctx.flags.on("A3D_QR_CAMERA")) return items;
      let out: RenderItem[] | null = null;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const id = itemToNodeId(item);
        const f = id === undefined ? 1 : fade.fadeFor(id);
        if (f < 0.999) {
          if (out === null) out = items.slice(0, i);
          out.push({ ...item, cameraFade: f });
        } else if (out !== null) {
          out.push(item);
        }
      }
      return out ?? items;
    }
  };
}
