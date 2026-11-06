import { describe, expect, it } from "vitest";
import { mapModuleSpecifiers } from "../../browser/import-specifiers";

const map = (specifier: string) => (specifier === "@aura3d/math" ? "/packages/math/src/index.ts" : specifier.startsWith("./") ? `/abs/${specifier.slice(2)}.ts` : undefined);

describe("mapModuleSpecifiers (TypeScript scanner, not a regex)", () => {
  it("rewrites static, side-effect, re-export and dynamic imports", () => {
    const source = [
      'import { a } from "@aura3d/math";',
      'import "./side";',
      'export * from "./reexport";',
      'const lazy = () => import("./lazy");',
      'import other from "left-alone";'
    ].join("\n");
    expect(mapModuleSpecifiers(source, map)).toBe([
      'import { a } from "/packages/math/src/index.ts";',
      'import "/abs/side.ts";',
      'export * from "/abs/reexport.ts";',
      'const lazy = () => import("/abs/lazy.ts");',
      'import other from "left-alone";'
    ].join("\n"));
  });

  it("ignores text that only looks like an import (comments, template literals, require)", () => {
    const source = [
      '// import x from "@aura3d/math"',
      "/* from \"@aura3d/math\" */",
      'const doc = `import { a } from "@aura3d/math"`;',
      'const text = "see from \\"@aura3d/math\\"";',
      'const r = require("@aura3d/math");'
    ].join("\n");
    expect(mapModuleSpecifiers(source, map)).toBe(source);
  });
});
