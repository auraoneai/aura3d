import assert from "node:assert/strict";
import { describe, test } from "vitest";
import type { Command } from "../../../packages/editor-runtime/src/Command.js";
import { createAnimationSceneNode } from "../../../packages/editor-runtime/src/AnimationSceneEditor.js";
import { createRootEditorSurface } from "../../../packages/editor-runtime/src/index.js";

class CounterCommand implements Command {
  readonly name = "counter";
  constructor(private readonly counter: { value: number }, private readonly delta: number) {}
  execute(): void {
    this.counter.value += this.delta;
  }
  undo(): void {
    this.counter.value -= this.delta;
  }
}

describe("O3 bounded root editor surface", () => {
  test("surface carries the editor capability label, never root", () => {
    const surface = createRootEditorSurface();
    assert.equal(surface.capabilityLabel, "editor");
  });

  test("undo/redo round-trips a command through shared history", async () => {
    const surface = createRootEditorSurface();
    const counter = { value: 0 };
    assert.equal(surface.canUndo, false);
    await surface.execute(new CounterCommand(counter, 2));
    assert.equal(counter.value, 2);
    assert.equal(surface.canUndo, true);
    await surface.undo();
    assert.equal(counter.value, 0);
    assert.equal(surface.canRedo, true);
    await surface.redo();
    assert.equal(counter.value, 2);
  });

  test("gizmo attach covers translate/rotate/scale with snap settings", () => {
    const surface = createRootEditorSurface();
    const translate = surface.attachGizmo("translate");
    const rotate = surface.attachGizmo("rotate");
    const scale = surface.attachGizmo("scale");
    assert.equal(translate.kind, "translate");
    assert.equal(rotate.kind, "rotate");
    assert.equal(scale.kind, "scale");
    assert.equal(translate.gizmo.enabled, true);

    const snapped = surface.configureGizmoSnap({ snapEnabled: true, positionSnap: 0.5, rotationSnapDegrees: 15 });
    assert.equal(snapped.snapEnabled, true);
    assert.equal(snapped.positionSnap, 0.5);
    const rebound = surface.attachGizmo("translate");
    assert.equal(rebound.settings().snapEnabled, true);
    assert.equal(rebound.settings().positionSnap, 0.5);

    const interactive = surface.createInteractiveGizmo({ mode: "rotate" });
    assert.ok(interactive);
    translate.gizmo.dispose();
    assert.equal(translate.gizmo.enabled, false);
  });

  test("play-mode toggle captures and restores through the host adapter", () => {
    let restored: unknown;
    const surface = createRootEditorSurface({
      snapshotAdapter: {
        capture: () => ({ selection: ["a"] }),
        restore: (snapshot) => {
          restored = snapshot;
        }
      }
    });
    assert.equal(surface.isPlaying, false);
    surface.enterPlayMode();
    assert.equal(surface.isPlaying, true);
    assert.throws(() => surface.enterPlayMode(), /already active/);
    surface.exitPlayMode();
    assert.equal(surface.isPlaying, false);
    assert.deepEqual(restored, { selection: ["a"] });
  });

  test("outliner read model describes hierarchy without DOM", () => {
    const surface = createRootEditorSurface();
    const root = createAnimationSceneNode({
      id: "scene",
      name: "Scene",
      kind: "set",
      children: [
        createAnimationSceneNode({ id: "hero", name: "Hero", kind: "character" }),
        createAnimationSceneNode({ id: "lamp", name: "Lamp", kind: "prop" })
      ]
    });
    const items = surface.describeOutliner(root);
    assert.equal(items.length, 3);
    assert.deepEqual(items.map((item) => String(item.id)), ["scene", "hero", "lamp"]);
  });
});
