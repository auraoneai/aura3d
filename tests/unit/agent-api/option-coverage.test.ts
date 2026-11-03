// Option probes exercise named downstream consumers. These are source-level
// observations; they do not imply rendered-pixel or device evidence.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { auditOptionProbes, documentedOptionReferences, optionCoverageRule, readOptionProbeSummaries, typedOptionGaps, typedOptionInventory } from "../../../tools/arch-gates/rules/option-coverage";
import { OPTION_COVERAGE_ROWS } from "../../../packages/engine/src/agent-api/compiler/optionCoverage";
import type { OptionCoverageRow } from "../../../packages/engine/src/contracts/compiler";
import { primitives } from "../../../packages/engine/src/agent-api/nodes/primitives";
import { instances } from "../../../packages/engine/src/agent-api/nodes/instances";
import { interactions } from "../../../packages/engine/src/agent-api/nodes/interactions";
import { geometry } from "../../../packages/engine/src/agent-api/nodes/geometry";
import { lights } from "../../../packages/engine/src/agent-api/nodes/lights";
import { effects } from "../../../packages/engine/src/agent-api/nodes/effects.composite";
import { material } from "../../../packages/engine/src/agent-api/nodes/material";
import { model, unsafeModelUrl } from "../../../packages/engine/src/agent-api/nodes/model";
import { qrPrimitiveGeometryOptions } from "../../../packages/engine/src/agent-api/compiler/geometry";
import { createProductionModelInstanceTransforms, createProductionPrimitiveGeometry, createProductionRuntimePrimitiveEntries, qrPrimitiveMeshFor } from "../../../packages/engine/src/agent-api/compiler/primitives";
import { createProductionRuntimeRendererInput } from "../../../packages/engine/src/agent-api/compiler/renderInput";
import { createProductionRuntimeEnvironmentFog } from "../../../packages/engine/src/agent-api/compiler/fog";
import { collectPrd02Lights, physicalLightDescriptor } from "../../../packages/engine/src/agent-api/compiler/lights";
import { applyModelTintBridge } from "../../../packages/engine/src/agent-api/compiler/modelMaterials";
import { Prd03PostSurface, mapBloomOptionsV2 } from "../../../packages/engine/src/agent-api/postBridge";
import { registeredPostPasses } from "../../../packages/rendering/src/contracts/post";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags";
import { scene } from "../../../packages/engine/src/agent-api/nodes/scene";
import { collectAuraSceneEvidence } from "../../../packages/engine/src/agent-api/sceneEvidence";
import { camera } from "../../../packages/engine/src/agent-api/nodes/camera";
import { resolveCameraFrame } from "../../../packages/engine/src/agent-api/compiler/camera";
import { createFromSpecRig } from "../../../packages/engine/src/agent-api/camera/rigs/fromSpec";
import type { AuraPrimitiveNode, AuraModelNode } from "../../../packages/engine/src/agent-api/nodes/types";

const modelAsset = unsafeModelUrl("/fixtures/probe.glb");
const triangle = { kind: "aura-custom-geometry" as const, positions: [[0, 0, 0], [1, 0, 0], [0, 1, 0]] as const, indices: [0, 1, 2] };
const baseTransforms = [{ position: [0, 0, 0] as const }];
const qr = qrPrimitiveGeometryOptions(resolveQrFlags({}), undefined, {});

