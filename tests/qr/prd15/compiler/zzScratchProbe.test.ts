import "@aura3d/engine";
import { it } from "vitest";
import { compileScene, updateCompiledScene } from "@aura3d/engine/contracts";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import { scene } from "../../../../packages/engine/src/agent-api/nodes/scene";
import { primitives } from "../../../../packages/engine/src/agent-api/nodes/primitives";
import { instances } from "../../../../packages/engine/src/agent-api/nodes/instances";
import { material } from "../../../../packages/engine/src/agent-api/nodes/material";
import { effects } from "../../../../packages/engine/src/agent-api/nodes/effects.composite";
import { createRootPostPipeline } from "../../../../packages/engine/src/agent-api/postBridge";
import { QUALITY_TIERS } from "@aura3d/rendering";
import { setPrd01ModelMatrixCache } from "../../../../packages/engine/src/agent-api/compiler/renderInput";
import { modelMatrixFor } from "../../../../packages/engine/src/agent-api/compiler/sceneGraph";
import { createModelMatrixCache } from "../../../../packages/engine/src/agent-api/sceneGraph";

const mountCtx = (): any => ({ renderer: undefined, assets: undefined, quality: { tier: "high" }, strict: false,
  flags: resolveQrFlags({ options: ["compiler"] }), degrade: () => {}, canvas: { width: 800, height: 600 },
  environmentLighting: () => ({ color: [0, 0, 0], intensity: 0 }), collectedLights: [], runtimeWarnings: new Set<string>() });
