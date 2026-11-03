// S5-WP19-04: every typed option probe row with a render-item, post-chain or
// post-pass observation is exercised here through the real compiler (or the
// real post pipeline / pass factory). A runtime row must change the named
// output between its A and B values; an unsupported row must make the runtime
// raise the named error for that field. Compile output is not pixel evidence.
import "@aura3d/engine";
import { describe, expect, it } from "vitest";
import { compileScene, updateCompiledScene } from "@aura3d/engine/contracts";
import { QUALITY_TIERS } from "@aura3d/rendering";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import type { OptionCoverageRow } from "../../../../packages/engine/src/contracts/compiler";
import { scene } from "../../../../packages/engine/src/agent-api/nodes/scene";
import { primitives } from "../../../../packages/engine/src/agent-api/nodes/primitives";
import { instances } from "../../../../packages/engine/src/agent-api/nodes/instances";
import { geometry } from "../../../../packages/engine/src/agent-api/nodes/geometry";
import { material } from "../../../../packages/engine/src/agent-api/nodes/material";
import { effects } from "../../../../packages/engine/src/agent-api/nodes/effects.composite";
import { createRootPostPipeline } from "../../../../packages/engine/src/agent-api/postBridge";
import { OPTION_COVERAGE_ROWS } from "../../../../packages/engine/src/agent-api/compiler/optionCoverage";
import type { MountSceneCompileContext } from "../../../../packages/engine/src/agent-api/compiler/compileScene";
import { setPrd01ModelMatrixCache } from "../../../../packages/engine/src/agent-api/compiler/renderInput";
import { modelMatrixFor } from "../../../../packages/engine/src/agent-api/compiler/sceneGraph";
import { createModelMatrixCache } from "../../../../packages/engine/src/agent-api/sceneGraph";
import { model, unsafeModelUrl } from "../../../../packages/engine/src/agent-api/nodes/model";
import { shouldNormalizeModelNode } from "../../../../packages/engine/src/agent-api/sceneMath";
import { createProductionModelInstanceTransforms } from "../../../../packages/engine/src/agent-api/compiler/primitives";
import { createProductionRuntimeEnvironmentFog, bindPrd07FogRuntime } from "../../../../packages/engine/src/agent-api/compiler/fog";
import { LiveAtmosphere } from "../../../../packages/engine/src/production-runtime/effects/LiveAtmosphere";
import type { AuraModelNode } from "../../../../packages/engine/src/agent-api/nodes/types";

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

/** Flatten an output object to `path -> JSON` so a row can name one field of it. */
function flatten(value: unknown, path: string, out: Map<string, string>, seen = new Set<unknown>()): Map<string, string> {
  if (ArrayBuffer.isView(value)) {
    out.set(path, JSON.stringify(Array.from(value as Float32Array, (n) => Math.round(n * 1e4) / 1e4)));
  } else if (value instanceof Map) {
    for (const [key, entry] of value) flatten(entry, `${path}.${String(key)}`, out, seen);
  } else if (value && typeof value === "object") {
    if (seen.has(value)) return out;
    seen.add(value);
    if (Array.isArray(value) && value.every((entry) => typeof entry !== "object")) out.set(path, JSON.stringify(value));
    else for (const [key, entry] of Object.entries(value)) if (key !== "temporalObjectKey" && key !== "revision" && key !== "dirty") flatten(entry, `${path}.${key}`, out, seen);
  } else if (typeof value !== "function" && value !== undefined) {
    out.set(path, JSON.stringify(value));
  }
  return out;
}

const read = (flat: Map<string, string>, key: string): string | undefined => {
  const parts = [...flat].filter(([path]) => path === key || path.startsWith(`${key}.`)).map(([path, value]) => `${path}=${value}`);
  return parts.length > 0 ? parts.join(";") : undefined;
};

const tri = { positions: [[0, 0, 0], [1, 0, 0], [0, 1, 0]] as [number, number, number][] };
const twoInstances = { transforms: [{ position: [0, 0, 0] as const }, { position: [1, 0, 0] as const }] };
/** Context an option needs to act at all (a pivot only moves a rotated node; sheen tint needs sheen). */
const BASE: Record<string, Record<string, unknown>> = {
  pivot: { rotation: [0, 1.2, 0] }, sheenColor: { sheen: 1 },
  // An Euler order only matters for a multi-axis rotation; instance colours need instances;
  // a colour target needs instance colours.
  rotationOrder: { rotation: [0.5, 1, 0.3] },
  instanceColors: { instances: [{ position: [0, 0, 0] }, { position: [1, 0, 0] }] },
  instanceColorTarget: { colors: ["#ff0000", "#00ff00"] }
};

