// Gate slot + node sync — extracted from boot.ts for 14-LOC. The slot map
// lives in the closure as the module-level map did.
import { pulseGateGeometry } from "../gameplay/gates";
import type { createGateSystem } from "../gameplay/gates";
import type { createBeatClock } from "../gameplay/beat-clock";
import type { PulseGateKind } from "../gameplay/patterns";
import { GATE_MATERIALS } from "./scene/materials";
import type { pulseWorldNodes } from "./scene/world";

import type { Game } from "@aura3d/game";

type NodeHandle = ReturnType<Game["app"]["nodes"]["get"]>;

export function createGateVisuals(deps: {
  world: ReturnType<typeof pulseWorldNodes>;
  handle(name: string): NodeHandle | undefined;
  gateSystem: ReturnType<typeof createGateSystem>;
  clock: ReturnType<typeof createBeatClock>;
}) {
  const { world, handle, gateSystem, clock } = deps;
  const gateSlots = new Map<string, number>();

  function syncGates(): void {
    const active = gateSystem.activeGates();
    const liveIds = new Set(active.map((g) => g.id));
    for (const [id, slot] of gateSlots) {
      if (!liveIds.has(id)) {
        gateSlots.delete(id);
        handle(world.gateNodeNames[slot]!)?.setPosition(0, -30, -30).setVisible(false);
      }
    }
    for (const gate of active) {
      let slot = gateSlots.get(gate.id);
      if (slot === undefined) {
        const used = new Set(gateSlots.values());
        slot = [0, 1, 2, 3].find((i) => !used.has(i));
        if (slot === undefined) continue;
        gateSlots.set(gate.id, slot);
        const mat = GATE_MATERIALS[gate.entry.kind as PulseGateKind] ?? GATE_MATERIALS.wall;
        handle(world.gateNodeNames[slot]!)?.setMaterial(mat).setVisible(true);
      }
      const geometry = pulseGateGeometry(gate.entry, clock.time());
      const centerY = (geometry.bottomY + geometry.topY) / 2;
      handle(world.gateNodeNames[slot]!)?.setPosition(geometry.centerX, centerY, gate.z)
        .setScale([geometry.halfWidth * 2, Math.max(0.08, geometry.topY - geometry.bottomY), 0.12]);
    }
  }

  return { syncGates };
}
