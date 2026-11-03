// S5-WP19-04 (misc lane): typed option rows whose observation starts with `consumer.` are exercised here at the
// layer where the option lands: the physics world built from the scene, the accessible world-text labels, the
// instance-wind contributor, LOD level tessellation, custom-geometry vertex/topology state, custom-material
// programs and uniform writes, hover scene evidence, live-fog diagnostics and the environment-lighting fallback.
// A runtime row must change the named output between its A and B values; this is not pixel evidence.
import "@aura3d/engine";
import { describe, expect, it } from "vitest";
import { compileScene, updateCompiledScene } from "@aura3d/engine-runtime/contracts";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import type { OptionCoverageRow } from "../../../../packages/engine/src/contracts/compiler";
import { scene } from "../../../../packages/engine/src/agent-api/nodes/scene";
import { primitives } from "../../../../packages/engine/src/agent-api/nodes/primitives";
import { instances, labelInstanceWindItems } from "../../../../packages/engine/src/agent-api/nodes/instances";
import { geometry } from "../../../../packages/engine/src/agent-api/nodes/geometry";
import { material } from "../../../../packages/engine/src/agent-api/nodes/material";
import { interactions } from "../../../../packages/engine/src/agent-api/nodes/interactions";
import { effects } from "../../../../packages/engine/src/agent-api/nodes/effects.composite";
import { physics } from "../../../../packages/engine/src/agent-api/nodes/physics";
import { OPTION_COVERAGE_ROWS } from "../../../../packages/engine/src/agent-api/compiler/optionCoverage";
import type { MountSceneCompileContext } from "../../../../packages/engine/src/agent-api/compiler/compileScene";
import { setPrd01ModelMatrixCache } from "../../../../packages/engine/src/agent-api/compiler/renderInput";
import { modelMatrixFor } from "../../../../packages/engine/src/agent-api/compiler/sceneGraph";
import { createModelMatrixCache } from "../../../../packages/engine/src/agent-api/sceneGraph";
import { worldLabelsFromSnapshot } from "../../../../packages/engine/src/agent-api/compiler/labels";
import { createProductionPrimitiveGeometry, createProductionRuntimePrimitiveEntries } from "../../../../packages/engine/src/agent-api/compiler/primitives";
import { applyCustomUniformWrites, type AuraCustomShaderMaterial } from "../../../../packages/engine/src/agent-api/compiler/customMaterial";
import { createProductionRuntimeEnvironment } from "../../../../packages/engine/src/agent-api/compiler/environment";
import { collectAuraSceneEvidence } from "../../../../packages/engine/src/agent-api/sceneEvidence";
import { LiveAtmosphere } from "../../../../packages/engine/src/production-runtime/effects/LiveAtmosphere";
import type { RenderItem } from "@aura3d/rendering";

const mountCtx = (): MountSceneCompileContext => ({
  renderer: undefined,
  assets: undefined,
  quality: { tier: "high" } as MountSceneCompileContext["quality"],
  strict: false,
  flags: resolveQrFlags({ options: ["compiler"] }),
  degrade: () => {},
  canvas: { width: 800, height: 600 } as unknown as HTMLCanvasElement,
  environmentLighting: () => ({ color: [0, 0, 0], intensity: 0 }) as never,
  collectedLights: [],
  runtimeWarnings: new Set<string>()
});

const tri = { positions: [[0, 0, 0], [1, 0, 0], [0, 1, 0]] as [number, number, number][], indices: [0, 1, 2] };
const quad = { positions: [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]] as [number, number, number][], indices: [0, 1, 2, 0, 2, 3] };
const twoInstances = { transforms: [{ position: [0, 0, 0] as const }, { position: [1, 0, 0] as const }] };

/** Context an option needs to act at all (custom-geometry `params` only reach a builtin LOD level). */
const BASE: Record<string, Record<string, unknown>> = {
  params: { lod: { levels: [{ name: "near", primitive: "box" }] } }
};

const NODE_BUILDERS: Record<string, (options: Record<string, unknown>) => unknown> = {
  "primitives.box": (o) => primitives.box(o as never),
  "primitives.capsule": (o) => primitives.capsule(o as never),
  "primitives.cylinder": (o) => primitives.cylinder(o as never),
  "primitives.plane": (o) => primitives.plane(o as never),
  "geometry.custom": (o) => geometry.custom(tri as never, o as never),
  "instances.cone": (o) => instances.cone({ ...twoInstances, ...o } as never),
  "instances.cylinder": (o) => instances.cylinder({ ...twoInstances, ...o } as never)
};

const node = (row: OptionCoverageRow, value: unknown) =>
  NODE_BUILDERS[row.builder]!({ ...(BASE[row.field] ?? {}), [row.field]: value });

