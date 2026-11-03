// S5-WP19-04 (models lane): every `model` / `instances.model` option probe row
// with an `actor.*` observation is exercised here against a loaded GLB actor:
// the real compiler (compileScene + updateCompiledScene) loads committed GLB
// bytes through a stubbed fetch, and each row must change the named actor
// render-item / material / frame-metadata / physics / light / wind output
// between its A and B values. An `actor.option-ignored` row must make the
// compiler raise an `option-ignored` degradation naming the field.
// Compile output is not pixel evidence.
import "@aura3d/engine";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { compileScene, updateCompiledScene } from "@aura3d/engine-runtime/contracts";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import type { OptionCoverageRow } from "../../../../packages/engine/src/contracts/compiler";
import { OPTION_COVERAGE_ROWS } from "../../../../packages/engine/src/agent-api/compiler/optionCoverage";
import type { MountSceneCompileContext } from "../../../../packages/engine/src/agent-api/compiler/compileScene";
import { createProductionRuntimeMetadata } from "../../../../packages/engine/src/agent-api/compiler/actors";
import { collectPrd02Lights } from "../../../../packages/engine/src/agent-api/compiler/lights";
import { createAuraRuntimeNodeRegistry } from "../../../../packages/engine/src/agent-api/app/runtimeNodes";
import { scene } from "../../../../packages/engine/src/agent-api/nodes/scene";
import { model } from "../../../../packages/engine/src/agent-api/nodes/model";
import { instances, labelInstanceWindItems } from "../../../../packages/engine/src/agent-api/nodes/instances";
import { defineAuraAssets } from "../../../../packages/engine/src/agent-api/nodes/assets";
import { physics } from "../../../../packages/engine/src/agent-api/index";
import type { RenderItem } from "@aura3d/rendering";
import type { AuraAssetRef, AuraSceneSnapshot, ProductionRuntimeActorEntry } from "../../../../packages/engine/src/agent-api/nodes/types";

/** Rewrite the JSON chunk of a committed GLB (the BIN chunk is reused byte for byte). */
function withGlbJson(glb: Uint8Array, edit: (json: Record<string, any>) => void): Uint8Array {
  const jsonLength = new DataView(glb.buffer, glb.byteOffset, glb.byteLength).getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + jsonLength))) as Record<string, any>;
  edit(json);
  let text = JSON.stringify(json);
  while (text.length % 4 !== 0) text += " ";
  const jsonBytes = new TextEncoder().encode(text);
  const rest = glb.subarray(20 + jsonLength);
  const out = new Uint8Array(20 + jsonBytes.length + rest.length);
  out.set(glb.subarray(0, 20));
  out.set(jsonBytes, 20);
  out.set(rest, 20 + jsonBytes.length);
  const view = new DataView(out.buffer);
  view.setUint32(8, out.length, true);
  view.setUint32(12, jsonBytes.length, true);
  return out;
}

/** body + four wheels (materials bodyPaint / tyreRubber); the Khronos AnimatedMorphCube (two morph targets). */
const car = new Uint8Array(readFileSync("tests/fixtures/gltf-multipart/body-and-four-wheels.glb"));
const morphCube = new Uint8Array(readFileSync("fixtures/asset-corpus/animated-morph-cube.glb"));
const FIXTURES: Record<string, Uint8Array> = {
  car,
  "morph-cube": morphCube,
  // Derived in memory from the committed car: the body node gains an MSFT_lod chain whose
  // level 1 is a wheel mesh, so an LOD policy has a real second level to select.
  "car-lod": withGlbJson(car, (json) => {
    json.extensionsUsed = [...(json.extensionsUsed ?? []), "MSFT_lod"];
    const body = json.nodes.find((node: { name?: string }) => node.name === "body");
    json.nodes.push({ name: "bodyLow", mesh: 1 });
    body.extensions = { MSFT_lod: { ids: [json.nodes.length - 1] } };
    body.extras = { MSFT_screencoverage: [1, 0.1] };
  }),
  // Derived in memory from the committed car: KHR_materials_variants maps the body to
  // bodyPaint ("paint") or tyreRubber ("rubber"). (The Khronos MaterialsVariantsShoe, whose three
  // variant materials share one name, has its own test: tests/qr/prd04/unit/gltf-materials-variants-shoe.test.ts.)
  "car-variants": withGlbJson(car, (json) => {
    json.extensionsUsed = [...(json.extensionsUsed ?? []), "KHR_materials_variants"];
    json.extensions = { ...(json.extensions ?? {}), KHR_materials_variants: { variants: [{ name: "paint" }, { name: "rubber" }] } };
    json.meshes[0].primitives[0].extensions = { KHR_materials_variants: { mappings: [{ material: 0, variants: [0] }, { material: 1, variants: [1] }] } };
  })
};
const sha256 = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");
const assets = defineAuraAssets(Object.fromEntries(Object.entries(FIXTURES).map(([id, bytes]) => [id, {
  type: "model" as const, format: "glb" as const, url: `/aura-assets/${id}.glb`, hash: sha256(bytes),
  metadata: { boundsMetadata: { min: [-1.5, 0, -2], max: [1.5, 1, 2] } }
}]))) as unknown as Record<string, AuraAssetRef<"model">>;

