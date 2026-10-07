// apps/showcase-neon-swarm/src/v2/scene/fx.ts — event fx (T2.5).
// Thin bridge from real sim events to game.fx primitives + session juice.
// The runtime-owned fx nodes (pulse ray, burst ring/spokes…) live in world.ts
// and are toggled from boot.ts; this module owns only the engine fx layer.
import type { Game } from "@aura3d/engine";

export function wireSwarmFx(game: Game) {
  return {
    pulseFired(at: [number, number, number]) {
      game.fx.burst("spark", at, { count: 4, speed: 2.2, color: "#35e6ff" });
    },
    droneHit(at: [number, number, number]) {
      game.fx.burst("spark", at, { count: 5, speed: 2.6, color: "#7de8ff" });
    },
    droneDied(at: [number, number, number], elite: boolean) {
      game.fx.burst(elite ? "explosion-small" : "debris", at, {
        count: elite ? 14 : 10,
        speed: elite ? 4.2 : 3.2,
        color: elite ? "#ff4d7e" : "#73b99d"
      });
    },
    burstFired(at: [number, number, number]) {
      game.fx.burst("explosion-small", at, { count: 24, speed: 5.4, color: "#ffc857" });
      game.session.hitStop(0.05);
      game.app.camera?.shake.add(0.2);
    },
    dashed(at: [number, number, number]) {
      game.fx.burst("streak", at, { count: 6, speed: 3.4, color: "#35e6ff" });
      game.app.camera?.shake.add(0.08);
    },
    playerHurt(at: [number, number, number]) {
      game.fx.burst("debris", at, { count: 6, speed: 2.4, color: "#ff5a36" });
      game.app.camera?.shake.add(0.16);
    },
    pickupTaken(at: [number, number, number]) {
      game.fx.burst("pickup", at, { count: 12, speed: 2.8, color: "#ffc857" });
    },
    waveStarted() {
      game.app.camera?.shake.add(0.06);
    },
    waveCleared() {
      game.session.hitStop(0.04);
    },
    playerDied(at: [number, number, number]) {
      game.fx.burst("explosion-small", at, { count: 30, speed: 5.8, color: "#ff5a36" });
      game.session.hitStop(0.09);
      game.app.camera?.shake.add(0.28);
    }
  };
}