function build(row: OptionCoverageRow, value: unknown): any {
  const option = { [row.field]: value };
  switch (row.builder) {
    case "effects.fog": return effects.fog(option);
    case "effects.bloom": return effects.bloom(option);
    case "effects.toon": return effects.toon(option);
    case "lights.directional": return lights.directional(option);
    case "lights.studio": return lights.studio(option);
    case "lights.hemisphere": return lights.hemisphere(option);
    case "geometry.define": return geometry.define({ positions: triangle.positions, indices: triangle.indices, ...option });
    case "geometry.custom": return geometry.custom(triangle, option);
    case "instances.cylinder": return instances.cylinder({ transforms: baseTransforms, ...option });
    case "instances.cone": return instances.cone({ transforms: baseTransforms, ...option });
    case "instances.model": return instances.model(modelAsset, { transforms: baseTransforms, ...option });
    case "interactions.orbit": return interactions.orbit(option);
    case "model": return model(modelAsset, option);
    case "material.pbr": return material.pbr(option);
    case "material.metal": return material.metal(option);
    case "interactions.hover": return interactions.hover(option);
    case "material.custom": return material.custom({
      glsl: { fragment: "out vec4 outColor; void main(){outColor=vec4(strength * float(TINT));}" },
      uniforms: { strength: { type: "f32", value: 0.5 } }, defines: { TINT: 1 }, ...option
    });
    case "primitives.box": return primitives.box(option);
    case "primitives.capsule": return primitives.capsule(option);
    case "primitives.cylinder": return primitives.cylinder(option);
    case "primitives.plane": return primitives.plane(option);
    default: throw new Error(`No consumer fixture for ${row.builder}`);
  }
}

