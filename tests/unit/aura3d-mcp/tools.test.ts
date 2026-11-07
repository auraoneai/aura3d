import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { TOOLS, lookupError, type ToolResult } from "../../../packages/aura3d-mcp/src/tools.js";
import { parseErrorTable } from "../../../packages/aura3d-mcp/src/docs.js";
import { buildDocsBundle } from "../../../packages/aura3d-mcp/src/bundle/build.js";
import { context, estimateTokens, makeProject, repoRoot } from "./helpers.js";

let project: string;
const call = async (name: string, args: Record<string, unknown>): Promise<ToolResult> => {
  const tool = TOOLS.find((t) => t.name === name)!;
  return tool.call({ projectDir: project, ...args }, context(project));
};

beforeAll(() => {
  project = makeProject();
});

describe("get_symbol", () => {
  it("returns signature, doc, example and the installed version for a function", async () => {
    const r = await call("get_symbol", { name: "createAuraApp" });
    expect(r.isError).toBeFalsy();
    expect(r.text).toContain("9.9.9-fixture");
    expect(r.text).toContain("export declare function createAuraApp(target: string | HTMLElement, options: AuraCreateAppOptions): AuraApp;");
    expect(r.text).toContain("Mounts the scene, owns renderer");
    expect(r.text).toContain('createAuraApp("#app"');
  });

  it("reports @default tags and prose defaults", async () => {
    const options = await call("get_symbol", { name: "AuraCreateAppOptions" });
    expect(options.text).toContain("maxPixelRatio = 2");
    const lights = await call("get_symbol", { name: "lights" });
    expect(lights.text).toMatch(/Defaults: .*intensity 1\.5/);
  });

  it("follows export * and resolves members and subpaths", async () => {
    expect((await call("get_symbol", { name: "DirectionalLightOptions" })).text).toContain("intensity?: number");
    const member = await call("get_symbol", { name: "AuraApp.onFrame" });
    expect(member.isError).toBeFalsy();
    expect(member.text).toContain("onFrame");
    const lerp = await call("get_symbol", { name: "lerp", subpath: "math" });
    expect(lerp.text).toContain("declare function lerp(a: number, b: number, t: number): number");
  });

  it("never exposes modules outside the exports map", async () => {
    const hidden = await call("get_symbol", { name: "ENGINE_INTERNAL_ONLY" });
    expect(hidden.isError).toBe(true);
    expect(hidden.text).not.toContain("declare const ENGINE_INTERNAL_ONLY");
    const sub = await call("get_symbol", { name: "x", subpath: "internal/secret" });
    expect(sub.isError).toBe(true);
    expect(sub.text).toContain("Public subpaths");
    expect((await call("get_symbol", { name: "x", package: "../../etc" })).isError).toBe(true);
  });

  it("suggests close names and explains a missing install", async () => {
    const miss = await call("get_symbol", { name: "createAura" });
    expect(miss.isError).toBe(true);
    expect(miss.text).toContain("createAuraApp");
    const none = await call("get_symbol", { name: "createAuraApp", projectDir: "/tmp/definitely-no-aura3d-project" });
    expect(none.text).toContain("is not installed");
  });
});

describe("search_docs", () => {
  it("finds the translation table row with a file path and version stamp", async () => {
    const r = await call("search_docs", { query: "three.js PerspectiveCamera WebGLRenderer setAnimationLoop" });
    expect(r.text).toContain("[aura3d-mcp docs@");
    expect(r.text).toContain("threejs-to-aura3d.md");
  });

  it("finds instancing guidance", async () => {
    const r = await call("search_docs", { query: "instances scatter per-instance colour" });
    expect(r.text).toMatch(/instances/);
  });

  it("never serves repository-internal docs", () => {
    const paths = buildDocsBundle(repoRoot).files.map((f) => f.path);
    expect(paths).not.toContain("docs/agents/codebase-map.md");
    expect(paths).toContain("docs/agents/error-codes.md");
    expect(paths).toContain("llms.txt");
  });
});

describe("get_recipe", () => {
  it("returns recipe source plus installed signatures", async () => {
    const r = await call("get_recipe", { task: "water with a custom shader and animated uniform" });
    expect(r.text).toContain("water-custom-shader");
    expect(r.text).toContain("```ts");
    expect(r.text).toMatch(/Signatures|Imports used/);
  });

  it("picks an instancing recipe for a forest task", async () => {
    const r = await call("get_recipe", { task: "forest of 10000 instanced trees" });
    expect(r.text).toMatch(/props-kit-instances|instances/);
  });
});

describe("scaffold", () => {
  it("creates a project through the installed create-aura3d", async () => {
    const r = await call("scaffold", { template: "mini-game", dir: "out/game" });
    const body = JSON.parse(r.text) as { ok: boolean; via: string; fileCount: number };
    expect(body.ok).toBe(true);
    expect(body.via).toBe("installed create-aura3d");
    expect(body.fileCount).toBe(2);
    expect(existsSync(join(project, "out", "game", "src", "main.ts"))).toBe(true);
    expect(readFileSync(join(project, "out", "game", "package.json"), "utf8")).toContain("mini-game");
  });

  it("rejects unknown templates and non-empty targets", async () => {
    const unknown = await call("scaffold", { template: "nope", dir: "out/other" });
    expect(unknown.isError).toBe(true);
    expect(unknown.text).toContain("Unknown template");
    const again = await call("scaffold", { template: "mini-game", dir: "out/game" });
    expect(again.isError).toBe(true);
  });
});

