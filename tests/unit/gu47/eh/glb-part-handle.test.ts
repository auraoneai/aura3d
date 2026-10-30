/**
 * GU47 E-H (WP-8) item 4: `handle.part(name)` — a named GLB sub-node as its
 * own runtime handle (`production-runtime/TypedGLBActor.ts`): actor-level
 * `part(name)` plus the C-37 `part` member on model handles. Fixture: a body
 * with four named wheel nodes.
 */
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { nodeHandleExtensionFor } from "../../../../packages/engine/src/contracts/runtimeNodes";
import {
  createTypedGLBActor,
  liveTypedGLBActor,
  type TypedGLBActor
} from "../../../../packages/engine/src/production-runtime/TypedGLBActor";
import type { AuraApp, AuraRuntimeNodeHandle } from "../../../../packages/engine/src/agent-api/index";

const GLB_BYTES = new Uint8Array(readFileSync("tests/fixtures/gltf-multipart/body-and-four-wheels.glb"));
const nativeFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = (async () => new Response(new Uint8Array(GLB_BYTES), { status: 200 })) as unknown as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = nativeFetch;
});

let serial = 0;
function loadActor(id: string, options: Record<string, unknown> = {}): Promise<TypedGLBActor> {
  serial += 1;
  return createTypedGLBActor({
    asset: { url: `https://assets.invalid/gu47-eh/wheels-${serial}.glb`, type: "model", format: "glb" },
    id,
    width: 64,
    height: 64,
    shareTextures: false,
    ...options
  });
}

function itemFor(actor: TypedGLBActor, nodeName: string, modelMatrix?: readonly number[]) {
  return actor.collectRenderItems(modelMatrix ? { modelMatrix } : {}).find((item) => item.label?.includes(`:${nodeName}:`));
}

describe("GU47 E-H GLB part handles", () => {
  it("part(name) drives the named node's local transform and visibility in the next collect", async () => {
    const actor = await loadActor("car");
    const wheel = actor.part("wheelFrontL")!;
    expect(wheel).toBeDefined();
    expect(wheel.id).toBe("car/wheelFrontL");
    expect(wheel.name).toBe("wheelFrontL");
    expect(wheel.position[0]).toBeCloseTo(1.05, 5);
    expect(actor.part("wheelFrontL")).toBe(wheel); // cached: per-frame calls allocate nothing

    const before = itemFor(actor, "wheelFrontL")!.modelMatrix!;
    const version = wheel.version;
    wheel.setPosition(2, 0.35, 1.3).setRotation(0, Math.PI / 2, 0);
    expect(wheel.version).toBeGreaterThan(version);
    const after = itemFor(actor, "wheelFrontL")!.modelMatrix!;
    expect(after[12]! - before[12]!).toBeCloseTo(2 - 1.05, 5);
    expect(after[0]).toBeCloseTo(0, 5); // 90° about Y: x axis now points along -z
    expect(wheel.rotation[1]).toBeCloseTo(Math.PI / 2, 5);

    wheel.setVisible(false);
    expect(itemFor(actor, "wheelFrontL")).toBeUndefined();
    wheel.visible = true;
    expect(itemFor(actor, "wheelFrontL")).toBeDefined();
    actor.dispose();
  });

  it("getWorld* compose the model matrix of the last drawn frame", async () => {
    const actor = await loadActor("truck");
    const wheel = actor.part("wheelBackR")!;
    const model = [2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 2, 0, 10, 0, -5, 1];
    actor.collectRenderItems({ modelMatrix: model });
    const world = wheel.getWorldPosition();
    // root(0,0.05,0) → wheels(0,0.01,0) → wheelBackR(-1.05,0.35,-1.3), then scale 2 and offset.
    expect(world[0]).toBeCloseTo(10 + 2 * -1.05, 4);
    expect(world[1]).toBeCloseTo(2 * (0.05 + 0.01 + 0.35), 4);
    expect(world[2]).toBeCloseTo(-5 + 2 * -1.3, 4);
    expect(wheel.getWorldScale()[0]).toBeCloseTo(2, 5);
    actor.dispose();
  });

  it("unknown names and merged static meshes return undefined", async () => {
    const actor = await loadActor("van");
    expect(actor.part("spoiler")).toBeUndefined();
    actor.dispose();
    const merged = await loadActor("static-van", { consolidateStaticMeshes: true });
    expect(merged.part("wheelFrontL")).toBeUndefined();
    merged.dispose();
  });

  it("model handles get a C-37 `part` member that resolves the live actor per call", async () => {
    const extension = nodeHandleExtensionFor("part");
    expect(extension?.appliesTo).toEqual(["model"]);
    expect(extension?.flag).toBe("A3D_QR_COMPILER");
    const handle = { id: "bus", kind: "model" } as unknown as AuraRuntimeNodeHandle;
    const part = extension!.create(handle, {} as AuraApp);
    expect(part("wheelFrontR")).toBeUndefined(); // GLB not loaded yet
    const actor = await loadActor("bus");
    expect(liveTypedGLBActor("bus")).toBe(actor);
    expect(part("wheelFrontR")?.name).toBe("wheelFrontR");
    actor.dispose();
    expect(liveTypedGLBActor("bus")).toBeUndefined();
    expect(part("wheelFrontR")).toBeUndefined();
  });
});
