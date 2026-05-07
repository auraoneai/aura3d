import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { EditorPluginHost, ReparentNodeCommand } from "@galileo3d/editor-runtime";
import { ProjectSerializer } from "../../apps/editor/src/project/ProjectSerializer";
import { StaticProjectExporter } from "../../apps/editor/src/export/StaticProjectExporter";

describe("editor project save/load workflow", () => {
  it("round-trips versioned project JSON and restores scene hierarchy", () => {
    const serializer = new ProjectSerializer();
    const project = serializer.createDefaultProject(new Date("2026-02-03T04:05:06.000Z"));
    const saved = serializer.serialize(project);
    const loaded = serializer.parse(saved);
    const built = serializer.buildScene(loaded);

    expect(loaded.version).toBe(1);
    expect(built.scene.root.children[0]?.name).toBe("Hero Cube");
    expect(built.scene.getNodeById("node-child")?.parent?.id).toBe("node-hero");
    expect(serializer.serialize(serializer.captureScene(built.scene, loaded))).toContain("Hero Cube");
  });

  it("serializes reparented authoring changes through public editor-runtime commands", async () => {
    const serializer = new ProjectSerializer();
    const project = serializer.createDefaultProject();
    const built = serializer.buildScene(project);
    const child = built.scene.getNodeById("node-child");
    const hero = built.scene.getNodeById("node-hero");
    expect(child).toBeTruthy();
    expect(hero).toBeTruthy();

    await new ReparentNodeCommand(child!, built.scene.root).execute();

    const captured = serializer.captureScene(built.scene, project);
    expect(captured.scene.nodes.find((node) => node.id === "node-child")?.parentId).toBeNull();
  });

  it("exports a static project runtime without editor app modules", () => {
    const serializer = new ProjectSerializer();
    const project = serializer.createDefaultProject();
    const exported = new StaticProjectExporter().export(project);

    expect(exported.entry).toBe("index.html");
    expect(exported.files.map((file) => file.path)).toEqual(["index.html", "project.json", "runtime.js"]);
    expect(exported.files.find((file) => file.path === "runtime.js")?.content).not.toContain("EditorShell");
    expect(exported.files.find((file) => file.path === "project.json")?.content).toContain('"version": 1');
  });

  it("loads the checked-in editor-authored project fixture", () => {
    const source = readFileSync(resolve("examples/editor-authored-project/project.json"), "utf8");
    const project = new ProjectSerializer().parse(source);

    expect(project.metadata.name).toBe("Editor Authored Sample");
    expect(project.assets[0]?.type).toBe("gltf");
    expect(project.scene.nodes.some((node) => node.script.behavior === "SpinBehavior")).toBe(true);
  });
});

describe("editor plugin API", () => {
  it("registers panels, tools, importers, and scripting nodes with deterministic snapshots", () => {
    const plugins = new EditorPluginHost();
    plugins.register({
      id: "acme.authoring",
      name: "Acme authoring",
      panels: [{ id: "acme.panel", title: "Acme Panel", order: 2 }],
      tools: [{ id: "acme.tool", title: "Acme Tool" }],
      importers: [{ id: "acme.gltf", label: "Acme glTF", extensions: [".gltf"] }],
      scriptingNodes: [{ id: "acme.node", title: "Acme Node", category: "Logic" }]
    });

    const snapshot = plugins.snapshot();
    expect(snapshot.plugins).toHaveLength(1);
    expect(snapshot.panels.map((panel) => panel.id)).toEqual(["acme.panel"]);
    expect(snapshot.tools.map((tool) => tool.id)).toEqual(["acme.tool"]);
    expect(snapshot.importers[0]?.extensions).toEqual([".gltf"]);
    expect(snapshot.scriptingNodes[0]?.category).toBe("Logic");
  });

  it("rejects duplicate plugin ids", () => {
    const plugins = new EditorPluginHost();
    plugins.register({ id: "acme.authoring", name: "Acme authoring" });

    expect(() => plugins.register({ id: "acme.authoring", name: "Duplicate" })).toThrow(/already registered/);
  });
});
