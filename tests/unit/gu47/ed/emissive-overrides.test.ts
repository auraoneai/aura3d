/**
 * GU47 E-D ED-5 / ED-6: per-instance emissive colour target, `setEmissive`, and the transmission / iridescence
 * override fields.
 */
import { describe, expect, it } from "vitest";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import "../../../../packages/rendering/src/lanes/prd01";
import "../../../../packages/rendering/src/lanes/prd04";
import { ForwardPass, Geometry, Material, MockRenderDevice, PBRMaterial, type RenderItem } from "../../../../packages/rendering/src";
import { generateProgramImpl } from "../../../../packages/rendering/src/program/ProgramGenerator";
import { setRendererQrFlags } from "../../../../packages/rendering/src/renderer/FrameGraph";
import { normalizeProgramFeatures } from "../../../../packages/rendering/src/program/ProgramFeatures";
import {
  A3D_INSTANCE_COLOR_TARGET_FEATURE,
  A3D_INSTANCE_EMISSIVE_ATTRIBUTE,
  materialInstanceColorTarget,
  registerInstanceColorTargetFeature,
  selectInstanceColorTargetFeature
} from "../../../../packages/rendering/src/shaders/chunks/instance_color_target.glsl";
import {
  MATERIAL_INSTANCE_COLOR_TARGET_PARAM,
  applyMaterialEmissive,
  applyMaterialOverrides,
  applyNodeMaterialExtras,
  lowerModelMaterialOverrides,
  setMaterialInstanceColorTarget,
  snapshotMaterials
} from "../../../../packages/engine/src/production-runtime/ModelMaterialOverrides";
import { StubModelMaterialHandle } from "../../../../packages/engine/src/contracts/materials";
import { parseAuraColor } from "../../../../packages/engine/src/contracts/sceneGraph";

const FLAGS = resolveQrFlags({ env: { A3D_QR: "core,materials" } });
const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const LIGHT1 = { dir: 1, point: 0, spot: 0, rect: 0, clustered: false, hemisphere: false } as const;
const transforms = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -1, 0, 0, 1, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 1]);
const colors = new Float32Array([1, 0.2, 0.1, 1, 0.1, 0.4, 1, 1]);

function glbMaterials(): Material[] {
  return [
    new Material({ name: "brake", shaderKey: "test", parameters: { u_emissiveColor: [0, 0, 0], u_emissiveStrength: 0, u_transmissionFactor: 0, u_iridescenceFactor: 0 } as never }),
    new Material({ name: "body", shaderKey: "test", parameters: { u_emissiveFactor: [0, 0, 0], u_emissiveStrength: 0 } as never }),
    new Material({ name: "glass", shaderKey: "test", parameters: { u_baseColorFactor: [1, 1, 1, 1] } as never })
  ];
}

describe("GU47 ED-6 setEmissive", () => {
  it("writes colour (linear) and strength on the named material only, live and write-on-change", () => {
    const mats = glbMaterials();
    expect(applyMaterialEmissive(mats, "brake", "#ff2010", 3)).toBe(1);
    const [r, g, b] = parseAuraColor("#ff2010");
    expect(mats[0]!.getParameter("u_emissiveColor")).toEqual([r, g, b]);
    expect(mats[0]!.getParameter("u_emissiveStrength")).toBe(3);
    expect(mats[1]!.getParameter("u_emissiveStrength")).toBe(0);
    const revision = mats[0]!.getRevision();
    applyMaterialEmissive(mats, "brake", "#ff2010", 3);
    expect(mats[0]!.getRevision()).toBe(revision);
  });

  it('"*" targets every material that carries emissive parameters; negative or NaN intensity clamps to 0', () => {
    const mats = glbMaterials();
    expect(applyMaterialEmissive(mats, "*", "#00ff00", -4)).toBe(2);
    expect(mats[1]!.getParameter("u_emissiveFactor")).toEqual([0, 1, 0]);
    expect(mats[1]!.getParameter("u_emissiveStrength")).toBe(0);
    expect(mats[2]!.getParameter("u_emissiveColor")).toBeUndefined();
    applyMaterialEmissive(mats, "*", "#00ff00", Number.NaN);
    expect(mats[0]!.getParameter("u_emissiveStrength")).toBe(0);
  });

  it("a later setMaterialOverrides re-applies from the authored snapshot and replaces the live write", () => {
    const mats = glbMaterials();
    const snapshot = snapshotMaterials(mats);
    applyMaterialEmissive(mats, "brake", "#ffffff", 5);
    applyMaterialOverrides(snapshot, mats, []);
    expect(mats[0]!.getParameter("u_emissiveStrength")).toBe(0);
  });

  it("the flag-off stub records the call", () => {
    const stub = new StubModelMaterialHandle(undefined, ["brake"]);
    expect(stub.inspectMaterials()[0]!.warnings).toEqual([]);
    stub.setEmissive("brake", "#ff0000", 2);
    expect(stub.inspectMaterials()[0]!.warnings).toEqual(["STUB_MATERIAL_HANDLE"]);
  });
});

