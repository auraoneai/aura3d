/**
 * Bank Shot HUD/touch fixture (PRD-09 1767): tabletop theme + aim-drag touch —
 * the same mount the migrated route uses, minus route state.
 */
import type { HudMountOptions } from "../../src/hud/HudKit";
import type { TouchControlsOptions } from "../../src/touch/TouchControls";

export const bankShotHudOptions: HudMountOptions = {
  theme: "tabletop",
  maxScreenFraction: 0.15,
  widgets: [
    { id: "clock", kind: "timer", mode: "countdown", warnAt: 45, anchor: "top", label: "Rack" },
    { id: "score", kind: "score", anchor: "top-right", label: "Score", rollMs: 200 },
    { id: "combo", kind: "combo", anchor: "top-right" },
    { id: "objective", kind: "objective", anchor: "bottom-left" },
    { id: "prompt", kind: "prompt", anchor: "bottom" },
    { id: "strike", kind: "meter", max: 1, anchor: "bottom-right", label: "Strike", color: "#d4a94f" }
  ]
};

export const bankShotTouchOptions: TouchControlsOptions = {
  preset: "aim-drag",
  bindings: {
    "stick.left": "KeyA",
    "stick.right": "KeyD",
    "stick.up": "KeyW",
    "stick.down": "KeyS",
    "rstick.left": "KeyA",
    "rstick.right": "KeyD",
    charge: "Space",
    confirm: "Space",
    cancel: "KeyR"
  }
};
