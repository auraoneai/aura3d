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
const BASE: Record<string, Record<string, unknown>> = { pivot: { rotation: [0, 1.2, 0] }, sheenColor: { sheen: 1 } };

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
  const compiled = await compileScene(snapshot, mountCtx());
  try {
    const source = updateCompiledScene(compiled, snapshot, undefined as never, 0) as { collectRenderItems?: () => Iterable<unknown>; renderItems?: unknown[] };
    const items = source.collectRenderItems ? [...source.collectRenderItems()] : (source.renderItems ?? []);
    expect(items).toHaveLength(1);
    const { geometry: geo, ...item } = items[0] as { geometry?: { bounds?: unknown } };
    return flatten({ ...item, geometry: { bounds: geo?.bounds } }, "renderItem", new Map());
  } finally {
    compiled.dispose();
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
const exactRenderItemFields = new Set(["renderItem.castShadow", "renderItem.frustumCulled", "renderItem.renderOrder", "renderItem.layerMask"]);

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