function observe(row: OptionCoverageRow, value: unknown): unknown {
  const built = build(row, value);
  if (row.builder === "effects.toon") {
    const surface = new Prd03PostSurface(resolveQrFlags({ options: { A3D_QR_POST: true } }));
    surface.addPostPass(built);
    try {
      const descriptor = registeredPostPasses().find((pass) => pass.id === `prd03.custom.${built.name}`);
      if (!descriptor) throw new Error("toon pass was not registered");
      if (row.field === "name") return descriptor.id;
      return descriptor.uniforms?.({} as never)[row.field === "bands" ? "u_bands" : row.field === "outline" ? "u_outline" : "u_texel"];
    } finally { surface.dispose(); }
  }
  if (row.builder === "geometry.define") {
    const mesh = createProductionPrimitiveGeometry(geometry.custom(built).toJSON());
    try {
      if (row.field === "bounds") return mesh.bounds;
      if (row.field === "indices") return Array.from(mesh.indexBuffer!.data);
      const semantic = row.field === "positions" ? "position" : "normal";
      return [0, 1, 2].flatMap((index) => [...mesh.vertexBuffer.getAttribute(index, semantic)]);
    } finally { mesh.dispose(); }
  }
  if (row.builder === "material.custom") {
    const entry = createProductionRuntimePrimitiveEntries([primitives.box({ material: built }).toJSON()])[0]!;
    const output = entry.resources[0]!.material as import("../../../packages/engine/src/agent-api/compiler/customMaterial").AuraCustomShaderMaterial;
    try {
      switch (row.field) {
        case "glsl": case "defines": case "fog": case "receiveShadow": return output.sources.glsl.fragment;
        case "wgsl": return output.sources.wgsl?.fragment;
        case "uniforms": return output.getParameter("u_strength");
        case "side": return output.renderState.cullMode;
        case "transparent": return output.renderState.blend;
        case "blending": return output.renderState.blendMode;
        case "depthWrite": return output.renderState.depthWrite;
        case "depthTest": return output.renderState.depthTest;
        default: throw new Error(`No custom material consumer for ${row.field}`);
      }
    } finally { output.dispose(); }
  }
  if (row.builder === "material.pbr" || row.builder === "material.metal") {
    const entry = createProductionRuntimePrimitiveEntries([primitives.box({ material: built }).toJSON()])[0]!;
    const param = row.observation === "pbr.color" ? "u_baseColor" : `u_${row.field}`;
    return entry.resources[0]!.material.getParameter(param);
  }
  const node = built.toJSON();
  if (row.observation === "interaction.hoverTargets") return collectAuraSceneEvidence(scene().add(built).toJSON()).interactions.hoverTargets;
  if (row.observation?.startsWith("fog.")) {
    const fog = createProductionRuntimeEnvironmentFog(scene().add(node).toJSON());
    if (!fog) throw new Error("fog consumer did not produce a fog input");
    return fog[row.field as "color" | "density"];
  }
  if (row.observation?.startsWith("bloom.")) {
    const result = mapBloomOptionsV2(node, 5).options;
    return result[row.field === "radius" ? "scatter" : row.field as "threshold" | "intensity"];
  }
  if (row.observation?.startsWith("hemisphere.")) {
    const resolved = collectPrd02Lights(scene().add(node).toJSON()).hemisphere[0]!;
    return resolved[row.observation.slice("hemisphere.".length) as "skyColor" | "groundColor" | "intensity" | "name" | "direction"];
  }
  if (row.observation?.startsWith("light.")) {
    const descriptor = physicalLightDescriptor(node, node.name ?? "studio");
    if (!descriptor) throw new Error("light consumer did not produce a descriptor");
    const key = row.observation.slice("light.".length);
    return descriptor[key === "shadow" ? "shadowRequested" : key as "name" | "intensity" | "color" | "position" | "direction"];
  }
  if (row.observation?.startsWith("orbit.")) {
    const snapshot = scene().camera(camera.orbit({ target: [0, 0, 0], position: [3, 2, 3] })).add(built).toJSON();
    const frame = resolveCameraFrame(snapshot, snapshot.camera, 1000);
    return row.field === "target" ? frame.target : frame.eye;
  }
  if (row.observation === "model.material") return applyModelTintBridge(node);
  if (row.observation === "model.instances") {
    const modelNode = node as AuraModelNode;
    return Array.from(createProductionModelInstanceTransforms(modelNode.instances!, modelNode, { min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] }, 0));
  }
  const primitiveNode = node as AuraPrimitiveNode;
  if (row.observation === "primitive.segments") return qrPrimitiveMeshFor(primitiveNode, qr)!.positions.length;
  const snapshot = scene().add(primitiveNode).toJSON();
  const entries = createProductionRuntimePrimitiveEntries([primitiveNode], qr);
  const input = createProductionRuntimeRendererInput(snapshot, { width: 640, height: 360 } as HTMLCanvasElement, [], entries, 0, undefined, new Set(), { color: [0, 0, 0], intensity: 0 }, []);
  const item = [...(input.source.collectRenderItems?.() ?? [])][0]!;
  switch (row.observation) {
    case "primitive.name": return item.label;
    case "primitive.material.color": return item.material?.getParameter("u_baseColor");
    case "primitive.size": return Array.from(item.modelMatrix as ArrayLike<number>);
    case "primitive.castShadow": return item.castShadow;
    case "instances.transforms": return Array.from(item.instanceTransforms!);
    case "instances.colors": return Array.from(item.instanceColors!);
    default: throw new Error(`No consumer observation for ${row.observation}`);
  }
}

/**
 * Observations exercised by the dedicated S5-WP19-04 probe suite
 * (tests/qr/prd15/compiler/optionProbes.test.ts: compiled render items, the
 * v2 bloom pipeline, toon pass uniforms, actor/instance model matrices and the
 * live fog) or by tests/unit/agent-api/pointer-interaction-target.test.ts.
 */
const DEDICATED_OBSERVATION = /^(renderItem\.|bloom\.v2\.|toon\.(uniform\.|fragment$|order$)|model\.(matrix|instanceMatrices)$|fog\.live\.|interaction\.pointerTarget$)/;

