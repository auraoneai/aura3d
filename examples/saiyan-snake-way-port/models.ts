// Meshy-generated props (text prompts only; see PORTING-NOTES.md "Meshy art pass" for prompts, task ids and rights basis).
// Same-origin pathname + sha256: the production bridge refuses http(s) model URLs and would draw nothing.
import { defineModelAssets } from "@aura3d/engine";

const LICENSE = "Meshy generated asset (AuraOne account plan terms at generation time), original text prompt, 2026-10-23";
const glb = (file: string, sha256: string) => ({ url: new URL(`./assets/${file}`, import.meta.url).pathname, sha256 });

export const MESHY = defineModelAssets({
  gate: glb("gate.glb", "sha256-f7f33f94d0ff7d3b2943d6571cea389d74952b60a4f9c6df651635626fec768a"),
  barrier: glb("barrier.glb", "sha256-1abcb50e0356ee708a5db10e4b8dc64f876089ddc634dce8a8786e044273db40"),
  ogre: glb("ogre.glb", "sha256-67e9ae1a89bdc48a0b6a28a535421071bca767930d317381c67cc2aaaf3ec519"),
  island: glb("island.glb", "sha256-605edc6b1c487fe3d8d9c649bd29e13dd6a57f394fdfc3ba4aacf386d79bd7bb"),
  cart: glb("cart.glb", "sha256-b524d3694dfebc51538817c72e23d90c2b0d86800706ea0ef1e0d5bb1b2c3366"),
  feast: glb("feast.glb", "sha256-ef57f499e2352bb73b9098a73190f88412b86aa54a1b9b711d7f69b2e856bac7"),
  lantern: glb("lantern.glb", "sha256-e7455a1ef72d8e5fe0e9a460f8cd68e7ba6ef85292b823979a22d7df7d3f730b")
}, { license: LICENSE, queryParam: null }).refs;

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
