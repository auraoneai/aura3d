import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { moduleUrlPath, rewriteImportMetaUrl, startExampleDevServer } from "../browser/example-dev-server";

describe("example dev server: import.meta.url in bundled app entries", () => {
  const root = mkdtempSync(join(tmpdir(), "aura3d-devserver-"));
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it("rewrites import.meta.url to the module's own served path", () => {
    expect(moduleUrlPath(root, join(root, "examples", "ninja", "models.ts"))).toBe("/examples/ninja/models.ts");
    const out = rewriteImportMetaUrl('const u = new URL("./a.glb", import.meta.url).href;', "/examples/ninja/models.ts");
    expect(out).toBe('const u = new URL("./a.glb", new URL("/examples/ninja/models.ts", self.location.href).href).href;');
    expect(rewriteImportMetaUrl("const x = import.meta.env;", "/x.ts")).toBe("const x = import.meta.env;");
  });

  it("an example mounted by an app resolves its assets next to the example, not under /apps/<app>/src/", async () => {
    // Same shape as apps/showcase-ninja-runner-port/src/main.ts importing examples/ninja-runner-port/models.ts.
    mkdirSync(join(root, "examples", "ninja"), { recursive: true });
    mkdirSync(join(root, "apps", "showcase-ninja", "src"), { recursive: true });
    writeFileSync(join(root, "examples", "ninja", "models.ts"), 'export const hero: string = new URL("./assets/meshy/hero.glb", import.meta.url).href;\n');
    writeFileSync(join(root, "apps", "showcase-ninja", "src", "main.ts"), 'import { hero } from "../../../examples/ninja/models";\n(globalThis as { heroUrl?: string }).heroUrl = hero;\n');
    const server = await startExampleDevServer(root);
    try {
      const body = await (await fetch(`${server.origin}/apps/showcase-ninja/src/main.ts`)).text();
      expect(body).toContain('"/examples/ninja/models.ts"');
      expect(body).not.toContain("import.meta.url");
      // Evaluate the URL the browser would compute from the page origin.
      const base = new URL("/examples/ninja/models.ts", server.origin).href;
      expect(new URL("./assets/meshy/hero.glb", base).pathname).toBe("/examples/ninja/assets/meshy/hero.glb");
    } finally {
      await server.close();
    }
  });
});
