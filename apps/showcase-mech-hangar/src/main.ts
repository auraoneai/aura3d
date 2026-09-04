/**
 * Mech Hangar -> Arena — route glue.
 *
 * One createAuraApp hosts both sets: the hangar bay (turntable, workshop key +
 * warm practicals) and the floodlit pit. The shared follow camera tracks a single
 * anchor node that each mode positions; part swaps re-mount typed GLB nodes so
 * pixels really change (the anti-skin-swap proof). Evidence publishes to
 * window.__MECH_HANGAR_EVIDENCE__ per the PRD evidence contract.
 *
 * Label: prototype. Root safe API only; combat is route-local; no kit claims.
 */
import {
  characterAssembly,
  camera,
  createAuraApp,
  lights,
  material,
  model,
  primitives,
  scene,
  game,
  text3D,
  type RuntimeNodeHandleLike
} from "@aura3d/engine";
import { AGGRESSION_PRESETS, RIVAL_LOADOUTS, aggregateStats, presetForBout } from "./stats";
import { createHangarAudio, AMBIENT_LOOP_SECONDS, HANGAR_AUDIO_CUES } from "./hangar-audio";
import { createHangarController } from "./hangar";
import {
  setupArenaHud,
  setupHangarHud,
  setArenaVisible,
  setHangarVisible,
  showKoCard,
  hideKoCard,
  updateArenaHud,
  updateHangarHud,
  type ArenaHudHandles,
  type HangarHudHandles
} from "./hud";
import { MECH_SLOTS, PART_OPTIONS, catalogReady, resolvePartAsset, selectedParts, type BuildSelection, type MechSlot } from "./parts-catalog";
import { PART_CURATION_VERDICT } from "./parts-generated";
import { buildMechAssemblyPlan, mountTransformForPart, validationSummary } from "./assembly";
import { createMechBout, type BoutEvent, type BoutInputs, type BoutSnapshot } from "./arena/mech-fight";
// Meshy hero mech: the admitted typed decimated body (root assets map) mounted
// as the visible hero silhouette for both fighters. Hangar staging, the live
// MH-2M swappable assembly, and route-local combat are unchanged.
import { assets as rootAssets } from "../../../src/aura-assets";

declare global {
  interface Window {
    __MECH_HANGAR_EVIDENCE__: MechHangarEvidence | undefined;
  }
}

const AGGRESSION_PRESET_COUNT = AGGRESSION_PRESETS.length;

const reducedMotion = typeof window !== "undefined"
  && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const visualReviewCapture = typeof window !== "undefined"
  && new URLSearchParams(window.location.search).get("capture") === "review";
if (typeof document !== "undefined") document.body.dataset.capture = visualReviewCapture ? "review" : "default";

// ---- world layout -----------------------------------------------------------
/** Hangar set sits at the origin; the pit is offset in -z so mode changes glide. */
const HANGAR_CENTER: readonly [number, number, number] = [0, 0, 0];
const ARENA_CENTER_Z = -34;
const arenaX = (x: number): [number, number, number] => [x, 0, ARENA_CENTER_Z];

// ---- input ------------------------------------------------------------------
const input = game.input({
  actions: {
    left: ["KeyA"],
    right: ["KeyD"],
    jump: ["Space"],
    light: ["KeyJ"],
    heavy: ["KeyK"],
    special: ["KeyL"],
    guard: ["ShiftLeft", "ShiftRight"],
    pause: ["KeyP"]
  },
  bufferMs: 90
});

// Hangar + meta keys ride raw keydown because they are UI, not held sim actions.
const hangarKeys = (code: string) => code === "Enter" || code === "Digit1" || code === "Digit2" || code === "Digit3" || code === "Digit4" || code === "ArrowLeft" || code === "ArrowRight";

// ---- audio ------------------------------------------------------------------
const audio = createHangarAudio();
const unlock = (): void => {
  window.removeEventListener("pointerdown", unlock);
  window.removeEventListener("keydown", unlock);
  void audio.unlock();
};
window.addEventListener("pointerdown", unlock);
window.addEventListener("keydown", unlock);

// ---- mode state -------------------------------------------------------------
let mode: "hangar" | "arena" = "hangar";
let boutIndex = 0;
let lastAmbientAt = -AMBIENT_LOOP_SECONDS;
let elapsed = 0;

// ---- hangar controller ------------------------------------------------------
const hangar = createHangarController(
  audio,
  {
  onSelectionChanged: () => {
    refreshHangarPanel();
    if (mode === "hangar") remountPreview();
  },
    onLockIn: () => {
      enterArena();
    }
  },
  { reducedMotion }
);

// ---- panels -----------------------------------------------------------------
const panelHost = document.getElementById("panel")!;
const hangarHud: HangarHudHandles = setupHangarHud(panelHost, hangar.selection);
const arenaPanel = document.createElement("aside");
arenaPanel.className = "mech-panel mech-arena-panel";
arenaPanel.setAttribute("aria-label", "Mech Hangar arena HUD");
document.body.appendChild(arenaPanel);
const arenaHud: ArenaHudHandles = setupArenaHud(arenaPanel);
setArenaVisible(arenaHud, false);

function currentPlan() {
  return buildMechAssemblyPlan("mechBuild-preview", hangar.selection);
}

function assemblyStatusLine(): string {
  if (!catalogReady) return "MH-2M family curation pending - mount disabled";
  const built = currentPlan();
  if ("error" in built) return "plan error: " + built.error;
  const summary = validationSummary(built.report);
  return summary.ready
    ? "assembly validated - base + " + summary.attachedParts + "/" + Math.max(0, summary.totalParts - 1) + " socketed"
    : "INVALID BUILD (" + summary.errors + " errors)";
}

function currentAssemblyReady(): boolean {
  if (!catalogReady) return false;
  const built = currentPlan();
  return !("error" in built) && built.report.ready;
}

function refreshHangarPanel(): void {
  updateHangarHud(hangarHud, {
    selection: hangar.selection,
    activeSlot: hangar.snapshot().activeSlot,
    stats: aggregateStats(hangar.selection),
    assemblyReady: currentAssemblyReady(),
    assemblyStatusLine: assemblyStatusLine(),
    catalogReady
  });
}

// ---- scene nodes ------------------------------------------------------------
function fitForSlot(slot: MechSlot): { scaleMode: "fit"; targetHeight?: number; targetMaxDimension?: number } {
  // These values are the render-side half of the socket contract in
  // assembly.ts. Keeping them identical to MOUNT_TARGETS is essential: the
  // authored offsets are derived from these fitted bounds, so a smaller
  // render fit makes every attachment appear to float or miss its socket.
  if (slot === "chassis") return { scaleMode: "fit", targetHeight: 1.05 };
  if (slot === "legs") return { scaleMode: "fit", targetHeight: 0.84 };
  if (slot === "arms") return { scaleMode: "fit", targetMaxDimension: 2.18 };
  return { scaleMode: "fit", targetMaxDimension: 0.68 };
}

function partNodeBuilders(side: "player" | "rival"): ReturnType<typeof model>[] {
  const builders: ReturnType<typeof model>[] = [];
  for (const slot of MECH_SLOTS) {
    for (const def of PART_OPTIONS[slot]) {
      const asset = resolvePartAsset(def.assetKey);
      if (!asset) continue;
      builders.push(
        model(asset, {
          name: "mech-" + side + "-" + def.assetKey,
          role: "primaryCharacter",
          castShadow: true,
          receiveShadow: true,
          ...fitForSlot(slot)
        }).position(HANGAR_CENTER[0], -60, HANGAR_CENTER[2]).runtime(game.runtimeNode("mech-" + side + "-" + def.assetKey, {
          tags: ["mech-part", side, slot, "typed-primary-asset"]
        }))
      );
    }
  }
  return builders;
}

// Meshy hero mech (typed assets.mechHeroDecimated): the visible hero body for
// both fighters. The validated MH-2M family stays live as the swappable
// socketed assembly around this body, so part swaps keep moving pixels/stats
// while the dominant silhouette is the coherent admitted hero.
const HERO_FEET_LIFT = 0.953; // -boundsMin.y of the hero asset: feet land on the deck plane.
// The authored family mounts around the fighter root, so a co-located hero
// would be swallowed by the chassis box. Landing the hero just ahead of the
// root (+Z local, yaw-rotated) keeps the hero's back in contact with the
// socketed armor face: one connected machine with the coherent hero torso
// leading and every selected family part visible and swappable around it. The
// earlier 0.55 m step opened a daylight gap that read as two separate robots.
const HERO_FORWARD = 0.32;
function heroNodeBuilders(side: "player" | "rival"): ReturnType<typeof model>[] {
  return [
    model(rootAssets.mechHeroDecimated, {
      name: "mech-hero-" + side,
      role: "primaryCharacter",
      castShadow: true,
      receiveShadow: true
    }).position(HANGAR_CENTER[0], -60 + HERO_FEET_LIFT, HANGAR_CENTER[2]).runtime(game.runtimeNode("mech-hero-" + side, {
      tags: ["mech-hero", side, "typed-primary-asset"]
    }))
  ];
}

const camAnchorBuilder = primitives.sphere({
  name: "mech cam anchor",
  material: material.emissive({ name: "cam anchor mat", color: "#101418", emissive: "#000000", emissiveIntensity: 0 })
}).position(HANGAR_CENTER[0], 1.05, HANGAR_CENTER[2]).scale([0.001, 0.001, 0.001])
  .runtime(game.runtimeNode("mech-cam-anchor", { tags: ["camera-anchor"] }));

const sparkMaterial = material.emissive({ name: "hit spark mat", color: "#ffd27a", emissive: "#ffb454", emissiveIntensity: 2.2 });
const dustMaterial = material.pbr({ name: "pit dust mat", color: "#8b93a1", roughness: 1, metallic: 0 });

