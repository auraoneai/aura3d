/**
 * Runner for lane 11's scene page. `?engine=aura3d|three` selects the lane's
 * own adapter for `?scene=<id>` (default `prd11-tier-ladder`); lane params
 * (`a3d-qr`, `aura3d-quality`, `loadMs`, `lateNodes`) are read by the adapter
 * and by the engine's own flag resolver on window.location.
 */

import { adapters as auraAdapters } from "../../aura3d/scenes/prd11/index";
import { adapters as threeAdapters } from "../../three/scenes/prd11/index";

const params = new URLSearchParams(window.location.search);
const engine = params.get("engine") ?? "aura3d";
const sceneId = params.get("scene") ?? "prd11-tier-ladder";
const host = document.getElementById("app") ?? document.body;

interface ReadyLike {
  readonly engine: string;
  readonly scene: string;
  readonly errors: readonly string[];
}

const adapters = engine === "three" ? threeAdapters : auraAdapters;
const run = (adapters as Record<string, (h: HTMLElement) => Promise<unknown>>)[sceneId];

try {
  if (!run) throw new Error(`no ${engine} adapter for scene ${sceneId}`);
  const ready = (await run(host)) as ReadyLike;
  (window as { __QR_READY__?: unknown }).__QR_READY__ = ready;
} catch (error) {
  (window as { __QR_READY__?: unknown }).__QR_READY__ = {
    engine,
    scene: sceneId,
    errors: [error instanceof Error ? error.message : String(error)]
  };
}
