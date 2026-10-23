/**
 * Meshy-generated models (text prompts only, through Kiro Prism) for the tram, passengers, townhouses, clock tower,
 * lighthouse, crates and street lamps. Prompts, task ids and credits are in PORTING-NOTES.md and
 * `assets/provenance/*`. Same-origin pathnames with sha256 hashes: the production bridge refuses http(s) model URLs.
 * `?procedural=1` falls back to the code-built stand-ins.
 */
import { defineAuraAssets, model } from "@aura3d/engine";

const LICENSE = "Meshy generated asset (AuraOne Meshy account plan terms at generation time), original text prompt, 2026-10-23";
const entry = (file: string, hash: string) => ({
  type: "model" as const, format: "glb" as const,
  url: new URL(`./assets/meshy/${file}`, import.meta.url).pathname, hash: `sha256-${hash}`,
  metadata: { license: LICENSE }
});

export const MESHY_ASSETS = defineAuraAssets({
  tram: entry("tram.glb", "2cefe4cce2813834b59308772a8c25552159fdf97a34c549672e08fc10aaeb98"),
  paxEasy: entry("pax-easy.glb", "0f7823eab8da42e469d38938c3a74632b6702ba5699279869181e3303bc21622"),
  paxSightseer: entry("pax-sightseer.glb", "bb95e0e101912044b4b0db869579a207659a04357e98d492284e005f428a77bb"),
  paxRushed: entry("pax-rushed.glb", "30d564151fd92f40d8ba1e1aaf7176301cda223b4d00feac4c1dc899f51018a9"),
  paxSleeper: entry("pax-sleeper2.glb", "3696499d334a0a8047ed107d0e82b57db61df556310fcc70244d5dff8666e2d2"),
  houseCream: entry("house-cream.glb", "3b23831a217c7f4e2fb07b8c4667d6aeeb2acd19f08b1ce74876247d796d28c6"),
  houseOchre: entry("house-ochre.glb", "2b0066c6efa873e739fa0bc3e1ddf3fd4d7ba5b63cd3b927970f6bfd475f806d"),
  houseBlue: entry("house-blue.glb", "3b3bd54850d1b2c5a8bceceda4b1946a962419be8aa1d89a27f0505cf8271df4"),
  clockTower: entry("clock-tower.glb", "2655ad824c490d3965273acfab2c12292fc8a1af82b328d85a749f09f42437be"),
  lighthouse: entry("lighthouse.glb", "d950164609a9857961db4e5bb1862066d502b7b43417c44e65d91d80039982ae"),
  crates: entry("crates.glb", "e037dd6cb054c0f67e03521f6e992ac920852b11467a1c7801706af5d3c3dc46"),
  lamp: entry("lamp.glb", "66bb1e5bc3780484e52f5836034afe53fdcd08872720984c78672ac9abe77204")
});

export const MESHY_ENABLED = !(typeof location !== "undefined" && /[?&]procedural=1\b/.test(location.search));

/** Raw bounds of every GLB are centred on the origin with the longest side 1.9 (Meshy normalisation). */
export const MODEL_HALF = { tram: [0.951, 0.58, 0.335], pax: 0.951, house: 0.951 } as const;

/** Tram body: long axis is model X, mapped onto tram-local +Z; stretched to the sim's 10.4 m length. */
export const TRAM = {
  yaw: -Math.PI / 2,
  scale: [5.47, 3.8, 5.1] as const,
  /** model centre height above the pose point, in tram-local metres */
  centerY: 2.15,
  /** standing floor inside the tram, tram-local metres */
  floorY: 0.8
};

export const PAX_SCALE = 0.85;

export { model };
