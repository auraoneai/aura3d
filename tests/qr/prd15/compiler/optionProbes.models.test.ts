import "@aura3d/engine";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, it } from "vitest";
import { compileScene, updateCompiledScene } from "@aura3d/engine-runtime/contracts";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import { scene } from "../../../../packages/engine/src/agent-api/nodes/scene";
import { model } from "../../../../packages/engine/src/agent-api/nodes/model";
import { instances, labelInstanceWindItems } from "../../../../packages/engine/src/agent-api/nodes/instances";
import { defineAuraAssets } from "../../../../packages/engine/src/agent-api/nodes/assets";
import { createAuraRuntimeNodeRegistry } from "../../../../packages/engine/src/agent-api/app/runtimeNodes";
import type { MountSceneCompileContext } from "../../../../packages/engine/src/agent-api/compiler/compileScene";

const files: Record<string, Uint8Array> = {
  car: new Uint8Array(readFileSync("tests/fixtures/gltf-multipart/body-and-four-wheels.glb")),
  shoe: new Uint8Array(readFileSync("fixtures/asset-corpus/materials-variants-shoe.glb")),
  cube: new Uint8Array(readFileSync("fixtures/asset-corpus/animated-morph-cube.glb"))
};
function withJson(glb: Uint8Array, edit: (json: any) => void): Uint8Array {
  const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  const jsonLength = view.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + jsonLength)));
  edit(json);
  let text = JSON.stringify(json);
  while (text.length % 4 !== 0) text += " ";
  const jsonBytes = new TextEncoder().encode(text);
  const rest = glb.subarray(20 + jsonLength);
  const out = new Uint8Array(20 + jsonBytes.length + rest.length);
  out.set(glb.subarray(0, 20)); out.set(jsonBytes, 20); out.set(rest, 20 + jsonBytes.length);
  const o = new DataView(out.buffer);
  o.setUint32(8, out.length, true); o.setUint32(12, jsonBytes.length, true);
  return out;
}
files.lod = withJson(files.car!, (json) => {
  json.extensionsUsed = [...(json.extensionsUsed ?? []), "MSFT_lod"];
  const body = json.nodes.find((n: any) => n.name === "body");
  const low = json.nodes.length;
  json.nodes.push({ name: "bodyLow", mesh: 1 });
  body.extensions = { MSFT_lod: { ids: [low] } };
  body.extras = { MSFT_screencoverage: [1, 0.1] };
});
const nativeFetch = globalThis.fetch;
beforeEach(() => { (globalThis as any).createImageBitmap = async () => ({ width: 4, height: 4, close() {} }); globalThis.fetch = (async (url: string) => new Response(new Uint8Array(files[String(url).split("/").pop()!.replace(".glb", "")]!), { status: 200 })) as unknown as typeof fetch; });
afterEach(() => { globalThis.fetch = nativeFetch; });
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const assets = defineAuraAssets({
  car: { type: "model", format: "glb", url: "/aura-assets/car.glb", hash: sha(files.car!) },
  shoe: { type: "model", format: "glb", url: "/aura-assets/shoe.glb", hash: sha(files.shoe!) },
  cube: { type: "model", format: "glb", url: "/aura-assets/cube.glb", hash: sha(files.cube!) },
  lod: { type: "model", format: "glb", url: "/aura-assets/lod.glb", hash: sha(files.lod!) }
});
const mountCtx = (): MountSceneCompileContext => ({
  renderer: undefined, assets: undefined, quality: { tier: "high" } as MountSceneCompileContext["quality"], strict: false,
  flags: resolveQrFlags({ options: ["compiler"] }), degrade: () => {},
  canvas: { width: 800, height: 600 } as unknown as HTMLCanvasElement,
  environmentLighting: () => ({ color: [0, 0, 0], intensity: 0 }) as never, collectedLights: [], runtimeWarnings: new Set<string>()
});