/** Read the compiled render items of a one-node scene (the probe registers the owner's matrix cache, as a mounted app does). */
async function renderItems<T>(built: unknown, read: (items: RenderItem[]) => T): Promise<T> {
  const snapshot = scene().add(built as never).toJSON();
  const ctx = mountCtx();
  const owner = {};
  const release = setPrd01ModelMatrixCache(createModelMatrixCache(modelMatrixFor(ctx.flags)), owner);
  const compiled = await compileScene(snapshot, { ...ctx, runtimeOwner: owner } as MountSceneCompileContext);
  try {
    const source = updateCompiledScene(compiled, snapshot, undefined as never, 0) as { collectRenderItems?: () => Iterable<RenderItem>; renderItems?: RenderItem[] };
    return read(source.collectRenderItems ? [...source.collectRenderItems()] : (source.renderItems ?? []));
  } finally {
    compiled.dispose();
    release();
  }
}

const customMaterial = (field: string, value: unknown): AuraCustomShaderMaterial => {
  const spec = {
    glsl: { fragment: "out vec4 outColor;\nvoid main() {\n  outColor = vec4(strength);\n#include <probe_tint>\n}" },
    uniforms: { strength: { type: "f32", value: 0.5 } },
    patch: { probe_tint: "" },
    [field]: value
  };
  const entry = createProductionRuntimePrimitiveEntries([primitives.box({ material: material.custom(spec as never) }).toJSON()])[0]!;
  return entry.resources[0]!.material as AuraCustomShaderMaterial;
};

function customGeometry(field: string, value: unknown): Record<string, unknown> {
  const mesh = createProductionPrimitiveGeometry(geometry.custom(geometry.define({ ...quad, [field]: value } as never)).toJSON() as never);
  try {
    return {
      vertexData: Array.from(new Uint8Array(mesh.vertexBuffer.data)),
      drawRange: mesh.drawRange,
      groups: mesh.groups,
      morphTargets: mesh.morphTargets?.map((target) => ({ ...target, positions: Array.from(target.positions as ArrayLike<number>) })),
      topology: mesh.topology
    };
  } finally {
    mesh.dispose();
  }
}

type Observer = (row: OptionCoverageRow, value: unknown) => unknown;

const OBSERVERS: Record<string, Observer> = {
  /** The scene-built physics world (`physics.worldFromSceneAsync`, the node-side consumer of `.physics`). */
  "consumer.physicsBody": async (row, value) => {
    const world = await physics.worldFromSceneAsync(scene().add(node(row, value) as never));
    try {
      const summary = world.snapshot();
      // S5-WP19-04: an instanced node gets one body (and collider) per instance.
      const expected = row.builder.startsWith("instances.") ? twoInstances.transforms.length : 1;
      expect(summary.bodies).toBe(expected);
      expect(summary.colliders).toBe(expected);
      return summary.snapshot.bodies.map(({ id, type, mass }) => {
        const body = world.getBody(id)!;
        return { type, mass, friction: body.friction, restitution: body.restitution };
      });
    } finally {
      world.dispose();
    }
  },
  /** Accessible world-text counterparts the label layer mounts (`worldLabelsFromSnapshot`). */
  "consumer.worldTextLabel": (row, value) => worldLabelsFromSnapshot(scene().add(node(row, value) as never).toJSON())
    .filter((label) => (label as { accessibleOnly?: boolean }).accessibleOnly === true).map((label) => label.text),
  /** The instance-wind frame contributor's selection label (`prd10.wind:` prefix). */
  "consumer.instanceWindLabel": (row, value) => renderItems(node(row, value), (items) => labelInstanceWindItems(items).items.map((item) => item.label)),
  "consumer.lodLevelVertexCount": (row, value) => renderItems(node(row, value), (items) => items.map((item) => item.geometry.vertexBuffer.vertexCount)),
  "consumer.customGeometry.vertexData": (row, value) => customGeometry(row.field, value).vertexData,
  "consumer.customGeometry.drawRange": (row, value) => customGeometry(row.field, value).drawRange,
  "consumer.customGeometry.groups": (row, value) => customGeometry(row.field, value).groups,
  "consumer.customGeometry.morphTargets": (row, value) => customGeometry(row.field, value).morphTargets,
  "consumer.customGeometry.topology": (row, value) => customGeometry(row.field, value).topology,
  /** `castShadow: true` publishes the material's own depth program for shadow casters. */
  "consumer.customDepthShader": (row, value) => {
    const output = customMaterial(row.field, value);
    try { return output.customDepthShaderKey ?? null; } finally { output.dispose(); }
  },
  "consumer.customFragment": (row, value) => {
    const output = customMaterial(row.field, value);
    try { return output.sources.glsl.fragment; } finally { output.dispose(); }
  },
  /** `handle.setUniform("glow", v)` lands on the aliased uniform (`applyCustomUniformWrites`). */
  "consumer.uniformAliasWrite": (row, value) => {
    const output = customMaterial(row.field, value);
    try {
      const applied = applyCustomUniformWrites(output, new Map([["glow", 0.9]]));
      return { applied, strength: output.getParameter("u_strength") };
    } finally { output.dispose(); }
  },
  "consumer.hoverSelections": (_row, value) =>
    collectAuraSceneEvidence(scene().add(interactions.hover({ target: "crate", selected: value as string })).toJSON()).interactions.hoverSelections,
  /** The atmosphere diagnostics name the active fog node. */
  "consumer.fogActiveNodeId": (_row, value) => {
    const atmosphere = new LiveAtmosphere();
    try {
      atmosphere.trackFogNodes([effects.fog({ density: 0.05, name: value as string }).toJSON() as never]);
      return atmosphere.report().fog.activeNodeId;
    } finally { atmosphere.dispose(); }
  },
  /** Without an environment node the production environment falls back to a scene-category preset read from node names. */
  "consumer.environmentPreset": (_row, value) =>
    createProductionRuntimeEnvironment(scene().add(effects.bloom({ name: value as string })).toJSON()).preset
};

