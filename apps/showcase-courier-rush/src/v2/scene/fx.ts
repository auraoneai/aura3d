// apps/showcase-courier-rush/src/v2/scene/fx.ts — gameplay event fx (T2.4).
// §6.9.7 VFX: spark burst + impact ring/slash on a real strike, dust on
// pickup, spark + trauma on drop and shift-clear. Juice: strike hit-stop
// 40 ms + shake 0.2, shiftClear trauma 0.25.
import type { AuraMaterialSpec, Game } from "@aura3d/engine";
import { DROP_BURST, PICKUP_BURST } from "./materials";

type NodeHandle = ReturnType<Game["app"]["nodes"]["get"]>;

export function wireCourierFx(game: Game): {
  onPickup(position: readonly [number, number, number]): void;
  onDrop(position: readonly [number, number, number]): void;
  onStrike(position: readonly [number, number, number], heading: number): void;
  onShiftClear(): void;
  onShiftFail(): void;
  syncImpact(dt: number): void;
} {
  let impactRemaining = 0;
  let burst: NodeHandle | undefined;
  let burstRemaining = 0;

  const burstNode = (): NodeHandle | undefined => {
    if (!burst) burst = game.app.nodes.get("contact-burst");
    return burst;
  };

  const triggerBurst = (x: number, y: number, z: number, mat: AuraMaterialSpec, radius: number): void => {
    burstRemaining = 0.35;
    const h = burstNode();
    if (!h) return;
    h.setMaterial(mat).setPosition(x, y, z).setScale([radius, radius, radius]).setVisible(true);
  };

  return {
    onPickup([x, y, z]) {
      game.fx.burst("dust", [x, y + 0.3, z], { count: 12, speed: 0.7, color: "#bae6fd" });
      triggerBurst(x, 0.6, z, PICKUP_BURST, 0.34);
    },
    onDrop([x, y, z]) {
      game.fx.burst("spark", [x, y + 0.3, z], { count: 14, speed: 1.0, color: "#fde68a" });
      triggerBurst(x, 0.6, z, DROP_BURST, 0.38);
      game.session.hitStop(0.03);
    },
    onStrike([x, , z], heading) {
      impactRemaining = 1.15;
      const ring = game.app.nodes.get("impact-ring");
      const slash = game.app.nodes.get("impact-slash");
      ring?.setPosition(x, 0.055, z).setRotation(Math.PI / 2, 0, heading).setVisible(true);
      slash?.setPosition(x, 0.075, z).setRotation(0, heading, Math.PI / 4).setVisible(true);
      game.fx.burst("spark", [x, 0.4, z], { count: 10, speed: 1.1, color: "#fecdd3" });
      game.app.camera?.shake.add(0.2);
      game.session.hitStop(0.04);
    },
    onShiftClear() {
      game.app.camera?.shake.add(0.25);
    },
    onShiftFail() {
      game.app.camera?.shake.add(0.2);
      game.session.hitStop(0.05);
    },
    syncImpact(dt: number) {
      if (burstRemaining > 0) {
        burstRemaining -= dt;
        if (burstRemaining <= 0) burstNode()?.setVisible(false);
      }
      if (impactRemaining <= 0) return;
      impactRemaining -= dt;
      const progress = 1 - Math.max(0, impactRemaining / 1.15);
      game.app.nodes.get("impact-ring")?.setScale(0.42 + progress * 0.55);
      game.app.nodes.get("impact-slash")?.setScale([0.8 + progress * 0.42, 0.055, 0.06]);
      if (impactRemaining <= 0) {
        game.app.nodes.get("impact-ring")?.setVisible(false);
        game.app.nodes.get("impact-slash")?.setVisible(false);
      }
    }
  };
}
