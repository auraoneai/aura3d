// apps/showcase-vault-breakers/src/v2/scene/fx.ts — gameplay event fx (T2.4).
// §6.9.5 VFX: a spark burst per bumper/sling/target contact, a shutter ring on
// the vault event, juice on vault open (trauma 0.2 + 40 ms hit-stop) and
// multiball (0.6× slow-mo 0.5 s). All through C-24 game.fx / game.session —
// plus the renderer-owned impact ring for sub-frame contact feedback.
import type { Game } from "@aura3d/engine";
import { IMPACT_AMBER, IMPACT_CYAN, IMPACT_VAULT } from "./materials";

type NodeHandle = ReturnType<Game["app"]["nodes"]["get"]>;
type ImpactKind = "amber" | "cyan" | "vault";

const IMPACT_MATERIAL = { amber: IMPACT_AMBER, cyan: IMPACT_CYAN, vault: IMPACT_VAULT } as const;

/** Static physics landmarks used as origins for bursts + impact rings. */
export const BUMPER_IMPACT_POSITIONS = [[-0.9, -1.7], [0.9, -1.7], [0, -0.7]] as const;
export const SLING_IMPACT_POSITIONS = [[-1.5, 1.9], [1.5, 1.9]] as const;
const TARGET_BANK_POSITIONS: Record<string, readonly (readonly [number, number])[]> = {
  "bank-left-top": [[-2.32, -2.4], [-2.32, -2.8], [-2.32, -3.2]],
  "bank-left-mid": [[-2.42, -0.6], [-2.42, -0.2], [-2.42, 0.2]],
  "bank-center": [[-0.5, -2.5], [0, -2.62], [0.5, -2.5]],
  "bank-right-mid": [[1.95, -0.6], [1.95, -0.2], [1.95, 0.2]],
  "bank-right-top": [[1.95, -2.4], [1.95, -2.8], [1.95, -3.2]]
};

export function wireVaultFx(game: Game): {
  onBumper(position: readonly [number, number]): void;
  onSling(position: readonly [number, number]): void;
  onTarget(id: string): void;
  onDrain(): void;
  onVaultOpen(): void;
  onMultiball(): void;
  syncImpact(dt: number): void;
} {
  let impactRing: NodeHandle | undefined;
  let impactRemaining = 0;
  let impactRadius = 0.28;

  const ring = (): NodeHandle | undefined => {
    if (!impactRing) impactRing = game.app.nodes.get("vault-live-impact-ring");
    return impactRing;
  };

  const triggerImpact = (x: number, z: number, kind: ImpactKind, radius = 0.28): void => {
    impactRemaining = game.session.reducedMotion ? 0.16 : 0.42;
    impactRadius = radius;
    ring()?.setMaterial(IMPACT_MATERIAL[kind])
      .setPosition(x, 0.32, z)
      .setRotation(Math.PI / 2, 0, 0)
      .setScale([radius, radius, 0.05])
      .setVisible(true);
  };

  return {
    onBumper([x, z]) {
      game.fx.burst("sparks", [x, 0.45, z], { count: 18, speed: 1.4, color: "#ffb054" });
      triggerImpact(x, z, "amber", 0.3);
      game.app.camera?.shake.add(0.08);
    },
    onSling([x, z]) {
      game.fx.burst("sparks", [x, 0.4, z], { count: 10, speed: 1.0, color: "#55f4ff" });
      triggerImpact(x, z, "cyan", 0.24);
    },
    onTarget(id) {
      const [bank] = id.split(":");
      const slot = Number(id.match(/:t(\d+)$/)?.[1] ?? 1);
      const [x, z] = TARGET_BANK_POSITIONS[bank ?? ""]?.[Math.max(0, Math.min(2, slot))] ?? [0, -2.5];
      game.fx.burst("sparks", [x, 0.4, z], { count: 8, speed: 0.8, color: "#36f1ff" });
      triggerImpact(x, z, "cyan", 0.18);
    },
    onDrain() {
      game.session.hitStop(0.04);
    },
    onVaultOpen() {
      game.app.camera?.shake.add(0.2);
      game.session.hitStop(0.04);
      triggerImpact(0, -3.3, "vault", 0.6);
    },
    onMultiball() {
      game.session.slowMo(0.6, 500);
    },
    syncImpact(dt: number) {
      if (impactRemaining <= 0) return;
      impactRemaining -= dt;
      const h = ring();
      if (!h) return;
      if (impactRemaining <= 0) { h.setVisible(false); return; }
      const life = impactRemaining;
      h.setScale([impactRadius + (0.42 - life) * 0.5, impactRadius + (0.42 - life) * 0.5, 0.05 + life * 0.04]);
    }
  };
}
