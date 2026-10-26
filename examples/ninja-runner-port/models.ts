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
