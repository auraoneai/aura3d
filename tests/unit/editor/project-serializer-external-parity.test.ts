import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ProjectSerializer } from "../../../apps/editor/src/project/ProjectSerializer";
import { StaticProjectExporter } from "../../../apps/editor/src/export/StaticProjectExporter";

describe("ExternalParity editor project serialization and static export", () => {
  it("creates a ExternalParity starter project with asset, material, light, camera, physics, script, and export settings", () => {
    const serializer = new ProjectSerializer();
    const project = serializer.createExternalParityStarterProject();
    const fox = project.scene.nodes.find((node) => node.id === "node-external-parity-fox");

    expect(project.metadata.name).toBe("ExternalParity Editor Authored Starter");
    expect(project.assets).toHaveLength(1);
    expect(project.assets[0]).toMatchObject({
      name: "Fox.glb",
      type: "gltf",
      status: "imported"
    });
    expect(fox).toMatchObject({
      name: "Imported Fox Hero",
      mesh: { primitive: "imported", assetId: "asset-external-parity-fox" },
      material: { name: "Edited ExternalParity Fox Material", baseColor: "#ff8844" },
      physics: { body: "dynamic", collider: "box" },
      animation: { enabled: true, clip: "Run" },
      script: { enabled: true, behavior: "BounceBehavior" }
    });
    expect(project.scene.nodes.some((node) => node.light.kind === "point" && node.light.intensity > 0)).toBe(true);
    expect(project.scene.nodes.some((node) => node.camera.enabled)).toBe(true);
    expect(project.export.entryNodeId).toBe("node-external-parity-camera");
    expect(project.metadata.provenance?.authoringTool).toBe("aura3d-browser-editor");
    expect(() => serializer.validate(project)).not.toThrow();
  });

  it("exports ExternalParity project JSON and a runtime-only app with ExternalParity claim boundaries", () => {
    const serializer = new ProjectSerializer();
    const project = serializer.createExternalParityStarterProject();
    const exported = new StaticProjectExporter().export(project);
    const runtime = exported.files.find((file) => file.path === "runtime.js")?.content ?? "";
    const projectJson = exported.files.find((file) => file.path === "project.json")?.content ?? "";
    const parsedProject = serializer.parse(projectJson);

    serializer.verifyEditorAuthoredProvenance(parsedProject);
    expect(exported.files.map((file) => file.path)).toEqual(["index.html", "project.json", "runtime.js"]);
    expect(runtime).toContain("Browser-first local authoring and static export workflow");
    expect(runtime).toContain("Unity replacement");
    expect(runtime).toContain("featureEvidence");
    expect(runtime).toContain("playBehaviorActive");
    expect(runtime).not.toContain("EditorShell");
    expect(runtime).not.toContain("__AURA3D_EDITOR_APP__");
  });

  it("validates the checked-in ExternalParity editor-authored static project provenance", () => {
    const serializer = new ProjectSerializer();
    const project = serializer.parse(readFileSync(resolve("examples/external-editor-authored-app/project.json"), "utf8"));

    serializer.verifyEditorAuthoredProvenance(project);
    expect(project.metadata.name).toBe("ExternalParity Editor Authored Sample");
    expect(project.assets[0]?.name).toBe("Fox.glb");
    expect(project.scene.nodes.some((node) => node.mesh.primitive === "imported" && node.mesh.assetId === "asset-external-parity-fox")).toBe(true);
    expect(project.scene.nodes.some((node) => node.camera.enabled)).toBe(true);
    expect(project.scene.nodes.some((node) => node.light.kind === "point")).toBe(true);
    expect(project.scene.nodes.some((node) => node.script.enabled)).toBe(true);
  });
});
