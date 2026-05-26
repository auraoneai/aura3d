import { describe, expect, it } from "vitest";
import { createStaticExportHtml, createStaticExportRuntime } from "@aura3d/editor-runtime";
import { ProjectSerializer, type EditorProject } from "../../../apps/editor/src/project/ProjectSerializer";
import { StaticProjectExporter } from "../../../apps/editor/src/export/StaticProjectExporter";

describe("ProjectSerializer", () => {
  it("creates deterministic versioned project JSON and restores scene hierarchy", () => {
    const serializer = new ProjectSerializer();
    const project = serializer.createDefaultProject(new Date("2026-03-04T05:06:07.000Z"));
    const saved = serializer.serialize(project);
    const loaded = serializer.parse(saved);
    const built = serializer.buildScene(loaded);

    expect(loaded.version).toBe(1);
    expect(loaded.metadata.savedAt).toBe("2026-03-04T05:06:07.000Z");
    expect(loaded.metadata.provenance?.runtimePackage).toBe("@aura3d/editor-runtime");
    expect(loaded.metadata.provenance?.evidenceHash).toMatch(/^a3d-prov-[0-9a-f]{8}$/);
    expect(loaded.scene.nodes[0]?.particleEmitter).toMatchObject({
      enabled: false,
      preset: "none",
      emissionRate: 24,
      maxParticles: 160
    });
    expect(built.scene.getNodeById("node-hero")?.name).toBe("Hero Cube");
    expect(built.scene.getNodeById("node-child")?.parent?.id).toBe("node-hero");
  });

  it("captures scene edits while preserving project authoring metadata", () => {
    const serializer = new ProjectSerializer();
    const project = serializer.createDefaultProject();
    const built = serializer.buildScene(project);
    const hero = built.scene.getNodeById("node-hero");
    expect(hero).toBeTruthy();

    hero!.name = "Captured Hero";
    hero!.transform.setPosition(2, 3, 4);
    const captured = serializer.captureScene(built.scene, project);
    const capturedHero = captured.scene.nodes.find((node) => node.id === "node-hero");

    expect(capturedHero?.name).toBe("Captured Hero");
    expect(capturedHero?.transform.position).toEqual([2, 3, 4]);
    expect(capturedHero?.material.name).toBe("Mint Material");
    expect(captured.importSettings).toEqual(project.importSettings);
    expect(captured.plugins).toEqual(["aura3d.default-authoring"]);
  });

  it("rejects unsupported versions, duplicate node ids, missing parents, and invalid import scale", () => {
    const serializer = new ProjectSerializer();
    const project = serializer.createDefaultProject();

    expect(() => serializer.validate({ ...project, version: 99 as 1 })).toThrow(/Unsupported editor project version/);
    expect(() => serializer.validate({
      ...project,
      scene: { nodes: [project.scene.nodes[0]!, { ...project.scene.nodes[1]!, id: project.scene.nodes[0]!.id }] }
    })).toThrow(/Duplicate or empty project node id/);
    expect(() => serializer.validate({
      ...project,
      scene: { nodes: [{ ...project.scene.nodes[0]!, parentId: "missing-parent" }] }
    })).toThrow(/references missing parent/);
    expect(() => serializer.validate({
      ...project,
      importSettings: { ...project.importSettings, scale: 0 }
    })).toThrow(/scale must be a positive finite number/);
  });

  it("migrates legacy v0 projects into the current legacy project format", () => {
    const serializer = new ProjectSerializer();
    const migrated = serializer.parse(JSON.stringify({
      version: 0,
      metadata: {
        name: "Legacy Browser Scene",
        savedAt: "2026-02-03T04:05:06.000Z"
      },
      scene: {
        nodes: [
          {
            id: "legacy-root-node",
            name: "Legacy Root Node",
            position: [1, 2, 3],
            material: { name: "Legacy Material", baseColor: "#abcdef", metallic: 0.2, roughness: 0.7 }
          }
        ]
      },
      assets: [
        {
          id: "legacy-asset",
          name: "Legacy Asset",
          type: "gltf",
          uri: "legacy.glb"
        }
      ],
      importSettings: {
        scale: 2,
        orientation: "z-up"
      },
      export: {
        title: "Legacy Export",
        entryNodeId: "legacy-root-node"
      }
    }));

    expect(migrated.version).toBe(1);
    expect(migrated.metadata.name).toBe("Legacy Browser Scene");
    expect(migrated.metadata.provenance?.authoringTool).toBe("aura3d-browser-editor");
    expect(migrated.scene.nodes[0]?.transform.position).toEqual([1, 2, 3]);
    expect(migrated.scene.nodes[0]?.material.textureSlots).toEqual({
      baseColor: "",
      normal: "",
      metallicRoughness: "",
      emissive: ""
    });
    expect(migrated.scene.nodes[0]?.particleEmitter).toMatchObject({
      enabled: false,
      preset: "none"
    });
    expect(migrated.assets[0]).toMatchObject({
      id: "legacy-asset",
      folder: "Migrated",
      status: "warning",
      diagnostics: ["Migrated from v0 project"]
    });
    expect(migrated.importSettings.scale).toBe(2);
    expect(migrated.importSettings.orientation).toBe("z-up");
    expect(migrated.export.title).toBe("Legacy Export");
    expect(serializer.buildScene(migrated).scene.getNodeById("legacy-root-node")?.name).toBe("Legacy Root Node");
  });

  it("round-trips custom asset records and static export project JSON", () => {
    const serializer = new ProjectSerializer();
    const project: EditorProject = {
      ...serializer.createDefaultProject(),
      assets: [
        {
          id: "asset-chair",
          name: "Chair",
          type: "gltf",
          uri: "assets/chair.gltf",
          importedAt: "2026-03-04T05:06:07.000Z",
          preview: "1 mesh",
          diagnostics: ["ok"]
        }
      ]
    };
    const projectWithEmitter: EditorProject = {
      ...project,
      scene: {
        nodes: [
          {
            ...project.scene.nodes[0]!,
            particleEmitter: {
              enabled: true,
              preset: "fountain",
              emissionRate: 48,
              maxParticles: 256,
              lifetime: 1.5,
              speed: 3.2,
              looping: true
            }
          },
          ...project.scene.nodes.slice(1)
        ]
      }
    };

    const parsed = serializer.parse(serializer.serialize(projectWithEmitter));
    const exported = new StaticProjectExporter().export(parsed);

    expect(parsed.assets[0]?.name).toBe("Chair");
    expect(parsed.scene.nodes[0]?.particleEmitter).toMatchObject({
      enabled: true,
      preset: "fountain",
      emissionRate: 48,
      maxParticles: 256
    });
    expect(exported.files.map((file) => file.path)).toEqual(["index.html", "project.json", "runtime.js"]);
    expect(exported.files.find((file) => file.path === "runtime.js")?.content).not.toContain("EditorShell");
  });

  it("uses the public editor-runtime static export package without loading the editor shell", () => {
    const html = createStaticExportHtml({ title: "Runtime Only Export" });
    const runtime = createStaticExportRuntime();

    expect(html).toContain('<script type="module" src="./runtime.js"></script>');
    expect(runtime).toContain("__AURA3D_EXPORTED_PROJECT__");
    expect(runtime).toContain('fetch("./project.json")');
    expect(runtime).toContain("provenanceHash");
    expect(runtime).not.toContain("__AURA3D_EDITOR_APP__");
    expect(runtime).not.toContain("EditorShell");
  });

  it("rejects forged or incomplete editor-authored provenance", () => {
    const serializer = new ProjectSerializer();
    const project = serializer.createDefaultProject();
    const withoutProvenance = {
      ...project,
      metadata: { name: project.metadata.name, savedAt: project.metadata.savedAt }
    };
    const forged = {
      ...project,
      metadata: {
        ...project.metadata,
        provenance: {
          ...project.metadata.provenance!,
          evidenceHash: "a3d-prov-forged"
        }
      }
    };

    expect(() => serializer.verifyEditorAuthoredProvenance(withoutProvenance)).toThrow(/missing metadata\.provenance/);
    expect(() => serializer.validate(forged)).toThrow(/evidenceHash/);
  });
});
