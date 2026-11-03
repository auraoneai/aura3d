// S5-WP19-04: `interactions.pointer({ target })` routes real pointer events
// only to its target node (the nearest hit under the pointer).
import { describe, expect, it } from "vitest";
import { scene } from "../../../packages/engine/src/agent-api/nodes/scene";
import { primitives } from "../../../packages/engine/src/agent-api/nodes/primitives";
import { interactions } from "../../../packages/engine/src/agent-api/nodes/interactions";
import { bindPointerInteractions, type AuraPointerInteractionEvent } from "../../../packages/engine/src/agent-api/nodes/pointerInteraction";
import { OPTION_COVERAGE_ROWS } from "../../../packages/engine/src/agent-api/compiler/optionCoverage";

function fakeCanvas() {
  const listeners = new Map<string, Set<(event: unknown) => void>>();
  return {
    listeners,
    addEventListener: (type: string, fn: (event: unknown) => void) => { (listeners.get(type) ?? listeners.set(type, new Set()).get(type)!).add(fn); },
    removeEventListener: (type: string, fn: (event: unknown) => void) => { listeners.get(type)?.delete(fn); },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 200, height: 100 }),
    dispatch(type: string, event: { clientX: number; clientY: number; pointerId?: number }) { for (const fn of listeners.get(type) ?? []) fn(event); }
  };
}

// Camera at +z looking at the origin; crate-a fills the left half, crate-b the right.
const sceneWith = (pointer: ReturnType<typeof interactions.pointer>) => scene()
  .camera({ mode: "perspective", position: [0, 0, 6], target: [0, 0, 0], fov: 50 })
  .add(primitives.box({ name: "crate-a", position: [-2, 0, 0] }))
  .add(primitives.box({ name: "crate-b", position: [2, 0, 0] }))
  .add(pointer)
  .toJSON();

// Screen x for world x = +-2 at z = 0: ndc = 2 / (6 * tan(25deg) * aspect 2) ~ 0.357.
const OVER_A = { clientX: 100 * (1 - 0.357), clientY: 50 };
const OVER_B = { clientX: 100 * (1 + 0.357), clientY: 50 };
const OVER_NOTHING = { clientX: 100, clientY: 50 };

function bind(target: string | undefined) {
  const canvas = fakeCanvas();
  const events: AuraPointerInteractionEvent[] = [];
  const app = { canvas, scene: sceneWith(interactions.pointer(target === undefined ? {} : { target })) };
  const dispose = bindPointerInteractions(app, (event) => events.push(event));
  return { canvas, events, dispose };
}

describe("interactions.pointer target", () => {
  it("routes events only when the target is the nearest hit, for both probe targets", () => {
    const row = OPTION_COVERAGE_ROWS.find((candidate) => candidate.builder === "interactions.pointer" && candidate.field === "target")!;
    expect(row.disposition).toBe("runtime");
    expect(row.observation).toBe("interaction.pointerTarget");
    const routed = (target: string) => {
      const { canvas, events } = bind(target);
      canvas.dispatch("pointerdown", { ...OVER_A, pointerId: 1 });
      canvas.dispatch("pointerdown", { ...OVER_B, pointerId: 2 });
      canvas.dispatch("pointerdown", { ...OVER_NOTHING, pointerId: 3 });
      return events.map((event) => [event.pointerId, event.target, event.hit?.nodeName]);
    };
    expect(routed(row.probeValueA as string)).toEqual([[1, "crate-a", "crate-a"]]);
    expect(routed(row.probeValueB as string)).toEqual([[2, "crate-b", "crate-b"]]);
  });

  it("routes every pointer phase over the target", () => {
    const { canvas, events } = bind("crate-a");
    canvas.dispatch("pointerdown", OVER_A);
    canvas.dispatch("pointermove", OVER_A);
    canvas.dispatch("pointerup", OVER_A);
    canvas.dispatch("pointermove", OVER_B);
    expect(events.map((event) => event.phase)).toEqual(["down", "move", "up"]);
  });

  it("routes every sample, hit or miss, without a target", () => {
    const { canvas, events } = bind(undefined);
    canvas.dispatch("pointerdown", OVER_A);
    canvas.dispatch("pointerdown", OVER_NOTHING);
    expect(events.map((event) => [event.target, event.hit?.nodeName])).toEqual([[undefined, "crate-a"], [undefined, undefined]]);
  });

  it("stops routing after dispose", () => {
    const { canvas, events, dispose } = bind("crate-a");
    dispose();
    canvas.dispatch("pointerdown", OVER_A);
    expect(events).toEqual([]);
    expect([...canvas.listeners.values()].every((set) => set.size === 0)).toBe(true);
  });

  it("names the missing element when the app has no canvas", () => {
    expect(() => bindPointerInteractions({ scene: sceneWith(interactions.pointer({ target: "crate-a" })) }, () => {}))
      .toThrow(/POINTER_INTERACTION_NO_ELEMENT/);
  });
});
