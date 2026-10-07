// Fixture for T1.9: a v2 route that PASSES the static art-direction scan.
import { createGame } from "@aura3d/game";

export function boot(target: HTMLElement) {
  return createGame({ id: "clean-route", target, scene });
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
