import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { StaticProjectExporter } from "../../apps/editor/src/export/StaticProjectExporter";
import { ProjectSerializer } from "../../apps/editor/src/project/ProjectSerializer";

describe("editor-authored project replay", () => {
  it("replays the checked-in editor-authored project through save/load/export runtime boundaries", () => {
    const serializer = new ProjectSerializer();
    const source = readFileSync(resolve("examples/editor-authored-project/project.json"), "utf8");
    const project = serializer.parse(source);

    expect(project.metadata.name).toBe("Editor Authored Sample");
    expect(project.metadata.provenance?.evidenceHash).toBe("a3d-prov-198756a1");
    expect(() => serializer.verifyEditorAuthoredProvenance(project)).not.toThrow();
    expect(project.metadata.provenance?.operations.map((operation) => operation.runtimeApi)).toEqual([
      "EditorRuntime.select",
      "EditorRuntime.executeCommand",
      "EditorRuntime.executeCommand",
      "ProjectSerializer.serialize",
      "StaticProjectExporter.export",
      "createStaticExportRuntime"
    ]);
    expect(project.assets[0]?.diagnostics).toContain("authored through editor import workflow fixture");

    const built = serializer.buildScene(project);
    expect(built.scene.getNodeById("node-hero")?.name).toBe("Hero Cube");
    expect(built.scene.getNodeById("node-child")?.parent?.id).toBe("node-hero");

    const replayedProject = serializer.parse(serializer.serialize(serializer.captureScene(built.scene, project)));
    expect(replayedProject.scene.nodes.map((node) => [node.id, node.parentId])).toEqual([
      ["node-hero", null],
      ["node-child", "node-hero"]
    ]);

    const exported = new StaticProjectExporter().export(replayedProject);
    expect(exported.entry).toBe("index.html");
    expect(exported.files.map((file) => file.path)).toEqual(["index.html", "project.json", "runtime.js"]);
    expect(exported.files.find((file) => file.path === "runtime.js")?.content).toContain("__AURA3D_EXPORTED_PROJECT__");
    expect(exported.files.find((file) => file.path === "runtime.js")?.content).toContain("provenanceHash");
    expect(exported.files.find((file) => file.path === "runtime.js")?.content).not.toContain("__AURA3D_EDITOR_APP__");
  });
});
