/**
 * Procedural Sengoku character & prop asset descriptors for Shadowstep Gauntlet (`examples/ninja-runner-port`).
 * Characters and district architecture are built natively from multi-material `@aura3d/engine` geometry
 * (`art/proceduralActors.ts`, `art/proceduralModels.ts`) with zero `.glb` dependencies.
 */
import { defineModelAssets } from "@aura3d/engine";
import { MESHY_MANIFEST, type PropId } from "./assets/meshy/manifest";

export type CharacterId = "hero" | "soldier" | "brute" | "sage" | "caster" | "scout";

export const CHARACTER_URLS: Readonly<Record<CharacterId, string>> = {
  hero: "/procedural/ninja/hero",
  soldier: "/procedural/ninja/soldier",
  brute: "/procedural/ninja/brute",
  sage: "/procedural/ninja/sage",
  caster: "/procedural/ninja/ninja_runner_port_ninjaCasterAnimR2",
  scout: "/procedural/ninja/ninja_runner_port_ninjaScoutAnimR2"
};

/** Which character model each of the thirteen actor slots clones: 0 hero, 1-3 shadow clones, 4-9 soldiers, 10-11 brutes, 12 sage. */
export const SLOT_MODEL: readonly CharacterId[] = ["hero", "hero", "hero", "hero", "soldier", "soldier", "soldier", "soldier", "soldier", "soldier", "brute", "brute", "sage"];

/**
 * Evening look adds three robed-caster slots (13-15) and three scout slots (16-18) after the thirteen base slots.
 */
export const EVENING_SLOT_MODEL: readonly CharacterId[] = [...SLOT_MODEL, "caster", "caster", "caster", "scout", "scout", "scout"];
/** Attack and death clips of the caster & scout procedural rigs. */
export const MESHY07_ENEMY_CLIPS: Readonly<Partial<Record<CharacterId, { readonly attack: string; readonly death: string }>>> = {
  caster: { attack: "cast", death: "death" },
  scout: { attack: "throw", death: "death" }
};

const LICENSE = "Aura3D procedural multi-material geometry (@aura3d/engine), CC0 / MIT";
const url = (id: PropId): string => `/procedural/ninja/prop/${id}`;
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

const DUSK_LICENSE = "Aura3D procedural multi-material geometry (@aura3d/engine), CC0 / MIT";
const dusk = (file: string, sha256: string) => ({ url: `/procedural/ninja/models/${file}`, sha256 });
export const DUSK_PROP_ASSETS = defineModelAssets({
  houseA: dusk("ninja_houseADusk", "b4c9348054f98be49092dc87749e7326b18cb3132158e6d8f4c058500e9caf80")
}, { license: DUSK_LICENSE, queryParam: null }).refs;
export const DUSK_PROP_SCALE: Readonly<Partial<Record<keyof typeof DUSK_PROP_ASSETS, number>>> = { houseA: 1.9 / 2.0 };
export const DUSK_PROP_KEYS: Readonly<Record<keyof typeof DUSK_PROP_ASSETS, string>> = { houseA: "ninjaHouseADusk" };

const SET_PIECE_LICENSE = "Aura3D procedural multi-material geometry (@aura3d/engine), CC0 / MIT";
const piece = (file: string, sha256: string) => ({ url: `/procedural/ninja/models/${file}`, sha256 });
export const SET_PIECE_ASSETS = defineModelAssets({
  shrineGate: piece("ninja_runner_port_ninjaShrineGate", "680e8045efca4f8c222309b764b255d44ce6e6a498fec90b678d761b98917775"),
  waterWheel: piece("ninja_runner_port_ninjaWaterWheel", "d5339b79bb7474e49de2c77b949889132137e7d0684d6f07d39b69d35552adfe"),
  pagoda: piece("ninja_runner_port_ninjaPagodaSilhouette", "5c44fcd1de5b0a0fa62f45114619ea1ee4d8c321a90f0d8a986145fa9d49a3d3")
}, { license: SET_PIECE_LICENSE, queryParam: null }).refs;
