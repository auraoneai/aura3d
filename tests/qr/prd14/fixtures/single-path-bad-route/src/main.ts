// Fixture for T1.9: a single-path rebuilt route that violates the static
// art-direction scan. MUST FAIL check-art-direction.mjs — proves the
// single-path branch scans src/** with the same patterns as src/v2/**.
import { createGame } from "@aura3d/game";

export function boot(target: HTMLElement) {
  const game = createGame({ id: "single-path-bad-route", target, scene });
  return game;
}

function scene() {
  return {
    lights: [{ type: "ambient", intensity: 0.6 }, { type: "directional", shadow: true }],
    nodes: []
  };
}

if (location.search.includes("capture=review")) {
  console.log("capture-only branch: swapping camera");
}
window.__MY_OWN_EVIDENCE__ = { notTheBeacon: true };
