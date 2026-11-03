import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkV5DeclarationConsumer } from "./v5-declaration-consumer.js";

function candidate(declaration: string): string {
  const stage = mkdtempSync(join(tmpdir(), "aura-v5-declaration-consumer-"));
  const engine = join(stage, "node_modules/@aura3d/engine");
  mkdirSync(engine, { recursive: true });
  writeFileSync(join(engine, "package.json"), JSON.stringify({
    name: "@aura3d/engine", type: "module", exports: { "./v5": { types: "./v5.d.ts" } }
  }));
  writeFileSync(join(engine, "v5.d.ts"), declaration);
  return stage;
}

describe("strict staged v5 declaration consumer", () => {
  it("accepts a self-contained isolated declaration candidate", () => {
    const stage = candidate("export interface Scene { readonly id: string }\n");
    try {
      const result = checkV5DeclarationConsumer(stage, 'import type { Scene } from "@aura3d/engine/v5"; export type T = Scene;');
      expect(result).toEqual({ success: true, diagnostics: [], forbiddenResolutions: [], escapedResolutions: [] });
    } finally { rmSync(stage, { recursive: true, force: true }); }
  });

  it.each(["@aura3d/physics-rapier", "@dimforge/rapier3d-compat"])(
    "rejects a declaration that requires optional backend %s even if installed",
    (name) => {
      const stage = candidate(`import type { World } from "${name}"; export interface Scene { world: World }\n`);
      try {
        const installed = join(stage, "node_modules", ...name.split("/"));
        mkdirSync(installed, { recursive: true });
        writeFileSync(join(installed, "package.json"), JSON.stringify({ name, type: "module", types: "./index.d.ts" }));
        writeFileSync(join(installed, "index.d.ts"), "export interface World {}\n");
        const result = checkV5DeclarationConsumer(stage, 'import type { Scene } from "@aura3d/engine/v5"; export type T = Scene;');
        expect(result.success).toBe(false);
        expect(result.forbiddenResolutions).toContain(name);
      } finally { rmSync(stage, { recursive: true, force: true }); }
    }
  );

  it("checks declaration bodies rather than skipping library errors", () => {
    const stage = candidate("export interface Scene { missing: NoSuchType }\n");
    try {
      const result = checkV5DeclarationConsumer(stage, 'import type { Scene } from "@aura3d/engine/v5"; export type T = Scene;');
      expect(result.success).toBe(false);
      expect(result.forbiddenResolutions).toEqual([]);
      expect(result.escapedResolutions).toEqual([]);
      // TypeScript may offer a spelling suggestion (2552) or report the plain
      // missing name (2304); both must name the deliberately undefined type.
      expect(result.diagnostics.filter((diagnostic) =>
        (diagnostic.code === 2304 || diagnostic.code === 2552) && diagnostic.message.includes("NoSuchType")
      ), JSON.stringify(result, null, 2)).toHaveLength(1);
    } finally { rmSync(stage, { recursive: true, force: true }); }
  });

  it("rejects a declaration resolved outside the supplied stage", () => {
    const stage = candidate('import type { External } from "./escaped.js"; export interface Scene { value: External }\n');
    const outside = mkdtempSync(join(tmpdir(), "aura-v5-declaration-outside-"));
    try {
      const external = join(outside, "escaped.d.ts");
      writeFileSync(external, "export interface External {}\n");
      symlinkSync(external, join(stage, "node_modules/@aura3d/engine/escaped.d.ts"));
      const result = checkV5DeclarationConsumer(stage, 'import type { Scene } from "@aura3d/engine/v5"; export type T = Scene;');
      expect(result.success).toBe(false);
      expect(result.escapedResolutions).toHaveLength(1);
    } finally {
      rmSync(stage, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });
});
