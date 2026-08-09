import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const EXAMPLE = "examples/custom-material-lab/main.ts";
const REPORT_DIRECTORY = resolve("tests/reports/portable-custom-materials");

test.describe("public portable custom materials", () => {
  test.setTimeout(180_000);
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
    mkdirSync(REPORT_DIRECTORY, { recursive: true });
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("renders three nontrivial materials, hot reloads atomically, diagnoses invalid source, and disposes on WebGL2", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    const source = readFileSync(resolve(EXAMPLE), "utf8");
    expect(source).toContain("PortableShaderMaterial");
    expect(source.match(/new PortableShaderMaterial/g)?.length).toBe(3);
    expect(source).not.toMatch(/from\s+["']three(?:\/|["'])/);
    expect(source).not.toMatch(/@aura3d\/[a-z0-9-]+\/src\//);

    await page.goto(`${server.origin}/examples/custom-material-lab/?backend=webgl2`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => (window as unknown as { __AURA_PORTABLE_MATERIAL_LAB__?: { frame: number } }).__AURA_PORTABLE_MATERIAL_LAB__?.frame! >= 3, undefined, { timeout: 30_000 })
      .catch(() => { throw new Error(`Portable material lab did not become ready: ${errors.join(" | ") || "no browser diagnostic"}`); });
    const state = await labState(page);
    expect(state).toMatchObject({ ready: true, backend: "webgl2", materialCount: 3, publicApiOnly: true, sourceKinds: ["GLSL", "WGSL"] });
    expect(state.diagnostics.drawCalls).toBe(3);

    const canvas = page.locator("#stage");
    await page.evaluate(() => (window as unknown as { __AURA_PORTABLE_MATERIAL_RENDER_FIXED__: () => unknown }).__AURA_PORTABLE_MATERIAL_RENDER_FIXED__());
    const before = await canvas.screenshot({ path: resolve(REPORT_DIRECTORY, "aura-webgl2-before.png") });
    const beforeHash = createHash("sha256").update(before).digest("hex");
    await page.evaluate(() => (window as unknown as { __AURA_PORTABLE_MATERIAL_HOT_RELOAD__: () => unknown }).__AURA_PORTABLE_MATERIAL_HOT_RELOAD__());
    const after = await canvas.screenshot({ path: resolve(REPORT_DIRECTORY, "aura-webgl2-after.png") });
    const afterHash = createHash("sha256").update(after).digest("hex");
    expect(afterHash).not.toBe(beforeHash);
    expect((await labState(page)).hotReloaded).toBe(true);

    const invalid = await page.evaluate(async () => {
      const rendering = await import("/packages/rendering/src/index.js");
      const library = new rendering.ShaderLibrary();
      try {
        new rendering.PortableShaderMaterial({
          shaderLibrary: library,
          name: "invalid-portable",
          sources: {
            glsl: {
              vertex: "#version 300 es\nuniform mat4 u_modelViewProjection;\nvoid main(){gl_Position=vec4(0.0);}",
              fragment: "#version 300 es\nprecision highp float;\nout vec4 outColor;\nvoid main(){outColor=vec4(1.0);}"
            },
            wgsl: {
              vertex: "@vertex fn vs_main() -> @builtin(position) vec4<f32>{return vec4<f32>();}",
              fragment: "@fragment fn fs_main() -> @location(0) vec4<f32>{return vec4<f32>();}"
            }
          }
        });
        return { name: "", diagnostics: [] as string[] };
      } catch (error) {
        return {
          name: error instanceof Error ? error.name : "unknown",
          diagnostics: typeof error === "object" && error !== null && "diagnostics" in error
            ? Array.from((error as { diagnostics: readonly string[] }).diagnostics)
            : [String(error)]
        };
      }
    });
    expect(invalid.name).toBe("PortableShaderCompilationError");
    expect(invalid.diagnostics).toEqual(expect.arrayContaining([
      "WGSL vertex stage is missing /* @aura3d-bindings */",
      "WGSL fragment stage is missing /* @aura3d-bindings */"
    ]));

    const runtimeCompile = await page.evaluate(async () => {
      const rendering = await import("/packages/rendering/src/index.js");
      const library = new rendering.ShaderLibrary();
      const instance = new rendering.PortableShaderMaterial({
        shaderLibrary: library,
        name: "invalid-glsl-runtime",
        sources: {
          glsl: {
            vertex: "#version 300 es\nlayout(location=0) in vec3 a_position; uniform mat4 u_modelViewProjection; void main(){gl_Position=u_modelViewProjection*vec4(a_position,1.0);}",
            fragment: "#version 300 es\nprecision highp float; out vec4 outColor; void main(){ outColor = this_is_not_glsl; }"
          },
          wgsl: {
            vertex: "/* @aura3d-bindings */\n@vertex fn vs_main(@location(0) p:vec3<f32>)->@builtin(position) vec4<f32>{return aura.u_modelViewProjection*vec4<f32>(p,1.0);}",
            fragment: "/* @aura3d-bindings */\n@fragment fn fs_main()->@location(0) vec4<f32>{return vec4<f32>(1.0);}"
          }
        }
      });
      const target = document.createElement("canvas");
      const device = await rendering.createRenderDevice({ backend: "webgl2", canvas: target });
      const result = instance.compile(device);
      instance.dispose();
      device.dispose();
      return result;
    });
    expect(runtimeCompile.ok).toBe(false);
    expect(runtimeCompile.diagnostics.join(" ")).toMatch(/shader compile failed/i);

    const disposal = await page.evaluate(() => (window as unknown as { __AURA_PORTABLE_MATERIAL_DISPOSE__: () => unknown }).__AURA_PORTABLE_MATERIAL_DISPOSE__());
    expect(disposal).toEqual({ materialsDisposed: true, rendererDisposed: true });

    writeFileSync(resolve(REPORT_DIRECTORY, "webgl2.json"), `${JSON.stringify({ state, beforeHash, afterHash, invalid, runtimeCompile, disposal }, null, 2)}\n`);
  });

  test("submits the same three public materials through native WebGPU with typed texture binding", async ({ page }) => {
    await page.goto(`${server.origin}/examples/custom-material-lab/?backend=webgpu`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => (window as unknown as { __AURA_PORTABLE_MATERIAL_LAB__?: { frame: number } }).__AURA_PORTABLE_MATERIAL_LAB__?.frame! >= 3,
      undefined,
      { timeout: 90_000 }
    );
    const state = await labState(page);
    expect(state.backend).toBe("webgpu");
    expect(state.materialCount).toBe(3);
    expect(state.diagnostics.drawCalls).toBe(3);
    expect(Number(state.diagnostics.nativeSubmissions)).toBeGreaterThanOrEqual(3);
    expect(Number(state.diagnostics.nativePassthroughSubmissions)).toBeGreaterThanOrEqual(3);
    expect(Number(state.diagnostics.nativeTextureBindings)).toBeGreaterThanOrEqual(1);
    expect(Number(state.diagnostics.nativeRenderPipelinesCreated)).toBeGreaterThanOrEqual(3);

    const wgslCompile = await page.evaluate(async () => {
      const rendering = await import("/packages/rendering/src/index.js");
      const library = new rendering.ShaderLibrary();
      const instance = new rendering.PortableShaderMaterial({
        shaderLibrary: library,
        name: "invalid-wgsl-runtime",
        sources: {
          glsl: {
            vertex: "#version 300 es\nlayout(location=0) in vec3 a_position; uniform mat4 u_modelViewProjection; void main(){gl_Position=u_modelViewProjection*vec4(a_position,1.0);}",
            fragment: "#version 300 es\nprecision highp float; out vec4 outColor; void main(){outColor=vec4(1.0);}"
          },
          wgsl: {
            vertex: "/* @aura3d-bindings */\n@vertex fn vs_main(@location(0) p:vec3<f32>)->@builtin(position) vec4<f32>{return aura.u_modelViewProjection*vec4<f32>(p,1.0);}",
            fragment: "/* @aura3d-bindings */\n@fragment fn fs_main()->@location(0) vec4<f32>{return vec4<f32>(definitely_missing,1.0);}"
          }
        }
      });
      const target = document.createElement("canvas");
      const device = await rendering.createRenderDevice({ backend: "webgpu", canvas: target });
      const result = await instance.compileAsync(device);
      instance.dispose();
      device.dispose();
      return result;
    });
    expect(wgslCompile.ok).toBe(false);
    expect(wgslCompile.diagnostics.join(" ")).toMatch(/fragment.*definitely_missing/i);

    const image = await page.locator("#stage").screenshot({ path: resolve(REPORT_DIRECTORY, "aura-webgpu.png") });
    const imageHash = createHash("sha256").update(image).digest("hex");
    await page.evaluate(() => (window as unknown as { __AURA_PORTABLE_MATERIAL_HOT_RELOAD__: () => unknown }).__AURA_PORTABLE_MATERIAL_HOT_RELOAD__());
    const reloaded = await labState(page);
    expect(reloaded.hotReloaded).toBe(true);
    expect(Number(reloaded.diagnostics.nativeRenderPipelinesCreated)).toBeGreaterThanOrEqual(1);
    writeFileSync(resolve(REPORT_DIRECTORY, "webgpu.json"), `${JSON.stringify({ state, reloaded, imageHash, wgslCompile }, null, 2)}\n`);
  });

  test("runs the locked Three r185 TSL control on WebGL2 and WebGPU and records the honest ergonomics delta", async ({ browser }) => {
    const baselineSource = readFileSync(resolve("benchmark/current-threejs/portable-materials/main.ts"), "utf8");
    const auraSource = readFileSync(resolve(EXAMPLE), "utf8");
    const results: Array<Record<string, unknown>> = [];

    for (const backend of ["webgl2", "webgpu"] as const) {
      const page = await browser.newPage();
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
      await page.goto(`${server.origin}/benchmark/current-threejs/portable-materials/?backend=${backend}`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => Boolean((window as unknown as { __THREE_TSL_MATERIAL_CONTROL__?: unknown }).__THREE_TSL_MATERIAL_CONTROL__), undefined, { timeout: 90_000 })
        .catch(() => { throw new Error(`Three TSL ${backend} control did not become ready: ${errors.join(" | ") || "no browser diagnostic"}`); });
      const state = await page.evaluate(() => (window as unknown as { __THREE_TSL_MATERIAL_CONTROL__: Record<string, unknown> }).__THREE_TSL_MATERIAL_CONTROL__);
      const image = await page.locator("#stage").screenshot({ path: resolve(REPORT_DIRECTORY, `three-tsl-${backend}.png`) });
      results.push({ backend, state, imageHash: createHash("sha256").update(image).digest("hex"), imageBytes: image.byteLength });
      await page.close();
    }

    expect(results[0]?.state).toMatchObject({ ready: true, version: "185", backend: "webgl2", materialCount: 3, tsl: true });
    expect(results[1]?.state).toMatchObject({ ready: true, version: "185", backend: "webgpu", materialCount: 3, tsl: true });
    expect(results[0]?.imageHash).not.toBe(results[1]?.imageHash);

    const comparison = {
      schema: "aura3d-portable-custom-material-comparison/1.0",
      generatedAt: new Date().toISOString(),
      baseline: {
        package: "three@0.185.1",
        revision: "185",
        surface: "WebGPURenderer + MeshBasicNodeMaterial + TSL",
        source: "benchmark/current-threejs/portable-materials/main.ts",
        sourceSha256: createHash("sha256").update(baselineSource).digest("hex"),
        authoredLines: authoredLines(baselineSource),
        strengths: ["one backend-neutral node graph", "composable typed expression graph", "mature node library and ecosystem"],
        costs: ["renderer/node-material-specific concepts", "runtime graph build diagnostics for some invalid compositions"]
      },
      aura3d: {
        surface: "PortableShaderMaterial + ShaderLibrary + Renderer",
        source: EXAMPLE,
        sourceSha256: createHash("sha256").update(auraSource).digest("hex"),
        authoredLines: authoredLines(auraSource),
        strengths: ["explicit GLSL/WGSL ownership", "schema-checked uniforms and resources", "atomic paired hot reload", "pre-render structural diagnostics"],
        costs: ["two shader implementations", "selected portable bindings only", "not TSL/node-graph parity"]
      },
      output: {
        three: results,
        aura: {
          webgl2: JSON.parse(readFileSync(resolve(REPORT_DIRECTORY, "webgl2.json"), "utf8")),
          webgpu: JSON.parse(readFileSync(resolve(REPORT_DIRECTORY, "webgpu.json"), "utf8"))
        },
        verdict: "Both surfaces render all three selected workloads on current WebGL2 and WebGPU. Screenshots are evidence of successful, distinct output, not pixel-equivalence: each implementation is authored independently."
      },
      diagnostics: {
        aura: "PortableShaderCompilationError reports schema divergence and identifies the missing WGSL stage binding marker before rendering.",
        three: "TSL provides stronger expression composition and type propagation; invalid graph failures may surface during node graph build/render."
      },
      portability: {
        three: "One TSL graph runs through r185 WebGPURenderer on native WebGPU and its WebGL2 backend.",
        aura: "One material object owns explicit paired GLSL/WGSL stages and runs through native WebGL2/WebGPU renderer paths."
      },
      verdict: "Aura3D now has a supported ShaderMaterial-class extension path for these selected workloads. Three r185 TSL remains materially more concise and composable; Aura3D does not claim general TSL or node-material parity."
    };
    writeFileSync(resolve(REPORT_DIRECTORY, "comparison.json"), `${JSON.stringify(comparison, null, 2)}\n`);
  });
});

async function labState(page: import("@playwright/test").Page): Promise<{
  readonly ready: boolean;
  readonly backend: string;
  readonly materialCount: number;
  readonly frame: number;
  readonly hotReloaded: boolean;
  readonly publicApiOnly: boolean;
  readonly sourceKinds: readonly string[];
  readonly diagnostics: Record<string, unknown>;
}> {
  return page.evaluate(() => (window as unknown as { __AURA_PORTABLE_MATERIAL_LAB__: never }).__AURA_PORTABLE_MATERIAL_LAB__);
}

function authoredLines(source: string): number {
  return source.split("\n").filter((line) => {
    const trimmed = line.trim();
    return trimmed.length > 0 && !trimmed.startsWith("//") && !trimmed.startsWith("/*") && !trimmed.startsWith("*");
  }).length;
}
