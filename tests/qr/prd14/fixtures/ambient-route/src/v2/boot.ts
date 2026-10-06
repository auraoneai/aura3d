// Fixture for T1.9: a v2 route that violates the static art-direction scan.
// MUST FAIL check-art-direction.mjs.
import { createGame } from "@aura3d/game";

export function boot(target: HTMLElement) {
  const game = createGame({ id: "ambient-route", target, scene });
  return game;
}

function scene() {
  return {
    // Forbidden by §7.1: ambient light in the mounted scene.
    lights: [{ type: "ambient", intensity: 0.6 }, { type: "directional", shadow: true }],
    nodes: []
  };
}

// Forbidden by §7.1 capture-branch: behaves differently under the capture query.
const params = new URLSearchParams(location.search);
if (location.search.includes("capture=review")) {
  console.log("capture-only branch: swapping camera");
}
window.__MY_OWN_EVIDENCE__ = { notTheBeacon: true };
