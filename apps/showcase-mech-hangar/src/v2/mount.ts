// Mech mounting + hangar controller — extracted from boot.ts for 14-LOC.
// The part/hero/marker handle maps and mount helpers behave as before;
// `getMode`/`onEnterArena` let the hangar callbacks reach boot-owned state.
import type { AuraRuntimeNodeHandle } from "@aura3d/engine";
import {
  MECH_SLOTS, PART_OPTIONS, selectedParts, type BuildSelection, type PartDef,
} from "../gameplay/parts-catalog";
import { createHangarController } from "../legacy/hangar";
import { mountTransformForPart } from "../gameplay/assembly";
import { HANGAR_CENTER, heroNodeId, markerNodeIds, partNodeId } from "./scene/world";

type NodeHandle = AuraRuntimeNodeHandle | null;

export interface MountDeps {
  handle(id: string): NodeHandle;
  getMode(): "hangar" | "arena";
  onLockIn(): void;
  audio: Parameters<typeof createHangarController>[0];
  reducedMotion: boolean;
  host: HTMLElement;
}

export function createMountSystem(deps: MountDeps) {
  const { handle } = deps;

  const partHandles = {
    player: new Map<string, NodeHandle>(),
    rival: new Map<string, NodeHandle>(),
  };
  for (const side of ["player", "rival"] as const) {
    for (const slot of MECH_SLOTS) {
      for (const def of PART_OPTIONS[slot]) {
        partHandles[side].set(def.assetKey, handle(partNodeId(side, def.assetKey)));
      }
    }
  }
  const heroHandles = {
    player: handle(heroNodeId("player")),
    rival: handle(heroNodeId("rival")),
  };
  const markerHandles = {
    player: Object.fromEntries(Object.entries(markerNodeIds("player")).map(([k, id]) => [k, handle(id)])) as Record<
      "ring" | "chevron" | "collar" | "lock",
      NodeHandle
    >,
    rival: Object.fromEntries(Object.entries(markerNodeIds("rival")).map(([k, id]) => [k, handle(id)])) as Record<
      "ring" | "chevron" | "collar" | "lock",
      NodeHandle
    >,
  };

  const HERO_FEET_LIFT = 0.953;
  const HERO_FORWARD = 0.32;

  function mountSide(
    side: "player" | "rival",
    selection: BuildSelection,
    rootPosition: readonly [number, number, number],
    yaw: number,
    familyBack = 0
  ): void {
    const parts = selectedParts(selection);
    const familyBackX = Math.sin(yaw) * familyBack;
    const familyBackZ = Math.cos(yaw) * familyBack;
    for (const slot of MECH_SLOTS) {
      for (const def of PART_OPTIONS[slot]) {
        const h = partHandles[side].get(def.assetKey);
        if (!h) continue;
        const mounted = parts.some((entry: PartDef) => entry.assetKey === def.assetKey);
        if (!mounted) {
          h.setVisible(false);
          continue;
        }
        const t = mountTransformForPart(def, parts, rootPosition, yaw);
        h.setVisible(true);
        h.setPosition(t.position[0] - familyBackX, t.position[1], t.position[2] - familyBackZ);
        h.setRotation(0, t.yaw, 0);
      }
    }
    const marker = markerHandles[side];
    marker.ring?.setVisible(true);
    marker.ring?.setPosition(rootPosition[0], 0.21, rootPosition[2]);
    marker.ring?.setRotation(Math.PI / 2, 0, 0);
    marker.ring?.setScale([side === "player" ? 0.84 : 0.78, side === "player" ? 0.84 : 0.78, 0.032]);
    marker.chevron?.setVisible(true);
    const chevronFront = 0.76;
    marker.chevron?.setPosition(
      rootPosition[0] + Math.sin(yaw) * chevronFront,
      rootPosition[1] + 1.56,
      rootPosition[2] + Math.cos(yaw) * chevronFront
    );
    marker.chevron?.setRotation(0, yaw, Math.PI / 4);
    marker.chevron?.setScale([0.115, 0.115, 0.032]);

    const hero = heroHandles[side];
    if (hero) {
      hero.setVisible(true);
      hero.setPosition(
        rootPosition[0] + Math.sin(yaw) * HERO_FORWARD,
        rootPosition[1] + HERO_FEET_LIFT,
        rootPosition[2] + Math.cos(yaw) * HERO_FORWARD
      );
      hero.setRotation(0, yaw, 0);
    }

    const selectedWeapon = parts.find((part: PartDef) => part.slot === "weapon");
    const weaponTransform = selectedWeapon
      ? mountTransformForPart(selectedWeapon, parts, [rootPosition[0] - familyBackX, rootPosition[1], rootPosition[2] - familyBackZ], yaw)
      : undefined;
    const visible = Boolean(weaponTransform);
    marker.collar?.setVisible(visible);
    marker.lock?.setVisible(visible);
    if (weaponTransform) {
      const forwardX = Math.sin(weaponTransform.yaw);
      const forwardZ = Math.cos(weaponTransform.yaw);
      marker.collar?.setPosition(
        weaponTransform.position[0] + forwardX * -0.18,
        weaponTransform.position[1],
        weaponTransform.position[2] + forwardZ * -0.18
      );
      marker.collar?.setRotation(0, weaponTransform.yaw, 0);
      marker.collar?.setScale([0.14, 0.14, 0.055]);
      marker.lock?.setPosition(
        weaponTransform.position[0] + forwardX * 0.19,
        weaponTransform.position[1] + 0.01,
        weaponTransform.position[2] + forwardZ * 0.19
      );
      marker.lock?.setRotation(0, weaponTransform.yaw, 0);
      marker.lock?.setScale([0.1, 0.1, 0.024]);
    }
  }

  function hideSide(side: "player" | "rival") {
    for (const h of partHandles[side].values()) h?.setVisible(false);
    heroHandles[side]?.setVisible(false);
    const marker = markerHandles[side];
    marker.ring?.setVisible(false);
    marker.chevron?.setVisible(false);
    marker.collar?.setVisible(false);
    marker.lock?.setVisible(false);
  }

  const hangar = createHangarController(
    deps.audio,
    {
      onSelectionChanged: () => {
        if (deps.getMode() === "hangar") remountPreview();
      },
      onLockIn: () => {
        deps.onLockIn();
      },
    },
    { reducedMotion: deps.reducedMotion }
  );

  const hangarKeys = (code: string) =>
    code === "Enter" || code === "Digit1" || code === "Digit2" || code === "Digit3" || code === "Digit4" || code === "ArrowLeft" || code === "ArrowRight";

  function remountPreview() {
    mountSide("player", hangar.selection, HANGAR_CENTER, hangar.snapshot().turntableYaw, 0.28);
  }

  // Turntable orbit drag on the canvas (hangar mode only).
  hangar.attachPointer(deps.host, () => deps.getMode() === "hangar");

  return { hangar, hangarKeys, mountSide, hideSide, remountPreview };
}
