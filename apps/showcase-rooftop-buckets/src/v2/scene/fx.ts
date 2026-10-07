// apps/showcase-rooftop-buckets/src/v2/scene/fx.ts — gameplay event fx (T2.4).
// §6.9.6 VFX: one `game.fx.trail` arc ribbon on the live ball, a spark burst
// on rim/board/swish/block contact, fire halo pulse while on-fire, net pulse
// on a make. Juice: swish hit-stop 30 ms, buzzer trauma 0.2.
import type { AuraMaterialSpec, Game } from "@aura3d/engine";
import { CONTACT_BLOCK, CONTACT_MAKE, CONTACT_MISS } from "./materials";

type NodeHandle = ReturnType<Game["app"]["nodes"]["get"]>;

export function wireRooftopFx(game: Game): {
  startTrail(ballNode: string): void;
  stopTrail(): void;
  onRelease(position: readonly [number, number, number]): void;
  onContact(kind: "rim" | "board" | "swish" | "block", position: readonly [number, number, number]): void;
  onFireStart(position: readonly [number, number, number]): void;
  onBuzzer(): void;
  syncBurst(dt: number): void;
} {
  let trail: { stop(): void } | null = null;
  let burst: NodeHandle | undefined;
  let burstRemaining = 0;
  let burstRadius = 0.3;

  const burstNode = (): NodeHandle | undefined => {
    if (!burst) burst = game.app.nodes.get("contact-burst");
    return burst;
  };

  const triggerBurst = (x: number, y: number, z: number, mat: AuraMaterialSpec, radius: number): void => {
    burstRemaining = 0.35;
    burstRadius = radius;
    burstNode()?.setMaterial(mat)
      .setPosition(x, y, z)
      .setScale([radius, radius, radius])
      .setVisible(true);
  };

  return {
    startTrail(ballNode) {
      trail?.stop();
      // §14.4 arc ribbon — the live flight reads against the skyline.
      trail = game.fx.trail(ballNode, { width: 0.09, life: 0.85, color: "#ffb054" });
    },
    stopTrail() {
      trail?.stop();
      trail = null;
    },
    onRelease([x, y, z]) {
      game.fx.burst("dust", [x, y - 0.1, z], { count: 10, speed: 0.6, color: "#fde68a" });
    },
    onContact(kind, [x, y, z]) {
      if (kind === "swish") {
        game.fx.burst("spark", [x, y, z], { count: 16, speed: 1.2, color: "#fef08a" });
        triggerBurst(x, y, z, CONTACT_MAKE, 0.4);
        game.session.hitStop(0.03);
        game.app.nodes.get("rim-net-pulse")?.setScale([0.19 * 1.5, 0.19 * 1.5, 0.036]);
      } else if (kind === "block") {
        game.fx.burst("spark", [x, y, z], { count: 12, speed: 1.0, color: "#f0abfc" });
        triggerBurst(x, y, z, CONTACT_BLOCK, 0.34);
        game.app.camera?.shake.add(0.12);
      } else {
        game.fx.burst("spark", [x, y, z], { count: 8, speed: 0.9, color: "#fda4af" });
        triggerBurst(x, y, z, CONTACT_MISS, 0.26);
      }
    },
    onFireStart([x, y, z]) {
      game.fx.burst("spark", [x, y, z], { count: 24, speed: 1.6, color: "#fbbf24" });
      game.app.camera?.shake.add(0.15);
    },
    onBuzzer() {
      game.app.camera?.shake.add(0.2);
      game.session.hitStop(0.05);
    },
    syncBurst(dt: number) {
      if (burstRemaining <= 0) return;
      burstRemaining -= dt;
      const h = burstNode();
      if (!h) return;
      if (burstRemaining <= 0) { h.setVisible(false); return; }
      const t = burstRemaining / 0.35;
      h.setScale([burstRadius * (1.4 - t * 0.4), burstRadius * (1.4 - t * 0.4), burstRadius * (1.4 - t * 0.4)]);
      // Net pulse decays back to the authored ring.
      if (t < 0.5) game.app.nodes.get("rim-net-pulse")?.setScale([0.19 + 0.19 * t, 0.19 + 0.19 * t, 0.024]);
    }
  };
}
