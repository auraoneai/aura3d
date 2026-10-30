// GU47 WP-6 (E-F) item 9: in a 60 s soak on a simulated clock, liveCount
// returns to 0 within 1.2 s after the last burst, and the particle pool is
// empty again (spent emitters retired, no particle batch left to draw).

import { describe, expect, it } from "vitest";
import { MockRenderDevice } from "../../../../packages/rendering/src/RenderDevice";
import { ParticleBatchPass } from "../../../../packages/rendering/src/vfx/ParticleBatchPass";
import type { FrameContributorContext } from "../../../../packages/rendering/src/contracts/frameGraph";
import { createAuraApp, scene } from "../../../../packages/engine/src";
import { createGameEffects, type GameEffectKind } from "../../../../packages/engine/src/agent-api/vfx/gameEffects";
import { prd07SystemFor, resetPrd07AppRegistry } from "../../../../packages/engine/src/agent-api/vfx/effects-api";
import { mulberry32 } from "../../../../packages/engine/src/production-runtime/effects/CpuEmitter";

const ctx = {
  device: null,
  camera: null,
  sceneDepth: { texture: null, available: false, linearize: { near: 0.1, far: 1000, orthographic: false } },
  blackboard: new Map()
} as never as FrameContributorContext;

/** Game-effect kinds Links, FC and Iron Crown fire (through createGameEffects -> app.effects.spawn). */
const GAME_KINDS: readonly GameEffectKind[] = ["hit-spark", "block-spark", "ground-dust", "dash-trail", "slash-trail", "impact-flash", "aura-burst", "ring-shockwave", "super-flash"];
/** Built-in burst kinds whose preset life is at most 1.1 s, plus their genre variants. */
const BURST_KINDS = ["spark", "ring", "streak", "pickup", "explosion-small", "muzzle", "splash", "impact-flash", "super-flash", "aura-burst", "spark-fire", "spark-electric", "pickup-gold", "pickup-gem"];

function soak(fire: (rng: () => number, app: ReturnType<typeof createAuraApp>) => void) {
  resetPrd07AppRegistry();
  const app = createAuraApp(null, { autoStart: false, scene: scene(), qualityRebuild: { flags: ["vfx"] } });
  const system = prd07SystemFor(app)!;
  const pass = new ParticleBatchPass(new MockRenderDevice());
  const rng = mulberry32(1414);
  const dt = 1 / 60;
  let t = 0;
  let nextFire = 0;
  let peakLive = 0;
  let lastFireAt = 0;
  // 60 s of play: an effect every 0.05-0.45 s.
  while (t < 60) {
    if (t >= nextFire) {
      fire(rng, app);
      lastFireAt = t;
      nextFire = t + 0.05 + rng() * 0.4;
    }
    app.step(dt);
    system.feed(pass);
    pass.transparentItems(ctx);
    peakLive = Math.max(peakLive, app.effects!.liveCount);
    t += dt;
  }
  // After the last effect: frames until the pool is empty.
  let settle = t - lastFireAt;
  while (app.effects!.liveCount > 0 && settle < 5) {
    app.step(dt);
    system.feed(pass);
    settle += dt;
  }
  system.feed(pass);
  const drawItems = pass.transparentItems(ctx).length;
  const emitters = system.emitterIds().length;
  app.dispose();
  return { settle, peakLive, drawItems, emitters };
}

describe("GU47 E-F item 9: liveCount soak", () => {
  it("game effects (the Links / FC / Iron Crown path): liveCount is 0 within 1.2 s of the last effect after 60 s", () => {
    let fx: ReturnType<typeof createGameEffects> | null = null;
    const result = soak((rng, app) => {
      fx ??= createGameEffects({ app });
      const kind = GAME_KINDS[Math.floor(rng() * GAME_KINDS.length)]!;
      fx.spawn(kind, [rng() * 10 - 5, 0.5 + rng(), rng() * 10 - 5]);
    });
    expect(result.peakLive).toBeGreaterThan(0);
    expect(result.settle).toBeLessThanOrEqual(1.2);
    expect(result.drawItems).toBe(0);
    expect(result.emitters).toBe(0);
  });

  it("raw bursts of the short-lived presets: liveCount is 0 within 1.2 s of the last burst after 60 s", () => {
    const result = soak((rng, app) => {
      const kind = BURST_KINDS[Math.floor(rng() * BURST_KINDS.length)]!;
      app.effects!.burst(kind, [rng() * 8 - 4, 1, rng() * 8 - 4], { count: 8 + Math.floor(rng() * 24) });
    });
    expect(result.peakLive).toBeGreaterThan(0);
    expect(result.settle).toBeLessThanOrEqual(1.2);
    expect(result.drawItems).toBe(0);
    expect(result.emitters).toBe(0);
  });
});