const SPARK_COUNT = 12;
const DUST_COUNT = 10;
const sparkBuilders = Array.from({ length: SPARK_COUNT }, (_, index) =>
  primitives.sphere({ name: "spark-" + index, material: sparkMaterial })
    .position(HANGAR_CENTER[0], -70, HANGAR_CENTER[2])
    .runtime(game.runtimeNode("mech-spark-" + index, { tags: ["particle", "renderer-owned"] }))
);
const dustBuilders = Array.from({ length: DUST_COUNT }, (_, index) =>
  primitives.sphere({ name: "dust-" + index, material: dustMaterial })
    .position(HANGAR_CENTER[0], -70, HANGAR_CENTER[2])
    .runtime(game.runtimeNode("mech-dust-" + index, { tags: ["particle", "renderer-owned"] }))
);

// A compact impact-ring pool makes the authored hit point legible at the
// camera distance used by the arena.  The ring is renderer-owned feedback; the
// bout still owns hit windows, damage, and the event that drives this pool.
const impactRingMaterials = [
  material.emissive({ name: "impact ring amber", color: "#ffd27a", emissive: "#ff9d42", emissiveIntensity: 2.35, opacity: 0.92 }),
  material.emissive({ name: "impact ring white", color: "#f5fbff", emissive: "#c8f4ff", emissiveIntensity: 2.1, opacity: 0.9 })
] as const;
const impactRingBuilders = Array.from({ length: 8 }, (_, index) =>
  primitives.torus({ name: "mech-impact-ring-" + index, material: impactRingMaterials[index % impactRingMaterials.length]! })
    .position(HANGAR_CENTER[0], -70, HANGAR_CENTER[2])
    .scale([0.001, 0.001, 0.001])
    .runtime(game.runtimeNode("mech-impact-ring-" + index, { tags: ["particle", "renderer-owned", "impact-feedback"] }))
);

// Team markers are deliberately small and embedded in the authored scene: a
// cyan player base, a coral rival base, and a matching chest chevron. They keep
// the two same-family modular assemblies separable during the arena exchange
// without replacing either typed character asset.
const teamMarkerMaterials = {
  player: material.emissive({ name: "player identity marker", color: "#7de9ff", emissive: "#22c9ff", emissiveIntensity: 1.3, opacity: 0.88 }),
  rival: material.emissive({ name: "rival identity marker", color: "#ff91b6", emissive: "#ff3f79", emissiveIntensity: 1.2, opacity: 0.88 })
} as const;
const teamMarkerBuilders = (["player", "rival"] as const).flatMap((side) => [
  primitives.torus({ name: "mech-" + side + "-identity-ring", material: teamMarkerMaterials[side] })
    .position(HANGAR_CENTER[0], -70, HANGAR_CENTER[2])
    .rotate(Math.PI / 2, 0, 0)
    .scale([0.001, 0.001, 0.001])
    .runtime(game.runtimeNode("mech-" + side + "-identity-ring", { tags: ["team-marker", side, "renderer-owned"] })),
  primitives.box({ name: "mech-" + side + "-identity-chevron", material: teamMarkerMaterials[side] })
    .position(HANGAR_CENTER[0], -70, HANGAR_CENTER[2])
    .scale([0.001, 0.001, 0.001])
    .runtime(game.runtimeNode("mech-" + side + "-identity-chevron", { tags: ["team-marker", side, "renderer-owned"] }))
]);

// One ring per typed weapon option gives each hardpoint a compact, readable
// muzzle signature while the GLB remains the actual mounted weapon.  The
// selected ring follows the same authored +Z-forward yaw as the weapon node.
const weaponAccentMaterials = [
  material.emissive({ name: "weapon accent bolt", color: "#7de9ff", emissive: "#25d6ff", emissiveIntensity: 1.65, opacity: 0.94 }),
  material.emissive({ name: "weapon accent arc", color: "#ffd36e", emissive: "#ff9b3e", emissiveIntensity: 1.55, opacity: 0.94 }),
  material.emissive({ name: "weapon accent plasma", color: "#ff8bcb", emissive: "#ff3e9c", emissiveIntensity: 1.7, opacity: 0.94 }),
  material.emissive({ name: "weapon accent siege", color: "#ffad79", emissive: "#ff653f", emissiveIntensity: 1.6, opacity: 0.94 })
] as const;
const weaponAccentBuilders = (["player", "rival"] as const).flatMap((side) =>
  PART_OPTIONS.weapon.map((def, index) =>
    primitives.torus({ name: "mech-" + side + "-weapon-accent-" + def.assetKey, material: weaponAccentMaterials[index % weaponAccentMaterials.length]! })
      .position(HANGAR_CENTER[0], -70, HANGAR_CENTER[2])
      .scale([0.001, 0.001, 0.001])
      .runtime(game.runtimeNode("mech-" + side + "-weapon-accent-" + def.assetKey, { tags: ["weapon-accent", side, "renderer-owned"] }))
  )
);

// The catalog weapon is a rigid typed hardpoint, so the hand-to-tool contact
// needs a rendered receiver rather than a floating marker.  These collars are
// authored scene geometry (metal sleeve + emissive lock stripe) and are driven
// from the exact `mountTransformForPart` position below.  They are deliberately
// kept separate from the GLB so the family gate can distinguish a real typed
// part from presentation-only contact dressing.
const hardpointCollarMaterials = {
  metal: material.pbr({
    name: "typed hardpoint collar metal",
    color: "#30495d",
    roughness: 0.34,
    metallic: 0.88,
    clearcoat: 0.28,
    clearcoatRoughness: 0.18
  }),
  player: material.emissive({
    name: "typed hardpoint player lock",
    color: "#7de9ff",
    emissive: "#22c9ff",
    emissiveIntensity: 1.5,
    opacity: 0.94
  }),
  rival: material.emissive({
    name: "typed hardpoint rival lock",
    color: "#ff91b6",
    emissive: "#ff3f79",
    emissiveIntensity: 1.35,
    opacity: 0.94
  })
} as const;
const hardpointCollarBuilders = (["player", "rival"] as const).flatMap((side) => [
  primitives.torus({ name: "mech-" + side + "-typed-hardpoint-collar", material: hardpointCollarMaterials.metal })
    .position(HANGAR_CENTER[0], -70, HANGAR_CENTER[2])
    .scale([0.001, 0.001, 0.001])
    .runtime(game.runtimeNode("mech-" + side + "-typed-hardpoint-collar", { tags: ["typed-assembly-contact", "hardpoint", side, "renderer-owned"] })),
  primitives.torus({ name: "mech-" + side + "-typed-hardpoint-lock", material: hardpointCollarMaterials[side] })
    .position(HANGAR_CENTER[0], -70, HANGAR_CENTER[2])
    .scale([0.001, 0.001, 0.001])
    .runtime(game.runtimeNode("mech-" + side + "-typed-hardpoint-lock", { tags: ["typed-assembly-contact", "hardpoint-lock", side, "renderer-owned"] }))
]);

// Two shallow receiver pads make the feet's actual ground contact inspectable
// in both the hangar and arena.  Their y value is fixed to the authored deck
// plane while the x/z positions follow each fighter root, so airborne movement
// cannot leave a stale pad floating with the model.
const footContactMaterial = material.pbr({
  name: "mech foot contact receiver",
  color: "#111f2d",
  roughness: 0.86,
  metallic: 0.5,
  clearcoat: 0.2,
  clearcoatRoughness: 0.32
});
const footContactSealMaterials = {
  player: material.emissive({ name: "player foot contact seal", color: "#7de9ff", emissive: "#22c9ff", emissiveIntensity: 0.95, opacity: 0.86 }),
  rival: material.emissive({ name: "rival foot contact seal", color: "#ff91b6", emissive: "#ff3f79", emissiveIntensity: 0.9, opacity: 0.86 })
} as const;
// A broad soft contact shadow grounds each fighter's whole silhouette on the
// deck. The per-foot receivers above are small inspectable cups; from the
// review distance the mech still read as floating without this dark disc.
const contactShadowMaterial = material.emissive({
  name: "mech contact shadow",
  color: "#05090e",
  emissive: "#000000",
  emissiveIntensity: 0,
  roughness: 1,
  opacity: 0.55
});
const contactShadowBuilders = (["player", "rival"] as const).map((side) =>
  primitives.cylinder({ name: "mech-" + side + "-contact-shadow", material: contactShadowMaterial })
    .position(HANGAR_CENTER[0], 0.115, HANGAR_CENTER[2])
    .scale([1.6, 0.012, 1.6])
    .runtime(game.runtimeNode("mech-" + side + "-contact-shadow", { tags: ["ground-contact-shadow", side, "renderer-owned"] }))
);
const footContactBuilders = (["player", "rival"] as const).flatMap((side) => [
  primitives.cylinder({ name: "mech-" + side + "-left-foot-receiver", material: footContactMaterial })
    .position(HANGAR_CENTER[0], 0.17, HANGAR_CENTER[2])
    .scale([0.24, 0.035, 0.17])
    .runtime(game.runtimeNode("mech-" + side + "-left-foot-receiver", { tags: ["typed-assembly-contact", "ground-receiver", side, "renderer-owned"] })),
  primitives.cylinder({ name: "mech-" + side + "-right-foot-receiver", material: footContactMaterial })
    .position(HANGAR_CENTER[0], 0.17, HANGAR_CENTER[2])
    .scale([0.24, 0.035, 0.17])
    .runtime(game.runtimeNode("mech-" + side + "-right-foot-receiver", { tags: ["typed-assembly-contact", "ground-receiver", side, "renderer-owned"] })),
  primitives.torus({ name: "mech-" + side + "-left-foot-seal", material: footContactSealMaterials[side] })
    .position(HANGAR_CENTER[0], 0.205, HANGAR_CENTER[2])
    .rotate(Math.PI / 2, 0, 0)
    .scale([0.19, 0.13, 0.018])
    .runtime(game.runtimeNode("mech-" + side + "-left-foot-seal", { tags: ["typed-assembly-contact", "ground-seal", side, "renderer-owned"] })),
  primitives.torus({ name: "mech-" + side + "-right-foot-seal", material: footContactSealMaterials[side] })
    .position(HANGAR_CENTER[0], 0.205, HANGAR_CENTER[2])
    .rotate(Math.PI / 2, 0, 0)
    .scale([0.19, 0.13, 0.018])
    .runtime(game.runtimeNode("mech-" + side + "-right-foot-seal", { tags: ["typed-assembly-contact", "ground-seal", side, "renderer-owned"] }))
]);

