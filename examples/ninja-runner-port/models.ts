/**
 * Generated 3D models for the port (Meshy text-to-3D through Kiro Prism, prompts and task ids in assets/ATTRIBUTION.md).
 * Characters are rigged GLBs with canonical clip names (run, idle, jump, slide, punch, sword, jab, block, hit, death) and
 * are cloned with `cloneSkinned`; props are instanced with `instances.model`. Asset URLs are same-origin pathnames with
 * a sha256 so the production bridge admits them.
 */
import { defineModelAssets } from "@aura3d/engine";
import { MESHY_MANIFEST, type PropId } from "./assets/meshy/manifest";

export type CharacterId = "hero" | "soldier" | "brute" | "sage";

export const CHARACTER_URLS: Readonly<Record<CharacterId, string>> = {
  hero: new URL("./assets/meshy/hero.glb", import.meta.url).href,
  soldier: new URL("./assets/meshy/soldier.glb", import.meta.url).href,
  brute: new URL("./assets/meshy/brute.glb", import.meta.url).href,
  sage: new URL("./assets/meshy/sage.glb", import.meta.url).href
};

/** Which character model each of the thirteen actor slots clones: 0 hero, 1-3 shadow clones, 4-9 soldiers, 10-11 brutes, 12 sage. */
export const SLOT_MODEL: readonly CharacterId[] = ["hero", "hero", "hero", "hero", "soldier", "soldier", "soldier", "soldier", "soldier", "soldier", "brute", "brute", "sage"];

const LICENSE = "Meshy generated asset (AuraOne account plan terms at generation time), own text prompt, 2026-10-23 and 2026-10-25";
const url = (id: PropId): string => new URL(`./assets/meshy/${id}.glb`, import.meta.url).pathname;
const entry = (id: PropId) => ({ url: url(id), sha256: MESHY_MANIFEST[id].sha256 });

export const PROP_ASSETS = defineModelAssets({
  houseA: entry("houseA"),
  houseB: entry("houseB"),
  tower: entry("tower"),
  gate: entry("gate"),
  pine: entry("pine"),
  lantern: entry("lantern"),
  oak: entry("oak"),
  houseC: entry("houseC"),
  houseD: entry("houseD"),
  teahouse: entry("teahouse"),
  marketStall: entry("marketStall"),
  cliffA: entry("cliffA"),
  cliffB: entry("cliffB"),
  boulder: entry("boulder"),
  bush: entry("bush"),
  ridge: entry("ridge"),
  fenceRail: entry("fenceRail")
}, { license: LICENSE, queryParam: null }).refs;

/**
 * GU47 WP-36 dusk retextures (NR-12), admitted with `aura3d assets import-meshy --into examples/ninja-runner-port/assets
 * --prefix ninja` (GLBs in assets/models/, rights and task metadata in assets/provenance/ninja_*.json). The evening look
 * draws them in place of the 4.6.2 prop; `?look=original` keeps the 4.6.2 GLB. Each swap is the same mesh layout re-scaled
 * by Meshy, so `scale` maps it back onto the original prop's bounds (placements, sizes and collision are unchanged).
 */
const DUSK_LICENSE = "Meshy generated asset (paid API, AuraOne account plan terms at generation time), retextured from the game's own mesh with an own text style prompt, GU47 WP-36 2026-10-30";
const dusk = (file: string, sha256: string) => ({ url: new URL(`./assets/models/${file}.glb`, import.meta.url).pathname, sha256 });
export const DUSK_PROP_ASSETS = defineModelAssets({
  houseA: dusk("ninja_houseADusk", "b4c9348054f98be49092dc87749e7326b18cb3132158e6d8f4c058500e9caf80")
}, { license: DUSK_LICENSE, queryParam: null }).refs;
/** Uniform scale that maps each dusk GLB onto the 4.6.2 prop's bounds (houseA: 2.0 x 1.679 x 1.04 m vs 1.9 x 1.595 x 0.988 m). */
export const DUSK_PROP_SCALE: Readonly<Partial<Record<keyof typeof DUSK_PROP_ASSETS, number>>> = { houseA: 1.9 / 2.0 };
/** WP-36 plan keys of the swaps (lane report and checklist). */
export const DUSK_PROP_KEYS: Readonly<Record<keyof typeof DUSK_PROP_ASSETS, string>> = { houseA: "ninjaHouseADusk" };