const NODE_BUILDERS: Record<string, (options: Record<string, unknown>) => unknown> = {
  "primitives.box": (o) => primitives.box(o as never),
  "primitives.capsule": (o) => primitives.capsule(o as never),
  "primitives.cylinder": (o) => primitives.cylinder(o as never),
  "primitives.plane": (o) => primitives.plane(o as never),
  "geometry.custom": (o) => geometry.custom(tri as never, o as never),
  "instances.cone": (o) => instances.cone({ ...twoInstances, ...o } as never),
  "instances.cylinder": (o) => instances.cylinder({ ...twoInstances, ...o } as never),
  "material.pbr": (o) => primitives.box({ name: "probe", material: material.pbr(o as never) }),
  "material.metal": (o) => primitives.box({ name: "probe", material: material.metal(o as never) })
};

async function renderItem(builder: string, field: string, value: unknown): Promise<Map<string, string>> {
  const node = NODE_BUILDERS[builder]!({ ...(BASE[field] ?? {}), [field]: value });
  const snapshot = scene().add(node as never).toJSON();
  // A mounted app registers its owner's A3D_QR_CORE model-matrix cache
  // (createAuraAppCore / compiler renderer); the frame input composes node
  // matrices through it, so the probe uses the same production default.
  const ctx = mountCtx();
  const owner = {};
  const release = setPrd01ModelMatrixCache(createModelMatrixCache(modelMatrixFor(ctx.flags)), owner);
  const compiled = await compileScene(snapshot, { ...ctx, runtimeOwner: owner });
  try {
    const source = updateCompiledScene(compiled, snapshot, undefined as never, 0) as { collectRenderItems?: () => Iterable<unknown>; renderItems?: unknown[] };
    const items = source.collectRenderItems ? [...source.collectRenderItems()] : (source.renderItems ?? []);
    expect(items).toHaveLength(1);
    const { geometry: geo, ...item } = items[0] as { geometry?: { bounds?: unknown; vertexBuffer?: { vertexCount?: number } } };
    return flatten({ ...item, geometry: { bounds: geo?.bounds, vertexCount: geo?.vertexBuffer?.vertexCount } }, "renderItem", new Map());
  } finally {
    compiled.dispose();
    release();
  }
}

/** `renderItem.material.u_x` names the lowered uniform `material.parameters.u_x`. */
const renderItemKey = (observation: string): string =>
  observation.replace(/^renderItem\.material\.(u_\w+)$/, "renderItem.material.parameters.$1");

function bloomPipeline(field: string, value: unknown) {
  const snapshot = scene().add(effects.bloom({ intensity: 0.9, [field]: value } as never)).toJSON();
  return createRootPostPipeline(snapshot, snapshot.camera, undefined, QUALITY_TIERS.high);
}

const rowsWith = (predicate: (row: OptionCoverageRow) => boolean) => OPTION_COVERAGE_ROWS.filter(predicate).map((row) => [`${row.builder}.${row.field}`, row] as const);
const renderItemRows = rowsWith((row) => row.disposition === "runtime" && row.observation?.startsWith("renderItem.") === true);
const exactRenderItemFields = new Set(["renderItem.castShadow", "renderItem.receiveShadow", "renderItem.frustumCulled", "renderItem.renderOrder", "renderItem.layerMask"]);

describe("typed option probes: render items", () => {
  it("covers the primitive, instance and material builders", () => {
    expect(new Set(renderItemRows.map(([, row]) => row.builder))).toEqual(new Set(Object.keys(NODE_BUILDERS)));
  });

  it.each(renderItemRows)("%s changes its render-item observation", async (_key, row) => {
    const key = renderItemKey(row.observation!);
    const a = read(await renderItem(row.builder, row.field, row.probeValueA), key);
    const b = read(await renderItem(row.builder, row.field, row.probeValueB), key);
    expect(b, `${key} missing for B`).toBeDefined();
    expect(a).not.toEqual(b);
    if (exactRenderItemFields.has(key)) {
      expect(a).toBe(`${key}=${JSON.stringify(row.probeValueA)}`);
      expect(b).toBe(`${key}=${JSON.stringify(row.probeValueB)}`);
    }
  });

  it("lowers position into the model matrix translation", async () => {
    const row = OPTION_COVERAGE_ROWS.find((candidate) => candidate.builder === "primitives.box" && candidate.field === "position")!;
    const flat = await renderItem(row.builder, row.field, row.probeValueB);
    expect(JSON.parse(flat.get("renderItem.modelMatrix")!).slice(12, 15)).toEqual([2, 1, -1]);
  });
});

