// Meshy-generated props (text prompts only; see PORTING-NOTES.md "Meshy art pass" for prompts, task ids and rights basis).
// Same-origin pathname + sha256: the production bridge refuses http(s) model URLs and would draw nothing.
import { defineModelAssets } from "@aura3d/engine";
import type { LookMode } from "./art/colorScript";

const LICENSE = "Meshy generated asset (AuraOne account plan terms at generation time), original text prompt, 2026-10-23";
const glb = (file: string, sha256: string) => ({ url: new URL(`./assets/${file}`, import.meta.url).pathname, sha256 });

export const MESHY = defineModelAssets({
  gate: glb("gate.glb", "sha256-f7f33f94d0ff7d3b2943d6571cea389d74952b60a4f9c6df651635626fec768a"),
  barrier: glb("barrier.glb", "sha256-1abcb50e0356ee708a5db10e4b8dc64f876089ddc634dce8a8786e044273db40"),
  ogre: glb("ogre.glb", "sha256-67e9ae1a89bdc48a0b6a28a535421071bca767930d317381c67cc2aaaf3ec519"),
  island: glb("island.glb", "sha256-605edc6b1c487fe3d8d9c649bd29e13dd6a57f394fdfc3ba4aacf386d79bd7bb"),
  cart: glb("cart.glb", "sha256-b524d3694dfebc51538817c72e23d90c2b0d86800706ea0ef1e0d5bb1b2c3366"),
  feast: glb("feast.glb", "sha256-ef57f499e2352bb73b9098a73190f88412b86aa54a1b9b711d7f69b2e856bac7"),
  lantern: glb("lantern.glb", "sha256-e7455a1ef72d8e5fe0e9a460f8cd68e7ba6ef85292b823979a22d7df7d3f730b"),
  /** GU47 WP-36 `serpSerpentHead` (admitted 2026-10-31, provenance/serpentHead.*): the colossal serpent landmark (SSR-10/17). */
  serpentHead: glb("serpentHead.glb", "sha256-8376edc24e11fc99cebd4b5ab2fcda24afa3ba56c34f2cedb073c47cfa1afe34"),
  /** GU47 wave 2 `serpSpireB` (admitted 2026-11-03, provenance/spireB.*): twisted red rock spire with hanging lanterns, a near-island variant in script mode (SSR-10). */
  spireB: glb("spireB.glb", "sha256-29693db9f821da39921adefbf0359b7c7f449935c444b47fa4109a4ef7ca2cf0"),
  /** GU47 wave 2 `serpSpireC` (admitted 2026-11-03, provenance/spireC.*): lacquer pagoda on a floating rock island, a near-island variant in script mode (SSR-10). */
  spireC: glb("spireC.glb", "sha256-667c6275cebd1596364e4d626ff51eb685db2d8fe6dd1d44797d8e3c5dfd18e7"),
  /** GU47 wave 2 `serpSpireA` (admitted 2026-11-03, decimated 116,262 -> 29,996 tris at 1024 px, provenance/spireA.*): four-tier lacquer pagoda on a rock island with gold trees (SSR-10). */
  spireA: glb("spireA.glb", "sha256-41758a150ff3f2fac901c5de4889042b7d0872c3652bde256e4a45a89e549ca6")
}, { license: LICENSE, queryParam: null }).refs;

/** Both versions retain the same rig and clips; only the original uses the 4.6.2 teal atlas. */
export const RUNNER_MODELS = defineModelAssets({
  original: {
    url: new URL("./assets/runner.glb", import.meta.url).pathname,
    sha256: "sha256-5e8a08af3b60c2a36aed4b0d3197c2d1846cf7cfc26a1322d366232cc035b9f4"
  },
  script: {
    url: new URL("./assets/runner-script.glb", import.meta.url).pathname,
    sha256: "sha256-7a1ea836817674f965fe1e42691acb15a51e6812d5519a441fd841584c5c3f7b"
  }
}, { license: LICENSE, queryParam: null }).refs;

export function runnerModelForLook(mode: LookMode) {
  return RUNNER_MODELS[mode];
}

export type MeshyKey = keyof typeof MESHY;

/** Entity types drawn as a single Meshy model: pooled slot count, target height (m) and the model's yaw offset. */
export const ENTITY_MODELS: Readonly<Record<string, { readonly key: MeshyKey; readonly pool: number; readonly height: number; readonly baseY: number; readonly yaw: number }>> = {
  arch: { key: "gate", pool: 8, height: 4.6, baseY: 2.2, yaw: 0 },
  barrier: { key: "barrier", pool: 16, height: 2.5, baseY: 1.1, yaw: 0 },
  oni: { key: "ogre", pool: 12, height: 3.4, baseY: 1.5, yaw: 0 },
  sweeper: { key: "cart", pool: 6, height: 2.8, baseY: 0.9, yaw: 0 },
  feast: { key: "feast", pool: 6, height: 1.9, baseY: 0.95, yaw: 0 }
};

export const LANTERN_COUNT = 10;
export const ISLAND_COUNT = 6;
/**
 * GU47 wave 2 (SSR-10): in script mode the six near islands cycle through the tall pagoda island, the red lantern spire and the
 * second pagoda island (`?look=original` keeps six original islands). `targetHeight` is the model height in metres before the
 * per-slot `1 + (i % 3) * 0.35` scale the original islands already used.
 */
export const ISLAND_VARIANTS: readonly { readonly key: MeshyKey; readonly targetHeight: number }[] = [
  { key: "spireC", targetHeight: 22 },
  { key: "spireB", targetHeight: 15 },
  { key: "spireA", targetHeight: 14 }
];
