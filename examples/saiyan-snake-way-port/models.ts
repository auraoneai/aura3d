// Meshy-generated props (text prompts only; see PORTING-NOTES.md "Meshy art pass" for prompts, task ids and rights basis).
// Same-origin pathname + sha256: the production bridge refuses http(s) model URLs and would draw nothing.
import { defineModelAssets } from "@aura3d/engine";

const LICENSE = "Meshy generated asset (AuraOne account plan terms at generation time), original text prompt, 2026-10-23";
const glb = (file: string, sha256: string) => ({ url: new URL(`./assets/${file}`, import.meta.url).pathname, sha256 });

export const MESHY = defineModelAssets({
  gate: glb("gate.glb", "sha256-3fb6d7084b80b087037307a57740c9a217d9401c662c342f45206af7f647871f"),
  barrier: glb("barrier.glb", "sha256-c1baefaebada21231cf073d8b8a530f75a7553b19c3dff8cfc1f38bc790e171b"),
  ogre: glb("ogre.glb", "sha256-8dd09a9b08673e7848d67b052c8d3fb6172d10e2baff847a4a993da3f9bc1937"),
  island: glb("island.glb", "sha256-605edc6b1c487fe3d8d9c649bd29e13dd6a57f394fdfc3ba4aacf386d79bd7bb"),
  cart: glb("cart.glb", "sha256-e5a704485d2104bf228795a8767f213aa8f4411d734e52690028f49c9038f3a6"),
  feast: glb("feast.glb", "sha256-993f6ebe301bd673989d07e1d1a1f0aada1b04e274169e24a6ac7a771f214620"),
  lantern: glb("lantern.glb", "sha256-5711a1c30cbd9354c1b78121573d370b88a319b049eaf678155f67bce43f3637")
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