describe("typed option probes: post chain and post passes", () => {
  it.each(rowsWith((row) => row.disposition === "runtime" && row.observation?.startsWith("bloom.v2.") === true))(
    "%s changes the v2 bloom pipeline option", (_key, row) => {
      const field = row.observation!.slice("bloom.v2.".length);
      const a = (bloomPipeline(row.field, row.probeValueA).options as { bloom?: Record<string, unknown> }).bloom?.[field];
      const b = (bloomPipeline(row.field, row.probeValueB).options as { bloom?: Record<string, unknown> }).bloom?.[field];
      expect(b).toBeDefined();
      expect(a).not.toEqual(b);
    });

  it.each(rowsWith((row) => row.disposition === "unsupported" && row.observation === "post.POST_FIELD_UNSUPPORTED"))(
    "%s is rejected with POST_FIELD_UNSUPPORTED naming the field", (_key, row) => {
      expect(row.reason).toContain(row.field);
      for (const value of [row.probeValueA, row.probeValueB]) {
        expect(() => bloomPipeline(row.field, value)).toThrow(expect.objectContaining({
          code: "POST_FIELD_UNSUPPORTED",
          message: expect.stringContaining(`"${row.field}"`)
        }));
      }
    });

  it.each(rowsWith((row) => row.disposition === "unsupported" && row.observation === "post.post-field-deprecated"))(
    "%s reports post-field-deprecated naming the field", (_key, row) => {
      const diagnostics = bloomPipeline(row.field, row.probeValueA).diagnostics;
      expect(diagnostics).toContainEqual(expect.objectContaining({ code: "post-field-deprecated", effect: "bloom", field: row.field }));
    });

  it.each(rowsWith((row) => row.disposition === "runtime" && /^toon\.(uniform\.|fragment$|order$)/.test(row.observation ?? "")))(
    "%s changes the toon pass", (_key, row) => {
      const pass = (value: unknown) => flatten(effects.toon({ [row.field]: value } as never), "toon", new Map());
      const key = row.observation!.replace(/^toon\.uniform\./, "toon.uniforms.").replace(/^toon\.fragment$/, "toon.fragment.glsl");
      const a = read(pass(row.probeValueA), key);
      const b = read(pass(row.probeValueB), key);
      expect(b).toBeDefined();
      expect(a).not.toEqual(b);
    });
});

/** Production actor matrix: renderInput composes `model(...)` through the owner's A3D_QR_CORE matrix cache. */
const MODEL_BOUNDS = { min: [-0.5, 0, -0.25] as [number, number, number], max: [0.5, 2, 0.25] as [number, number, number] };
const MODEL_BASE: Record<string, Record<string, unknown>> = { pivot: { rotation: [0, 1.2, 0] }, rotationOrder: { rotation: [0.5, 1, 0.3] } };
const probeAsset = unsafeModelUrl("/fixtures/probe.glb");

function modelMatrix(field: string, value: unknown): number[] {
  const node = model(probeAsset, { ...(MODEL_BASE[field] ?? {}), [field]: value } as never).toJSON() as AuraModelNode;
  const cache = createModelMatrixCache(modelMatrixFor(resolveQrFlags({})));
  cache.beginFrame();
  return Array.from(cache.modelMatrix(node, MODEL_BOUNDS, shouldNormalizeModelNode(node), 0), (n) => Math.round(n * 1e4) / 1e4);
}

function modelInstanceMatrices(field: string, value: unknown): number[] {
  const node = instances.model(probeAsset, { transforms: [{ position: [1, 0, 0] }], ...(MODEL_BASE[field] ?? {}), [field]: value } as never).toJSON() as AuraModelNode;
  return Array.from(createProductionModelInstanceTransforms(node.instances!, node, MODEL_BOUNDS, 0), (n) => Math.round(n * 1e4) / 1e4);
}

