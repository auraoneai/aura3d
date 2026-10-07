// apps/showcase-siege-golf/src/v2/scene/fx.ts — juice wiring (T2.5).
// Maps strike / impact-wood / impact-metal / pin-down / pin-sunk / cup-flash /
// complete / failed onto game.fx bursts + hitStop + camera shake.
import type { Game } from "@aura3d/engine";

type NodeHandle = ReturnType<Game["app"]["nodes"]["get"]>;

export interface SiegeFx {
  strike(x: number, z: number, power: number): void;
  impactWood(x: number, y: number, z: number): void;
  impactMetal(x: number, y: number, z: number): void;
  pinDown(x: number, y: number, z: number): void;
  pinSunk(x: number, z: number): void;
  cupFlash(x: number, z: number): void;
  complete(x: number, z: number): void;
  failed(): void;
  step(dt: number): void;
}

export function wireSiegeFx(game: Game): SiegeFx {
  let strikeFlashRemaining = 0;
  let cupFlashRemaining = 0;
  let strikeFlash: NodeHandle | undefined;
  let cupFlash: NodeHandle | undefined;

  const strikeNode = (): NodeHandle | undefined => {
    if (!strikeFlash) strikeFlash = game.app.nodes.get("siege-strike-flash");
    return strikeFlash;
  };
  const cupNode = (): NodeHandle | undefined => {
    if (!cupFlash) cupFlash = game.app.nodes.get("siege-cup-flash");
    return cupFlash;
  };

  return {
    strike(x, z, power) {
      strikeNode()?.setPosition(x, 0.3, z).setVisible(true);
      strikeFlashRemaining = 0.3;
      game.fx.burst("dust", [x, 0.12, z], { count: 8, speed: 1.4, color: "#d9c79a" });
      game.app.camera?.shake.add(0.1 + power * 0.08);
      game.session.hitStop(0.03);
    },
    impactWood(x, y, z) {
      game.fx.burst("debris", [x, Math.max(y, 0.15), z], { count: 6, speed: 2.2, color: "#a8823f" });
    },
    impactMetal(x, y, z) {
      game.fx.burst("spark", [x, Math.max(y, 0.15), z], { count: 5, speed: 2.6, color: "#ffd9a0" });
    },
    pinDown(x, y, z) {
      game.fx.burst("pickup", [x, Math.max(y, 0.4), z], { count: 8, speed: 2.4, color: "#ffcf5c" });
      game.app.camera?.shake.add(0.12);
    },
    pinSunk(x, z) {
      game.fx.burst("ring", [x, 0.1, z], { count: 10, speed: 3, color: "#59d7ff" });
      game.app.camera?.shake.add(0.18);
      game.session.hitStop(0.04);
    },
    cupFlash(x, z) {
      cupNode()?.setPosition(x, 0.06, z).setVisible(true);
      cupFlashRemaining = 0.5;
    },
    complete(x, z) {
      game.fx.burst("ring", [x, 0.3, z], { count: 16, speed: 4, color: "#ffcf5c" });
      game.app.camera?.shake.add(0.25);
    },
    failed() {
      game.app.camera?.shake.add(0.2);
      game.session.hitStop(0.05);
    },
    step(dt) {
      if (strikeFlashRemaining > 0) {
        strikeFlashRemaining -= dt;
        if (strikeFlashRemaining <= 0) {
          strikeNode()?.setPosition(0, -20, -20).setVisible(false);
        }
      }
      if (cupFlashRemaining > 0) {
        cupFlashRemaining -= dt;
        if (cupFlashRemaining <= 0) {
          cupNode()?.setPosition(0, -20, -20).setVisible(false);
        }
      }
    }
  };
}
