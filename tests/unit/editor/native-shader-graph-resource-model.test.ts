import { describe, expect, it } from "vitest";
import { ShaderGraphModel } from "../../../packages/editor-runtime/src/ShaderGraphModel";
import { ShaderGraphPanel, type ShaderGraphPanelState } from "../../../apps/editor/src/panels/ShaderGraphPanel";

describe("shader graph resource authoring", () => {
  it("only connects coordinate types accepted by the selected resource and result", () => {
    const model = new ShaderGraphModel({ version: 1, stage: "material", resources: [
      { name: "image", kind: "texture2d" },
      { name: "volume", kind: "texture3d" },
      { name: "depth", kind: "depth2d" }
    ], nodes: [
      { id: "uv", op: "constant", type: "vec2", value: [0, 0] },
      { id: "uvw", op: "constant", type: "vec3", value: [0, 0, 0] },
      { id: "sample", op: "textureSample", type: "vec4", resource: "volume" },
      { id: "load", op: "textureLoad", type: "f32", resource: "depth" }
    ] });
    expect(model.inputPorts("sample")[0]).toMatchObject({ name: "Texture coordinates", acceptedTypes: ["vec3"] });
    expect(model.canConnect("uv", "sample", 0)).toBe(false);
    model.connect("uvw", "sample", 0);
    model.connect("uv", "load", 0);
    model.setOutput("color", "sample");
    model.setOutput("opacity", "load");
    expect(model.validate("glsl")).toEqual([]);
    expect(model.compile("wgsl").material?.outputTypes).toMatchObject({ color: "vec4", opacity: "f32" });

    model.updateNode("sample", { resource: "image" });
    expect(model.inputPorts("sample")[0]).toMatchObject({ acceptedTypes: ["vec2"], connectedNodeId: "uvw" });
    expect(model.canConnect("uvw", "sample", 0)).toBe(false);
    expect(model.validate().some((diagnostic) => diagnostic.nodeId === "sample" && diagnostic.code === "type-mismatch")).toBe(true);
    expect(model.undo()).toBe(true);
    expect(model.inputPorts("sample")[0]?.acceptedTypes).toEqual(["vec3"]);
    model.updateNode("load", { resource: "volume" });
    expect(model.inputPorts("load")[0]?.acceptedTypes).toEqual([]);
  });

  it("filters live texture choices and displays unavailable or unsupported saved resources honestly", () => {
    const state: ShaderGraphPanelState = {
      status: "uncompiled", diagnostics: [], canUndo: false, canRedo: false,
      graph: { nodes: [], outputs: {}, resources: [
        { name: "volume", kind: "texture3d" },
        { name: "depth", kind: "depth2d" },
        { name: "image", kind: "texture2d" },
        { name: "data", kind: "storage-buffer", type: "f32" }
      ] },
      bindings: { depth: "lost-depth", image: [1, 2] },
      textures: [
        { id: "vol-id", label: "Volume", kind: "texture3d" },
        { id: "image-id", label: "Image", kind: "texture2d" }
      ]
    };
    const element = { innerHTML: "" };
    const panel = Object.create(ShaderGraphPanel.prototype) as ShaderGraphPanel;
    Object.assign(panel, { element, controller: { state: () => state, operations: () => [] },
      error: "", selectedOperation: "", selectedType: "", resourceName: "", resourceKind: "uniform", resourceType: "f32" });
    panel.render();
    const row = (name: string): string => {
      const start = element.innerHTML.indexOf(`<span>${name} (`);
      expect(start).toBeGreaterThan(-1);
      return element.innerHTML.slice(start, element.innerHTML.indexOf("</div>", start));
    };
    expect(row("volume")).toContain('value="vol-id"');
    expect(row("volume")).not.toContain('value="image-id"');
    expect(row("depth")).toContain("No compatible live 2D depth texture is available.");
    expect(row("depth")).toContain("Saved texture unavailable: lost-depth");
    expect(row("image")).toContain("Invalid saved binding");
    expect(row("image")).toContain('value="image-id"');
    expect(row("data")).toContain("Binding unavailable for this resource");
    expect(row("data")).not.toContain("Uniform value");
    expect(element.innerHTML).toContain('value="texture3d"');
    expect(element.innerHTML).toContain('value="depth2d"');

    const compute: ShaderGraphPanelState = { ...state, status: "unsupported", graph: { ...state.graph!, stage: "compute" } };
    Object.assign(panel, { controller: { state: () => compute, operations: () => [] } });
    panel.render();
    expect(element.innerHTML).toContain("Compute graph editing and preview are unavailable here");
    expect(element.innerHTML).toContain("Resources (read-only)");
    expect(element.innerHTML).toContain("data (storage-buffer, f32)");
    expect(element.innerHTML).not.toContain("data-resource-binding");
    expect(element.innerHTML).not.toContain('data-graph-action="add-resource"');
  });
});
