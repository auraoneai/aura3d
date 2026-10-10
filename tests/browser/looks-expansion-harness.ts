// PRD-13 §17.2 — looks-expansion harness.
// Renders `scene().add(looks.preset(id)).add(model(DamagedHelmet))` for one look
// id per query (?look=<id>), with `expansion` forced by ?expansion=none|v0|v1.
// Exposes per-look build + diagnostics on window.__AURA3D_LOOKS_EXPANSION__.
import { createAuraApp, defineAuraAssets, looks, model, scene, type AuraLookId } from "@aura3d/engine";

const params = new URLSearchParams(location.search);
const lookId = params.get("look") as AuraLookId | null;
const expansion = (params.get("expansion") ?? "auto") as "auto" | "v0" | "v1";

const assets = defineAuraAssets({
  helmet: {
    type: "model",
    url: "/fixtures/asset-corpus/damaged-helmet.glb",
    hash: "4028ccbce11eb924"
  }
});

declare global {
  interface Window {
    __AURA3D_LOOKS_EXPANSION__?: {
      look: string | null;
      expansion: string;
      status: "built" | "error";
      error?: string;
      diagnostics?: unknown;
    };
  }
}

try {
  if (!lookId) throw new Error("missing ?look=<id> query param");
  const canvas = document.getElementById("look-canvas") as HTMLCanvasElement;
  const built = scene().add(looks.preset(lookId, undefined, { expansion })).add(model(assets.helmet));
  const app = createAuraApp(canvas, { scene: built, pixelRatio: 1, resize: false });
  // Let a few frames render, then snapshot diagnostics for the spec.
  for (let i = 0; i < 5; i++) app.step(1 / 60);
  app.pause();
  window.__AURA3D_LOOKS_EXPANSION__ = {
    look: lookId,
    expansion,
    status: "built",
    diagnostics: app.diagnostics()
  };
} catch (error) {
  window.__AURA3D_LOOKS_EXPANSION__ = {
    look: lookId,
    expansion,
    status: "error",
    error: error instanceof Error ? error.message : String(error)
  };
}
