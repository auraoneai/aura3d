import { defineAuraAssets } from "@aura3d/engine";

/**
 * Route-local Meshy-generated 3D assets for Grid Dispatch (v2) with verified sha256 hashes.
 */
export const v2Assets = defineAuraAssets({
  gridTransamerica: {
    type: "model",
    format: "glb",
    url: "/aura-assets/grid-transamerica-pyramid.glb",
    hash: "sha256-3cafeed0426f479d5805059349bed964cf1029a54d84bcf1f582e2684e12eeb0",
    bounds: [36, 160, 36],
    role: "setDressing"
  },
  gridFerryBuilding: {
    type: "model",
    format: "glb",
    url: "/aura-assets/grid-ferry-building.glb",
    hash: "sha256-f1f5f1b909f940fe42e5a210ec51fdc20f9729d00333616e46a071fe123406bb",
    bounds: [64, 52, 22],
    role: "setDressing"
  },
  gridPaintedLadies: {
    type: "model",
    format: "glb",
    url: "/aura-assets/grid-painted-ladies.glb",
    hash: "sha256-7b7f8d0be4cdd7562056cd35aad5dcaf984fde6e8416cabd1a4559ddc56ab4dc",
    bounds: [28, 16, 14],
    role: "setDressing"
  },
  gridCablecarShelter: {
    type: "model",
    format: "glb",
    url: "/aura-assets/grid-cablecar-shelter.glb",
    hash: "sha256-b6962783d181f6806b5044693c1f66c50cfa6190df421a4b7c7a49c4356a961b",
    bounds: [3.2, 3.0, 5.4],
    role: "setDressing"
  }
});
