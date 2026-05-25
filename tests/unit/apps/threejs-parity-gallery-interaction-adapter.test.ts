import { describe, expect, it } from "vitest";
import { InteractionControls } from "../../../packages/controls/src";
import {
  applyGalleryOrbitDrag,
  pointer01FromClient,
  resolveGalleryPointerDownAction,
  routePointerCreatesRipple
} from "../../../apps/advanced-examples-gallery/src/galleryInteractionAdapter";

describe("v9 gallery interaction adapter", () => {
  it("routes product pointer-down to hotspot picking and water routes to ripples", () => {
    expect(resolveGalleryPointerDownAction("product-configurator")).toBe("product-hotspot");
    expect(resolveGalleryPointerDownAction("data-galaxy")).toBe("scene-ripple-or-select");

    expect(routePointerCreatesRipple("water-lab")).toBe(true);
    expect(routePointerCreatesRipple("ocean-observatory")).toBe(true);
    expect(routePointerCreatesRipple("product-configurator")).toBe(false);
  });

  it("normalizes client pointers and applies bounded orbit drag math outside main orchestration", () => {
    expect(InteractionControls).toBeTypeOf("function");
    expect(pointer01FromClient(150, 90, { left: 100, top: 50, width: 200, height: 80 })).toEqual({
      x: 0.25,
      y: 0.5
    });

    const dragged = applyGalleryOrbitDrag({ yaw: 0.4, pitch: -0.2 }, { x: 0.2, y: 0.5 }, { x: 0.6, y: 0.7 });
    expect(dragged.yaw).toBeCloseTo(1.4, 6);
    expect(dragged.pitch).toBeCloseTo(0.08, 6);

    expect(applyGalleryOrbitDrag({ yaw: 0, pitch: 0.2 }, { x: 0, y: 0 }, { x: 0, y: 2 }).pitch).toBe(0.32);
    expect(applyGalleryOrbitDrag({ yaw: 0, pitch: -0.7 }, { x: 0, y: 1 }, { x: 0, y: 0 }).pitch).toBe(-0.72);
  });
});
