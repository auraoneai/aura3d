/**
 * PRD-10 world shaders only declare uniforms the RenderDevice can upload.
 *
 * WebGL2 MultiDraw uploads JS numbers with uniform1f, 16-float arrays with
 * uniformMatrix4fv, longer multiples of 4 with uniform4fv, and 2/3/4-float
 * arrays as vec2/vec3/vec4 — nothing else (#491). An `int`/`bool` uniform,
 * a `float[N]`/`vec2[N]`/`vec3[N]` array, or a `vec4[2..4]` array silently never
 * arrives (or throws UNSUPPORTED_UNIFORM), which is how the Path S terrain lost
 * its layer count and morph ranges and the water its wave speeds.
 * Raw-GL test helpers (terrainGpuHeightReadback) are exempt.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOTS = ["packages/rendering/src/world", "packages/engine/src/production-runtime/world"];
const EXEMPT = new Set(["packages/rendering/src/world/terrain/TerrainHeightTexture.ts"]);
const UNIFORM = /^\s*uniform\s+(?:highp\s+|mediump\s+|lowp\s+)?(\w+)\s+(\w+)\s*(?:\[\s*([^\]]+)\s*\])?\s*;/gm;
const ARRAY_CONSTANTS: Readonly<Record<string, number>> = { "${MAX_RULES}": 8 };

function* tsFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* tsFiles(path);
    else if (entry.endsWith(".ts")) yield path;
  }
}

function problem(type: string, arraySize: string | undefined): string | null {
  if (type.startsWith("sampler")) return null;
  if (type === "int" || type === "uint" || type === "bool" || /^[iub]vec\d$/.test(type)) return "integer/bool uniform";
  if (arraySize === undefined) return null;
  const n = ARRAY_CONSTANTS[arraySize] ?? Number(arraySize);
  if (type === "mat4") return null;
  if (type !== "vec4") return `${type}[] array`;
  if (!Number.isFinite(n)) return `vec4[${arraySize}] with unknown size`;
  return n >= 2 && n <= 4 ? `vec4[${n}] (uploads as ${n * 4} floats)` : null;
}

describe("prd10 world shader uniforms are device-uploadable", () => {
  it("declares no int/bool uniforms and no unsupported arrays", () => {
    const root = process.cwd();
    const offenders: string[] = [];
    for (const base of ROOTS) {
      for (const file of tsFiles(join(root, base))) {
        const rel = relative(root, file);
        if (EXEMPT.has(rel)) continue;
        for (const m of readFileSync(file, "utf8").matchAll(UNIFORM)) {
          const issue = problem(m[1]!, m[3]);
          if (issue) offenders.push(`${rel}: uniform ${m[1]} ${m[2]}${m[3] ? `[${m[3]}]` : ""} — ${issue}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
