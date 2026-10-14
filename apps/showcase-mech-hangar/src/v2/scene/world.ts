// apps/showcase-mech-hangar/src/v2/scene/world.ts — one union scene for the
// hangar workshop (z=0) and the floodlit pit (z=-34). Both sets mount at boot;
// mode changes only move the camera anchor and re-pose the fighters, so
// loading.sceneSwaps stays 0 while loading.sceneId reports the logical room.
import type { AuraNodeInput } from "@aura3d/engine";
import { game as engineGame, model, primitives } from "@aura3d/engine";
import { assets } from "../../../../../src/aura-assets";
import { MECH_SLOTS, PART_OPTIONS, resolvePartAsset } from "../../gameplay/parts-catalog";
import {
  collarLockMat,
  collarMat,
  hangarBackdropMat,
  hangarBayStripMat,
  hangarBeamLightMat,
  hangarCrateMat,
  hangarFloorMat,
  hangarFrameMat,
  hangarSignMat,
  identityChevronMat,
  identityRingMat,
  pitBackdropMat,
  pitFloorMat,
  pitPillarLightMat,
  pitPillarMat,
  pitRailMat
} from "./materials";

export const HANGAR_CENTER: readonly [number, number, number] = [0, 0, 0];
export const ARENA_CENTER_Z = -34;

export const CAM_ANCHOR_ID = "mech-cam-anchor";
export const heroNodeId = (side: "player" | "rival") => `mech-hero-${side}`;
export const partNodeId = (side: "player" | "rival", assetKey: string) => `mech-${side}-${assetKey}`;
export const markerNodeIds = (side: "player" | "rival") => ({
  ring: `mech-${side}-identity-ring`,
  chevron: `mech-${side}-identity-chevron`,
  collar: `mech-${side}-hardpoint-collar`,
  lock: `mech-${side}-hardpoint-lock`
});

/** Hangar set dressing: deck, bays, gantry accents, workshop clutter. */
const hangarNodeIds: string[] = [];
const pitNodeIds: string[] = [];
function track(bucket: string[], id: string, spec: { tags: readonly string[] }) {
  bucket.push(id);
  return engineGame.runtimeNode(id, spec);
}
function hangarSetNodes(): AuraNodeInput[] {
  const nodes: AuraNodeInput[] = [
    primitives.box({ name: "hangar deck", material: hangarFloorMat })
      .position(0, -0.06, 0).scale([16.5, 0.12, 13])
      .runtime(track(hangarNodeIds, "hangar-deck", { tags: ["hangar-set", "floor"] })),
    primitives.box({ name: "hangar far wall", material: hangarBackdropMat })
      .position(0, 4.4, -5.8).scale([16.5, 9.2, 0.3])
      .runtime(track(hangarNodeIds, "hangar-far-wall", { tags: ["hangar-set", "backdrop"] })),
    primitives.box({ name: "hangar floor inset", material: hangarFrameMat })
      .position(0, 0.006, 0.4).scale([4.6, 0.02, 4.6])
      .runtime(track(hangarNodeIds, "hangar-floor-inset", { tags: ["hangar-set", "floor-detail"] }))
  ];
  for (const side of [-1, 1] as const) {
    nodes.push(
      primitives.box({ name: `hangar deck edge ${side}`, material: hangarSignMat })
        .position(side * 2.42, 0.02, 0.4).scale([0.09, 0.024, 4.6])
        .runtime(track(hangarNodeIds, `hangar-deck-edge-${side}`, { tags: ["hangar-set", "objective-marker"] }))
    );
  }
  [-7.2, -3.6, 0, 3.6, 7.2].forEach((x, index) => {
    nodes.push(
      primitives.box({ name: `hangar bay frame ${index}`, material: hangarFrameMat })
        .position(x, 2.6, -5.4).scale([0.42, 5.2, 0.42])
        .runtime(track(hangarNodeIds, `hangar-bay-frame-${index}`, { tags: ["hangar-set", "frame"] })),
      primitives.box({ name: `hangar bay strip ${index}`, material: hangarBayStripMat })
        .position(x, 2.6, -5.16).scale([0.12, 4.8, 0.06])
        .runtime(track(hangarNodeIds, `hangar-bay-strip-${index}`, { tags: ["hangar-set", "practical-proxy"] }))
    );
  });
  nodes.push(
    primitives.box({ name: "hangar upper beam", material: hangarFrameMat })
      .position(0, 5.2, -5.3).scale([16.5, 0.5, 0.44])
      .runtime(track(hangarNodeIds, "hangar-upper-beam", { tags: ["hangar-set", "frame"] })),
    primitives.box({ name: "hangar beam lamp", material: hangarBeamLightMat })
      .position(0, 4.92, -5.3).scale([14.8, 0.1, 0.3])
      .runtime(track(hangarNodeIds, "hangar-beam-lamp", { tags: ["hangar-set", "practical-proxy"] }))
  );
  [-1, 1].forEach((side, i) => {
    nodes.push(
      primitives.box({ name: `hangar bay sign ${side}`, material: hangarSignMat })
        .position(side * 5.4, 4.35, -5.12).scale([1.5, 0.42, 0.05])
        .runtime(track(hangarNodeIds, `hangar-bay-sign-${i}`, { tags: ["hangar-set", "signage"] }))
    );
  });
  // Workshop clutter — catwalk slab + crate stacks, kept clear of the turntable.
  nodes.push(
    primitives.box({ name: "hangar catwalk", material: hangarFrameMat })
      .position(0, 3.1, -4.55).scale([16.5, 0.16, 1.15])
      .runtime(track(hangarNodeIds, "hangar-catwalk", { tags: ["hangar-set", "catwalk"] }))
  );
  const crateSpecs: readonly (readonly [number, number, number, number])[] = [
    [-5.9, 0.45, 2.8, 0.9],
    [-5.0, 0.35, 3.6, 0.7],
    [5.6, 0.5, 3.0, 1.0],
    [6.4, 0.32, 2.0, 0.64],
    [4.6, 0.24, 4.1, 0.48]
  ];
  crateSpecs.forEach(([x, y, z, s], i) => {
    nodes.push(
      primitives.box({ name: `hangar crate ${i}`, material: hangarCrateMat })
        .position(x, y, z).scale([s, s, s])
        .runtime(track(hangarNodeIds, `hangar-crate-${i}`, { tags: ["hangar-set", "clutter"] }))
    );
  });
  return nodes;
}

