// Fixture for T1.9: a single-path rebuilt route that PASSES the static
// art-direction scan. No src/v2 tree — src/main.ts boots every URL.
import { createGame } from "@aura3d/game";

export function boot(target: HTMLElement) {
  return createGame({ id: "single-path-route", target, scene });
}

function scene() {
  return {
    lights: [{ type: "directional", shadow: true, intensity: 2.2 }],
    environment: { preset: "studio" },
    nodes: []
  };
}

export function evidence() {
  return window.__AURA3D_GAME__;
}