const turntableBuilder = primitives.cylinder({
  name: "hangar turntable",
  // Lift the deck out of the near-black floor.  The earlier #344c61 surface
  // lost its edge against the contact insert, so the typed feet read as if
  // they were hovering over a hole.  This is still a hard-surface steel
  // treatment; the brighter value simply gives the rim a readable bevel under
  // the cool workshop key.
  material: material.pbr({ name: "turntable steel", color: "#486b83", roughness: 0.44, metallic: 0.58, clearcoat: 0.24, clearcoatRoughness: 0.24 })
}).position(HANGAR_CENTER[0], 0.055, HANGAR_CENTER[2]).scale([2.35, 0.11, 2.35]);

// A separate matte insert gives the feet a readable receiver surface. It is
// authored scene dressing (not a fake DOM shadow) and keeps the black turntable
// from swallowing the contact point under the typed family.
const turntableContactBuilder = primitives.cylinder({
  name: "hangar turntable contact insert",
  // Keep a blue-black value for the receiver, but not absolute black: the
  // earlier insert swallowed the foot seals and made the mech appear to float
  // above a void. A restrained steel blue gives the contact witness a visible
  // boundary while retaining contrast with the cyan ring.
  material: material.pbr({ name: "turntable contact insert", color: "#214863", roughness: 0.72, metallic: 0.16, clearcoat: 0.16, clearcoatRoughness: 0.32 })
}).position(HANGAR_CENTER[0], 0.17, HANGAR_CENTER[2]).scale([1.82, 0.018, 1.82]);

const hangarFloorBuilder = primitives.box({
  name: "hangar floor",
  material: material.pbr({ name: "hangar deck", color: "#20394e", roughness: 0.74, metallic: 0.30, clearcoat: 0.12, clearcoatRoughness: 0.42 })
}).position(HANGAR_CENTER[0], -0.06, HANGAR_CENTER[2]).scale([16, 0.12, 14]);

const hangarBackdropBuilder = primitives.box({
  name: "hangar back wall",
  material: material.pbr({ name: "hangar wall", color: "#13263a", roughness: 0.84, metallic: 0.12, clearcoat: 0.08, clearcoatRoughness: 0.5 })
}).position(HANGAR_CENTER[0], 3.2, HANGAR_CENTER[2] - 6.4).scale([18, 6.6, 0.3]);

const hangarFrameMaterial = material.pbr({ name: "hangar frame steel", color: "#263e55", roughness: 0.52, metallic: 0.62 });
const hangarStripMaterial = material.emissive({ name: "hangar bay strip", color: "#215f7a", emissive: "#61dfff", emissiveIntensity: 0.7, opacity: 0.82 });
const hangarBayBuilders = [-7.2, -3.6, 0, 3.6, 7.2].flatMap((x, index) => [
  primitives.box({ name: `hangar bay pillar ${index}`, material: hangarFrameMaterial })
    .position(x, 2.85, HANGAR_CENTER[2] - 6.02)
    .scale([0.12, 2.85, 0.16]),
  primitives.box({ name: `hangar bay strip ${index}`, material: hangarStripMaterial })
    .position(x + (index % 2 === 0 ? 0.16 : -0.16), 3.05, HANGAR_CENTER[2] - 5.72)
    .scale([0.035, 2.1, 0.025])
]);
const hangarBeamBuilder = primitives.box({ name: "hangar upper beam", material: hangarFrameMaterial })
  .position(HANGAR_CENTER[0], 5.65, HANGAR_CENTER[2] - 5.98)
  .scale([8.7, 0.14, 0.18]);
const hangarBeamLightBuilder = primitives.box({
  name: "hangar upper light",
  material: material.emissive({ name: "hangar upper light material", color: "#1c4c5e", emissive: "#6fdcff", emissiveIntensity: 0.72 })
}).position(HANGAR_CENTER[0], 5.38, HANGAR_CENTER[2] - 5.72).scale([6.8, 0.055, 0.035]);

const hangarBaySignMaterial = material.emissive({
  name: "hangar bay sign material",
  color: "#194b62",
  emissive: "#5fdcff",
  emissiveIntensity: 0.86,
  opacity: 0.92
});
const hangarBaySignBuilders = [
  text3D("BAY 07", {
    name: "hangar bay seven sign",
    size: 0.42,
    depth: 0.05,
    letterSpacing: 0.045,
    material: hangarBaySignMaterial
  // Keep the sign inside the review camera's vertical safe area. The earlier
  // 4.78 m placement put the top of "BAY 07" on the capture edge, which the
  // composition probe correctly classified as foreground clipping.
  }).position(-2.65, 3.92, HANGAR_CENTER[2] - 5.69),
  text3D("AEGIS // ASSEMBLY DECK", {
    name: "hangar assembly deck sign",
    size: 0.24,
    depth: 0.04,
    letterSpacing: 0.03,
    material: hangarBaySignMaterial
  }).position(-2.65, 3.28, HANGAR_CENTER[2] - 5.69)
];
const hangarFloorInsetBuilder = primitives.box({
  name: "hangar floor presentation inset",
  material: material.pbr({ name: "hangar floor presentation steel", color: "#243a50", roughness: 0.74, metallic: 0.30, clearcoat: 0.12, clearcoatRoughness: 0.42 })
}).position(HANGAR_CENTER[0], 0.008, HANGAR_CENTER[2] + 0.35).scale([5.8, 0.02, 4.2]);
const hangarFloorEdgeBuilders = [-1, 1].flatMap((side) => [
  primitives.box({ name: `hangar floor cyan edge ${side}`, material: hangarStripMaterial })
    .position(side * 5.55, 0.035, HANGAR_CENTER[2] + 0.35).scale([0.035, 0.025, 3.8]),
  primitives.box({ name: `hangar floor warm edge ${side}`, material: hangarStripMaterial })
    .position(side * 4.75, 0.035, HANGAR_CENTER[2] - 3.42).scale([0.75, 0.025, 0.028])
]);

const pitFloorBuilder = primitives.box({
  name: "arena armored floor",
  material: material.pbr({ name: "pit floor steel", color: "#182f43", roughness: 0.36, metallic: 0.68, clearcoat: 0.22, clearcoatRoughness: 0.2 })
// The review camera is a three-quarter follow view rather than an orthographic
// top-down shot.  Keep the authored combat envelope centred under that view so
// the active frame reads as an arena instead of ending at the canvas midpoint.
}).position(0, -0.065, ARENA_CENTER_Z).scale([20, 0.13, 14]);

const pitBackdropBuilder = primitives.box({
  name: "arena flood wall",
  material: material.emissive({ name: "pit back wall", color: "#1b4058", emissive: "#176b8f", emissiveIntensity: 0.46 })
}).position(0, 3.5, ARENA_CENTER_Z - 5.3).scale([20.5, 7.1, 0.28]);

const pitPillarMaterial = material.pbr({ name: "pit structural steel", color: "#172d42", roughness: 0.42, metallic: 0.66 });
const pitPillarLight = material.emissive({ name: "pit structural light", color: "#1c5369", emissive: "#47cfff", emissiveIntensity: 0.8 });
const pitStructureBuilders = [-7.2, 0, 7.2].flatMap((x, index) => [
  primitives.box({ name: `pit pillar ${index}`, material: pitPillarMaterial })
    .position(x, 3.1, ARENA_CENTER_Z - 4.85)
    .scale([0.55, 3.1, 0.45]),
  primitives.box({ name: `pit pillar light ${index}`, material: pitPillarLight })
    .position(x, 4.15, ARENA_CENTER_Z - 4.52)
    .scale([0.22, 0.08, 0.05])
]);

const pitDeckPanelMaterial = material.pbr({
  name: "pit deck panel finish",
  color: "#203b50",
  roughness: 0.42,
  metallic: 0.72,
  clearcoat: 0.2,
  clearcoatRoughness: 0.24
});
const pitDeckSeamMaterial = material.emissive({
  name: "pit deck seam light",
  color: "#164e63",
  emissive: "#38d6ff",
  emissiveIntensity: 0.7,
  opacity: 0.82
});
const pitDeckBuilders = Array.from({ length: 10 }, (_, index) => {
  const side = index % 2 === 0 ? -1 : 1;
  const depth = Math.floor(index / 2);
  const z = ARENA_CENTER_Z - 6.5 + depth * 1.45;
  const x = side * (2.6 + (depth % 2) * 0.38);
  return [
    primitives.box({ name: `pit deck plate ${index}`, material: pitDeckPanelMaterial })
      .position(x, 0.075, z)
      .rotate(0, 0, side * 0.04)
      .scale([1.22, 0.035, 0.58]),
    primitives.box({ name: `pit deck seam ${index}`, material: pitDeckSeamMaterial })
      .position(x, 0.12, z - 0.02)
      .scale([0.95, 0.012, 0.018])
  ];
}).flat();

