/**
 * Courier Rush HUD/touch fixture (PRD-09 1767): the same widget list and
 * steer-pedals bindings the migrated route mounts, so `layout.spec.ts` and
 * `touch.spec.ts` exercise the kit without depending on the route's sources.
 */
import type { HudMountOptions } from "../../src/hud/HudKit";
import type { TouchControlsOptions } from "../../src/touch/TouchControls";

export const courierHudOptions: HudMountOptions = {
  theme: "motorsport",
  maxScreenFraction: 0.22,
  widgets: [
    { id: "timer", kind: "timer", mode: "countdown", warnAt: 10, anchor: "top", label: "Shift" },
    { id: "score", kind: "score", anchor: "top-right", label: "Earnings", rollMs: 250 },
    { id: "strikes", kind: "lives", anchor: "top-left", label: "Strikes" },
    { id: "combo", kind: "combo", anchor: "top-right", mobileAnchor: "bottom-right" },
    { id: "objective", kind: "objective", anchor: "bottom-left" },
    { id: "speed", kind: "speedometer", anchor: "bottom-right", mobileAnchor: "hidden" },
    {
      id: "nav",
      kind: "indicator",
      anchor: "center",
      target: () => null
    }
  ]
};

export const courierTouchOptions: TouchControlsOptions = {
  preset: "steer-pedals",
  bindings: {
    throttle: "throttle",
    brake: "brake",
    "steer-left": "left",
    "steer-right": "right",
    boost: "handbrake",
    reset: "reset"
  },
  haptics: true
};
