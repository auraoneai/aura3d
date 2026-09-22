import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createTypedGLBActor,
  type TypedGLBActor
} from "../../../packages/engine/src/production-runtime/TypedGLBActor";

/**
 * Performance mission section 27 (asset reuse), measured on `showcase-deep-recovery`: five typed GLB
 * assets produced 17 GLB fetch/parse cycles because `createTypedGLBActor` built a fresh loader per
 * scene node. The fix lives in `@aura3d/assets` (`loadProductionGLTFRenderPipeline`), so this suite
 * proves the actor path inherits it **and** that the per-actor mutations a typed actor performs on
 * its own scene graph, materials and geometries stay actor-local.
 *
 * Each test uses its own URL: the parsed-asset cache is module state on purpose (that is the whole
 * point), so shared URLs across tests would couple their reference counts.
 */

const GLB_BYTES = new Uint8Array(readFileSync("tests/fixtures/gltf-multipart/body-and-four-wheels.glb"));

let fetchCalls: string[] = [];
const nativeFetch = globalThis.fetch;

beforeEach(() => {
  fetchCalls = [];
  globalThis.fetch = (async (input: unknown) => {
    fetchCalls.push(String(input));
    return new Response(new Uint8Array(GLB_BYTES), { status: 200 });
  }) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = nativeFetch;
});

function typedAsset(name: string) {
  return {
    url: `https://assets.invalid/aura-assets/deepRecovery${name}.glb`,
    type: "model",
    format: "glb",
    hash: `sha256-${name.toLowerCase()}`
  } as const;
}

function createActor(asset: ReturnType<typeof typedAsset>, id: string, options: Record<string, unknown> = {}): Promise<TypedGLBActor> {
  return createTypedGLBActor({ asset, id, width: 512, height: 512, ...options }) as Promise<TypedGLBActor>;
}

function renderNodeNames(actor: TypedGLBActor): string[] {
  return actor.pipeline.resources.scene.collectRenderables().map(({ node }) => node.name);
}

function visibleItemCount(actor: TypedGLBActor): number {
  return actor.collectRenderItems().length;
}

describe("typed GLB actor parsed-asset reuse", () => {
  it("loads one parse for every actor that references the same typed asset url", async () => {
    const asset = typedAsset("WreckHull");
    const actors = await Promise.all([createActor(asset, "wreck-1"), createActor(asset, "wreck-2"), createActor(asset, "wreck-3")]);

    expect(fetchCalls.filter((url) => url === asset.url)).toHaveLength(1);
    expect(new Set(actors.map((actor) => actor.pipeline.asset)).size).toBe(1);
    // Every actor still owns the resources it mutates.
    expect(new Set(actors.map((actor) => actor.pipeline.resources)).size).toBe(3);
    const geometries = actors.flatMap((actor) => [...actor.pipeline.resources.geometryLibrary.values()]);
    expect(new Set(geometries).size).toBe(geometries.length);
    for (const actor of actors) expect(visibleItemCount(actor)).toBeGreaterThan(0);
    for (const actor of actors) actor.dispose();
  });

  it("keeps scene-root renames, hidden nodes and tints actor-local", async () => {
    const asset = typedAsset("CrateStandard");
    const probe = await createActor(asset, "probe");
    const hideableNode = renderNodeNames(probe)[0]!;
    probe.dispose();

    const hidden = await createActor(asset, "crate-hidden", { hiddenNodeNames: [hideableNode] });
    const plain = await createActor(asset, "crate-plain", { tint: { baseColor: [0.25, 0.5, 0.75, 1] } });

    try {
      expect(hidden.pipeline.asset).toBe(plain.pipeline.asset);
      expect(hidden.pipeline.resources.scene.root.name).toBe("crate-hidden-scene-root");
      expect(plain.pipeline.resources.scene.root.name).toBe("crate-plain-scene-root");
      // Hiding a node is an actor-local visibility write, never a shared-parse write.
      expect(renderNodeNames(hidden)).not.toContain(hideableNode);
      expect(renderNodeNames(plain)).toContain(hideableNode);
      expect(visibleItemCount(hidden)).toBeLessThan(visibleItemCount(plain));
      expect(visibleItemCount(plain)).toBeGreaterThan(0);

      const hiddenMaterial = [...hidden.pipeline.resources.materialLibrary.values()][0]!;
      const plainMaterial = [...plain.pipeline.resources.materialLibrary.values()][0]!;
      expect(plainMaterial.getParameter("u_baseColor")).toEqual([0.25, 0.5, 0.75, 1]);
      expect(hiddenMaterial.getParameter("u_baseColor")).not.toEqual([0.25, 0.5, 0.75, 1]);

      // A later tint on one actor must not travel to the actor that shares its parse.
      hidden.setTint({ baseColor: [0.9, 0.1, 0.2, 1] });
      expect(plainMaterial.getParameter("u_baseColor")).toEqual([0.25, 0.5, 0.75, 1]);
    } finally {
      hidden.dispose();
      plain.dispose();
    }
  });

  it("disposing one actor leaves its peers usable and only frees the shared parse last", async () => {
    const asset = typedAsset("CrateHeavy");
    const first = await createActor(asset, "wreck-first");
    const second = await createActor(asset, "wreck-second");
    const sharedAsset = first.pipeline.asset;
    const firstGeometries = [...first.pipeline.resources.geometryLibrary.values()];
    const peerGeometries = [...second.pipeline.resources.geometryLibrary.values()];

    try {
      first.dispose();
      first.dispose(); // idempotent double dispose

      expect(firstGeometries.every((geometry) => isVertexBufferDisposed(geometry))).toBe(true);
      expect(peerGeometries.every((geometry) => !isVertexBufferDisposed(geometry))).toBe(true);
      expect(second.pipeline.asset).toBe(sharedAsset);
      expect(second.pipeline.asset.disposed).toBe(false);
      expect(visibleItemCount(second)).toBeGreaterThan(0);
      expect(second.evidence.renderItemCount).toBeGreaterThan(0);
      expect(second.evidence.url).toBe(asset.url);

      // The last lease is gone, so the next actor re-parses rather than reading a released asset.
      second.dispose();
      const reloaded = await createActor(asset, "wreck-after-release");
      expect(fetchCalls.filter((url) => url === asset.url)).toHaveLength(2);
      expect(reloaded.pipeline.asset).not.toBe(sharedAsset);
      expect(visibleItemCount(reloaded)).toBeGreaterThan(0);
      reloaded.dispose();
    } finally {
      second.dispose();
    }
  });
});

type ActorGeometry = TypedGLBActor["pipeline"]["resources"]["geometryLibrary"] extends ReadonlyMap<string, infer geometry>
  ? geometry
  : never;

function isVertexBufferDisposed(geometry: ActorGeometry): boolean {
  try {
    geometry.vertexBuffer.getAttribute(0, "position");
    return false;
  } catch {
    return true;
  }
}