// The overhead frame is a major depth cue in the arena capture. Keep it dark
// enough to sit behind the fighters, but lift it out of absolute black so the
// clipped-at-the-edge beams read as painted steel instead of missing geometry.
const pitTrussMaterial = material.pbr({ name: "pit overhead truss", color: "#234c66", roughness: 0.42, metallic: 0.58, clearcoat: 0.18, clearcoatRoughness: 0.3 });
const pitTrussLight = material.emissive({ name: "pit overhead light band", color: "#174b63", emissive: "#5ee7ff", emissiveIntensity: 1.25 });
const pitTrussBuilders = [
  primitives.box({ name: "pit overhead truss beam", material: pitTrussMaterial })
    .position(0, 6.15, ARENA_CENTER_Z - 3.9)
    .scale([8.8, 0.24, 0.22]),
  primitives.box({ name: "pit overhead light band", material: pitTrussLight })
    .position(0, 5.76, ARENA_CENTER_Z - 3.55)
    .scale([6.9, 0.06, 0.05]),
  primitives.box({ name: "pit overhead magenta band", material: material.emissive({ name: "pit overhead magenta light", color: "#7e225f", emissive: "#f472b6", emissiveIntensity: 1.05 }) })
    .position(0, 5.62, ARENA_CENTER_Z - 3.68)
    .scale([4.8, 0.045, 0.04])
];

const pitMarkingMaterial = material.emissive({ name: "pit lane marks", color: "#23455c", emissive: "#4cc9e8", emissiveIntensity: 0.42 });
const pitMarkingBuilders = [-3.6, -1.8, 0, 1.8, 3.6].map((x, index) =>
  primitives.box({ name: "pit lane mark " + index, material: pitMarkingMaterial })
    .position(x, 0.012, ARENA_CENTER_Z)
    .scale([0.035, 0.024, 7.6])
);

const rimMaterial = material.emissive({ name: "pit rim mat", color: "#2a4a63", emissive: "#59d7ff", emissiveIntensity: 1.1 });
const rimBuilders = [-1, 1].map((side) =>
  primitives.box({ name: "pit rim " + (side < 0 ? "west" : "east"), material: rimMaterial })
    .position(side * 4.85, 0.09, ARENA_CENTER_Z)
    .scale([0.7, 0.18, 9])
);

// A shallow combat ring and warning chevrons give the arena a purposeful
// footprint beneath the assembled typed fighters. These are set dressing only;
// bout spacing and hit tests remain owned by the route-local combat sim.
const arenaRingMaterial = material.emissive({ name: "arena combat ring", color: "#15364a", emissive: "#65e6ff", emissiveIntensity: 0.72, opacity: 0.9 });
const arenaRingBuilders = [
  primitives.torus({ name: "arena outer combat ring", material: arenaRingMaterial })
    .position(0, 0.025, ARENA_CENTER_Z)
    .rotate(Math.PI / 2, 0, 0)
    .scale([4.35, 4.35, 0.035]),
  primitives.torus({ name: "arena inner combat ring", material: arenaRingMaterial })
    .position(0, 0.028, ARENA_CENTER_Z)
    .rotate(Math.PI / 2, 0, 0)
    .scale([2.55, 2.55, 0.022])
];
const arenaWarningMaterial = material.emissive({ name: "arena warning stripes", color: "#4a2619", emissive: "#ff9055", emissiveIntensity: 0.5, opacity: 0.86 });
const arenaWarningBuilders = [-3.9, 3.9].flatMap((x, side) =>
  [-1.8, 0, 1.8].map((z, index) =>
    primitives.box({ name: `arena warning ${side}-${index}`, material: arenaWarningMaterial })
      .position(x, 0.035, ARENA_CENTER_Z + z)
      .rotate(0, 0, side === 0 ? -0.35 : 0.35)
      .scale([0.06, 0.03, 0.54])
  )
);

// Break the otherwise empty pit into a readable combat set. These center
// plates, back-wall ribs, and suspended light panels are renderer-owned
// dressing only; fighter positions, hit windows, and arena bounds remain
// owned by the route-local bout simulation.
const pitFloorInlay = material.pbr({
  name: "pit center inlay",
  color: "#274761",
  roughness: 0.28,
  metallic: 0.78,
  clearcoat: 0.3,
  clearcoatRoughness: 0.16
});
const pitFloorGlow = material.emissive({
  name: "pit center glow seam",
  color: "#2d8ca8",
  emissive: "#54e7ff",
  emissiveIntensity: 0.64,
  opacity: 0.86
});
const pitCenterPlateBuilders = Array.from({ length: 12 }, (_, index) => {
  const row = Math.floor(index / 4);
  const column = index % 4;
  const x = -3.15 + column * 2.1;
  const z = ARENA_CENTER_Z - 2.25 + row * 2.25;
  return [
    primitives.box({ name: `pit center armor plate ${index}`, material: pitFloorInlay })
      .position(x, 0.035, z)
      .scale([0.92, 0.025, 0.92]),
    primitives.box({ name: `pit center armor seam ${index}`, material: pitFloorGlow })
      .position(x, 0.074, z - 0.86)
      .scale([0.58, 0.012, 0.018])
  ];
}).flat();

const pitBackPanelBuilders = Array.from({ length: 7 }, (_, index) => {
  const x = -8.4 + index * 2.8;
  const tint = index % 3 === 0 ? "#ff5f86" : index % 2 === 0 ? "#58e5ff" : "#8f7dff";
  return [
    primitives.box({
      name: `pit back wall panel ${index}`,
      material: material.pbr({ name: `pit back wall panel material ${index}`, color: index % 2 === 0 ? "#1c2d45" : "#17253b", roughness: 0.54, metallic: 0.48 })
    }).position(x, 3.0 + (index % 2) * 0.22, ARENA_CENTER_Z - 4.76).scale([1.1, 2.35, 0.08]),
    primitives.box({
      name: `pit back wall light ${index}`,
      material: material.emissive({ name: `pit back wall light material ${index}`, color: tint, emissive: tint, emissiveIntensity: 0.88 })
    }).position(x, 4.8 + (index % 2) * 0.18, ARENA_CENTER_Z - 4.62).scale([0.72, 0.08, 0.045])
  ];
}).flat();

const pitSuspendedLightBuilders = [-5.6, 0, 5.6].flatMap((x, index) => [
  primitives.box({ name: `pit suspended light rail ${index}`, material: pitTrussLight })
    .position(x, 5.15, ARENA_CENTER_Z + 0.8)
    .scale([1.55, 0.06, 0.08]),
  primitives.box({ name: `pit suspended light drop ${index}`, material: material.emissive({ name: `pit suspended drop material ${index}`, color: index % 2 === 0 ? "#ff638c" : "#65e6ff", emissive: index % 2 === 0 ? "#ff638c" : "#65e6ff", emissiveIntensity: 0.96 }) })
    .position(x, 4.56, ARENA_CENTER_Z + 0.8)
    .scale([0.08, 0.54, 0.05])
]);

