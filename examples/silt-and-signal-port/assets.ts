/**
 * Typed asset refs for the port's art. Everything under ./assets is CC0 (see assets/ATTRIBUTION.md): Kenney
 * models (single-file GLBs, textures embedded), the Aura3D animation-starter hero, and ambientCG surface sets.
 * URLs resolve through the bundler as site-relative paths so the built site serves them from the example's own path;
 * each carries the sha256 of its file (checked in tests/unit/silt-and-signal-port/terrain.test.ts), which is what lets
 * the production bridge treat it as a manifest asset instead of a raw URL.
 */
import { defineAuraAssets } from "@aura3d/engine";

const HASHES = {
  "models/board.glb": "sha256-cb725a12a84664201367ca277f5e9155089fb1319464ba5c69800525434b742b",
  "models/hero.glb": "sha256-407a9aa65fe186bac976d46fb78fbc303471eb75328fca31d7bbfc1812bc81ea",
  "models/house.glb": "sha256-7aa00a1bee1828e5518426cf85f744c9ffd142d66850ff0ae08fca2c27a09757",
  "models/lamp.glb": "sha256-7fbcdb9322a84d89fb7b7dfc2ff95a1ade9e6b574c63a05d3132f6c573f55d60",
  "models/rocks.glb": "sha256-8fe1d77dc723f5603219e1bb88e6e7c3905ba3ab47e42769311b0821a87b2585",
  "models/tree.glb": "sha256-e14290412ced6fb472f86885ce4158911ba12ec5be15f556a7745a7397b5d31d",
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
} as const;

const url = (path: string): string => new URL(path, import.meta.url).pathname;
export const ASSET_HASHES: Readonly<Record<string, string>> = HASHES;
const model = (file: string, bounds: readonly [number, number, number], extra: Record<string, unknown> = {}) =>
  ({ type: "model", format: "glb", url: url(`./assets/models/${file}.glb`), hash: ASSET_HASHES[`models/${file}.glb`]!, bounds, metadata: { license: "CC0-1.0", ...extra } }) as const;
const tex = (name: string, channel: "Color" | "NormalGL" | "Roughness") =>
  ({ type: "texture", format: "jpg", url: url(`./assets/textures/${name}_${channel}.jpg`), hash: ASSET_HASHES[`textures/${name}_${channel}.jpg`]!, metadata: { license: "CC0-1.0 (ambientCG)" } }) as const;

/** Clip names and durations come from `aura3d assets inspect hero.glb --animation`. */
export const HERO_CLIPS = [
  { name: "idle", duration: 1.33, loop: true },
  { name: "drive", duration: 0.17, loop: true },
  { name: "sit", duration: 0.17, loop: true },
  { name: "walk", duration: 0.67, loop: true },
  { name: "sprint", duration: 0.5, loop: true },
  { name: "emote-yes", duration: 0.67, loop: false },
  { name: "interact-right", duration: 0.67, loop: false },
  { name: "pick-up", duration: 0.33, loop: false }
] as const;

export const assets = defineAuraAssets({
  tree: model("tree", [0.927, 1.684, 0.883]),
  rocks: model("rocks", [1, 1, 1]),
  house: model("house", [1.64, 0.88, 0.968]),
  lamp: model("lamp", [0.425, 0.6, 0.425]),
  board: model("board", [0.3, 0.137, 0.7]),
  hero: model("hero", [1.6, 2.7, 0.8], { animations: HERO_CLIPS.map((c) => c.name), animationClips: HERO_CLIPS.map((c) => c.name) }),
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
  bricksRough: tex("bricks", "Roughness")
});