const nativeFetch = globalThis.fetch;
beforeEach(() => {
  globalThis.fetch = (async (url: unknown) => {
    const id = String(url).split("/").pop()!.replace(/\.glb$/, "");
    const bytes = FIXTURES[id];
    return bytes ? new Response(new Uint8Array(bytes), { status: 200 }) : new Response("missing", { status: 404 });
  }) as unknown as typeof fetch;
});
afterEach(() => { globalThis.fetch = nativeFetch; });

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

const TWO_INSTANCES = [{ position: [0, 0, 0] as const }, { position: [3, 0, 0] as const }];
const MORPH_WEIGHTS = { "Cube-morph-1": 0.5 };
/** Asset and context an option needs to act at all (a variant needs a variants GLB; wrinkle needs live morph weights). */
const ASSET_FOR: Record<string, string> = { variant: "car-variants", lod: "car-lod", wrinkle: "morph-cube" };
const BASE: Record<string, Record<string, Record<string, unknown>>> = {
  model: {},
  "instances.model": {
    // A node position is the default for instances that do not set their own.
    position: { transforms: [{ scale: 1 }, { scale: 2 }] },
    instanceColorTarget: { colors: ["#ff0000", "#00ff00"] }
  }
};

function buildNode(builder: string, field: string, value: unknown): unknown {
  const asset = assets[ASSET_FOR[field] ?? "car"]!;
  const options = { ...(BASE[builder]![field] ?? {}), [field]: value };
  const node = builder === "model"
    ? model(asset, options as never)
    : instances.model(asset, { transforms: TWO_INSTANCES, ...options } as never);
  return field === "wrinkle" ? (node as ReturnType<typeof model>).runtime({ id: "probe-actor" }) : node;
}

interface ActorFrame {
  readonly snapshot: AuraSceneSnapshot;
  readonly items: readonly RenderItem[];
  readonly assetName: string | undefined;
  /** Material state per item, read before the compiled scene (and its materials) are disposed. */
  readonly materials: readonly { readonly name?: string; readonly baseColor: string; readonly instanceColorTarget: unknown }[];
  readonly warnings: readonly string[];
  readonly ignored: readonly string[];
}