const pitSignMaterial = material.emissive({
  name: "pit wayfinding sign",
  color: "#102b42",
  emissive: "#8aeaff",
  emissiveIntensity: 0.92,
  opacity: 0.9
});
const pitSignBuilders = [
  text3D("MECH PIT", {
    name: "pit sign mech pit",
    size: 0.46,
    depth: 0.05,
    letterSpacing: 0.03,
    material: pitSignMaterial
  }).position(-3.05, 5.15, ARENA_CENTER_Z - 4.46),
  text3D("ROUND 01", {
    name: "pit sign round",
    size: 0.22,
    depth: 0.03,
    letterSpacing: 0.025,
    material: material.emissive({ name: "pit round sign", color: "#401b2b", emissive: "#ff8aa8", emissiveIntensity: 0.72 })
  }).position(2.7, 5.08, ARENA_CENTER_Z - 4.45),
  text3D("MH-2M // LIVE TEST", {
    name: "pit sign mh2m live test",
    size: 0.18,
    depth: 0.03,
    letterSpacing: 0.022,
    material: material.emissive({ name: "pit mh2m sign", color: "#163c54", emissive: "#61dcff", emissiveIntensity: 0.82 })
  }).position(-0.78, 4.58, ARENA_CENTER_Z - 4.45)
];
const app = createAuraApp("#app", {
  diagnostics: { overlay: false, performancePanel: false },
  renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" },
  scene: scene()
    .background("#081522")
    .addMany([
      // Hangar lighting: cool workshop key + warm practicals (PRD section 6).
      lights.directional({ name: "workshop cool key", position: [4.2, 5.4, 3.2], intensity: 1.55, color: "#d7ebff" }),
      lights.point({ name: "warm practical left", position: [-2.6, 2.3, 1.9], intensity: 3.65, color: "#ffb454" }),
      lights.point({ name: "warm practical right", position: [2.7, 2.1, -1.4], intensity: 3.05, color: "#ff9a3d" }),
      lights.point({ name: "workshop frontal fill", position: [-2.9, 3.2, 3.4], intensity: 3.75, color: "#a9e1ff" }),
      lights.ambient({ name: "global fill", intensity: 1.22, color: "#89a9c4" }),
      // Arena floodlights over the pit.
      lights.directional({ name: "floodlight north", position: [0, 7.4, ARENA_CENTER_Z - 3.4], intensity: visualReviewCapture ? 2.05 : 2.65, color: "#eaf4ff" }),
      lights.directional({ name: "floodlight south", position: [2.4, 6.4, ARENA_CENTER_Z + 3.6], intensity: visualReviewCapture ? 1.6 : 2.05, color: "#cfe2ff" }),
      lights.point({ name: "arena front key", position: [0, 4.2, ARENA_CENTER_Z + 6.5], intensity: visualReviewCapture ? 3.35 : 5.1, color: "#d8ecff" }),
      lights.point({ name: "arena blue rim", position: [-4.8, 2.5, ARENA_CENTER_Z - 3.8], intensity: 3.35, color: "#47cfff" }),
      lights.point({ name: "arena warm rim", position: [4.8, 2.2, ARENA_CENTER_Z - 1.8], intensity: 3.0, color: "#ff7a5c" }),
      turntableBuilder,
      turntableContactBuilder,
      hangarFloorBuilder,
      hangarFloorInsetBuilder,
      ...hangarFloorEdgeBuilders,
      hangarBackdropBuilder,
      ...hangarBayBuilders,
      hangarBeamBuilder,
      hangarBeamLightBuilder,
      ...hangarBaySignBuilders,
      pitFloorBuilder,
      pitBackdropBuilder,
      camAnchorBuilder
    ])
    .addMany([
      ...pitMarkingBuilders,
      ...rimBuilders,
      ...pitStructureBuilders,
      ...pitDeckBuilders,
      ...pitTrussBuilders,
      ...arenaRingBuilders,
      ...arenaWarningBuilders,
      ...pitCenterPlateBuilders,
      ...pitBackPanelBuilders,
      ...pitSuspendedLightBuilders,
      ...pitSignBuilders,
      ...sparkBuilders,
      ...dustBuilders,
      ...impactRingBuilders,
      ...teamMarkerBuilders,
      ...weaponAccentBuilders,
      ...heroNodeBuilders("player"),
      ...heroNodeBuilders("rival"),
      ...hardpointCollarBuilders,
      ...contactShadowBuilders,
      ...footContactBuilders,
      ...partNodeBuilders("player"),
      ...partNodeBuilders("rival")
    ])
    .camera(camera.follow({
      targetNode: "mech-cam-anchor",
      distance: visualReviewCapture ? 5.55 : 6.55,
      // target-yaw rotates the offset by the anchor's yaw, so spinning the anchor
      // orbits the camera around the framed point while still looking at it.
      offsetMode: "target-yaw",
      // Explicit offset owns follow-camera distance. Keep the full ±4.2m pit
      // and both 1.7m fighters inside the frame while retaining a readable
      // three-quarter arena view; the wider combat framing prevents a close
      // strike from cropping one silhouette out of the review frame.
      offset: visualReviewCapture ? [0, 1.82, 4.62] : [0, 1.66, 5.28],
      fov: visualReviewCapture ? 52 : (reducedMotion ? 53 : 54),
      // Exact review captures must frame the current exchange, not the camera
      // anchor's prior location. Runtime play keeps the eased chase motion.
      smoothing: visualReviewCapture ? 0 : 0.16
    }))
});

// ---- runtime handles --------------------------------------------------------
await app.ready();
const anchor = app.nodes.require("mech-cam-anchor") as RuntimeNodeHandleLike;
const playerNodes = new Map<string, RuntimeNodeHandleLike>();
const rivalNodes = new Map<string, RuntimeNodeHandleLike>();
for (const slot of MECH_SLOTS) {
  for (const def of PART_OPTIONS[slot]) {
    const playerHandle = app.nodes.get("mech-player-" + def.assetKey);
    if (playerHandle) playerNodes.set(def.assetKey, playerHandle as RuntimeNodeHandleLike);
    const rivalHandle = app.nodes.get("mech-rival-" + def.assetKey);
    if (rivalHandle) rivalNodes.set(def.assetKey, rivalHandle as RuntimeNodeHandleLike);
  }
}
const sparkNodes = sparkBuilders.map((_, index) => app.nodes.require("mech-spark-" + index) as RuntimeNodeHandleLike);
const dustNodes = dustBuilders.map((_, index) => app.nodes.require("mech-dust-" + index) as RuntimeNodeHandleLike);
const impactRingNodes = impactRingBuilders.map((_, index) => app.nodes.require("mech-impact-ring-" + index) as RuntimeNodeHandleLike);
const teamMarkerNodes = new Map<"player" | "rival", { ring: RuntimeNodeHandleLike; chevron: RuntimeNodeHandleLike }>(
  (["player", "rival"] as const).map((side) => [side, {
    ring: app.nodes.require("mech-" + side + "-identity-ring") as RuntimeNodeHandleLike,
    chevron: app.nodes.require("mech-" + side + "-identity-chevron") as RuntimeNodeHandleLike
  }])
);
const heroNodes = new Map<"player" | "rival", RuntimeNodeHandleLike>(
  (["player", "rival"] as const).map((side) => [side, app.nodes.require("mech-hero-" + side) as RuntimeNodeHandleLike])
);
const weaponAccentNodes = new Map<string, RuntimeNodeHandleLike>();
for (const side of ["player", "rival"] as const) {
  for (const def of PART_OPTIONS.weapon) {
    weaponAccentNodes.set(side + ":" + def.assetKey, app.nodes.require("mech-" + side + "-weapon-accent-" + def.assetKey) as RuntimeNodeHandleLike);
  }
}
const hardpointCollarNodes = new Map<"player" | "rival", { metal: RuntimeNodeHandleLike; lock: RuntimeNodeHandleLike }>(
  (["player", "rival"] as const).map((side) => [side, {
    metal: app.nodes.require("mech-" + side + "-typed-hardpoint-collar") as RuntimeNodeHandleLike,
    lock: app.nodes.require("mech-" + side + "-typed-hardpoint-lock") as RuntimeNodeHandleLike
  }])
);
const footContactNodes = new Map<"player" | "rival", {
  leftReceiver: RuntimeNodeHandleLike;
  rightReceiver: RuntimeNodeHandleLike;
  leftSeal: RuntimeNodeHandleLike;
  rightSeal: RuntimeNodeHandleLike;
}>(
  (["player", "rival"] as const).map((side) => [side, {
    leftReceiver: app.nodes.require("mech-" + side + "-left-foot-receiver") as RuntimeNodeHandleLike,
    rightReceiver: app.nodes.require("mech-" + side + "-right-foot-receiver") as RuntimeNodeHandleLike,
    leftSeal: app.nodes.require("mech-" + side + "-left-foot-seal") as RuntimeNodeHandleLike,
    rightSeal: app.nodes.require("mech-" + side + "-right-foot-seal") as RuntimeNodeHandleLike
  }])
);
const contactShadowNodes = new Map<"player" | "rival", RuntimeNodeHandleLike>(
  (["player", "rival"] as const).map((side) => [side, app.nodes.require("mech-" + side + "-contact-shadow") as RuntimeNodeHandleLike])
);

// The route-primary visual probe isolates the same typed modular assembly that
// human reviewers see. Keep suppression state in the route so the regular mount
// pass cannot immediately re-show the subject during the two-frame comparison.
let compositionSubjectSuppressed = false;

const { createMechHangarFeel } = await import("./arena/feel");
const feel = createMechHangarFeel({ reducedMotion, arenaZ: ARENA_CENTER_Z, sparkNodes, dustNodes, impactNodes: impactRingNodes });