describe("typed option probes and real consumers", () => {
  const rows = OPTION_COVERAGE_ROWS.filter((row) => row.disposition === "runtime" && !DEDICATED_OBSERVATION.test(row.observation ?? ""));
  it("registers a useful set of consumer probes", () => { expect(rows.length).toBeGreaterThan(30); });
  it.each(rows.map((row) => [`${row.builder}.${row.field}`, row] as const))("%s reaches its named consumer", (_name, row) => {
    expect(row.observation).toBeTruthy();
    expect(observe(row, row.probeValueA), `${row.builder}.${row.field} -> ${row.observation}`).not.toEqual(observe(row, row.probeValueB));
  });

  it("pins independent numerical outcomes instead of accepting any changed input", () => {
    const row = (builder: string, field: string) => OPTION_COVERAGE_ROWS.find((r) => r.builder === builder && r.field === field)!;
    expect(observe(row("effects.fog", "density"), 0.05)).toBeCloseTo(0.05);
    expect(observe(row("effects.fog", "density"), 0.25)).toBeCloseTo(0.25);
    expect(observe(row("effects.bloom", "radius"), 0.2)).toBeCloseTo(0.2);
    expect(observe(row("lights.directional", "shadow"), false)).toBe(false);
    expect(observe(row("lights.directional", "shadow"), true)).toBe(true);
    const instanceMatrix = observe(row("instances.cylinder", "transforms"), [{ position: [2, 1, -1] }]) as number[];
    expect(instanceMatrix.slice(12, 15)).toEqual([2, 1, -1]);
  });

  it("rejects unsupported shape parameters with actionable options", () => {
    const row = OPTION_COVERAGE_ROWS.find((r) => r.disposition === "unsupported" && r.builder === "primitives.plane")!;
    // interactions.pointer({ target }) gained a runtime consumer (pointer-interaction-target.test.ts).
    const pointer = OPTION_COVERAGE_ROWS.find((r) => r.builder === "interactions.pointer" && r.field === "target")!;
    expect(pointer.disposition).toBe("runtime");
    expect(row.reason).toContain("size");
    expect(() => primitives.plane({ params: row.probeValueB as never })).toThrow(/Supported params: widthSegments, heightSegments/);
  });
});

