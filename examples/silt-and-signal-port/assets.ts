/**
 * Typed asset refs for the port's art. Everything under ./assets is CC0 (see assets/ATTRIBUTION.md): Kenney
 * models (single-file GLBs, textures embedded), the Aura3D animation-starter hero, and ambientCG surface sets.
 * URLs resolve through the bundler as site-relative paths so the built site serves them from the example's own path;
 * each carries the sha256 of its file (checked in tests/unit/silt-and-signal-port/terrain.test.ts), which is what lets
 * the production bridge treat it as a manifest asset instead of a raw URL.
 */
import { defineAuraAssets, defineModelAssets } from "@aura3d/engine";

const HASHES = {
  "models/courier.glb": "sha256-6ff58fb9e3b9b715a8e9c1234619308ed58f4a5ec29e47166a05e5d412447edd",
  "models/hoverboard.glb": "sha256-4efacc1c0f985e061a89345e7ca5b991579ced89efc1d34ce1aa2d34e5655488",
  "models/canyonrocks.glb": "sha256-2988706391e2b9f488c4c986b981dd25ce62e72c751f6b3356dc66bdf23b75fd",
  "models/pillar.glb": "sha256-c3905d6a2cea48aee50224ea435282993975b22128f87b397b157f522aaa4445",
  "models/aqueduct.glb": "sha256-f3954fff6860a5fcb908e2d52591e16f81f789f6f35f1e0879f165b82a285d98",
  "models/gatehouse.glb": "sha256-60a2284a723269203a2571ce7646234f22a7b3cf924aa7fd1978113023cba0f6",
  "models/lantern.glb": "sha256-29711fb1dfeaa430df1c3b4fa011e621f9613e5b693f6ee489267d5f3996baea",
  "models/ringgate.glb": "sha256-bf2300aac5583b1c2ad7169a390275ec0311e7117ef8e8031aae46958c0c7e08",
  "models/ringclean.glb": "sha256-2dffaf16cfa75b0003d1048c05ed3c9e95b6c1c3195f6ba4116fd11783e4008d",
  "models/banner.glb": "sha256-5da0fd3a11600705d435c881f0012b5424c17d357d84090915c177fa4e415186",
  "models/stall.glb": "sha256-f610e63a9c11dc5cc5a00f3f21d2bfbd80171a4f28fef2f482cfb022cb5c2fac",
  "models/watchtower.glb": "sha256-e1b4f84d7daffb49629dbe90d741abf47acded34745c15c68227173e629d3c83",
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
  "textures/plaster_Color.jpg": "sha256-be925668100ca02f524e2a21a3d3af3eb545e845a481490b5904318861d28eb9",
  "textures/plaster_NormalGL.jpg": "sha256-cbc39c32f995be2ca85093e3f0067202df7cfa0a91c1c5f64367e6a2b396bf1b",
  "textures/plaster_Roughness.jpg": "sha256-906fc577fe62ade67d8a8d83968543ed59926cf8e506979e10a49175f17303cb",
} as const;

