import { describe, expect, it } from "vitest";
import { EditorPluginHost } from "@aura3d/editor-runtime";

describe("EditorPluginHost", () => {
  it("registers panel, tool, importer, and scripting node contributions", () => {
    const host = new EditorPluginHost();

    host.register({
      id: "acme.authoring",
      name: "Acme Authoring",
      panels: [
        { id: "inspector-extra", title: "Inspector Extra", order: 20 },
        { id: "asset-extra", title: "Asset Extra", order: 10 }
      ],
      tools: [{ id: "snap-move", title: "Snap Move", cursor: "crosshair" }],
      importers: [{ id: "acme-gltf", label: "Acme glTF", extensions: [".gltf", ".glb"] }],
      scriptingNodes: [{ id: "spin-node", title: "Spin Node", category: "Transform" }]
    });

    const snapshot = host.snapshot();
    expect(snapshot.plugins.map((plugin) => plugin.id)).toEqual(["acme.authoring"]);
    expect(snapshot.panels.map((panel) => panel.id)).toEqual(["asset-extra", "inspector-extra"]);
    expect(snapshot.tools[0]?.cursor).toBe("crosshair");
    expect(snapshot.importers[0]?.extensions).toEqual([".gltf", ".glb"]);
    expect(snapshot.scriptingNodes[0]?.category).toBe("Transform");
  });

  it("supports unregister and clear for editor extension lifecycle", () => {
    const host = new EditorPluginHost();
    host.register({ id: "acme.lifecycle", name: "Acme Lifecycle", panels: [{ id: "lifecycle", title: "Lifecycle" }] });

    expect(host.get("acme.lifecycle")?.name).toBe("Acme Lifecycle");
    expect(host.unregister("acme.lifecycle")).toBe(true);
    expect(host.list()).toEqual([]);

    host.register({ id: "acme.lifecycle", name: "Acme Lifecycle" });
    host.clear();
    expect(host.snapshot().plugins).toEqual([]);
  });

  it("rejects invalid ids, duplicate plugin ids, and duplicate contribution ids", () => {
    const host = new EditorPluginHost();

    expect(() => host.register({ id: "bad id", name: "Bad" })).toThrow(/plugin id/);
    host.register({ id: "acme.unique", name: "Unique" });
    expect(() => host.register({ id: "acme.unique", name: "Duplicate" })).toThrow(/already registered/);
    expect(() => host.register({
      id: "acme.duplicates",
      name: "Duplicates",
      tools: [
        { id: "duplicate-tool", title: "First" },
        { id: "duplicate-tool", title: "Second" }
      ]
    })).toThrow(/duplicate tool/);
  });
});