describe("option discovery and ownership", () => {
  it("discovers nested calls without treating their inner keys as outer options", () => {
    const markdown = '```ts\nprimitives.box({ name: "box", material: material.pbr({ color: "#fff" }) })\n```';
    const found = documentedOptionReferences(markdown, "example.md");
    expect(found.map((r) => `${r.builder}.${r.field}`).sort()).toEqual(["material.pbr.color", "primitives.box.material", "primitives.box.name"]);
    const game = '```ts\nconst effects = game.effects({});\neffects.hitSpark([0, 0, 0], { ownerId: "p" });\neffects.fog({ density: 0.1 });\n```';
    expect(documentedOptionReferences(game, "game.md").map((r) => `${r.builder}.${r.field}`)).toEqual(["effects.fog.density"]);
    const positional = '```ts\ngeometry.custom({ positions: [0, 0, 0] }, { name: "mesh" });\n```';
    expect(documentedOptionReferences(positional, "mesh.md").map((r) => `${r.builder}.${r.field}`)).toEqual(["geometry.custom.name"]);
    const spread = documentedOptionReferences('```ts\nprimitives.box({ ...defaults });\n```', "dynamic.md");
    expect(auditOptionProbes(spread, [])[0]?.detail).toContain("primitives.box.*");
    const conditional = documentedOptionReferences('```ts\ninteractions.pointer(target ? { target } : {});\n```', "conditional.md");
    expect(conditional.map((r) => `${r.builder}.${r.field}`)).toEqual(["interactions.pointer.target"]);
    const signature = documentedOptionReferences('```ts\neffects.shaderPass({ name?, glsl? | fragment?: { glsl?, wgsl? } });\n```', "api.md");
    expect(signature).toEqual([]);
  });

  it("fails missing, duplicate, unverified and reasonless unsupported probes", () => {
    const refs = documentedOptionReferences('```ts\nprimitives.box({ size: 2 })\n```', "example.md");
    expect(auditOptionProbes(refs, []).map((f) => f.detail)).toContain("primitives.box.size has no typed consumer probe");
    const rows = [
      { builder: "primitives.box", field: "size", disposition: "unverified" as const, observation: "pending" },
      { builder: "primitives.box", field: "size", disposition: "unsupported" as const, observation: "error" }
    ];
    const findings = auditOptionProbes(refs, rows).map((f) => f.detail).join("\n");
    expect(findings).toContain("duplicate probe");
    expect(findings).toContain("actionable reason");
    expect(auditOptionProbes(refs, [rows[0]!]).map((f) => f.detail).join("\n")).toContain("unverified evidence only");
    expect(readOptionProbeSummaries('const primitive = forOptions<T>(); const rows = [primitive("primitives.box", "size", 1, 2, "primitive.size")];')[0]).toMatchObject({ builder: "primitives.box", field: "size", observation: "primitive.size", disposition: "runtime" });
  });

  it("discovers options passed through a const-bound object, not only inline literals", () => {
    const markdown = '```ts\nconst options = { size: 2, castShadow: true };\nconst alias = options;\nprimitives.box(alias);\nlet mutable = { name: "x" };\nprimitives.plane(mutable);\n```';
    expect(documentedOptionReferences(markdown, "bound.md").map((r) => `${r.builder}.${r.field}`).sort()).toEqual(["primitives.box.castShadow", "primitives.box.size"]);
  });

  it("derives every typed option of each probed builder from its public option type", () => {
    const inventory = typedOptionInventory(process.cwd());
    const keys = new Set(inventory.map((r) => `${r.builder}.${r.field}`));
    // Fields that no documented example spells out are still discovered.
    for (const key of ["material.pbr.clearcoat", "material.pbr.roughness", "lights.directional.shadow", "effects.toon.inkColor", "geometry.define.uvs", "primitives.box.receiveShadow"]) expect(keys.has(key), key).toBe(true);
    const gaps = typedOptionGaps(inventory, readOptionProbeSummaries(readFileSync("packages/engine/src/agent-api/compiler/optionCoverage.ts", "utf8")));
    const pbr = gaps.find((f) => f.detail.startsWith("material.pbr:"))?.detail ?? "";
    expect(pbr).toContain("clearcoat");
    // Probed fields are not reported as gaps.
    expect(pbr).not.toMatch(/: .*\broughness\b(?!Map)/);
    expect(gaps.every((f) => !f.enforced)).toBe(true);
  }, 120_000);

  it("all documented options have downstream evidence or an actionable unsupported diagnostic", () => {
    expect(optionCoverageRule([], process.cwd(), { typed: false }).filter((finding) => finding.enforced)).toEqual([]);
  });
});

/* -------------------- the two 4.1.2 silent no-ops (WP-S.2) ------------------- */