describe("typed option probes: model matrices", () => {
  it.each(rowsWith((row) => row.disposition === "runtime" && row.observation === "model.matrix"))(
    "%s changes the actor model matrix", (_key, row) => {
      expect(modelMatrix(row.field, row.probeValueA)).not.toEqual(modelMatrix(row.field, row.probeValueB));
    });

  it.each(rowsWith((row) => row.disposition === "runtime" && row.observation === "model.instanceMatrices"))(
    "%s changes every native instance matrix", (_key, row) => {
      expect(modelInstanceMatrices(row.field, row.probeValueA)).not.toEqual(modelInstanceMatrices(row.field, row.probeValueB));
    });

  it("fits targetHeight to the measured bounds height", () => {
    const matrix = modelMatrix("targetHeight", 3);
    expect(Math.hypot(matrix[4]!, matrix[5]!, matrix[6]!) * (MODEL_BOUNDS.max[1] - MODEL_BOUNDS.min[1])).toBeCloseTo(3, 3);
  });
});

/** Live fog (A3D_QR_VFX_FOG, default-on): the app's LiveAtmosphere tracks the scene fog node. */
const FOG_BASE: Record<string, Record<string, unknown>> = { intensity: { legacyOpacityCap: true, mode: "exp2", density: 0.05 }, heightFalloff: { mode: "height" }, heightReference: { mode: "height" } };

function liveFog(field: string, value: unknown): Record<string, unknown> {
  const node = effects.fog({ ...(FOG_BASE[field] ?? {}), [field]: value } as never).toJSON();
  const snapshot = scene().add(effects.fog({ ...(FOG_BASE[field] ?? {}), [field]: value } as never)).toJSON();
  const atmosphere = new LiveAtmosphere();
  atmosphere.trackFogNodes([node as never]);
  const owner = {};
  const release = bindPrd07FogRuntime({ flags: resolveQrFlags({}), atmosphere }, owner);
  try {
    const fog = createProductionRuntimeEnvironmentFog(snapshot, [], 1280, 720, owner);
    expect(fog).not.toBe(false);
    return fog as unknown as Record<string, unknown>;
  } finally {
    release();
    atmosphere.dispose();
  }
}

describe("typed option probes: scene fog", () => {
  it.each(rowsWith((row) => row.disposition === "runtime" && row.observation?.startsWith("fog.live.") === true))(
    "%s changes the live forward fog", (_key, row) => {
      const key = row.observation!.slice("fog.live.".length);
      const a = liveFog(row.field, row.probeValueA)[key];
      const b = liveFog(row.field, row.probeValueB)[key];
      expect(b).toBeDefined();
      expect(a).not.toEqual(b);
    });

  async function fogDegradations(options: Record<string, unknown>): Promise<string[]> {
    const messages: string[] = [];
    const snapshot = scene().add(effects.fog(options as never)).toJSON();
    const compiled = await compileScene(snapshot, { ...mountCtx(), degrade: (d: { code: string; message: string }) => { if (d.code === "option-ignored") messages.push(d.message); } } as never);
    compiled.dispose();
    return messages;
  }

  it("reports no OPTION_IGNORED note for the fields fog reads", async () => {
    expect(await fogDegradations({ name: "haze", mode: "height", color: "#88aacc", density: 0.05, intensity: 0.5, heightFalloff: 0.2, heightReference: 0, near: 1, far: 50 })).toEqual([]);
  });

  it.each(rowsWith((row) => row.disposition === "unsupported" && row.observation === "degradation.option-ignored" && row.builder === "effects.fog"))(
    "%s is reported as an option-ignored degradation naming the field", async (_key, row) => {
      expect(row.reason).toContain(row.field);
      for (const value of [row.probeValueA, row.probeValueB]) {
        const messages = await fogDegradations({ density: 0.05, [row.field]: value });
        expect(messages).toHaveLength(1);
        expect(messages[0]).toContain(`OPTION_IGNORED ${row.builder}`);
        expect(messages[0]).toContain(`"${row.field}"`);
      }
    });
});

describe("typed option probes: ignored builder options", () => {
  it.each(rowsWith((row) => row.disposition === "unsupported" && row.observation === "degradation.option-ignored" && row.builder !== "effects.fog"))(
    "%s is reported as an option-ignored degradation naming the field", async (_key, row) => {
      expect(row.reason).toContain(row.field);
      for (const value of [row.probeValueA, row.probeValueB]) {
        const messages: string[] = [];
        const node = NODE_BUILDERS[row.builder]!({ [row.field]: value });
        const compiled = await compileScene(scene().add(node as never).toJSON(), { ...mountCtx(), degrade: (d: { code: string; message: string }) => { if (d.code === "option-ignored") messages.push(d.message); } } as never);
        compiled.dispose();
        expect(messages).toHaveLength(1);
        expect(messages[0]).toContain(`OPTION_IGNORED ${row.builder}`);
        expect(messages[0]).toContain(`"${row.field}"`);
      }
    });
});
