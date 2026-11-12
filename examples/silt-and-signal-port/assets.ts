/**
 * Typed asset refs for Duneglide (`silt-and-signal-port`).
 *
 * All 3D geometry (skiff, articulated desert surfer rig, ruins, viaducts, gatehouses, mesa spires, flora, and lamps)
 * is authored 100% procedurally with `@aura3d/engine` (`art/proceduralModels.ts`) — zero `.glb` files are fetched or bundled.
 * Surface maps under `./assets/textures` are CC0 ambientCG 1K PBR sets (see `assets/ATTRIBUTION.md`), verified by sha256
 * in `tests/unit/silt-and-signal-port/terrain.test.ts`.
 */
import { defineAuraAssets } from "@aura3d/engine";

const HASHES = {
  "textures/bricks_Color.jpg": "sha256-eddb1c0d350ae6258126337e3bd0fd74d4cd09ed8129b663c3c4482ffc8ccb6b",
  "textures/bricks_NormalGL.jpg": "sha256-409a1d71eaf5d4786bcaf2d825542f5eb210fb913a9bd19866d09e5fa3001cdc",
  "textures/bricks_Roughness.jpg": "sha256-e856fe68a035d8b5f5d33d379f783441bfb54746fbfc7e9ac55caeb54706340d",
  "textures/grass_Color.jpg": "sha256-a79c506865b9293bf17f66c39ebbb35b487ed7444ab6d207a791f64881693eee",
  "textures/grass_NormalGL.jpg": "sha256-c71ac38a9253bc3f2b340d6a1147048bfbf6092e906c1051ad253cfc163c1852",
  "textures/grass_Roughness.jpg": "sha256-e70c387e277764bc1037a04cf965782bf8b3881e35770f55376e46248909f760",
  "textures/ground_Color.jpg": "sha256-364ceedc01a4f6a89fa146f7d423e7c514afe24e1fa7af103ea2a84a650575ab",
  "textures/ground_NormalGL.jpg": "sha256-3deac030d923f72752708b2d2ab5969376ab8e7ebe9452b1e11b31c58d774b9d",
  "textures/ground_Roughness.jpg": "sha256-b59fc261f733f1062e9a0cad4ba1db6c942c7f5de546b2927fb99770d9379aa2",
  "textures/paving_Color.jpg": "sha256-363f061edd2056a86e313246ca666a8f102788b18844e6885f0bd5dcb838f527",
  "textures/paving_NormalGL.jpg": "sha256-88537bab50e9b369ed9dcc01b27b388967d912fb0e6133945b2d5e38df8d7479",
  "textures/paving_Roughness.jpg": "sha256-2a7b783b52852266d5b88061bd48c09e3d9d03d219c5d5693540dbe429391972",
  "textures/rock_Color.jpg": "sha256-09aab3df526e6801a788b9daee659ce081a582d88182b6e2ba17b3b6c1f8a6ad",
  "textures/rock_NormalGL.jpg": "sha256-2a5afdb4f4ea08aab0348d5e04b32e3a2ff92e450158344ea3bfa9a2140d6aa9",
  "textures/rock_Roughness.jpg": "sha256-75256cb9072dfdd046e12988e03c8d6a17af985b35e3b83e5082e4699ebde1a6",
  "textures/plaster_Color.jpg": "sha256-be925668100ca02f524e2a21a3d3af3eb545e845a481490b5904318861d28eb9",
  "textures/plaster_NormalGL.jpg": "sha256-cbc39c32f995be2ca85093e3f0067202df7cfa0a91c1c5f64367e6a2b396bf1b",
  "textures/plaster_Roughness.jpg": "sha256-906fc577fe62ade67d8a8d83968543ed59926cf8e506979e10a49175f17303cb"
} as const;