describe("WP-S.2 spot checks", () => {
  const options = qrPrimitiveGeometryOptions(resolveQrFlags({}), undefined, {});
  const planeVertices = (params?: Record<string, number>): number => {
    const node = primitives.plane(params ? { params } : {}).toJSON() as unknown as AuraPrimitiveNode;
    return qrPrimitiveMeshFor(node, options)!.positions.length / 3;
  };

  it("plane widthSegments / heightSegments subdivide the mesh", () => {
    expect(planeVertices()).toBe(4);
    expect(planeVertices({ widthSegments: 8, heightSegments: 4 })).toBe((8 + 1) * (4 + 1));
    expect(planeVertices({ widthSegments: 2 })).toBe((2 + 1) * (1 + 1));
  });

  it("plane rejects a shape key that has no effect, naming the supported params", () => {
    expect(() => primitives.plane({ params: { radius: 2 } as never })).toThrow(/Supported params: widthSegments, heightSegments/);
  });

  it("orbit takes a node name or a world point through typed overloads", () => {
    expect(interactions.orbit().toJSON()).toMatchObject({ kind: "interaction", mode: "orbit" });
    expect(interactions.orbit({ target: "cube" }).toJSON()).toMatchObject({ target: "cube" });
    expect(interactions.orbit("cube").toJSON()).toMatchObject({ target: "cube" });
    expect(interactions.orbit([0, 1, 0]).toJSON()).toMatchObject({ targetPoint: [0, 1, 0] });
    expect(interactions.orbit({ target: [0, 1, 0], position: [1, 2, 3], autoRotate: true }).toJSON()).toMatchObject({
      targetPoint: [0, 1, 0], orbitPosition: [1, 2, 3], autoRotate: 0.5
    });
    expect((interactions.orbit({ target: "cube" }).toJSON() as { ignoredOptions?: unknown }).ignoredOptions).toBeUndefined();
    // Unknown keys are reported, not dropped.
    expect((interactions.orbit({ speed: 2 } as never).toJSON() as { ignoredOptions?: string[] }).ignoredOptions?.[0]).toMatch(/"speed"[\s\S]*Valid options: target, position, autoRotate/);
  });

  describe("interactions.orbit configures the orbit camera", () => {
    const base = camera.orbit({ target: [0, 0.8, 0], position: [3, 2, 3], distance: 4 });
    const frameOf = (spec: ReturnType<typeof camera.orbit>, nodes: unknown[], timeMs = 0) => {
      const builder = scene().camera(spec);
      for (const node of nodes) builder.add(node as never);
      const snapshot = builder.toJSON();
      return { spec: snapshot.camera, frame: resolveCameraFrame(snapshot, snapshot.camera, timeMs) };
    };

    it("a world point becomes the pivot and the eye keeps its offset", () => {
      const { frame } = frameOf(base, [interactions.orbit([1, 0, 2])]);
      expect(frame.target).toEqual([1, 0, 2]);
      expect(frame.eye).toEqual([4, 1.2, 5]);
    });

    it("position pins the eye", () => {
      const { frame } = frameOf(base, [interactions.orbit({ target: [1, 0, 2], position: [9, 9, 9] })]);
      expect(frame.target).toEqual([1, 0, 2]);
      expect(frame.eye).toEqual([9, 9, 9]);
    });

    it("autoRotate turns the eye around the pivot at radians per second, keeping its radius and height", () => {
      const rotating = [interactions.orbit({ autoRotate: Math.PI / 2 })];
      const start = frameOf(base, rotating, 0).frame;
      const quarter = frameOf(base, rotating, 1000).frame;
      const radius = (eye: readonly number[], target: readonly number[]) => Math.hypot(eye[0]! - target[0]!, eye[2]! - target[2]!);
      expect(start.eye).toEqual([3, 2, 3]);
      expect(quarter.eye[0]).toBeCloseTo(3, 6);
      expect(quarter.eye[2]).toBeCloseTo(-3, 6);
      expect(quarter.eye[1]).toBe(2);
      expect(radius(quarter.eye, quarter.target)).toBeCloseTo(radius(start.eye, start.target), 6);
    });

    it("the camera rig path produces the same pose as resolveCameraFrame", () => {
      const { spec, frame } = frameOf(base, [interactions.orbit({ target: [1, 0, 2], autoRotate: 1 })], 2500);
      const rig = createFromSpecRig(spec as never);
      expect(rig.continuous).toBe(true);
      const pose = rig.update({ time: 2500, subject: () => undefined } as never);
      for (let axis = 0; axis < 3; axis += 1) {
        expect(pose.position[axis]).toBeCloseTo(frame.eye[axis]!, 9);
        expect(pose.target[axis]).toBeCloseTo(frame.target[axis]!, 9);
      }
    });

    it("leaves non-orbit cameras and scenes without an orbit interaction untouched", () => {
      const perspective = camera.perspective({ position: [0, 1, 4], target: [0, 1, 0] });
      expect(frameOf(perspective as never, [interactions.orbit([5, 5, 5])]).spec).toBe(perspective);
      expect(frameOf(base, [interactions.orbit("cube")]).spec).toBe(base);
    });
  });
});
