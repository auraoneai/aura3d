import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { build } from "esbuild";
import { describe, expect, it } from "vitest";
import { findTopLevelAwait, verifyNoTopLevelAwait } from "../../../tools/verify-no-tla/index.ts";

const root = process.cwd();
const built = existsSync(join(root, "dist/physics-rapier/rapierInit.lazy.js")) && existsSync(join(root, "dist/index.js"));
const external = ["node:*", "@dimforge/rapier3d-compat", "recast-navigation", "@gltf-transform/*", "@loaders.gl/*", "ktx-parse", "meshoptimizer"];
const entries = ["dist/index.js", "dist/physics/index.js", "dist/game/index.js"].map((entry) => resolve(root, entry));

function readOutputs(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return readOutputs(full);
    return name.endsWith(".js") ? [readFileSync(full, "utf8")] : [];
  });
}

async function bundle(options: { target: string; format: "esm" | "iife"; conditions?: string[]; splitting?: boolean }) {
  const outdir = mkdtempSync(join(tmpdir(), "no-tla-"));
  try {
    await build({
      entryPoints: entries,
      bundle: true,
      outdir,
      format: options.format,
      target: options.target,
      splitting: options.splitting === true,
      conditions: options.conditions,
      external,
      logLevel: "silent"
    });
    return readOutputs(outdir);
  } finally {
    rmSync(outdir, { recursive: true, force: true });
  }
}

describe.skipIf(!built)("consumer bundles of the built engine without top-level await", () => {
  it("published dist contains no top-level await except the default solver init", () => {
    const report = verifyNoTopLevelAwait(root);
    expect(report.hits).toEqual([]);
  });

  it("the lazy solver init has no top-level await and the default one does", () => {
    expect(findTopLevelAwait(readFileSync(join(root, "dist/physics-rapier/rapierInit.lazy.js"), "utf8"))).toEqual([]);
    expect(findTopLevelAwait(readFileSync(join(root, "dist/physics-rapier/rapierInit.js"), "utf8")).length).toBeGreaterThan(0);
  });

  it.each([
    { target: "es2020", format: "esm" as const },
    { target: "es2020", format: "iife" as const },
    { target: "es2022", format: "iife" as const },
    { target: "esnext", format: "esm" as const, splitting: true }
  ])("bundles with the aura3d-no-tla condition: $format $target", async (options) => {
    const outputs = await bundle({ ...options, conditions: ["aura3d-no-tla"] });
    expect(outputs.length).toBeGreaterThan(0);
    if (options.format === "esm") {
      for (const output of outputs) expect(findTopLevelAwait(output)).toEqual([]);
    }
  }, 120_000);

  it("the default build still needs top-level await, so an es2020 target is rejected and says why", async () => {
    await expect(bundle({ target: "es2020", format: "esm" })).rejects.toThrow(/Top-level await/);
  }, 120_000);

  it("ensurePhysics() makes the lazy build usable and a world before it is a clear error", () => {
    const script = `
      const physics = await import(${JSON.stringify(resolve(root, "dist/physics/index.js"))});
      let early = "no error";
      try { new physics.PhysicsWorld({}); } catch (error) { early = String(error.message); }
      await physics.ensurePhysics();
      const world = new physics.PhysicsWorld({ gravity: [0, -9.81, 0] });
      const body = world.createBody ? world.createBody({ name: "ball", shape: "sphere", radius: 0.5, mass: 1, position: [0, 5, 0] }) : null;
      for (let i = 0; i < 30; i += 1) world.step(1 / 60);
      console.log(JSON.stringify({ mode: physics.physicsInitMode, early, fell: body ? body.position()[1] < 5 : null }));
    `;
    const result = spawnSync(process.execPath, ["--conditions=aura3d-no-tla", "--input-type=module", "-e", script], { cwd: root, encoding: "utf8" });
    expect(result.stderr).not.toMatch(/SyntaxError/);
    const parsed = JSON.parse(result.stdout.trim().split("\n").pop() ?? "{}") as { mode: string; early: string; fell: boolean | null };
    expect(parsed.mode).toBe("lazy");
    expect(parsed.early).toMatch(/ensurePhysics|not ready|already/i);
    expect(parsed.fell === null || parsed.fell === true).toBe(true);
  }, 60_000);
});
