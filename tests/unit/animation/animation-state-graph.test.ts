import { describe, expect, it } from "vitest";
import { AnimationStateGraph } from "../../../packages/animation/src/AnimationStateGraph";

describe("AnimationStateGraph one-shot and terminal states", () => {
  it("consumes trigger parameters so held attack input does not repeat one-shots", () => {
    const graph = new AnimationStateGraph([
      {
        name: "idle",
        transitions: [
          {
            to: "heavy",
            label: "heavy pressed",
            consumeParameters: ["heavy"],
            condition: (params) => params.heavy === true
          }
        ]
      },
      {
        name: "heavy",
        duration: 0.3,
        oneShot: true,
        onComplete: "idle"
      }
    ], "idle");

    graph.setParameter("heavy", true);
    expect(graph.update(0.016)).toBe("heavy");
    expect(graph.parameters.heavy).toBe(false);

    expect(graph.update(0.15)).toBe("heavy");
    expect(graph.update(0.15)).toBe("idle");
    expect(graph.update(0.016)).toBe("idle");
  });

  it("keeps KO terminal after completion even when attack triggers remain true", () => {
    const graph = new AnimationStateGraph([
      {
        name: "idle",
        transitions: [
          { to: "ko", priority: 10, condition: (params) => params.health === 0 },
          { to: "jab", priority: 1, consumeParameters: ["jab"], condition: (params) => params.jab === true }
        ]
      },
      { name: "jab", duration: 0.2, oneShot: true, onComplete: "idle" },
      { name: "ko", duration: 0.5, terminal: true, completedParameter: "koComplete" }
    ], "idle");

    graph.setParameter("health", 0);
    graph.setParameter("jab", true);
    expect(graph.update(0)).toBe("ko");
    expect(graph.update(1)).toBe("ko");
    expect(graph.currentState).toBe("ko");
    expect(graph.parameters.koComplete).toBe(true);

    const snapshot = graph.graphSnapshot();
    expect(snapshot.currentState).toBe("ko");
    expect(snapshot.states.find((state) => state.name === "ko")).toMatchObject({
      current: true,
      terminal: true,
      completed: true
    });
  });

  it("rejects invalid one-shot completion targets at construction time", () => {
    expect(() =>
      new AnimationStateGraph([
        { name: "idle", transitions: [{ to: "attack", condition: () => true }] },
        { name: "attack", duration: 0.2, oneShot: true, onComplete: "missing" }
      ], "idle")
    ).toThrow(/completion target missing does not exist/);
  });
});
