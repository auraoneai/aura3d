import { defineAuraAssets } from "@aura3d/engine";

/**
 * Local Grid Dispatch V2 asset manifest.
 *
 * These GLBs are generated specifically for this route (Meshy text-to-3d via
 * the Kiro Prism proxy) and served from this app's own `public/aura-assets/`
 * directory — root `/aura-assets/` manifests are deliberately untouched.
 *
 * Provenance + rights records live under artifacts/meshy per asset slug.
 */
export const v2Assets = defineAuraAssets({
  gridTransamerica: {
    type: "model",
    format: "glb",
    url: "/aura-assets/grid-transamerica-pyramid.glb",
    hash: "sha256-3cafeed0426f",
    bounds: [40, 145, 40]
  },
  gridFerryBuilding: {
    type: "model",
    format: "glb",
    url: "/aura-assets/grid-ferry-building.glb",
    hash: "sha256-f1f5f1b909f9",
    bounds: [52, 24, 14]
  },
  gridPaintedLadies: {
    type: "model",
    format: "glb",
    url: "/aura-assets/grid-painted-ladies.glb",
    hash: "sha256-7b7f8d0be4cd",
    bounds: [30, 14, 12]
  },
  gridCablecarShelter: {
    type: "model",
    format: "glb",
    url: "/aura-assets/grid-cablecar-shelter.glb",
    hash: "sha256-b6962783d181",
    bounds: [6, 4.5, 3]
  }
});
