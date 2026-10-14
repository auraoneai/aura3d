// apps/showcase-pulse-tunnel/src/v2/scene/fx.ts — juice wiring (T2.5).
// Maps lane/jump/slide/graze/collision/pass/beat/section events onto
// game.fx bursts + hitStop + camera shake. The beat ring breathes through
// the shared "pulse-beat-ring" runtime node.
import type { Game } from "@aura3d/engine";

type NodeHandle = ReturnType<Game["app"]["nodes"]["get"]>;

export interface PulseFx {
  laneSwitch(x: number, y: number, z: number): void;
  jump(x: number, y: number, z: number): void;
  slide(x: number, y: number, z: number): void;
  graze(x: number, y: number, z: number): void;
  shieldHit(x: number, y: number, z: number, final: boolean): void;
  gatePassed(x: number, z: number): void;
  beat(beat: number): void;
  sectionRise(): void;
  runOver(completed: boolean): void;
  step(dt: number): void;
}

export function wirePulseFx(game: Game): PulseFx {
  let beatRingScale = 0;
  let grazeFlashRemaining = 0;
  let grazeFlash: NodeHandle | undefined;
  let beatRing: NodeHandle | undefined;

  const grazeNode = (): NodeHandle | undefined => {
    if (!grazeFlash) grazeFlash = game.app.nodes.get("pulse-graze-flash");
    return grazeFlash;
  };
  const beatNode = (): NodeHandle | undefined => {
    if (!beatRing) beatRing = game.app.nodes.get("pulse-beat-ring");
    return beatRing;
  };

  return {
    laneSwitch(x, y, z) {
      game.fx.burst("streak", [x, Math.max(y, 0.1), z], { count: 3, speed: 2.4, color: "#3ff2ff" });
    },
    jump(x, y, z) {
      game.fx.burst("dust", [x, 0.05, z], { count: 4, speed: 1.6, color: "#bae6fd" });
    },
    slide(x, y, z) {
      game.fx.burst("streak", [x, 0.08, z], { count: 4, speed: 3, color: "#67e8f9" });
    },
    graze(x, y, z) {
      const flash = grazeNode();
      flash?.setPosition(x, Math.max(y, 0.2), z).setVisible(true);
      grazeFlashRemaining = 0.35;
      game.fx.burst("pickup", [x, Math.max(y, 0.2), z], { count: 6, speed: 2.2, color: "#ffd166" });
      game.app.camera?.shake.add(0.08);
    },
    shieldHit(x, y, z, final) {
      game.fx.burst("ring", [x, Math.max(y, 0.35), z + 0.15], { count: 8, speed: 4, color: "#ff4fd8" });
      game.fx.burst("debris", [x, 0.4, z], { count: 6, speed: 3 });
      game.app.camera?.shake.add(final ? 0.5 : 0.3);
      game.session.hitStop(final ? 0.08 : 0.05);
    },
    gatePassed(x, z) {
      game.fx.burst("spark", [x, 0.5, z], { count: 2, speed: 1.4 });
    },
    beat(beat) {
      // Beat ring breathes every quarter note; a small kick every bar.
      beatRingScale = beat % 4 === 0 ? 1.35 : 1.12;
      if (beat % 4 === 0) {
        game.fx.burst("ring", [0, 0.35, 1.55], { count: 4, speed: 1.2, color: "#ff4fd8" });
      }
    },
    sectionRise() {
      game.fx.burst("ring", [0, 0.35, 1.55], { count: 14, speed: 5, color: "#a78bfa" });
      game.app.camera?.shake.add(0.22);
      game.session.hitStop(0.04);
    },
    runOver(completed) {
      game.app.camera?.shake.add(completed ? 0.25 : 0.55);
      game.session.hitStop(completed ? 0.03 : 0.09);
      if (!completed) {
        game.fx.burst("explosion-small", [0, 0.4, 1.55], { count: 18, speed: 4.5 });
      }
    },
    step(dt) {
      if (beatRingScale > 0.9) {
        beatRingScale = Math.max(0.9, beatRingScale - dt * 1.6);
        beatNode()?.setScale([0.9 * beatRingScale, 0.66 * beatRingScale, 1]);
      }
      if (grazeFlashRemaining > 0) {
        grazeFlashRemaining -= dt;
        if (grazeFlashRemaining <= 0) {
          grazeNode()?.setPosition(0, -20, -20).setVisible(false);
        }
      }
    }
  };
}