// ---- mounting ---------------------------------------------------------------
function mountSide(
  side: "player" | "rival",
  selection: BuildSelection,
  rootPosition: readonly [number, number, number],
  yaw: number,
  nodes: Map<string, RuntimeNodeHandleLike>,
  // Hangar-only display spread: pushes the swappable family shell backward
  // along facing so the Meshy hero stands clear ahead of it instead of
  // fusing into one kitbash read. Arena calls keep 0 (combat truth).
  familyBack = 0
): void {
  const parts = selectedParts(selection);
  const familyBackX = Math.sin(yaw) * familyBack;
  const familyBackZ = Math.cos(yaw) * familyBack;
  for (const slot of MECH_SLOTS) {
    for (const def of PART_OPTIONS[slot]) {
      const handle = nodes.get(def.assetKey);
      if (!handle) continue;
      const mounted = parts.some((entry) => entry.assetKey === def.assetKey);
      if (!mounted) {
        handle.setVisible(false);
        continue;
      }
      // Every selected slot is a visible typed GLB. The same transform drives
      // the hangar preview, arena fighters, and swap captures, so the default
      // and every valid option prove a connected modular assembly rather than a
      // whole-body fallback with cosmetic overlays.
      if (compositionSubjectSuppressed) {
        handle.setVisible(false);
        continue;
      }
      const t = mountTransformForPart(def, parts, rootPosition, yaw);
      handle.setVisible(true);
      handle.setPosition(t.position[0] - familyBackX, t.position[1], t.position[2] - familyBackZ);
      handle.setRotation(0, t.yaw, 0);
    }
  }

  // Presentation-only identity accents are kept in the same mount pass as the
  // typed family and hardpoint. They follow the fighter root, so movement,
  // jumps, and the hangar turntable cannot leave a stale marker behind.
  const marker = teamMarkerNodes.get(side);
  if (marker) {
    const markerRadius = side === "player" ? 0.84 : 0.78;
    // Subject-isolation captures must hide every presentation cue alongside
    // the family; otherwise a tiny marker becomes the measured "hero".
    marker.ring.setVisible(!compositionSubjectSuppressed);
    marker.ring.setPosition(rootPosition[0], 0.21, rootPosition[2]);
    marker.ring.setRotation(Math.PI / 2, 0, 0);
    marker.ring.setScale([markerRadius, markerRadius, 0.032]);
    marker.chevron.setVisible(!compositionSubjectSuppressed);
    // Keep the badge on the chest plane rather than floating above the head;
    // the silhouette stays dominant while the color key remains visible. The
    // Meshy hero chest now leads the family core, so the badge rides ahead of
    // the hero torso instead of sinking into it.
    const chevronFront = 0.76;
    marker.chevron.setPosition(
      rootPosition[0] + Math.sin(yaw) * chevronFront,
      rootPosition[1] + 1.56,
      rootPosition[2] + Math.cos(yaw) * chevronFront
    );
    marker.chevron.setRotation(0, yaw, Math.PI / 4);
    marker.chevron.setScale([0.115, 0.115, 0.032]);
  }

  // The Meshy hero body is the fighter's coherent silhouette; the typed family
  // above stays the live swappable assembly around it. The hero follows the
  // fighter root (turntable yaw in the hangar, facing yaw in the arena) with
  // feet on the deck plane, and hides with the subject for isolation evidence.
  const hero = heroNodes.get(side);
  if (hero) {
    if (compositionSubjectSuppressed) {
      hero.setVisible(false);
    } else {
      hero.setVisible(true);
      hero.setPosition(
        rootPosition[0] + Math.sin(yaw) * HERO_FORWARD,
        rootPosition[1] + HERO_FEET_LIFT,
        rootPosition[2] + Math.cos(yaw) * HERO_FORWARD
      );
      hero.setRotation(0, yaw, 0);
    }
  }

  const selectedWeapon = parts.find((part) => part.slot === "weapon");
  for (const weaponDef of PART_OPTIONS.weapon) {
    const accent = weaponAccentNodes.get(side + ":" + weaponDef.assetKey);
    if (!accent) continue;
    const active = !compositionSubjectSuppressed && selectedWeapon?.assetKey === weaponDef.assetKey;
    accent.setVisible(active);
    if (!active) {
      accent.setScale([0.001, 0.001, 0.001]);
      continue;
    }
    const weaponTransform = mountTransformForPart(weaponDef, parts, [rootPosition[0] - familyBackX, rootPosition[1], rootPosition[2] - familyBackZ], yaw);
    // Catalog weapons are +Z-forward and part-centred.  A 0.30 m forward
    // offset lands this compact muzzle halo just beyond the fitted 0.68 m
    // hardpoint, making the attachment read as a held tool rather than a pink
    // rod floating through the torso.
    const muzzleOffset = 0.3;
    accent.setPosition(
      weaponTransform.position[0] + Math.sin(yaw) * muzzleOffset,
      weaponTransform.position[1] + 0.03,
      weaponTransform.position[2] + Math.cos(yaw) * muzzleOffset
    );
    // Face the review camera (rather than the weapon axis) so the ring remains
    // a readable circular cue for both opposing yaw directions.
    accent.setRotation(0, 0, 0);
    accent.setScale([0.105, 0.105, 0.028]);
  }

  // Mount-surface evidence follows the same typed transform as the selected
  // weapon.  The metal collar sits at the rear/grip side of the part while the
  // coloured lock ring sits just ahead of it; together they read as a hand,
  // receiver, and muzzle chain instead of a disconnected pink line.
  const hardpoint = hardpointCollarNodes.get(side);
  if (hardpoint) {
    const selectedWeaponTransform = selectedWeapon
      ? mountTransformForPart(selectedWeapon, parts, [rootPosition[0] - familyBackX, rootPosition[1], rootPosition[2] - familyBackZ], yaw)
      : undefined;
    const visible = Boolean(selectedWeaponTransform) && !compositionSubjectSuppressed;
    hardpoint.metal.setVisible(visible);
    hardpoint.lock.setVisible(visible);
    if (selectedWeaponTransform) {
      const forwardX = Math.sin(selectedWeaponTransform.yaw);
      const forwardZ = Math.cos(selectedWeaponTransform.yaw);
      const collarOffset = -0.18;
      hardpoint.metal.setPosition(
        selectedWeaponTransform.position[0] + forwardX * collarOffset,
        selectedWeaponTransform.position[1],
        selectedWeaponTransform.position[2] + forwardZ * collarOffset
      );
      hardpoint.metal.setRotation(0, selectedWeaponTransform.yaw, 0);
      hardpoint.metal.setScale([0.14, 0.14, 0.055]);
      hardpoint.lock.setPosition(
        selectedWeaponTransform.position[0] + forwardX * 0.19,
        selectedWeaponTransform.position[1] + 0.01,
        selectedWeaponTransform.position[2] + forwardZ * 0.19
      );
      hardpoint.lock.setRotation(0, selectedWeaponTransform.yaw, 0);
      hardpoint.lock.setScale([0.10, 0.10, 0.024]);
    } else {
      hardpoint.metal.setScale([0.001, 0.001, 0.001]);
      hardpoint.lock.setScale([0.001, 0.001, 0.001]);
    }
  }

  // Keep the receiver pads on the physical deck while tracking each fighter's
  // x/z root.  A fixed deck y is intentional: airborne combat does not make a
  // floating shadow/pad claim, and the pad remains an inspectable ground contact
  // witness for the grounded state.
  const contacts = footContactNodes.get(side);
  if (contacts) {
    const footOffsets = [-0.43, 0.43] as const;
    const footHandles = [
      [contacts.leftReceiver, contacts.leftSeal],
      [contacts.rightReceiver, contacts.rightSeal]
    ] as const;
    for (const [index, offset] of footOffsets.entries()) {
      const localZ = 0.02;
      const x = rootPosition[0] + offset * Math.cos(yaw) + localZ * Math.sin(yaw);
      const z = rootPosition[2] - offset * Math.sin(yaw) + localZ * Math.cos(yaw);
      const [receiver, seal] = footHandles[index]!;
      const visible = !compositionSubjectSuppressed;
      receiver.setVisible(visible);
      seal.setVisible(visible);
      receiver.setPosition(x, 0.16, z);
      seal.setPosition(x, 0.205, z);
      receiver.setRotation(0, yaw, 0);
      seal.setRotation(Math.PI / 2, yaw, 0);
      receiver.setScale([0.24, 0.035, 0.17]);
      seal.setScale([0.19, 0.13, 0.018]);
    }
  }
  // The contact shadow tracks the fighter root on the deck plane like the
  // receivers, and hides with the subject for isolation evidence.
  const shadow = contactShadowNodes.get(side);
  if (shadow) {
    const visible = !compositionSubjectSuppressed;
    shadow.setVisible(visible);
    shadow.setPosition(rootPosition[0], 0.115, rootPosition[2]);
    shadow.setScale([1.6, 0.012, 1.6]);
  }
}

function concealRivalHangarContacts(): void {
  // Rival nodes are never mounted in hangar mode, but the foot receivers,
  // seals, and contact shadow park at the podium (not underground like the
  // parts/accents). Without an explicit hide, the rival's pink foot seals and
  // dark receiver discs sit at the turntable centre through every hangar
  // capture. The bout remount shows them again via mountSide, so this only
  // applies to the hangar presentation.
  const contacts = footContactNodes.get("rival");
  if (contacts) {
    for (const handle of [contacts.leftReceiver, contacts.rightReceiver, contacts.leftSeal, contacts.rightSeal]) {
      handle.setVisible(false);
      handle.setScale([0.001, 0.001, 0.001]);
    }
  }
  const shadow = contactShadowNodes.get("rival");
  if (shadow) {
    shadow.setVisible(false);
    shadow.setScale([0.001, 0.001, 0.001]);
  }
}

function remountPreview(): void {
  if (mode !== "hangar") return;
  mountSide("player", hangar.selection, HANGAR_CENTER, hangar.snapshot().turntableYaw, playerNodes);
  concealRivalHangarContacts();
}

// ---- bout wiring ------------------------------------------------------------
/**
 * The rival build is a FIXED loadout across the session (PRD section 5 keeps
 * rival loadouts fixed for balance); rematches cycle only the aggression preset.
 */
const RIVAL_FIXED_LOADOUT = RIVAL_LOADOUTS[1]!;

let bout: ReturnType<typeof createMechBout> | null = null;
let paused = false;
let walkCueCooldown = 0;

function enterArena(): void {
  if (!catalogReady || !currentAssemblyReady()) {
    // Validation refused the lock-in; stay in the hangar and say so.
    hangar.unlockForRematchEdit();
    refreshHangarPanel();
    return;
  }
  mode = "arena";
  paused = false;
  // The arena HUD is a full-width review surface.  Collapse the hangar's
  // side-column layout while it is active so the follow camera has the whole
  // viewport for the typed fighters and pit instead of rendering into a
  // 3/4-width canvas beside an empty panel column.
  panelHost.parentElement?.classList.add("is-arena");
  setHangarVisible(hangarHud, false);
  setArenaVisible(arenaHud, true);
  startBout();
}

function startBout(): void {
  const presetIndex = boutIndex % AGGRESSION_PRESET_COUNT;
  bout = createMechBout({
    playerSelection: hangar.selection,
    rivalSelection: RIVAL_FIXED_LOADOUT.selection,
    presetIndex,
    seed: 20260821 + boutIndex * 7919
  });
  hideKoCard(arenaHud);
  mountSide("player", hangar.selection, arenaX(-1.9), Math.PI / 2, playerNodes);
  mountSide("rival", RIVAL_FIXED_LOADOUT.selection, arenaX(1.9), -Math.PI / 2, rivalNodes);
}

function leaveToHangar(): void {
  mode = "hangar";
  paused = false;
  bout = null;
  panelHost.parentElement?.classList.remove("is-arena");
  hangar.unlockForRematchEdit();
  setArenaVisible(arenaHud, false);
  setHangarVisible(hangarHud, true);
  for (const handle of rivalNodes.values()) handle.setVisible(false);
  remountPreview();
  refreshHangarPanel();
}