function flatten(value: unknown, path: string, out: Map<string, string>, seen = new Set<unknown>()): Map<string, string> {
  if (ArrayBuffer.isView(value)) out.set(path, JSON.stringify(Array.from(value as Float32Array, (n) => Math.round(n * 1e4) / 1e4)));
  else if (value instanceof Map) { for (const [k, e] of value) flatten(e, `${path}.${String(k)}`, out, seen); }
  else if (value && typeof value === "object") { if (seen.has(value)) return out; seen.add(value);
    if (Array.isArray(value) && value.every((e) => typeof e !== "object")) out.set(path, JSON.stringify(value));
    else for (const [k, e] of Object.entries(value)) flatten(e, `${path}.${k}`, out, seen); }
  else if (value !== undefined) out.set(path, typeof value === "function" ? "fn" : JSON.stringify(value));
  return out;
}
async function item(node: unknown) {
  const snapshot = scene().add(node as never).toJSON();
  const ctx = mountCtx(); const owner = {}; ctx.runtimeOwner = owner;
  const release = setPrd01ModelMatrixCache(createModelMatrixCache(modelMatrixFor(ctx.flags)), owner);
  const compiled = await compileScene(snapshot, ctx);
  const source = updateCompiledScene(compiled, snapshot, undefined as never, 0) as any;
  const items = source.collectRenderItems ? [...source.collectRenderItems()] : source.renderItems;
  const f = flatten({ items, snapshotNode: snapshot.nodes?.[snapshot.nodes.length - 1] ?? snapshot }, "", new Map());
  compiled.dispose(); release();
  return f;
}
function diff(label: string, a: Map<string, string>, b: Map<string, string>) {
  const keys = new Set([...a.keys(), ...b.keys()]);
  const d = [...keys].filter((k) => a.get(k) !== b.get(k) && !/temporalObjectKey|revision|\.id$|uuid/i.test(k));
  console.log(`### ${label}: ${d.length} diffs\n` + d.slice(0, 15).map((k) => `  ${k}: ${a.get(k)?.slice(0, 120)} -> ${b.get(k)?.slice(0, 120)}`).join("\n"));
}
const pbrF = (field: string, base: Record<string, unknown> = {}) => (v: any) => primitives.box({ name: "p", material: material.pbr({ ...base, [field]: v } as any) });
const boxF = (field: string, base: Record<string, unknown> = {}, b = primitives.box) => (v: any) => (b as any)({ name: "p", ...base, [field]: v });
const CASES: Array<[string, (v: any) => unknown, unknown, unknown]> = [
  ["box.instances", boxF("instances"), [{ position: [0, 0, 0] }], [{ position: [2, 1, -1] }]],
  ["box.instanceColors", boxF("instanceColors", { instances: [{ position: [0, 0, 0] }, { position: [1, 0, 0] }] }), ["#ff0000", "#ff0000"], ["#00ff00", "#00ff00"]],
  ["box.params", boxF("params"), { widthSegments: 1 }, { widthSegments: 3 }],
  ["box.geometry", boxF("geometry"), { kind: "aura-custom-geometry", positions: [[0,0,0],[1,0,0],[0,1,0]] }, { kind: "aura-custom-geometry", positions: [[0,0,0],[2,0,0],[0,1,0]] }],
  ["box.lod", boxF("lod"), { levels: [{ distance: 0, params: { widthSegments: 1 } }] }, { levels: [{ distance: 0, params: { widthSegments: 4 } }] }],
  ["box.text3D", boxF("text3D"), { text: "A" }, { text: "B" }],
  ["box.physics", boxF("physics"), { type: "static" }, { type: "dynamic" }],
  ["cone.instanceColorTarget", (v) => (instances as any).cone({ name: "p", transforms: [{ position: [0,0,0] }], colors: ["#ff0000"], instanceColorTarget: v }), "baseColor", "emissive"],
  ["cone.wind", (v) => (instances as any).cone({ name: "p", transforms: [{ position: [0,0,0] }], wind: v }), { strength: 0.1 }, { strength: 0.9 }],
  ["pbr.name", pbrF("name"), "a", "b"],
  ["pbr.unlit", pbrF("unlit"), false, true],
  ["pbr.specularIntensity", pbrF("specularIntensity"), 0.2, 0.8],
  ["pbr.specularColor", pbrF("specularColor"), "#ff0000", "#00ff00"],
  ["pbr.dispersion", pbrF("dispersion"), 0.1, 0.8],
  ["pbr.normalScale", pbrF("normalScale"), 0.5, 1.5],
  ["pbr.occlusionStrength", pbrF("occlusionStrength"), 0.2, 0.8],
  ["pbr.clearcoatNormalScale", pbrF("clearcoatNormalScale"), 0.5, 1.5],
  ["pbr.alphaToCoverage", pbrF("alphaToCoverage"), false, true],
  ["pbr.rimColor", pbrF("rimColor"), "#ff0000", "#00ff00"],
  ["pbr.coreColor", pbrF("coreColor"), "#ff0000", "#00ff00"],
  ["pbr.falloff", pbrF("falloff"), 0.2, 0.8],
  ["pbr.noiseStrength", pbrF("noiseStrength"), 0.2, 0.8],
  ["pbr.practical", pbrF("practical", { emissive: "#ffffff" }), false, true],
  ["pbr.kind", pbrF("kind"), "custom", "depth-preview"],
  ["pbr.clipping", pbrF("clipping"), { planes: [[0, 1, 0, 0]] }, { planes: [[1, 0, 0, 0]] }],
  ["pbr.physicalWarnings", pbrF("physicalWarnings"), "warn", "off"],
  ["pbr.sampling", pbrF("sampling"), { wrap: "repeat" }, { wrap: "clamp" }],
  ["pbr.textureAnisotropy", pbrF("textureAnisotropy"), 1, 8],
  ["pbr.texCoords", pbrF("texCoords"), { baseColor: 0 }, { baseColor: 1 }],
  ["pbr.texTransforms", pbrF("texTransforms"), { baseColor: { offset: [0, 0] } }, { baseColor: { offset: [0.5, 0] } }],
  ["pbr.envMap", pbrF("envMap"), "a.hdr", "b.hdr"],
  ["pbr.texture", pbrF("texture"), "a.png", "b.png"],
  ["pbr.normal", pbrF("normal"), "a.png", "b.png"],
  ["pbr.shader", pbrF("shader"), "a", "b"],
];
it("scratch", async () => {
  for (const [label, build, a, b] of CASES) {
    try { diff(label, await item(build(a)), await item(build(b))); } catch (e) { console.log(`### ${label}: THROW ${(e as Error).message}`); }
  }
  for (const [label, a, b] of [["bloom.color", "#ff0000", "#00ff00"]] as const) {
    const p = (v: string) => { const s = scene().add(effects.bloom({ intensity: 0.9, color: v } as any)).toJSON(); return flatten(createRootPostPipeline(s, s.camera, undefined, QUALITY_TIERS.high), "", new Map()); };
    diff(label, p(a), p(b));
  }
}, 240000);
