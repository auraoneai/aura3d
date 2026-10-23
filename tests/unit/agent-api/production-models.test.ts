import { afterEach, describe, expect, it, vi } from "vitest";
import { defineModelAssets, modelsEnabledFromUrl, model, primitives, scene, AuraRuntimeError } from "../../../packages/engine/src/public/index";
import { createAssetProvenance } from "../../../packages/engine/src/agent-api/diagnostics";
import { analyzeProductionBridgeEligibility } from "../../../packages/engine/src/agent-api/compiler/observations";
import { createAuraRuntimeNodeRegistry } from "../../../packages/engine/src/agent-api/app/runtimeNodes";
import type { AuraSceneSnapshot } from "../../../packages/engine/src/agent-api/nodes/types";

const HASH_A = "a".repeat(64);
const HASH_B = "B".repeat(64);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("defineModelAssets: production bridge contract", () => {
  it("returns typed refs the production bridge treats as manifest assets (not unsafe/inline)", () => {
    const assets = defineModelAssets({
      hero: { url: "/assets/hero.glb", sha256: HASH_A, animations: ["run", "idle"], license: "own prompt", sizeBytes: 100 },
      tree: { url: "/assets/tree.glb", sha256: `sha256-${HASH_B}`, bounds: [1, 2, 1], sizeBytes: 50 }
    }, { queryParam: null });
    expect(assets.ids).toEqual(["hero", "tree"]);
    expect(assets.declaredBytes).toBe(150);
    expect(assets.refs.hero.hash).toBe(`sha256-${HASH_A}`);
    expect(assets.refs.tree.hash).toBe(`sha256-${HASH_B.toLowerCase()}`);
    expect(assets.refs.hero.metadata?.animations).toEqual(["run", "idle"]);
    expect(createAssetProvenance(assets.refs.hero).source).toBe("typed-aura-assets-manifest");
    const nodes = [model(assets.refs.hero).toJSON(), model(assets.refs.tree).toJSON()];
    const eligibility = analyzeProductionBridgeEligibility(nodes);
    expect(eligibility.eligible).toBe(true);
    expect(eligibility.typedModelCount).toBe(2);
  });

  it("fails at definition time on a bad sha256, naming the asset", () => {
    expect(() => defineModelAssets({ hero: { url: "/a.glb", sha256: "nope" } })).toThrowError(/"hero" needs a 64-character hex sha256/);
    expect(() => defineModelAssets({ hero: { url: "/a.glb", sha256: "" } })).toThrowError(AuraRuntimeError);
  });

  it("refuses another-origin URLs that the bridge would silently drop, unless they carry manifest sourcePath", () => {
    expect(() => defineModelAssets({ hero: { url: "https://cdn.example.com/hero.glb", sha256: HASH_A } })).toThrowError(/another origin/);
    const ok = defineModelAssets({ hero: { url: "https://cdn.example.com/hero.glb", sha256: HASH_A, sourcePath: "public/aura-assets/hero.glb" } }, { queryParam: null });
    expect(createAssetProvenance(ok.refs.hero).source).toBe("typed-aura-assets-manifest");
  });

  it("normalises a same-origin absolute URL to a pathname", () => {
    vi.stubGlobal("location", { origin: "https://site.test", href: "https://site.test/play/" });
    const assets = defineModelAssets({ hero: { url: "https://site.test/assets/hero.glb", sha256: HASH_A } });
    expect(assets.refs.hero.url).toBe("/assets/hero.glb");
  });

  it("joins baseUrl in front of relative entries only", () => {
    const assets = defineModelAssets({ a: { url: "models/a.glb", sha256: HASH_A }, b: { url: "/abs/b.glb", sha256: HASH_A } }, { baseUrl: "/game/", queryParam: null });
    expect(assets.refs.a.url).toBe("/game/models/a.glb");
    expect(assets.refs.b.url).toBe("/abs/b.glb");
  });
});

