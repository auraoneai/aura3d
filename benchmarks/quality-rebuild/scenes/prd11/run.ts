/**
 * Runner for lane 11's scene page. `?engine=aura3d|three` selects the lane's
 * own adapter; lane params (`a3d-qr`, `aura3d-quality`, `loadMs`) are read by
 * the adapter and by the engine's own flag resolver on window.location.
 */

const params = new URLSearchParams(window.location.search);
const engine = params.get("engine") ?? "aura3d";
const host = document.getElementById("app") ?? document.body;

interface ReadyLike {
  readonly engine: string;
  readonly scene: string;
  readonly errors: readonly string[];
}

const run = engine === "three"
  ? (await import("../../three/scenes/prd11/tier-ladder")).default
  : (await import("../../aura3d/scenes/prd11/tier-ladder")).default;

try {
  const ready = (await run(host)) as ReadyLike;
  (window as { __QR_READY__?: unknown }).__QR_READY__ = ready;
} catch (error) {
  (window as { __QR_READY__?: unknown }).__QR_READY__ = {
    engine,
    scene: "prd11-tier-ladder",
    errors: [error instanceof Error ? error.message : String(error)]
  };
}