async function actorFrame(builder: string, field: string, value: unknown): Promise<ActorFrame> {
  const snapshot = scene().add(buildNode(builder, field, value) as never).toJSON();
  const ctx = mountCtx();
  const runtimeNodes = createAuraRuntimeNodeRegistry(snapshot);
  const ignored: string[] = [];
  const compiled = await compileScene(snapshot, {
    ...ctx, runtimeNodes,
    degrade: (d: { code: string; message: string }) => { if (d.code === "option-ignored") ignored.push(d.message); }
  } as MountSceneCompileContext);
  try {
    if (field === "wrinkle") runtimeNodes.get("probe-actor")!.setMorphTargets!(MORPH_WEIGHTS);
    const source = updateCompiledScene(compiled, snapshot, runtimeNodes as never, 0) as { collectRenderItems?: () => Iterable<RenderItem> };
    const items = [...(source.collectRenderItems?.() ?? [])];
    const entries = (compiled as unknown as { readonly actorEntries: readonly ProductionRuntimeActorEntry[] }).actorEntries;
    // An invisible model is not loaded at all (isRenderableModelNode).
    expect(entries.length).toBe(snapshot.nodes.some((node) => "visible" in node && node.visible === false) ? 0 : 1);
    const materials = items.map((item) => {
      const material = baseMaterial(item);
      return { name: material?.name, baseColor: round(material?.getParameter("u_baseColor")), instanceColorTarget: material?.getParameter("u_a3dInstanceColorTarget") ?? "unset" };
    });
    return { snapshot, items, assetName: entries.length ? createProductionRuntimeMetadata(entries, []).assetName : undefined, materials, warnings: [...ctx.runtimeWarnings], ignored };
  } finally {
    compiled.dispose();
  }
}

const baseMaterial = (item: RenderItem | undefined) => {
  const material = item?.material as ({ baseMaterial?: unknown } & Record<string, unknown>) | undefined;
  return (material && "baseMaterial" in material ? material.baseMaterial : material) as { name?: string; getParameter(name: string): unknown } | undefined;
};
const bodyIndex = (frame: ActorFrame) => Math.max(0, frame.items.findIndex((item) => item.label?.includes(":body")));
const bodyItem = (frame: ActorFrame) => frame.items[bodyIndex(frame)];
const bodyMaterial = (frame: ActorFrame) => frame.materials[bodyIndex(frame)];
const round = (value: unknown) => JSON.stringify(value, (_key, entry) => ArrayBuffer.isView(entry) ? Array.from(entry as Float32Array, (n) => Math.round(n * 1e4) / 1e4) : entry);

/** Observation name -> the value it reads from one actor frame (or the node's scene consumer). */
const OBSERVE: Record<string, (frame: ActorFrame, builder: string, field: string, value: unknown) => unknown> = {
  "actor.renderItems.count": (frame) => frame.items.length,
  "actor.renderItems.labels": (frame) => frame.items.map((item) => item.label),
  "actor.metadata.assetName": (frame) => frame.assetName,
  "actor.material.u_baseColor": (frame) => bodyMaterial(frame)?.baseColor,
  "actor.material.u_a3dInstanceColorTarget": (frame) => bodyMaterial(frame)?.instanceColorTarget,
  "actor.material.name": (frame) => bodyMaterial(frame)?.name,
  "actor.runtimeWarnings": (frame) => frame.warnings,
  "actor.instanceLights": (frame) => round(collectPrd02Lights(frame.snapshot).descriptors),
  "actor.windLabel": (frame) => labelInstanceWindItems([...frame.items]).items.map((item) => item.label),
  "actor.physicsBodies": (_frame, builder, field, value) => {
    const world = physics.worldFromScene(scene().add(buildNode(builder, field, value) as never));
    try { return world.snapshot().snapshot.bodies.map((body) => [body.type, body.mass]); } finally { world.dispose(); }
  }
};

const ITEM_FIELD = /^actor\.renderItem\.(\w+)$/;
const EXACT_ITEM_FIELDS = new Set(["castShadow", "receiveShadow", "frustumCulled", "renderOrder", "layerMask", "userData"]);

function observe(row: OptionCoverageRow, frame: ActorFrame, value: unknown): unknown {
  const itemField = ITEM_FIELD.exec(row.observation!)?.[1];
  if (itemField) return round(frame.items.map((item) => (item as unknown as Record<string, unknown>)[itemField]));
  const read = OBSERVE[row.observation!];
  if (!read) throw new Error(`No actor observation "${row.observation}"`);
  return read(frame, row.builder, row.field, value);
}

const rowsWith = (predicate: (row: OptionCoverageRow) => boolean) => OPTION_COVERAGE_ROWS.filter(predicate).map((row) => [`${row.builder}.${row.field}`, row] as const);
const actorRows = rowsWith((row) => row.disposition === "runtime" && row.observation?.startsWith("actor.") === true);