describe("procedural fallback switch", () => {
  it("modelsEnabledFromUrl: only 0/false/off/no disable", () => {
    expect(modelsEnabledFromUrl("models", "https://x.test/?models=0")).toBe(false);
    expect(modelsEnabledFromUrl("models", "https://x.test/?models=OFF")).toBe(false);
    expect(modelsEnabledFromUrl("models", "https://x.test/?models=1")).toBe(true);
    expect(modelsEnabledFromUrl("models", "https://x.test/")).toBe(true);
    expect(modelsEnabledFromUrl("gltf", "https://x.test/?gltf=false")).toBe(false);
    expect(modelsEnabledFromUrl("models", "not a url at all :::")).toBe(true);
  });

  it("node() builds the GLB model when enabled and the fallback when disabled", () => {
    const manifest = { hero: { url: "/hero.glb", sha256: HASH_A } } as const;
    const on = defineModelAssets(manifest, { enabled: true });
    const off = defineModelAssets(manifest, { enabled: false });
    const fallback = () => primitives.box({ width: 1, height: 1, depth: 1 });
    expect(on.enabled).toBe(true);
    expect(on.node("hero", { name: "h" }, fallback).toJSON().kind).toBe("model");
    expect(off.enabled).toBe(false);
    expect(off.node("hero", { name: "h" }, fallback).toJSON().kind).toBe("primitive");
  });

  it("a disabled model with no fallback is hidden, never throws", () => {
    const off = defineModelAssets({ hero: { url: "/hero.glb", sha256: HASH_A } }, { enabled: () => false });
    const node = off.node("hero").toJSON() as { kind: string; visible?: boolean };
    expect(node.kind).toBe("model");
    expect(node.visible).toBe(false);
  });

  it("follows ?models=0 from the page URL by default and rejects unknown ids by name", () => {
    vi.stubGlobal("location", { origin: "https://x.test", href: "https://x.test/?models=0" });
    const assets = defineModelAssets({ hero: { url: "/hero.glb", sha256: HASH_A } });
    expect(assets.enabled).toBe(false);
    expect(() => assets.node("tree" as "hero")).toThrowError(/unknown model id "tree"/);
  });
});

describe("scene(init) no longer silently drops its argument", () => {
  it("scene({ children, background, camera }) builds a populated scene", () => {
    const box = primitives.box({ width: 1, height: 1, depth: 1 });
    const built = scene({ children: [box, box], background: "#102030" }).toJSON();
    expect(built.nodes).toHaveLength(2);
    expect(built.background).toBe("#102030");
  });

  it("an unknown key or a non-object throws a named error instead of returning an empty scene", () => {
    expect(() => scene({ nodes: [] } as never)).toThrowError(/does not understand "nodes"/);
    expect(() => scene([] as never)).toThrowError(AuraRuntimeError);
    expect(() => scene({ children: "x" } as never)).toThrowError(/array of nodes/);
    expect(scene().toJSON().nodes).toHaveLength(0);
  });
});

describe("setUniform on a model node", () => {
  const assets = defineModelAssets({ hero: { url: "/hero.glb", sha256: HASH_A } }, { queryParam: null });
  const snapshotOf = (node: unknown) => ({ nodes: [node] }) as unknown as AuraSceneSnapshot;

  it("is a once-per-uniform diagnostic no-op, not a throw", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const node = model(assets.refs.hero).runtime({ id: "hero-node" }).toJSON();
    const handle = createAuraRuntimeNodeRegistry(snapshotOf(node)).get("hero-node")!;
    expect(() => handle.setUniform!("uGlow", 1)).not.toThrow();
    expect(handle.setUniform!("uGlow", 2)).toBe(handle);
    expect(warn.mock.calls.filter((call) => String(call[0]).includes("MODEL_SETUNIFORM_NOOP") && String(call[0]).includes("uGlow"))).toHaveLength(1);
  });

  it("still validates on a non-model node without a custom material", () => {
    const node = primitives.box({ width: 1, height: 1, depth: 1 }).runtime({ id: "box-node" }).toJSON();
    const handle = createAuraRuntimeNodeRegistry(snapshotOf(node)).get("box-node")!;
    expect(() => handle.setUniform!("uGlow", 1)).toThrowError(/setUniform requires a node material created by material.custom/);
  });
});