/* Static literals: the bundler only rewrites `new URL("<literal>", import.meta.url)`; a computed path resolves against the chunk and 404s. */
const ASSET_URLS: Readonly<Record<string, string>> = {
  "models/courier.glb": new URL("./assets/models/courier.glb", import.meta.url).pathname,
  "models/hoverboard.glb": new URL("./assets/models/hoverboard.glb", import.meta.url).pathname,
  "models/canyonrocks.glb": new URL("./assets/models/canyonrocks.glb", import.meta.url).pathname,
  "models/pillar.glb": new URL("./assets/models/pillar.glb", import.meta.url).pathname,
  "models/aqueduct.glb": new URL("./assets/models/aqueduct.glb", import.meta.url).pathname,
  "models/gatehouse.glb": new URL("./assets/models/gatehouse.glb", import.meta.url).pathname,
  "models/lantern.glb": new URL("./assets/models/lantern.glb", import.meta.url).pathname,
  "models/ringgate.glb": new URL("./assets/models/ringgate.glb", import.meta.url).pathname,
  "models/ringclean.glb": new URL("./assets/models/ringclean.glb", import.meta.url).pathname,
  "models/banner.glb": new URL("./assets/models/banner.glb", import.meta.url).pathname,
  "models/stall.glb": new URL("./assets/models/stall.glb", import.meta.url).pathname,
  "models/watchtower.glb": new URL("./assets/models/watchtower.glb", import.meta.url).pathname,
  "models/board.glb": new URL("./assets/models/board.glb", import.meta.url).pathname,
  "models/hero.glb": new URL("./assets/models/hero.glb", import.meta.url).pathname,
  "models/house.glb": new URL("./assets/models/house.glb", import.meta.url).pathname,
  "models/lamp.glb": new URL("./assets/models/lamp.glb", import.meta.url).pathname,
  "models/rocks.glb": new URL("./assets/models/rocks.glb", import.meta.url).pathname,
  "models/tree.glb": new URL("./assets/models/tree.glb", import.meta.url).pathname,
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
  "textures/plaster_Roughness.jpg": new URL("./assets/textures/plaster_Roughness.jpg", import.meta.url).pathname,
};
const url = (key: string): string => {
  const hit = ASSET_URLS[key];
  if (!hit) throw new Error(`silt-and-signal-port: unknown asset ${key}`);
  return hit;
};
export const ASSET_HASHES: Readonly<Record<string, string>> = HASHES;
const model = (file: string, bounds: readonly [number, number, number], extra: { animations?: readonly string[]; animationClips?: readonly string[]; license?: string } = {}) => ({
  url: url(`models/${file}.glb`),
  sha256: ASSET_HASHES[`models/${file}.glb`]!,
  bounds,
  ...(extra.animations ? { animations: extra.animations } : {}),
  ...(extra.animationClips ? { metadata: { animationClips: extra.animationClips } } : {}),
  ...(extra.license ? { license: extra.license } : {})
});
const tex = (name: string, channel: "Color" | "NormalGL" | "Roughness") =>
  ({ type: "texture", format: "jpg", url: url(`textures/${name}_${channel}.jpg`), hash: ASSET_HASHES[`textures/${name}_${channel}.jpg`]!, metadata: { license: "CC0-1.0 (ambientCG)" } }) as const;

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

/** The Meshy courier: idle from the animation library, walk and run from the rig's basic set (names from `assets inspect`). */
export const COURIER_CLIPS = [
  { name: "idle", duration: 4.03, loop: true },
  { name: "walk", duration: 1.07, loop: true },
  { name: "run", duration: 0.67, loop: true }
] as const;

const MODELS = defineModelAssets({
  courier: model("courier", [0.01, 0.018, 0.006], { animations: COURIER_CLIPS.map((c) => c.name), animationClips: COURIER_CLIPS.map((c) => c.name), license: "Meshy generated asset (AuraOne account plan terms at generation time)" }),
  hoverboard: model("hoverboard", [1.903, 0.365, 1.125], { license: "Meshy generated asset (AuraOne account plan terms at generation time)" }),
  canyonrocks: model("canyonrocks", [1.9, 0.911, 1.667], { license: "Meshy generated asset (AuraOne account plan terms at generation time)" }),
  pillar: model("pillar", [0.711, 1.903, 0.713], { license: "Meshy generated asset (AuraOne account plan terms at generation time)" }),
  aqueduct: model("aqueduct", [1.902, 1.28, 0.67], { license: "Meshy generated asset (AuraOne account plan terms at generation time)" }),
  gatehouse: model("gatehouse", [1.901, 1.409, 0.78], { license: "Meshy generated asset (AuraOne account plan terms at generation time)" }),
  lantern: model("lantern", [0.323, 1.903, 0.166], { license: "Meshy generated asset (AuraOne account plan terms at generation time)" }),
  ringgate: model("ringgate", [1.899, 1.309, 1.9], { license: "Meshy generated asset (AuraOne account plan terms at generation time)" }),
  ringclean: model("ringclean", [1.902, 1.903, 0.314], { license: "Meshy generated asset (AuraOne account plan terms at generation time)" }),
  banner: model("banner", [0.778, 1.905, 0.14], { license: "Meshy generated asset (AuraOne account plan terms at generation time)" }),
  stall: model("stall", [1.901, 1.417, 1.173], { license: "Meshy generated asset (AuraOne account plan terms at generation time)" }),
  watchtower: model("watchtower", [0.804, 1.902, 0.863], { license: "Meshy generated asset (AuraOne account plan terms at generation time)" }),
  tree: model("tree", [0.927, 1.684, 0.883]),
  rocks: model("rocks", [1, 1, 1]),
  house: model("house", [1.64, 0.88, 0.968]),
  lamp: model("lamp", [0.425, 0.6, 0.425]),
  board: model("board", [0.3, 0.137, 0.7]),
  hero: model("hero", [1.6, 2.7, 0.8], { animations: HERO_CLIPS.map((c) => c.name), animationClips: HERO_CLIPS.map((c) => c.name) })
}, { license: "CC0-1.0", queryParam: null }).refs;

export const assets = defineAuraAssets({
  ...MODELS,
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
