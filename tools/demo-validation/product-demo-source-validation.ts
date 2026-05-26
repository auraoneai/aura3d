import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type ProductDemoId = "product-configurator" | "architecture-viewer" | "game-slice";

export interface ProductDemoSourceValidationResult {
  readonly ok: boolean;
  readonly checkedExamples: readonly ProductDemoId[];
  readonly violations: readonly string[];
}

const productDemos: readonly ProductDemoId[] = [
  "product-configurator",
  "architecture-viewer",
  "game-slice",
];

const runtimeStateByDemo: Record<ProductDemoId, string> = {
  "product-configurator": "__AURA3D_PRODUCT_DEMO__",
  "architecture-viewer": "__AURA3D_ARCHITECTURE_DEMO__",
  "game-slice": "__AURA3D_GAME_DEMO__",
};

const requiredReadmeSections = [
  "## Purpose",
  "## Run",
  "## Systems Used",
  "## Expected Output",
  "## Acceptance Target",
  "## Known Limits",
] as const;

export function validateProductDemoSources(rootDir = process.cwd()): ProductDemoSourceValidationResult {
  const violations: string[] = [];

  for (const demo of productDemos) {
    const demoRoot = join(rootDir, "examples", demo);
    const indexPath = join(demoRoot, "index.html");
    const mainPath = join(demoRoot, "main.ts");
    const readmePath = join(demoRoot, "README.md");

    if (!existsSync(indexPath)) violations.push(`${demo}: missing index.html`);
    if (!existsSync(mainPath)) violations.push(`${demo}: missing main.ts`);
    if (!existsSync(readmePath)) violations.push(`${demo}: missing README.md`);
    if (!existsSync(mainPath) || !existsSync(readmePath)) continue;

    const main = readFileSync(mainPath, "utf8");
    const readme = readFileSync(readmePath, "utf8");
    const stateName = runtimeStateByDemo[demo];

    requirePattern(violations, demo, main, /from\s+["']@aura3d\/rendering["']/, "uses public @aura3d/rendering imports");
    requirePattern(violations, demo, main, /\bRenderer\b/, "references the engine Renderer");
    requirePattern(violations, demo, main, /\bRenderer\.create\s*\(/, "creates an engine Renderer");
    requirePattern(violations, demo, main, /\brenderer\.render\s*\(/, "submits frames through renderer.render");
    requirePattern(violations, demo, main, /backend:\s*["']webgl2["']/, "requests the WebGL2 renderer backend");
    requirePattern(violations, demo, main, new RegExp(escapeRegExp(stateName)), `exposes ${stateName}`);
    requirePattern(violations, demo, main, /rendererBacked:\s*true/, "reports rendererBacked runtime evidence");
    requirePattern(violations, demo, main, /drawCalls:\s*diagnostics\.drawCalls/, "reports draw-call diagnostics");
    requirePattern(violations, demo, main, /addEventListener\s*\(\s*["'](?:pointerdown|click|keydown)["']/, "registers real input handlers");

    rejectPattern(violations, demo, main, /getContext\s*\(\s*["']2d["']/, "uses a 2D canvas context");
    rejectPattern(violations, demo, main, /\bCanvasRenderingContext2D\b/, "depends on CanvasRenderingContext2D");
    rejectPattern(violations, demo, main, /\bdrawImage\s*\(/, "draws static image output");
    rejectPattern(violations, demo, main, /\bnew\s+Image\s*\(/, "uses static image output");
    rejectPattern(violations, demo, main, /rendererBacked:\s*true[\s\S]{0,160}(?:mock|fake|stub)/i, "pairs rendererBacked with mock/fake/stub wording");

    for (const section of requiredReadmeSections) {
      if (!readme.includes(section)) {
        violations.push(`${demo}: README missing ${section}`);
      }
    }
    requirePattern(violations, demo, readme, /pnpm exec playwright test tests\/browser\/product-demos\.spec\.ts/, "documents the product demo browser test command");
    requirePattern(violations, demo, readme, /Renderer|WebGL2|webgl2/, "documents renderer usage");
    requirePattern(violations, demo, readme, /Known Limits/i, "documents known limits");
  }

  return {
    ok: violations.length === 0,
    checkedExamples: productDemos,
    violations,
  };
}

function requirePattern(violations: string[], demo: ProductDemoId, source: string, pattern: RegExp, description: string): void {
  if (!pattern.test(source)) {
    violations.push(`${demo}: ${description}`);
  }
}

function rejectPattern(violations: string[], demo: ProductDemoId, source: string, pattern: RegExp, description: string): void {
  if (pattern.test(source)) {
    violations.push(`${demo}: forbidden ${description}`);
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