describe("CLI wrappers", () => {
  it("assets_resolve returns structured JSON and defaults to a dry run", async () => {
    const r = await call("assets_resolve", { need: "robot", name: "robot" });
    const body = JSON.parse(r.text) as { ok: boolean; result: { dryRun: boolean; assetName: string; candidates: unknown[] } };
    expect(body.ok).toBe(true);
    expect(body.result.dryRun).toBe(true);
    expect(body.result.assetName).toBe("robot");
  });

  it("assets_inspect checks the file exists and returns the CLI JSON", async () => {
    const r = await call("assets_inspect", { file: "model.glb" });
    expect((JSON.parse(r.text) as { result: { triangles: number } }).result.triangles).toBe(1234);
    expect((await call("assets_inspect", { file: "missing.glb" })).isError).toBe(true);
  });

  it("check_deploy reports ok and failures from the exit status", async () => {
    const good = JSON.parse((await call("check_deploy", {})).text) as { ok: boolean };
    expect(good.ok).toBe(true);
    const bad = await call("check_deploy", { release: true });
    const body = JSON.parse(bad.text) as { ok: boolean; result: { failures: string[] } };
    expect(body.ok).toBe(false);
    expect(body.result.failures).toEqual(["release: missing LICENSE"]);
    expect((await call("check_deploy", { dist: "nope" })).isError).toBe(true);
  });

  it("explains a missing CLI install instead of throwing", async () => {
    const r = await call("assets_resolve", { need: "robot", projectDir: "/tmp/definitely-no-aura3d-project" });
    expect(r.text).toContain("not installed");
  });
});

describe("explain_error", () => {
  const required = ["RENDERER_MOUNT_FAILED", "CONTACT_SHADOW_PARTIAL", "KTX2_CSP_BLOCKED", "CAMERA_INFINITE_FAR_UNSUPPORTED", "DEPTH_POSTPROCESS_UNSUPPORTED", "AssetIntegrityError", "TEXTURE_FLIPY_DEGRADED", "TRANSMISSION_DEGRADED", "DEPTH_ALPHA_HASH_DEGRADED", "CONTACT_SHADOW_DEGRADED"];

  it("has cause and fix for every required code", async () => {
    for (const code of required) {
      const r = await call("explain_error", { code });
      expect(r.isError, code).toBeFalsy();
      expect(r.text).toMatch(/Cause: .{20,}/);
      expect(r.text).toMatch(/Fix: .{20,}/);
    }
  });

  it("matches a pasted console line and case-insensitive codes", async () => {
    const line = "[aura3d] RENDERER_MOUNT_FAILED: Contact shadow init threw. Nothing will draw.";
    expect((await call("explain_error", { code: line })).text).toContain("RENDERER_MOUNT_FAILED (");
    expect((await call("explain_error", { code: "assetintegrityerror" })).text).toContain("AssetIntegrityError");
    expect((await call("explain_error", { code: "NO_SUCH_CODE" })).isError).toBe(true);
  });

  it("covers every *_DEGRADED code that the renderer source can emit", () => {
    const rows = parseErrorTable(readFileSync(join(repoRoot, "docs/agents/error-codes.md"), "utf8"));
    const known = new Set(rows.map((r) => r.code));
    const sources = ["packages/rendering/src/DepthPass.ts", "packages/rendering/src/ForwardPass.ts", "packages/rendering/src/Renderer.ts", "packages/rendering/src/webgl2/TextureUpload.ts"];
    for (const file of sources) {
      for (const m of readFileSync(join(repoRoot, file), "utf8").matchAll(/\b([A-Z][A-Z0-9_]*_DEGRADED)\b/g)) expect(known.has(m[1]!), `${m[1]} in ${file}`).toBe(true);
    }
    expect(lookupError(rows, "ktx2_csp_blocked").row?.code).toBe("KTX2_CSP_BLOCKED");
  });
});

describe("token size", () => {
  it("keeps every answer under 2,500 tokens (chars / 3.6)", async () => {
    const answers: Array<[string, Record<string, unknown>]> = [
      ["get_symbol", { name: "createAuraApp" }],
      ["get_symbol", { name: "AuraCreateAppOptions" }],
      ["search_docs", { query: "camera orbit autoRotate", limit: 8 }],
      ["search_docs", { query: "material custom shader uniform water", limit: 8 }],
      ["get_recipe", { task: "procedural humanoid robot with walking" }],
      ["get_recipe", { task: "forest of 10000 instanced trees" }],
      ["get_recipe", { task: "low poly island with water and fog" }],
      ["explain_error", { code: "RENDERER_MOUNT_FAILED" }],
      ["assets_resolve", { need: "robot" }],
      ["check_deploy", {}]
    ];
    for (const [name, args] of answers) {
      const r = await call(name, args);
      expect(estimateTokens(r.text), `${name} ${JSON.stringify(args)}`).toBeLessThan(2500);
    }
  });
});