/** Pit set dressing: dust deck, floodlit pillars, guard rails. */
function pitSetNodes(): AuraNodeInput[] {
  const nodes: AuraNodeInput[] = [
    primitives.cylinder({ name: "pit dust deck", material: pitFloorMat })
      .position(0, -0.08, ARENA_CENTER_Z).scale([7.6, 0.16, 7.6])
      .runtime(track(pitNodeIds, "pit-deck", { tags: ["pit-set", "floor"] })),
    primitives.cylinder({ name: "pit far wall", material: pitBackdropMat })
      .position(0, 3.6, ARENA_CENTER_Z).scale([8.4, 7.4, 8.4])
      .runtime(track(pitNodeIds, "pit-far-wall", { tags: ["pit-set", "backdrop"] }))
  ];
  // Ringed pillars at the pit lip; alternating lamp strips read as the
  // overhead practicals the direction asks for.
  for (let i = 0; i < 8; i += 1) {
    const angle = (i / 8) * Math.PI * 2;
    const px = Math.cos(angle) * 7.0;
    const pz = ARENA_CENTER_Z + Math.sin(angle) * 7.0;
    nodes.push(
      primitives.box({ name: `pit pillar ${i}`, material: pitPillarMat })
        .position(px, 3.0, pz).scale([0.5, 6.0, 0.5]).rotate(0, -angle, 0)
        .runtime(track(pitNodeIds, `pit-pillar-${i}`, { tags: ["pit-set", "frame"] })),
      primitives.box({ name: `pit pillar lamp ${i}`, material: pitPillarLightMat })
        .position(px * 0.965, 3.0, ARENA_CENTER_Z + Math.sin(angle) * 7.0 * 0.965)
        .scale([0.09, 5.4, 0.09]).rotate(0, -angle, 0)
        .runtime(track(pitNodeIds, `pit-pillar-lamp-${i}`, { tags: ["pit-set", "practical-proxy"] }))
    );
  }
  for (let i = 0; i < 16; i += 1) {
    const angle = (i / 16) * Math.PI * 2;
    nodes.push(
      primitives.box({ name: `pit rail ${i}`, material: pitRailMat })
        .position(Math.cos(angle) * 6.2, 0.55, ARENA_CENTER_Z + Math.sin(angle) * 6.2)
        .scale([1.4, 0.09, 0.07]).rotate(0, -angle + Math.PI / 2, 0)
        .runtime(track(pitNodeIds, `pit-rail-${i}`, { tags: ["pit-set", "rail"] }))
    );
  }
  return nodes;
}

