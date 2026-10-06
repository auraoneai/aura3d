/**
 * Aura Clash HUD/touch fixture (PRD-09 1767): fighting theme — two ghosted
 * health meters, meter bars, round pips, timer, edge combo, callout — plus the
 * dpad-4btn preset bindings the migrated route uses.
 */
import type { HudMountOptions } from "../../src/hud/HudKit";
import type { TouchControlsOptions } from "../../src/touch/TouchControls";

export const auraClashHudOptions: HudMountOptions = {
  theme: "fighting",
  maxScreenFraction: 0.22,
  widgets: [
    { id: "p1-name", kind: "prompt", anchor: "top-left" },
    { id: "p1-rounds", kind: "lives", anchor: "top-left", label: "Player rounds" },
    { id: "p1-health", kind: "meter", max: 100, ghost: true, anchor: "top-left", label: "Mara Volt", color: "#39d353" },
    { id: "p1-meter", kind: "meter", max: 100, anchor: "top-left", label: "Meter", color: "#e8b93f" },
    { id: "p1-state", kind: "prompt", anchor: "top-left", mobileAnchor: "hidden" },
    { id: "p2-name", kind: "prompt", anchor: "top-right" },
    { id: "p2-rounds", kind: "lives", anchor: "top-right", label: "Rival rounds" },
    { id: "p2-health", kind: "meter", max: 100, ghost: true, anchor: "top-right", label: "Rook Atlas", color: "#39d353" },
    { id: "p2-meter", kind: "meter", max: 100, anchor: "top-right", label: "Meter", color: "#e8b93f" },
    { id: "p2-state", kind: "prompt", anchor: "top-right", mobileAnchor: "hidden" },
    { id: "clock", kind: "timer", mode: "countdown", warnAt: 10, anchor: "top" },
    { id: "callout", kind: "prompt", anchor: "top" },
    { id: "combo", kind: "combo", anchor: "left" },
    { id: "burst", kind: "prompt", anchor: "bottom-left" }
  ]
};

export const auraClashTouchOptions: TouchControlsOptions = {
  preset: "dpad-4btn",
  bindings: {
    "stick.left": "left",
    "stick.right": "right",
    "stick.up": "jump",
    "stick.down": "down",
    "rstick.up": "dash",
    left: "left",
    right: "right",
    block: "guard",
    light: "light",
    heavy: "heavy",
    special: "special",
    jump: "jump"
  },
  haptics: true
};
