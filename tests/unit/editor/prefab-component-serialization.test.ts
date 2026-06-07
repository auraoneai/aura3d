import { describe, expect, it } from "vitest";
import { PrefabRegistry, type EditorPrefabNodeBase } from "../../../packages/editor-runtime/src";

interface ComponentPrefabNode extends EditorPrefabNodeBase {
  readonly components: readonly {
    readonly type: "Transform" | "Animator" | "CombatState" | "AudioState" | "EvidenceId";
    readonly data: Record<string, unknown>;
  }[];
}

describe("PrefabRegistry component serialization", () => {
  it("serializes component-bearing prefabs and instantiates independent component copies", () => {
    const registry = new PrefabRegistry<ComponentPrefabNode>();
    const prefab = registry.create({
      id: "fighter-prefab",
      name: "Fighter Prefab",
      rootNodeId: "fighter-root",
      createdAt: "2026-06-06T00:00:00.000Z",
      nodes: [
        {
          id: "fighter-root",
          name: "Fighter Root",
          parentId: null,
          components: [
            { type: "Transform", data: { position: [0, 0, 0], facing: 1 } },
            { type: "Animator", data: { state: "idle", clip: "Idle" } },
            { type: "CombatState", data: { hp: 360, meter: 0 } },
            { type: "AudioState", data: { bus: "combat", muted: false } },
            { type: "EvidenceId", data: { id: "fighter-prefab-template" } }
          ]
        }
      ]
    });

    registry.register(prefab);
    const [player] = registry.instantiate("fighter-prefab", { idPrefix: "player", nameSuffix: " Player" });
    const [rival] = registry.instantiate("fighter-prefab", { idPrefix: "rival", nameSuffix: " Rival" });

    expect(JSON.parse(JSON.stringify(prefab))).toMatchObject({
      schemaVersion: "aura3d-prefab",
      id: "fighter-prefab",
      nodes: [{ components: expect.arrayContaining([expect.objectContaining({ type: "CombatState" })]) }]
    });
    expect(player.id).toBe("player-fighter-root");
    expect(rival.id).toBe("rival-fighter-root");
    expect(player.name).toBe("Fighter Root Player");
    expect(rival.name).toBe("Fighter Root Rival");
    expect(player.components).toEqual(rival.components);
    expect(player).not.toBe(rival);
  });
});
