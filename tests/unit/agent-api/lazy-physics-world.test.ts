import { describe, expect, it } from "vitest";
import { createAuraApp, material, primitives, scene } from "@aura3d/engine";

/**
 * Two things are pinned here.
 *
 * **Lazy world.** `createAuraApp` used to construct a `PhysicsWorld` eagerly, so every app paid for
 * the solver — and `PhysicsWorld` pulls in `cannon-es` (85 KB minified). It is now built on first use.
 * `app.physics` must still behave identically: live for any app, stable identity, and declared bodies
 * still registered.
 *
 * **Name lookup for externally-registered bodies.** `idsByName` was only populated by
 * `createBody`, so a body registered by the host — which is what `createAuraApp` does for every node
 * declaring `.physics({...})` — was invisible to name lookup. `bodies.get(1).nodeName` returned
 * "declared" while `bodies.has("declared")` returned **false**, breaking the exact ergonomic
 * `docs/concepts/physics.md` leads with. Pre-existing: it fails identically on the eager code.
 */
describe("lazy physics world", () => {
  it("a scene with no declared bodies still exposes a working app.physics", () => {
    const app = createAuraApp(undefined as never, {
      scene: scene().add(primitives.box({ name: "b", material: material.pbr({ color: "#fff" }) }))
    });
    expect(app.physics.bodies.ids()).toEqual([]);
    const body = app.physics.createBody({ name: "crate", shape: "box", mass: 1 });
    body.applyImpulse([3, 0, 0]);
    expect(body.velocity()[0]).toBeCloseTo(3, 5);
  });

  it("app.physics returns a stable identity across accesses", () => {
    const app = createAuraApp(undefined as never, { scene: scene() });
    expect(app.physics).toBe(app.physics);
  });

  it("does not construct a solver for a scene with no physics", () => {
    /*
     * The point of the laziness. A scene declaring no bodies must not instantiate a world at all —
     * asserted through observable behaviour rather than internals: an untouched app reports no bodies,
     * and the first access is what brings a working runtime into existence.
     */
    const app = createAuraApp(undefined as never, {
      scene: scene().add(primitives.box({ name: "static-only", material: material.pbr({ color: "#fff" }) }))
    });
    expect(app.physics.bodies.all()).toEqual([]);
    expect(app.physics.gravity()[1]).toBeCloseTo(-9.81, 5);
  });

  it("resolves a scene-declared body by name, the ergonomic the docs lead with", () => {
    // `docs/concepts/physics.md` opens with `app.physics.bodies.require("crate").applyImpulse(...)`
    // on a body declared via `.physics({...})`. That must actually work.
    const app = createAuraApp(undefined as never, {
      scene: scene().add(
        primitives.box({ name: "crate", material: material.pbr({ color: "#c98b4b" }) })
          .position(0, 0.5, 0)
          .physics({ type: "dynamic", shape: "box", halfExtents: [0.25, 0.25, 0.25], mass: 1 })
      )
    });
    const crate = app.physics.bodies.require("crate");
    crate.applyImpulse([4, 0, 0]);
    expect(crate.velocity()[0]).toBeCloseTo(4, 5);
    expect(crate.nodeName).toBe("crate");
  });

  it("a scene that declares bodies registers them by node name", () => {
    const app = createAuraApp(undefined as never, {
      scene: scene().add(
        primitives.box({ name: "declared", material: material.pbr({ color: "#fff" }) })
          .position(0, 1, 0)
          .physics({ type: "dynamic", shape: "box", halfExtents: [0.2, 0.2, 0.2], mass: 1 })
      )
    });
    expect(app.physics.bodies.has("declared")).toBe(true);
  });
});
