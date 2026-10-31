// GU47 phase 3: a sky node's sky leaves with its scene. Aura Hoops 3D found the Venice sky still drawing over the next
// court after setVenue -> setScene, because the effect system only ever set the sky from a scene's sky node.

import { describe, expect, it } from "vitest";
import { sky } from "../../../../packages/engine/src/agent-api/nodes/sky";
import type { EffectNodeLike } from "../../../../packages/engine/src/production-runtime/effects/EffectNodeLowering";
import { ProductionEffectSystem, type AppLike } from "../../../../packages/engine/src/production-runtime/effects/ProductionEffectSystem";

function systemFor(nodes: EffectNodeLike[]): { system: ProductionEffectSystem; app: { scene: { nodes: EffectNodeLike[] } }; step(): void } {
  const callbacks: ((frame: { dt: number }) => void)[] = [];
  const app = { scene: { nodes }, onFrame: (cb: (frame: { dt: number }) => void) => { callbacks.push(cb); return () => undefined; } };
  const system = new ProductionEffectSystem(app as AppLike, { tier: "high" });
  return { system, app, step: () => { for (const cb of callbacks) cb({ dt: 1 / 60 }); } };
}

const gradientSky = (): EffectNodeLike => sky.gradient({ name: "venice-sky", top: "#2b4f8f", horizon: "#f4b27a" } as never).toJSON() as EffectNodeLike;

describe("GU47 phase 3: scene sky lifecycle", () => {
  it("a scene's sky node sets the live sky", () => {
    const { system } = systemFor([gradientSky()]);
    expect(system.atmosphere.state().sky?.model).toBe("gradient");
  });

  it("switching to a scene without a sky node clears the previous scene's sky", () => {
    const { system, app, step } = systemFor([gradientSky()]);
    expect(system.atmosphere.state().sky).not.toBeNull();
    app.scene.nodes = [];
    step();
    expect(system.atmosphere.state().sky).toBeNull();
    expect(system.atmosphere.report().background).toBe("none");
  });

  it("switching to a scene with its own sky node takes the new sky", () => {
    const { system, app, step } = systemFor([gradientSky()]);
    app.scene.nodes = [sky.preetham({ name: "next-court" } as never).toJSON() as EffectNodeLike];
    step();
    expect(system.atmosphere.state().sky?.model).toBe("preetham");
  });

  it("a sky set at runtime through the atmosphere stays across a scene change", () => {
    const { system, app, step } = systemFor([]);
    system.atmosphere.setSky({ model: "gradient" } as never);
    app.scene.nodes = [];
    step();
    expect(system.atmosphere.state().sky?.model).toBe("gradient");
  });
});