/** Swappable modular parts: every catalog option mounted once per side. */
function partNodes(side: "player" | "rival"): AuraNodeInput[] {
  const nodes: AuraNodeInput[] = [];
  for (const slot of MECH_SLOTS) {
    for (const def of PART_OPTIONS[slot]) {
      const asset = resolvePartAsset(def.assetKey);
      if (!asset) continue;
      const fit =
        slot === "chassis" ? { scaleMode: "fit" as const, targetHeight: 1.05 }
        : slot === "legs" ? { scaleMode: "fit" as const, targetHeight: 0.84 }
        : slot === "arms" ? { scaleMode: "fit" as const, targetMaxDimension: 2.18 }
        : { scaleMode: "fit" as const, targetMaxDimension: 0.68 };
      nodes.push(
        model(asset, {
          name: partNodeId(side, def.assetKey),
          role: "primaryCharacter",
          castShadow: true,
          receiveShadow: true,
          ...fit
        })
          .position(0, -60, 0)
          .runtime(engineGame.runtimeNode(partNodeId(side, def.assetKey), {
            tags: ["mech-part", side, slot, "typed-primary-asset"]
          }))
      );
    }
  }
  return nodes;
}

/** Meshy hero shell per side — the coherent silhouette the family mounts around. */
function heroNodes(side: "player" | "rival"): AuraNodeInput[] {
  return [
    model(assets.mechHeroDecimated, {
      name: heroNodeId(side),
      role: "primaryCharacter",
      castShadow: true,
      receiveShadow: true
    })
      .position(0, -60, 0)
      .runtime(engineGame.runtimeNode(heroNodeId(side), { tags: ["mech-hero", side, "typed-primary-asset"] }))
  ];
}

/** Identity ring, chest chevron, and weapon hardpoint markers per fighter. */
function fighterMarkerNodes(side: "player" | "rival"): AuraNodeInput[] {
  const ids = markerNodeIds(side);
  return [
    primitives.torus({ name: `${side} identity ring`, material: identityRingMat })
      .position(0, -60, 0).scale([0.84, 0.84, 0.032])
      .runtime(engineGame.runtimeNode(ids.ring, { tags: ["team-marker", side, "presentation"] })),
    primitives.box({ name: `${side} identity chevron`, material: identityChevronMat })
      .position(0, -60, 0).scale([0.115, 0.115, 0.032])
      .runtime(engineGame.runtimeNode(ids.chevron, { tags: ["team-marker", side, "presentation"] })),
    primitives.cylinder({ name: `${side} hardpoint collar`, material: collarMat })
      .position(0, -60, 0).scale([0.14, 0.055, 0.14])
      .runtime(engineGame.runtimeNode(ids.collar, { tags: ["hardpoint", side, "presentation"] })),
    primitives.cylinder({ name: `${side} hardpoint lock`, material: collarLockMat })
      .position(0, -60, 0).scale([0.1, 0.024, 0.1])
      .runtime(engineGame.runtimeNode(ids.lock, { tags: ["hardpoint", side, "presentation"] }))
  ];
}

export interface MechWorldNodes {
  readonly nodes: readonly AuraNodeInput[];
  readonly hangarNodeIds: readonly string[];
  readonly pitNodeIds: readonly string[];
  readonly partNodeIds: { readonly player: readonly string[]; readonly rival: readonly string[] };
  readonly heroNodeIds: readonly string[];
}

export function mechWorldNodes(): MechWorldNodes {
  const hangar = hangarSetNodes();
  const pit = pitSetNodes();
  const playerPartIds: string[] = [];
  const rivalPartIds: string[] = [];
  for (const slot of MECH_SLOTS) {
    for (const def of PART_OPTIONS[slot]) {
      playerPartIds.push(partNodeId("player", def.assetKey));
      rivalPartIds.push(partNodeId("rival", def.assetKey));
    }
  }
  const nodes: AuraNodeInput[] = [
    ...hangar,
    ...pit,
    // Camera anchor — an invisible runtime node both rig modes track.
    primitives.sphere({ name: "mech cam anchor", material: collarMat })
      .position(HANGAR_CENTER[0], 0.95, HANGAR_CENTER[2]).scale([0.001, 0.001, 0.001])
      .runtime(engineGame.runtimeNode(CAM_ANCHOR_ID, { tags: ["camera-anchor"] })),
    ...partNodes("player"),
    ...partNodes("rival"),
    ...heroNodes("player"),
    ...heroNodes("rival"),
    ...fighterMarkerNodes("player"),
    ...fighterMarkerNodes("rival")
  ];
  return {
    nodes,
    hangarNodeIds,
    pitNodeIds,
    partNodeIds: { player: playerPartIds, rival: rivalPartIds },
    heroNodeIds: [heroNodeId("player"), heroNodeId("rival")]
  };
}