describe("GU47 ED-6 transmission / iridescence override fields", () => {
  it("write the KHR factors (clamped 0..1) on materials whose authored snapshot carries them", () => {
    const mats = glbMaterials();
    const snapshot = snapshotMaterials(mats);
    applyMaterialOverrides(snapshot, mats, lowerModelMaterialOverrides(undefined, [{ transmission: 0.7, iridescence: 2 }]));
    expect(mats[0]!.getParameter("u_transmissionFactor")).toBe(0.7);
    expect(mats[0]!.getParameter("u_iridescenceFactor")).toBe(1);
    expect(mats[2]!.getParameter("u_transmissionFactor")).toBeUndefined();
    applyMaterialOverrides(snapshot, mats, []);
    expect(mats[0]!.getParameter("u_transmissionFactor")).toBe(0);
  });
});

describe("GU47 ED-5 per-instance emissive colour target", () => {
  it("the node's instanceColorTarget reaches the material (write on change; base clears)", () => {
    const material = new PBRMaterial({ name: "lamps" });
    expect(materialInstanceColorTarget(material)).toBe("base");
    applyNodeMaterialExtras(material, undefined, "emissive");
    expect(material.getParameter(MATERIAL_INSTANCE_COLOR_TARGET_PARAM)).toBe(1);
    expect(materialInstanceColorTarget(material)).toBe("emissive");
    expect(setMaterialInstanceColorTarget(material, "emissive")).toBe(false);
    expect(setMaterialInstanceColorTarget(material, "both")).toBe(true);
    expect(materialInstanceColorTarget(material)).toBe("both");
    setMaterialInstanceColorTarget(material, undefined);
    expect(materialInstanceColorTarget(material)).toBe("base");
  });

  it("selects only for instanced forward draws with colours whose material targets the emissive term", () => {
    registerInstanceColorTargetFeature();
    const material = new PBRMaterial({ name: "lamps" });
    const item = (extra: Partial<RenderItem>) => ({ geometry: Geometry.litCube(1), material, modelMatrix: IDENTITY, ...extra }) as RenderItem;
    expect(selectInstanceColorTargetFeature(item({ instanceTransforms: transforms, instanceColors: colors }), "forward")).toBeUndefined();
    setMaterialInstanceColorTarget(material, "emissive");
    expect(selectInstanceColorTargetFeature(item({ instanceTransforms: transforms, instanceColors: colors }), "forward")).toBe("emissive");
    expect(selectInstanceColorTargetFeature(item({ instanceTransforms: transforms }), "forward")).toBeUndefined();
    expect(selectInstanceColorTargetFeature(item({ instanceTransforms: transforms, instanceColors: colors }), "shadow" as never)).toBeUndefined();
  });

  it("emissive: the colours feed only the emissive term (no base multiply); both: base and emissive", () => {
    registerInstanceColorTargetFeature();
    const emissive = generateProgramImpl(normalizeProgramFeatures({ lighting: "lit", lights: LIGHT1, instancing: { color: false }, features: { [A3D_INSTANCE_COLOR_TARGET_FEATURE]: "emissive" } }), { flags: FLAGS as never });
    expect(emissive.vertex).toContain(`in vec4 ${A3D_INSTANCE_EMISSIVE_ATTRIBUTE};`);
    expect(emissive.fragment).toContain("a3dEmissive *= v_a3dInstanceEmissiveTint.rgb;");
    expect(emissive.fragment).not.toMatch(/#define USE_INSTANCING_COLOR/);
    const both = generateProgramImpl(normalizeProgramFeatures({ lighting: "lit", lights: LIGHT1, instancing: { color: true }, features: { [A3D_INSTANCE_COLOR_TARGET_FEATURE]: "both" } }), { flags: FLAGS as never });
    expect(emissive.vertex).toMatch(/#define A3D_INSTANCE_EMISSIVE_ATTRIBUTE/);
    expect(both.fragment).toMatch(/#define USE_INSTANCING_COLOR/);
    expect(both.fragment).toContain("a3dEmissive *= v_instanceColor.rgb;");
    expect(both.vertex).not.toMatch(/#define A3D_INSTANCE_EMISSIVE_ATTRIBUTE/);
  });

  it("ForwardPass binds the colour buffer as the emissive attribute for target emissive, as a_instanceColor otherwise", () => {
    const run = (target: "emissive" | "both" | undefined) => {
      const material = new PBRMaterial({ name: `lamps-${target ?? "base"}`, baseColor: [0.2, 0.2, 0.2, 1] });
      setMaterialInstanceColorTarget(material, target);
      const device = new MockRenderDevice();
      // Generated programs only (the default core path); the frozen legacy library has no emissive target.
      setRendererQrFlags(FLAGS, device);
      device.beginFrame(8, 8);
      new ForwardPass({ items: [{ geometry: Geometry.litCube(1), material, modelMatrix: IDENTITY, instanceTransforms: transforms, instanceColors: colors, label: "lamps" }] })
        .execute({ device, width: 8, height: 8 });
      device.endFrame();
      const draw = device.drawCommands.find((command) => command.label?.startsWith("lamps"));
      return draw?.instanceAttributes?.map((attribute) => attribute.shaderName) ?? [];
    };
    expect(run("emissive")).toContain(A3D_INSTANCE_EMISSIVE_ATTRIBUTE);
    expect(run("emissive")).not.toContain("a_instanceColor");
    expect(run("both")).toContain("a_instanceColor");
    expect(run(undefined)).toContain("a_instanceColor");
  });
});