function playerInputsFromActions(): BoutInputs {
  return {
    moveX: (input.held("right") ? 1 : 0) - (input.held("left") ? 1 : 0),
    jump: input.buffered("jump"),
    light: input.buffered("light"),
    heavy: input.buffered("heavy"),
    special: input.buffered("special"),
    guard: input.held("guard")
  };
}

// ---- touch controls ---------------------------------------------------------
function bindTouchButton(id: string, down: () => void, up: () => void): void {
  const button = document.querySelector("[data-touch='" + id + "']");
  if (!button) return;
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    down();
  });
  button.addEventListener("pointerup", up);
  button.addEventListener("pointerleave", up);
}

function ensureTouchControls(): void {
  if (document.getElementById("mech-touch")) return;
  const host = document.createElement("div");
  host.id = "mech-touch";
  const makeZone = (zoneClass: string, buttons: readonly { touch: string; label: string; glyph: string }[]) => {
    const zone = document.createElement("div");
    zone.className = "mech-touch-zone " + zoneClass;
    for (const spec of buttons) {
      const button = document.createElement("button");
      button.dataset.touch = spec.touch;
      button.setAttribute("aria-label", spec.label);
      button.textContent = spec.glyph;
      zone.appendChild(button);
    }
    return zone;
  };
  host.appendChild(makeZone("is-left", [
    { touch: "left", label: "move left", glyph: "\u2190" },
    { touch: "guard", label: "guard", glyph: "G" },
    { touch: "right", label: "move right", glyph: "\u2192" }
  ]));
  host.appendChild(makeZone("is-right", [
    { touch: "light", label: "light strike", glyph: "J" },
    { touch: "heavy", label: "heavy strike", glyph: "K" },
    { touch: "special", label: "special", glyph: "L" },
    { touch: "jump", label: "jump-thrust", glyph: "\u2191" }
  ]));
  document.body.appendChild(host);
  const press = (action: string) => () => input.setAction(action, true);
  const release = (action: string) => () => input.setAction(action, false);
  bindTouchButton("left", press("left"), release("left"));
  bindTouchButton("right", press("right"), release("right"));
  bindTouchButton("guard", press("guard"), release("guard"));
  bindTouchButton("light", press("light"), release("light"));
  bindTouchButton("heavy", press("heavy"), release("heavy"));
  bindTouchButton("special", press("special"), release("special"));
  bindTouchButton("jump", press("jump"), release("jump"));
}
ensureTouchControls();

// ---- keys -------------------------------------------------------------------
window.addEventListener("keydown", (event) => {
  if (mode === "hangar") {
    if (hangarKeys(event.code)) {
      if (hangar.handleKeyDown(event.code)) refreshHangarPanel();
    }
    return;
  }
  // KeyP belongs exclusively to game.input. Handling it here as well would
  // toggle pause twice in one key press (raw keydown, then buffered action).
  if (event.code === "KeyR" && bout && (bout.snapshot().phase === "ko" || bout.snapshot().phase === "lost")) {
    boutIndex += 1;
    startBout();
    return;
  }
  if (event.code === "Backspace") {
    leaveToHangar();
  }
});

// ---- route metadata ---------------------------------------------------------
/** Authored key bindings surfaced in evidence and README (PRD section 4). */
const ROUTE_CONTROLS = {
  hangar: { selectSlot: ["Digit1", "Digit2", "Digit3", "Digit4"], cyclePart: ["ArrowLeft", "ArrowRight"], lockBuild: ["Enter"], orbitPreview: ["pointer drag"] },
  arena: { move: ["KeyA", "KeyD"], jumpThrust: ["Space"], lightStrike: ["KeyJ"], heavyStrike: ["KeyK"], special: ["KeyL"], guard: ["ShiftLeft", "ShiftRight"], pause: ["KeyP"], rematch: ["KeyR"], backToHangar: ["Backspace"] },
  touch: "dual-zone buttons mirroring arena keys"
} as const;

/** Route-local systems inventory (no kit claims; each is glue in this app). */
const ROUTE_SYSTEMS = {
  assembly: "characterAssembly plan -> validateCharacterAssemblyPlan -> typed part node mounting",
  combat: "route-local fixed-step bout rules (windows, guard break, power, KO)",
  rival: "createCombatAi with rematch aggression presets (keep-away/balanced/rushdown)",
  feel: "renderer-owned spark/dust/impact-ring pools + player/rival identity markers + follow-camera punch",
  audio: "createGameAudio 4-bus mixer over CLI-registered synthesized cues",
  curation: "deterministic in-repo MH-2M family gate (16 original CC0 parts, explicit sockets/metre scale)"
} as const;

/** Claim boundary: what this route may and may not claim (docs/agents labels). */
const CLAIM_BOUNDARY = {
  label: "prototype",
  renderer: "createAuraApp root safe API",
  allowed: [
    "typed provenance-tracked part swapping changes rendered pixels and stats",
    "route-local mech combat vs createCombatAi rival",
    "validated characterAssembly plans gate lock-in"
  ],
  notAllowed: [
    "reusable fighting/character/combat kit claims",
    "production-runtime-only feature claims from this root route",
    "public release candidate until independent human visual review passes"
  ]
} as const;

// ---- evidence ---------------------------------------------------------------
interface MechHangarEvidence {
  status: string;
  label: string;
  claimBoundary: typeof CLAIM_BOUNDARY;
  controls: typeof ROUTE_CONTROLS;
  systems: typeof ROUTE_SYSTEMS;
  playerMoveId: string | null;
  mounted: boolean;
  mode: string;
  slots: readonly MechSlot[];
  selectedParts: readonly string[];
  primaryAssetRefs: readonly string[];
  stats: ReturnType<typeof aggregateStats>;
  assemblyValidated: boolean;
  boutState: string;
  rivalAggression: string;
  koEvents: readonly unknown[];
  audioCues: readonly string[];
  catalogReady: boolean;
  curationVerdict: typeof PART_CURATION_VERDICT;
  outcomeHash: string;
  pauseFreezesSimulation: boolean;
  reducedMotion: boolean;
  registeredAudioCues: number;
  diagnostics: { readonly drawCalls: number; readonly renderSize: readonly number[]; readonly runtimeBackend?: string };
  fighterPositions: { playerX: number; rivalX: number };
  fighterVitals: { playerHp: number; rivalHp: number; playerGuard: number; playerPower: number };
  feel: unknown;
  heroAsset: { ref: "assets.mechHeroDecimated"; url: string; hash: string; bounds: readonly [number, number, number]; quality: "candidate" };
}

let lastBoutState = "idle";
let lastOutcomeHash = "";
const publishedKoEvents: unknown[] = [];

/**
 * Live fighter positions in evidence so route specs can measure behaviour
 * (approach/retreat profiles per aggression preset) instead of trusting labels.
 */
let lastFighterPositions = { playerX: -1.9, rivalX: 1.9 };
let lastFighterVitals = { playerHp: 1, rivalHp: 1, playerGuard: 1, playerPower: 0.5 };

/** Time warp scales how many fixed steps run per display frame. Sim stays 60Hz-fixed. */
let timeWarp = 1;
(window as unknown as Record<string, unknown>).__MECH_HANGAR_SET_TIME_WARP__ = (warp: number) => {
  timeWarp = Math.max(1, Math.min(4, Math.floor(warp)));
};

/**
 * Synchronous bout pacing for route specs and accessibility: advances the SAME
 * fixed-step simulation (and its event pipeline -> HUD/audio/feel/KO card)
 * without waiting on wall-clock frames. This is pacing, not a shortcut: every
 * rule (windows, guard, power, KO, rematch presets) runs identically.
 */
(window as unknown as Record<string, unknown>).__MECH_HANGAR_SIM_TICK__ = (frames: number, options?: {
  toward?: boolean;
  strike?: "none" | "light" | "heavy" | "special";
  guard?: boolean;
}) => {
  if (!bout || paused) return null;
  const strikeEvery = options?.strike && options.strike !== "none" ? 34 : Number.MAX_SAFE_INTEGER;
  for (let index = 0; index < frames; index += 1) {
    const gap = lastFighterPositions.rivalX - lastFighterPositions.playerX;
    const inputs: BoutInputs = {
      moveX: options?.toward ? Math.sign(gap) : 0,
      jump: false,
      light: options?.strike === "light" && index % strikeEvery === 0 ? true : false,
      heavy: options?.strike === "heavy" && index % strikeEvery === 0 ? true : false,
      special: options?.strike === "special" && index % strikeEvery === 0 ? true : false,
      guard: Boolean(options?.guard)
    };
    bout.pushInputs(inputs);
    const snap = bout.step(1 / 60);
    for (const event of snap.events) handleBoutEvent(event);
    // The synchronous evidence driver uses the same renderer-owned feel event
    // pipeline as the display loop, but without waiting for a frame callback.
    // This keeps impact rings and dust available for the exact post-tick frame.
    feel.onEvents(snap.events);
    lastFighterPositions = { playerX: snap.player.x, rivalX: snap.rival.x };
    const boutStats = bout.stats();
    lastFighterVitals = {
      playerHp: snap.player.hp / boutStats.player.hpMax,
      rivalHp: snap.rival.hp / boutStats.rival.hpMax,
      playerGuard: snap.player.guard / boutStats.player.guardMax,
      playerPower: snap.player.power / boutStats.player.powerMax
    };
    mountSide("player", hangar.selection, [snap.player.x, snap.player.y, ARENA_CENTER_Z], Math.PI / 2, playerNodes);
    mountSide("rival", RIVAL_FIXED_LOADOUT.selection, [snap.rival.x, snap.rival.y, ARENA_CENTER_Z], -Math.PI / 2, rivalNodes);
    if (snap.phase === "ko" || snap.phase === "lost") break;
  }
  const pacedMidX = (lastFighterPositions.playerX + lastFighterPositions.rivalX) / 2;
  anchor.setPosition(pacedMidX, 1.02, ARENA_CENTER_Z);
  anchor.setRotation(0, 0, 0);
  publishEvidence(bout.snapshot());
  return {
    phase: bout.snapshot().phase,
    vitals: { ...lastFighterVitals },
    positions: { ...lastFighterPositions },
    koEvents: publishedKoEvents.length
  };
};