describe("typed option probes: loaded GLB actors", () => {
  it("covers model and instances.model", () => {
    expect(new Set(actorRows.map(([, row]) => row.builder))).toEqual(new Set(["model", "instances.model"]));
  });

  it.each(actorRows)("%s changes its actor observation", async (_key, row) => {
    const frameA = await actorFrame(row.builder, row.field, row.probeValueA);
    const frameB = await actorFrame(row.builder, row.field, row.probeValueB);
    const a = observe(row, frameA, row.probeValueA);
    const b = observe(row, frameB, row.probeValueB);
    expect(b, `${row.observation} missing for B`).toBeDefined();
    expect(a).not.toEqual(b);
    const itemField = ITEM_FIELD.exec(row.observation!)?.[1];
    if (itemField && EXACT_ITEM_FIELDS.has(itemField)) {
      // Every mesh of the actor carries exactly the authored value.
      expect(frameA.items.length).toBeGreaterThan(0);
      for (const [frame, value] of [[frameA, row.probeValueA], [frameB, row.probeValueB]] as const) {
        for (const item of frame.items) expect((item as unknown as Record<string, unknown>)[itemField]).toEqual(value);
      }
    }
    // A runtime option never also reports itself as ignored.
    expect([...frameA.ignored, ...frameB.ignored].filter((message) => message.includes(`"${row.field}"`))).toEqual([]);
  });

  it("pins the consumer outcomes of the structural options", async () => {
    expect((await actorFrame("model", "visible", false)).items).toHaveLength(0);
    expect((await actorFrame("model", "visible", true)).items).toHaveLength(5);
    expect((await actorFrame("model", "hiddenNodeNames", ["wheelFrontL"])).items.map((item) => item.label).some((label) => label?.includes("wheelFrontL"))).toBe(false);
    expect((await actorFrame("model", "role", "primaryWorld")).items.length).toBeLessThan(5);
    expect(bodyMaterial(await actorFrame("model", "variant", "paint"))?.name).toBe("bodyPaint");
    expect(bodyMaterial(await actorFrame("model", "variant", "rubber"))?.name).toBe("tyreRubber");
    // instanceColorTarget "emissive" is code 1 on the instanced material (ModelMaterialOverrides).
    expect(bodyMaterial(await actorFrame("instances.model", "instanceColorTarget", "emissive"))?.instanceColorTarget).toBe(1);
    expect(bodyItem(await actorFrame("model", "lod", { bias: 0.001, crossFadeSeconds: 0 }))?.lodLevel).toBe(1);
    expect(bodyItem(await actorFrame("model", "lod", false))?.lodLevel).toBe(0);
    // resolveWrinkleMapStrength: weight 0.5 x amount 2.
    expect((await actorFrame("model", "wrinkle", { bindings: [{ target: "Cube-morph-1", amount: 2 }] })).items[0]?.wrinkleStrength).toBeCloseTo(1);
    const instanced = await actorFrame("instances.model", "position", [2, 1, -1]);
    for (const item of instanced.items) expect(item.instanceTransforms).toHaveLength(32);
  });
});

describe("typed option probes: instances.model options the runtime does not apply", () => {
  it("reports no OPTION_IGNORED note for the instance options the runtime applies", async () => {
    const frame = await actorFrame("instances.model", "wind", true);
    expect(frame.ignored).toEqual([]);
    expect((await actorFrame("instances.model", "colors", ["#ff0000", "#00ff00"])).ignored).toEqual([]);
  });

  it.each(rowsWith((row) => row.disposition === "unsupported" && row.observation === "actor.option-ignored"))(
    "%s is reported as an option-ignored degradation naming the field", async (_key, row) => {
      expect(row.reason).toContain(row.field);
      for (const value of [row.probeValueA, row.probeValueB]) {
        const frame = await actorFrame(row.builder, row.field, value);
        const notes = frame.ignored.filter((message) => message.startsWith(`OPTION_IGNORED ${row.builder}`));
        expect(notes).toHaveLength(1);
        expect(notes[0]).toContain(`"${row.field}"`);
        // The batch still draws: the option is reported, not fatal.
        expect(frame.items.length).toBeGreaterThan(0);
      }
    });
});