/* Static literals: the bundler only rewrites `new URL("<literal>", import.meta.url)`; a computed path resolves against the chunk and 404s. */
const ASSET_URLS: Readonly<Record<string, string>> = {
  "textures/bricks_Color.jpg": new URL("./assets/textures/bricks_Color.jpg", import.meta.url).pathname,
  "textures/bricks_NormalGL.jpg": new URL("./assets/textures/bricks_NormalGL.jpg", import.meta.url).pathname,
  "textures/bricks_Roughness.jpg": new URL("./assets/textures/bricks_Roughness.jpg", import.meta.url).pathname,
  "textures/grass_Color.jpg": new URL("./assets/textures/grass_Color.jpg", import.meta.url).pathname,
  "textures/grass_NormalGL.jpg": new URL("./assets/textures/grass_NormalGL.jpg", import.meta.url).pathname,
  "textures/grass_Roughness.jpg": new URL("./assets/textures/grass_Roughness.jpg", import.meta.url).pathname,
  "textures/ground_Color.jpg": new URL("./assets/textures/ground_Color.jpg", import.meta.url).pathname,
  "textures/ground_NormalGL.jpg": new URL("./assets/textures/ground_NormalGL.jpg", import.meta.url).pathname,
  "textures/ground_Roughness.jpg": new URL("./assets/textures/ground_Roughness.jpg", import.meta.url).pathname,
  "textures/paving_Color.jpg": new URL("./assets/textures/paving_Color.jpg", import.meta.url).pathname,
  "textures/paving_NormalGL.jpg": new URL("./assets/textures/paving_NormalGL.jpg", import.meta.url).pathname,
  "textures/paving_Roughness.jpg": new URL("./assets/textures/paving_Roughness.jpg", import.meta.url).pathname,
  "textures/rock_Color.jpg": new URL("./assets/textures/rock_Color.jpg", import.meta.url).pathname,
  "textures/rock_NormalGL.jpg": new URL("./assets/textures/rock_NormalGL.jpg", import.meta.url).pathname,
  "textures/rock_Roughness.jpg": new URL("./assets/textures/rock_Roughness.jpg", import.meta.url).pathname,
  "textures/plaster_Color.jpg": new URL("./assets/textures/plaster_Color.jpg", import.meta.url).pathname,
  "textures/plaster_NormalGL.jpg": new URL("./assets/textures/plaster_NormalGL.jpg", import.meta.url).pathname,
  "textures/plaster_Roughness.jpg": new URL("./assets/textures/plaster_Roughness.jpg", import.meta.url).pathname
};

const url = (key: string): string => {
  const hit = ASSET_URLS[key];
  if (!hit) throw new Error(`silt-and-signal-port: unknown asset ${key}`);
  return hit;
};

export const ASSET_HASHES: Readonly<Record<string, string>> = HASHES;

const tex = (name: string, channel: "Color" | "NormalGL" | "Roughness") =>
  ({
    type: "texture",
    format: "jpg",
    url: url(`textures/${name}_${channel}.jpg`),
    hash: ASSET_HASHES[`textures/${name}_${channel}.jpg`]!,
    metadata: { license: "CC0-1.0 (ambientCG)" }
  }) as const;

/** Procedural surfer motion states reported through `worldRuntime.riderAnimation()`. */
export const HERO_CLIPS = [
  { name: "idle", duration: 1.33, loop: true },
  { name: "drive", duration: 0.17, loop: true },
  { name: "sit", duration: 0.17, loop: true },
  { name: "walk", duration: 0.67, loop: true },
  { name: "sprint", duration: 0.5, loop: true }
] as const;

export const COURIER_CLIPS = [
  { name: "idle", duration: 4.03, loop: true },
  { name: "walk", duration: 1.07, loop: true },
  { name: "run", duration: 0.67, loop: true }
] as const;

export const assets = defineAuraAssets({
  grassColor: tex("grass", "Color"),
  grassNormal: tex("grass", "NormalGL"),
  grassRough: tex("grass", "Roughness"),
  groundColor: tex("ground", "Color"),
  groundNormal: tex("ground", "NormalGL"),
  groundRough: tex("ground", "Roughness"),
  pavingColor: tex("paving", "Color"),
  pavingNormal: tex("paving", "NormalGL"),
  pavingRough: tex("paving", "Roughness"),
  rockColor: tex("rock", "Color"),
  rockNormal: tex("rock", "NormalGL"),
  rockRough: tex("rock", "Roughness"),
  bricksColor: tex("bricks", "Color"),
  bricksNormal: tex("bricks", "NormalGL"),
  bricksRough: tex("bricks", "Roughness"),
  plasterColor: tex("plaster", "Color"),
  plasterNormal: tex("plaster", "NormalGL"),
  plasterRough: tex("plaster", "Roughness")
});