const consumerRows = OPTION_COVERAGE_ROWS.filter((row) => row.disposition === "runtime" && row.observation?.startsWith("consumer.") === true)
  .map((row) => [`${row.builder}.${row.field}`, row] as const);

describe("typed option probes: misc consumers", () => {
  it("has an observer for every consumer.* observation", () => {
    expect(consumerRows.length).toBeGreaterThan(30);
    for (const [, row] of consumerRows) expect(OBSERVERS[row.observation!], row.observation).toBeDefined();
  });

  it.each(consumerRows)("%s changes its consumer observation", async (_key, row) => {
    const a = await OBSERVERS[row.observation!]!(row, row.probeValueA);
    const b = await OBSERVERS[row.observation!]!(row, row.probeValueB);
    expect(b, `${row.observation} missing for B`).not.toBeUndefined();
    expect(b).not.toEqual([]);
    expect(a).not.toEqual(b);
  });

  it("pins the consumer outcomes, not just a changed input", async () => {
    const row = (builder: string, field: string) => OPTION_COVERAGE_ROWS.find((r) => r.builder === builder && r.field === field)!;
    expect(await OBSERVERS["consumer.physicsBody"]!(row("primitives.box", "physics"), row("primitives.box", "physics").probeValueB)).toEqual([expect.objectContaining({ type: "static", friction: expect.closeTo(0.9, 5) })]);
    expect(await OBSERVERS["consumer.worldTextLabel"]!(row("primitives.box", "text3D"), row("primitives.box", "text3D").probeValueB)).toEqual(["crate B"]);
    expect(await OBSERVERS["consumer.instanceWindLabel"]!(row("instances.cone", "wind"), true)).toEqual([expect.stringMatching(/^prd10\.wind:/)]);
    expect(await OBSERVERS["consumer.instanceWindLabel"]!(row("instances.cone", "wind"), false)).toEqual([expect.not.stringMatching(/^prd10\.wind:/)]);
    expect(await OBSERVERS["consumer.uniformAliasWrite"]!(row("material.custom", "uniformAliases"), { glow: "strength" })).toEqual({ applied: 1, strength: expect.closeTo(0.9, 5) });
    expect(await OBSERVERS["consumer.customDepthShader"]!(row("material.custom", "castShadow"), false)).toBeNull();
    expect(await OBSERVERS["consumer.customFragment"]!(row("material.custom", "patch"), { probe_tint: "outColor = vec4(0.75);" })).toContain("outColor = vec4(0.75);");
    expect(await OBSERVERS["consumer.hoverSelections"]!(row("interactions.hover", "selected"), "crate-b")).toEqual(["crate-b"]);
    expect(await OBSERVERS["consumer.fogActiveNodeId"]!(row("effects.fog", "name"), "haze-b")).toBe("haze-b");
    expect(await OBSERVERS["consumer.customGeometry.topology"]!(row("geometry.define", "topology"), "points")).toBe("points");
    expect(await OBSERVERS["consumer.customGeometry.drawRange"]!(row("geometry.define", "drawRange"), { start: 3, count: 3 })).toEqual({ start: 3, count: 3 });
  });

  it.each(OPTION_COVERAGE_ROWS.filter((row) => row.disposition === "unsupported" && row.observation === "geometry.AURA_GEOMETRY_OPTION_UNSUPPORTED")
    .map((row) => [`${row.builder}.${row.field}`, row] as const))("%s is rejected naming the field", (_key, row) => {
    expect(row.reason).toContain(row.field);
    for (const value of [row.probeValueA, row.probeValueB]) {
      expect(() => geometry.define({ ...quad, [row.field]: value } as never)).toThrow(expect.objectContaining({
        code: "AURA_GEOMETRY_OPTION_UNSUPPORTED",
        message: expect.stringContaining(`"${row.field}"`)
      }));
    }
    // geometry.dynamic still tags its own output, and geometry.custom keeps accepting a dynamic spec.
    const dynamic = geometry.dynamic(quad);
    expect(dynamic.dynamic).toBe(true);
    expect(() => geometry.custom(dynamic)).not.toThrow();
  });
});