async function run(node: unknown, morph?: Record<string, number>) {
  const snapshot = scene().add(node as never).toJSON();
  const ctx = mountCtx();
  const runtimeNodes = createAuraRuntimeNodeRegistry(snapshot);
  const degr: string[] = [];
  const compiled = await compileScene(snapshot, { ...ctx, runtimeNodes, degrade: (d: any) => degr.push(d.code + ":" + d.message) } as never);
  if (morph) (runtimeNodes.get("m") as any)?.setMorphTargets(morph);
  const source = updateCompiledScene(compiled, snapshot, runtimeNodes as never, 0) as any;
  const items = source.collectRenderItems ? [...source.collectRenderItems()] : (source.renderItems ?? []);
  const out = { n: items.length, labels: items.map((i: any) => i.label), wr: items.map((i: any) => i.wrinkleStrength), mats: items.slice(0,1).map((i: any) => { const m = i.material; const b = m && ("baseMaterial" in m ? m.baseMaterial : m); return Object.keys(b ?? {}).join(",") + "|" + JSON.stringify(b?.getParameter ? ["u_baseColor","u_color","u_baseColorFactor","u_a3dInstanceColorTarget"].map((k) => b.getParameter(k)) : null); }), lod: items.map((i: any) => i.lodLevel), mname: items.map((i: any) => { const m = i.material; const b = m && ("baseMaterial" in m ? m.baseMaterial : m); return b?.name + "#" + JSON.stringify([...(b?.parameters?.keys?.() ?? [])].filter((k: string) => /Texture$|Map$/.test(k)).map((k: string) => [k, String(b.getParameter(k)?.id ?? b.getParameter(k)?.label ?? typeof b.getParameter(k))]).slice(0,3)); }), wl: labelInstanceWindItems(items).items.map((i: any) => i.label.slice(0, 14)), meta: (compiled as any).actorEntries?.map((e: any) => e.actor.pipeline.metadata.assetName), cl: JSON.stringify(source.collectedLights)?.slice(0, 300), ic: items.map((i: any) => i.instanceColors?.length), warnings: [...ctx.runtimeWarnings], degr, lights: Object.keys(source).join(",") };
  compiled.dispose();
  return out;
}

describe("explore", () => {
  it("dump", async () => {
    const t = [{ position: [0, 0, 0] as const }, { position: [3, 0, 0] as const }];
    const cases: Record<string, unknown> = {
      shoe: model(assets.shoe),
      shoeBeach: model(assets.shoe, { variant: "beach" }),
      shoeStreet: model(assets.shoe, { variant: "street" }),
      windOff: instances.model(assets.car, { transforms: t, wind: false }),
      windOn: instances.model(assets.car, { transforms: t, wind: true })
    };
    for (const [k, v] of Object.entries(cases)) {
      try { console.log(k, JSON.stringify(await run(v, k === "cubeW" ? { "Cube-morph-1": 0.5 } : undefined))); } catch (e) { console.log(k, "ERR", String(e).slice(0, 300)); }
    }
    const { physics } = await import("../../../../packages/engine/src/agent-api/index");
    const bounded = { ...assets.car, metadata: { ...(assets.car as any).metadata, boundsMetadata: { min: [-1.5, 0, -2], max: [1.5, 1, 2] } } } as typeof assets.car;
    for (const [k, n] of Object.entries({ colliderBounds: model(bounded, { collider: "bounds" }), colliderFalse: model(bounded, { collider: false }), physStatic: model(bounded, { physics: { type: "static" } }), physDyn: model(bounded, { physics: { type: "dynamic", mass: 2 } }), instPhys: instances.model(bounded, { transforms: t, physics: { type: "static", shape: "box", halfExtents: [1, 1, 1] } as never }), instPhysBounds: instances.model(bounded, { transforms: t, physics: { type: "static" } }) })) {
      try { const w = physics.worldFromScene(scene().add(n as never)); console.log(k, JSON.stringify(w.snapshot().snapshot.bodies.map((b: any) => [b.type, b.mass, b.position]))); w.dispose(); } catch (e) { console.log(k, "ERR", String(e).slice(0, 200)); }
    }
  }, 120000);
});