(window as unknown as Record<string, unknown>).__MECH_HANGAR_VALIDATION_PROBE__ = () => {
  // Proves the live lock-gate validator refuses a floating part inside this very
  // page: take the current validated plan, strip the weapon's attachment rule,
  // and revalidate. The floating-part failure must come back not-ready.
  const built = currentPlan();
  if ("error" in built) return { ready: false, errors: 1 };
  const stripped = {
    ...built.plan,
    parts: built.plan.parts.map((part) =>
      part.role === ("weapon" as const) ? { ...part, attachment: undefined } : part
    )
  };
  const report = characterAssembly.validatePlan(stripped);
  return { ready: report.ready, errors: report.summary.errors };
};

function publishEvidence(snapshot?: BoutSnapshot): void {
  const diagnostics = app.diagnostics();
  const selected = selectedParts(hangar.selection);
  const evidence: MechHangarEvidence = {
    status: mode === "hangar" ? (catalogReady ? "ready" : "curation-pending") : paused ? "paused" : "playing",
    label: CLAIM_BOUNDARY.label,
    claimBoundary: CLAIM_BOUNDARY,
    controls: ROUTE_CONTROLS,
    systems: ROUTE_SYSTEMS,
    playerMoveId: snapshot?.player.move?.id ?? null,
    mounted: true,
    mode,
    slots: MECH_SLOTS,
    selectedParts: selected.map((part) => part.assetKey),
    primaryAssetRefs: selected.map((part) => `assets.${part.assetKey}`),
    stats: aggregateStats(hangar.selection),
    assemblyValidated: currentAssemblyReady(),
    boutState: snapshot?.phase ?? lastBoutState,
    rivalAggression: presetForBout(mode === "arena" ? boutIndex % AGGRESSION_PRESET_COUNT : 0).id,
    koEvents: publishedKoEvents,
    audioCues: [...audio.proof().recentCues],
    catalogReady,
    curationVerdict: PART_CURATION_VERDICT,
    outcomeHash: lastOutcomeHash,
    pauseFreezesSimulation: paused,
    reducedMotion,
    registeredAudioCues: HANGAR_AUDIO_CUES.length,
    diagnostics: {
      drawCalls: diagnostics.drawCalls,
      renderSize: diagnostics.renderSize,
      ...(diagnostics.renderer?.runtime.backend ? { runtimeBackend: diagnostics.renderer.runtime.backend } : {})
    },
    fighterPositions: lastFighterPositions,
    fighterVitals: lastFighterVitals,
    feel: feel.snapshot(),
    heroAsset: {
      ref: "assets.mechHeroDecimated",
      url: rootAssets.mechHeroDecimated.url,
      hash: rootAssets.mechHeroDecimated.hash,
      bounds: rootAssets.mechHeroDecimated.bounds,
      quality: "candidate"
    }
  };
  // PRD 07 evidence contract name plus the showcase-registry canonical name
  // point at the same live object.
  window.__MECH_HANGAR_EVIDENCE__ = evidence;
  Object.defineProperty(window, "__AURA3D_SHOWCASE_MECH_HANGAR__", { value: evidence, configurable: true, writable: true });
}

// Bind the shared image-QA contract to the actual visible review hero. This is
// intentionally an application-category subject: Mech Hangar has no
// route-primary play-space projection requirement, but it still needs an honest
// full hero-plus-assembly isolation check. Suppression hides the Meshy hero
// body with every selected typed slot and presentation cue, never a hidden
// whole-body proxy.
Object.defineProperty(window, "__AURA3D_COMPOSITION_PROBE__", {
  configurable: true,
  value: {
    category: "application",
    subject: { position: [0, 1.36, 0], rotation: [0, 0, 0], targetSize: 2.72 },
    setSubjectSuppressed(suppressed: boolean) {
      compositionSubjectSuppressed = suppressed;
      if (mode === "hangar") {
        mountSide("player", hangar.selection, HANGAR_CENTER, hangar.snapshot().turntableYaw, playerNodes);
      } else if (bout) {
        mountSide("player", hangar.selection, [lastFighterPositions.playerX, 0, ARENA_CENTER_Z], Math.PI / 2, playerNodes);
        mountSide("rival", RIVAL_FIXED_LOADOUT.selection, [lastFighterPositions.rivalX, 0, ARENA_CENTER_Z], -Math.PI / 2, rivalNodes);
      }
    },
    settleSubjectPose() {
      // The typed family is authored in a static pose; the route's live
      // turntable and combat transforms remain unchanged by this no-op hook.
    }
  }
});

// ---- frame loop -------------------------------------------------------------
let frameCount = 0;
refreshHangarPanel();
remountPreview();

function handleBoutEvent(event: BoutEvent): void {
  if (!bout) return;
  if (event.type === "hit") void audio.cue(event.heavy ? "mechHeavyHitSfx" : "mechLightHitSfx");
  else if (event.type === "blocked") void audio.cue("mechGuardBlockSfx");
  else if (event.type === "guardBreak") void audio.cue("mechGuardBreakSfx");
  else if (event.type === "specialFire") void audio.cue("mechSpecialFireSfx");
  else if (event.type === "ko") {
    void audio.cue("mechKoStingSfx");
    publishedKoEvents.push({ victimId: event.victimId, x: event.x, frame: event.frame });
    showKoCard(arenaHud, event.victimId === "rival", bout.preset());
  }
}

app.onFrame(({ dt }) => {
  const stepDt = Math.min(0.05, Math.max(1 / 240, dt || 1 / 60));
  frameCount += 1;
  elapsed += stepDt;
  input.update(stepDt);

  if (mode === "hangar") {
    hangar.update(stepDt);
    remountPreview();
    // Anchor = the preview mech's chest; its yaw spins the world-offset around
    // the mech (target-yaw), which is the mouse-draggable orbit.
    const orbit = hangar.snapshot();
    anchor.setPosition(HANGAR_CENTER[0], 0.95, HANGAR_CENTER[2]);
    anchor.setRotation(0, orbit.orbitYaw, 0);
    if (elapsed - lastAmbientAt > AMBIENT_LOOP_SECONDS) {
      lastAmbientAt = elapsed;
      void audio.cue("mechAmbientHangarSfx");
    }
    publishEvidence();
    return;
  }

  if (!bout) {
    publishEvidence();
    return;
  }

  // Pause is an edge-triggered toggle. `buffered()` intentionally remains true
  // for a short input window, which would flip the state twice on consecutive
  // frames; consume only the actual press edge so the simulation stays frozen.
  if (input.pressed("pause")) {
    paused = !paused;
    publishEvidence(bout.snapshot());
    return;
  }
  if (paused) {
    // Pause freezes BOTH mechs + AI: no sim step, no feel tick, no cues.
    publishEvidence(bout.snapshot());
    return;
  }

  let snap = bout.snapshot();
  for (let warpStep = 0; warpStep < timeWarp; warpStep += 1) {
    bout.pushInputs(playerInputsFromActions());
    snap = bout.step(stepDt);
    for (const event of snap.events) handleBoutEvent(event);
  }
  feel.noteHitStop(snap.hitstopFrames);

  feel.update(stepDt * timeWarp, snap.events, { x: (snap.player.x + snap.rival.x) / 2, y: 1.02, z: ARENA_CENTER_Z });
  const midX = (snap.player.x + snap.rival.x) / 2;
  anchor.setPosition(midX, 1.02, ARENA_CENTER_Z);
  anchor.setRotation(0, 0, 0);

  lastFighterPositions = { playerX: snap.player.x, rivalX: snap.rival.x };
  const boutStats = bout.stats();
  lastFighterVitals = {
    playerHp: snap.player.hp / boutStats.player.hpMax,
    rivalHp: snap.rival.hp / boutStats.rival.hpMax,
    playerGuard: snap.player.guard / boutStats.player.guardMax,
    playerPower: snap.player.power / boutStats.player.powerMax
  };
  mountSide("player", hangar.selection, [snap.player.x, snap.player.y, ARENA_CENTER_Z], Math.PI / 2, playerNodes);
  mountSide("rival", RIVAL_FIXED_LOADOUT.selection, [snap.rival.x, snap.rival.y, ARENA_CENTER_Z], -Math.PI / 2, rivalNodes);

  walkCueCooldown -= stepDt;
  const moving = (input.held("left") || input.held("right")) && !snap.player.airborne && snap.phase === "fighting";
  if (moving && walkCueCooldown <= 0) {
    walkCueCooldown = 0.42;
    void audio.cue("mechWalkHeavySfx");
  }

  const stats = bout.stats();
  updateArenaHud(arenaHud, {
    playerHpFraction: snap.player.hp / stats.player.hpMax,
    rivalHpFraction: snap.rival.hp / stats.rival.hpMax,
    playerGuardFraction: snap.player.guard / stats.player.guardMax,
    rivalGuardFraction: snap.rival.guard / stats.rival.guardMax,
    playerPowerFraction: snap.player.power / stats.player.powerMax,
    rivalPowerFraction: snap.rival.power / stats.rival.powerMax,
    preset: bout.preset(),
    boutIndex,
    phase: snap.phase
  });

  lastBoutState = snap.phase;
  lastOutcomeHash = bout.outcomeHash();
  publishEvidence(snap);
});

publishEvidence();

export {};
