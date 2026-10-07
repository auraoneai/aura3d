// PRD-07 — render-source bridge: publishes the per-app effect feed and
// atmosphere state on the canvas's production-runtime source, so the
// prd07.* frame contributors see them through ctx.source.
// (Workaround for CCR-07-1: FrameContributorContext has no canvas/app pointer.)

import { attachRootRenderSource } from "../RootRuntimeSupport";
import type { ProductionEffectSystem } from "../../production-runtime/effects/ProductionEffectSystem";

export interface VfxBridge {
  readonly detach: () => void;
  readonly attached: boolean;
}

/**
 * Attach the bridge. When a bridge already exists on the canvas (e.g. a second
 * app on the same element, which attachRootRenderSource itself rejects), the
 * call reports VFX_APP_BINDING_AMBIGUOUS and stays detached — the effects API
 * still functions for API-level calls but nothing reaches the renderer.
 */
export function attachVfxBridge(canvas: HTMLCanvasElement, system: ProductionEffectSystem): VfxBridge {
  const source = {
    get vfx() {
      return {
        feed: (hook: Parameters<ProductionEffectSystem["feed"]>[0]) => system.feed(hook),
        afterDraw: (diag: Parameters<ProductionEffectSystem["afterDraw"]>[0]) => system.afterDraw(diag)
      };
    },
    get atmosphere() {
      return { sky: system.atmosphere.state().sky as Record<string, unknown> | null };
    }
  };
  try {
    const detach = attachRootRenderSource(canvas, { source: source as never });
    return { detach, attached: true };
  } catch {
    system.diagnostics.note(
      "VFX_APP_BINDING_AMBIGUOUS",
      "",
      "canvas already has a production-runtime source bridge; prd07 effects cannot bind to this app's renderer"
    );
    return { detach: () => {}, attached: false };
  }
}
