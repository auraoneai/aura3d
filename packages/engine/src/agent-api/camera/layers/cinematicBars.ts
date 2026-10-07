/**
 * `camera/layers/cinematicBars.ts` — Y-6 letterbox layer.
 *
 * A `controller.addLayer(createCinematicBarsLayer(...))` layer that eases
 * letterbox bars in/out toward a target aspect (2.39:1 default). The pose is
 * unchanged — the bars are presentation chrome, not a crop: standalone, the
 * layer draws two DOM bars over the canvas; for a C-13 composite the
 * `prd08.letterbox` contributor publishes the eased rect
 * (`{top, bottom, aspect}` — bar fraction of frame height each side) on the
 * blackboard every collected frame.
 *
 * Bar height for canvas aspect `a` and target `t` (t > a):
 * `(1 - a/t) / 2` of canvas height per side — 16:9 → (1−1.778/2.39)/2 ≈ 0.128.
 */
import type { AuraCameraLayer } from "../../../contracts/camera.js";
import type { FrameContributor, RenderItem } from "@aura3d/rendering/contracts";
import { ease } from "../ease.js";

export interface AuraCinematicBarsOptions {
  /** Target aspect (w/h). Default 2.39 (anamorphic letterbox). */
  readonly targetAspect?: number;
  /** Seconds to ease fully in/out. Default 0.8. */
  readonly easeSeconds?: number;
  /** Canvas/backing aspect to bar against (w/h). Default 16/9. */
  readonly canvasAspect?: number;
  /** DOM container for standalone bars; omitted = no DOM overlay. */
  readonly container?: {
    appendChild(el: unknown): void;
    removeChild(el: unknown): void;
  };
}

export interface AuraCinematicBarsLayer extends AuraCameraLayer {
  /** Eased bar height as a fraction of frame height, 0..0.5. */
  readonly barFraction: number;
  /** Published blackboard rect for this layer right now. */
  rect(): { readonly top: number; readonly bottom: number; readonly aspect: number };
  /** Fully close the bars (eases back to 0). */
  release(): void;
}

export const LETTERBOX_BLACKBOARD_KEY = "prd08.letterbox";

const activeBars = new Set<AuraCinematicBarsLayer>();

function barTarget(canvasAspect: number, targetAspect: number): number {
  if (!(canvasAspect > 0) || !(targetAspect > canvasAspect)) return 0;
  return (1 - canvasAspect / targetAspect) / 2;
}

function createBarDiv(doc: Document): HTMLDivElement {
  const el = doc.createElement("div");
  el.style.position = "fixed";
  el.style.left = "0";
  el.style.width = "100%";
  el.style.height = "0";
  el.style.background = "black";
  el.style.pointerEvents = "none";
  el.style.zIndex = "2147483000";
  return el;
}

export function createCinematicBarsLayer(options: AuraCinematicBarsOptions = {}): AuraCinematicBarsLayer {
  const targetAspect = options.targetAspect ?? 2.39;
  const easeSeconds = Math.max(1e-3, options.easeSeconds ?? 0.8);
  const canvasAspect = options.canvasAspect ?? 16 / 9;
  let progress = 0;             // 0 = open, 1 = fully letterboxed
  let direction: 1 | -1 = 1;
  const doc = typeof document !== "undefined" ? document : undefined;
  let topEl: HTMLDivElement | null = null;
  let bottomEl: HTMLDivElement | null = null;
  if (options.container && doc) {
    topEl = createBarDiv(doc);
    topEl.style.top = "0";
    bottomEl = createBarDiv(doc);
    bottomEl.style.bottom = "0";
    options.container.appendChild(topEl);
    options.container.appendChild(bottomEl);
  }

  const layer: AuraCinematicBarsLayer = {
    id: "cinematicBars",
    timeDomain: "real",
    barFraction: 0,
    apply(pose, ctx) {
      progress = Math.min(1, Math.max(0, progress + direction * (ctx.dt / easeSeconds)));
      const eased = ease.inOutSine(progress);
      const frac = barTarget(canvasAspect, targetAspect) * eased;
      (layer as { barFraction: number }).barFraction = frac;
      if (topEl && bottomEl) {
        topEl.style.height = `${frac * 100}%`;
        bottomEl.style.height = `${frac * 100}%`;
      }
      if (frac <= 0 && direction < 0) activeBars.delete(layer);
      else activeBars.add(layer);
      return pose;
    },
    energy() {
      return (layer as { barFraction: number }).barFraction > 0 ? 1 : 0;
    },
    rect() {
      const f = (layer as { barFraction: number }).barFraction;
      return { top: f, bottom: f, aspect: targetAspect };
    },
    release() {
      direction = -1;
    }
  };
  activeBars.add(layer);
  return layer;
}

/**
 * Publishes the strongest active bars layer's rect on `prd08.letterbox` for
 * any C-13 composite that wants it (none registered yet — key is absent when
 * no bars layer is active or the flag is off).
 */
export function createLetterboxContributor(): FrameContributor {
  return {
    id: "prd08.letterbox",
    owner: "prd08",
    flag: "A3D_QR_CAMERA",
    phases: ["collect"],
    collect(items: RenderItem[], ctx) {
      if (!ctx.flags.on("A3D_QR_CAMERA")) return items;
      let best: AuraCinematicBarsLayer | null = null;
      for (const l of activeBars) if (!best || l.barFraction > best.barFraction) best = l;
      if (best && best.barFraction > 0) ctx.blackboard.set(LETTERBOX_BLACKBOARD_KEY, best.rect());
      else ctx.blackboard.delete(LETTERBOX_BLACKBOARD_KEY);
      return items;
    }
  };
}
