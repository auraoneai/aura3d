import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { addAsset, validateAssets } from "../../packages/aura3d-cli/src/index";
import { writeReport, type ReleaseCheck } from "../check-common";

interface AgentDogfoodScore {
  readonly agent: string;
  readonly compiles: boolean;
  readonly runs: boolean;
  readonly apiHallucinations: number;
  readonly assetPathErrors: number;
  readonly turns: number;
  readonly notes: readonly string[];
}

const allowedContextFiles = [
  "llms.txt",
  "AGENTS.md",
  ".claude/CLAUDE.md",
  ".cursor/rules/aura3d.mdc",
  ".github/copilot-instructions.md",
  "docs/agents/agent-context.md",
  "docs/agents/build-playbook.md",
  "docs/agents/claims-and-boundaries.md",
  "docs/agents/codebase-map.md",
  "docs/agents/verification.md"
] as const;

const workspace = resolve("tests/reports/agent-context/codex-self-test-workspace");
const reportPath = "tests/reports/agent-context/codex-self-test.json";
const markdownPath = "docs/project/agent-dogfood-results.md";
const tsconfig = JSON.parse(readFileSync("tsconfig.base.json", "utf8")) as {
  compilerOptions?: { paths?: Record<string, readonly string[]> };
};

rmSync(workspace, { recursive: true, force: true });
mkdirSync(resolve(workspace, "src"), { recursive: true });
mkdirSync(resolve(workspace, "assets/product"), { recursive: true });
mkdirSync(resolve(workspace, "tests"), { recursive: true });
mkdirSync(resolve(workspace, "context"), { recursive: true });

const missingContext = allowedContextFiles.filter((path) => !existsSync(path));
for (const file of allowedContextFiles) {
  if (!existsSync(file)) continue;
  const target = resolve(workspace, "context", file);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, readFileSync(file));
}

writeProjectFiles();
const assetResult = addAsset({
  projectDir: workspace,
  file: "assets/product/agent-product.glb",
  name: "agentProduct"
});
const validation = validateAssets({ projectDir: workspace });

const mainSource = readFileSync(resolve(workspace, "src/main.ts"), "utf8");
const apiHallucinations = findApiHallucinations(mainSource);
const assetPathErrors = findAssetPathErrors(mainSource, validation);
const buildResult = runCommand("pnpm", ["exec", "vite", "build", "--config", resolve(workspace, "vite.config.ts")], workspace);
const browserResult = buildResult.ok
  ? runCommand("pnpm", ["exec", "playwright", "test", "tests/route-health.spec.ts", "tests/screenshot.spec.ts", "--config", resolve(workspace, "playwright.config.ts"), "--reporter=line"], workspace)
  : { ok: false, output: "Skipped because build failed." };
const routeReport = readOptionalJson<{ ready?: boolean; backend?: string; drawCalls?: number }>(resolve(workspace, "tests/reports/route-health.json"));
const screenshotReport = readOptionalJson<{ bytes?: number; profile?: Record<string, number> }>(resolve(workspace, "tests/reports/screenshot.json"));
const screenshotPath = resolve(workspace, "tests/reports/screenshot.png");

const score: AgentDogfoodScore = {
  agent: "Codex",
  compiles: buildResult.ok,
  runs: browserResult.ok && routeReport?.ready === true && routeReport.backend === "webgl2",
  apiHallucinations: apiHallucinations.length,
  assetPathErrors: assetPathErrors.length,
  turns: 1,
  notes: [
    "Generated app uses only the public engine import surface and typed assets emitted by aura assets add.",
    "Verification used the local repo toolchain; Claude Code, Cursor, and Copilot remain separate external runs."
  ]
};

const checks: ReleaseCheck[] = [
  {
    id: "agent-context-files-present",
    pass: missingContext.length === 0,
    detail: missingContext.length === 0 ? `${allowedContextFiles.length} context files copied` : `missing: ${missingContext.join(", ")}`
  },
  {
    id: "codex-generated-app-uses-typed-assets",
    pass: mainSource.includes("model(assets.agentProduct") && !mainSource.includes("unsafeModelUrl"),
    detail: "src/main.ts imports assets from ./aura-assets and calls model(assets.agentProduct)"
  },
  {
    id: "codex-generated-asset-manifest-validates",
    pass: assetResult.ok && validation.ok,
    detail: validation.ok ? `${validation.manifest.assets.length} typed asset validates` : validation.messages.join("; ")
  },
  {
    id: "codex-generated-app-no-api-hallucinations",
    pass: apiHallucinations.length === 0,
    detail: apiHallucinations.length === 0 ? "no invented @aura3d/engine imports" : apiHallucinations.join(", ")
  },
  {
    id: "codex-generated-app-no-asset-path-errors",
    pass: assetPathErrors.length === 0,
    detail: assetPathErrors.length === 0 ? "no raw model URL or missing typed asset dependency" : assetPathErrors.join("; ")
  },
  {
    id: "codex-generated-app-builds",
    pass: buildResult.ok,
    detail: buildResult.ok ? "vite build passed" : buildResult.output
  },
  {
    id: "codex-generated-app-route-health",
    pass: browserResult.ok && routeReport?.ready === true && routeReport.backend === "webgl2" && Number(routeReport.drawCalls ?? 0) > 0,
    detail: browserResult.ok ? `ready=${routeReport?.ready ?? false}, backend=${routeReport?.backend ?? "unknown"}, drawCalls=${routeReport?.drawCalls ?? 0}` : browserResult.output
  },
  {
    id: "codex-generated-app-screenshot-profile",
    pass:
      existsSync(screenshotPath) &&
      statSync(screenshotPath).size > 1000 &&
      Number(screenshotReport?.bytes ?? 0) > 1000 &&
      Number(screenshotReport?.profile?.yellowPixels ?? 0) > 800 &&
      Number(screenshotReport?.profile?.rainPixels ?? 0) > 70 &&
      Number(screenshotReport?.profile?.centerObjectPixels ?? 0) > 900,
    detail: existsSync(screenshotPath)
      ? `screenshot bytes=${statSync(screenshotPath).size}, profile=${JSON.stringify(screenshotReport?.profile ?? {})}`
      : "screenshot missing"
  }
];

writeMarkdown(checks, score);
writeReport(reportPath, "aura3d-agent-context-codex-self-test", checks, {
  workspace,
  allowedContextFiles,
  score,
  buildOutput: buildResult.output,
  browserOutput: browserResult.output,
  routeReport,
  screenshotReport
});

function writeProjectFiles(): void {
  writeFileSync(resolve(workspace, "package.json"), JSON.stringify({
    name: "aura3d-codex-context-self-test",
    private: true,
    type: "module",
    scripts: {
      build: "vite build",
      test: "playwright test tests/route-health.spec.ts tests/screenshot.spec.ts"
    },
    dependencies: {
      "@aura3d/engine": "1.0.0"
    },
    devDependencies: {
      "@playwright/test": "^1.52.0",
      typescript: "^5.8.3",
      vite: "^7.3.2"
    }
  }, null, 2));

  writeFileSync(resolve(workspace, "index.html"), `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Aura3D Codex Context Self Test</title>
    <style>
      html, body, #app { margin: 0; width: 100%; height: 100%; background: #071016; }
      body { font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
    </style>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
`);

  writeFileSync(resolve(workspace, "src/main.ts"), `import { camera, createAuraApp, effects, interactions, lights, material, model, primitives, scene, timeline } from "@aura3d/engine";
import { assets } from "./aura-assets";

const app = createAuraApp("#app", {
  diagnostics: { overlay: true, assetPanel: true, performancePanel: true },
  scene: scene()
    .background("#071016")
    .add(primitives.plane({
      name: "wet studio floor",
      width: 7,
      height: 5,
      material: material.pbr({ color: "#13242b", roughness: 0.18, metallic: 0.12 })
    }).position(0, -0.58, -0.6).rotate(-1.5708, 0, 0))
    .add(model(assets.agentProduct, {
      material: material.pbr({
        color: "#ffe166",
        roughness: 0.42,
        metallic: 0.08,
        texture: assets.agentTexture
      })
    }).position(0, 0.02, -0.7).scale(1.3))
    .add(lights.studio({ intensity: 1.2 }))
    .add(effects.rain({ intensity: 0.24, speed: 0.3 }))
    .add(effects.bloom({ intensity: 0.18 }))
    .add(interactions.orbit())
    .camera(camera.dolly({ from: [0, 1.15, 4.2], to: [0, 1.0, 3.1], target: [0, 0.25, -0.7], seconds: 7 }))
    .timeline(timeline.loop({ seconds: 7 }))
});

declare global {
  interface Window { auraApp: typeof app; }
}

window.auraApp = app;
`);

  writeFileSync(resolve(workspace, "assets/product/agent-product.glb"), readFileSync("fixtures/asset-corpus/duck.glb"));
  writeFileSync(resolve(workspace, "assets/product/agent-texture.webp"), Buffer.from("aura3d-agent-texture"));
  addAsset({ projectDir: workspace, file: "assets/product/agent-texture.webp", name: "agentTexture" });

  writeFileSync(resolve(workspace, "vite.config.ts"), `import { defineConfig } from "vite";

export default defineConfig({
  resolve: {
    alias: [
${viteAliasEntries()}
    ]
  }
});
`);

  writeFileSync(resolve(workspace, "playwright.config.ts"), `import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  use: {
    baseURL: "http://127.0.0.1:4179"
  },
  webServer: {
    command: "pnpm exec vite --host 127.0.0.1 --port 4179 --strictPort",
    url: "http://127.0.0.1:4179",
    reuseExistingServer: false,
    timeout: 120_000
  }
});
`);

  writeFileSync(resolve(workspace, "tests/route-health.spec.ts"), `import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

test("generated Aura3D app reaches ready state", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => page.locator("body").getAttribute("data-aura3d-ready")).toBe("true");
  const drawCalls = Number(await page.locator("body").getAttribute("data-aura3d-draw-calls"));
  const diagnostics = await page.evaluate(() => window.__AURA3D_ROUTE_READY__?.diagnostics);
  expect(diagnostics?.backend).toBe("webgl2");
  expect(drawCalls).toBeGreaterThan(0);
  mkdirSync(resolve("tests/reports"), { recursive: true });
  writeFileSync(resolve("tests/reports/route-health.json"), JSON.stringify({ ready: true, backend: diagnostics?.backend, drawCalls }, null, 2));
});
`);

  writeFileSync(resolve(workspace, "tests/screenshot.spec.ts"), `import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

test("generated Aura3D app screenshot is non-empty", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => page.locator("body").getAttribute("data-aura3d-ready")).toBe("true");
  const canvas = page.locator("canvas");
  await expect(canvas).toBeVisible();
  const profile = await canvas.evaluate((element) => {
    const target = element as HTMLCanvasElement;
    const gl = target.getContext("webgl2", { preserveDrawingBuffer: true });
    if (!gl) return { error: "missing-webgl2", yellowPixels: 0, rainPixels: 0, centerObjectPixels: 0, uniqueBuckets: 0 };
    const pixels = new Uint8Array(target.width * target.height * 4);
    gl.readPixels(0, 0, target.width, target.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const buckets = new Set<string>();
    let yellowPixels = 0;
    let rainPixels = 0;
    let centerObjectPixels = 0;
    for (let y = 0; y < target.height; y += 4) {
      for (let x = 0; x < target.width; x += 4) {
        if (x > target.width * 0.76 && y > target.height * 0.74) continue;
        const offset = (y * target.width + x) * 4;
        const r = pixels[offset] ?? 0;
        const g = pixels[offset + 1] ?? 0;
        const b = pixels[offset + 2] ?? 0;
        const luminance = r * 0.2126 + g * 0.7152 + b * 0.0722;
        if (luminance > 32) buckets.add(\`\${r >> 5}-\${g >> 5}-\${b >> 5}\`);
        if (r > 135 && g > 125 && b < 170 && r > b * 1.08 && g > b * 1.04) yellowPixels += 1;
        if (r > 165 && g > 185 && b > 205) rainPixels += 1;
        if (x > target.width * 0.28 && x < target.width * 0.68 && y > target.height * 0.28 && y < target.height * 0.84 && luminance > 70) centerObjectPixels += 1;
      }
    }
    return { yellowPixels, rainPixels, centerObjectPixels, uniqueBuckets: buckets.size };
  });
  expect(profile.error).toBeUndefined();
  expect(profile.yellowPixels).toBeGreaterThan(800);
  expect(profile.rainPixels).toBeGreaterThan(70);
  expect(profile.centerObjectPixels).toBeGreaterThan(900);
  expect(profile.uniqueBuckets).toBeGreaterThan(18);
  const screenshot = await canvas.screenshot();
  expect(screenshot.byteLength).toBeGreaterThan(1000);
  mkdirSync(resolve("tests/reports"), { recursive: true });
  writeFileSync(resolve("tests/reports/screenshot.png"), screenshot);
  writeFileSync(resolve("tests/reports/screenshot.json"), JSON.stringify({ bytes: screenshot.byteLength, profile }, null, 2));
});
`);
}

function viteAliasEntries(): string {
  return Object.entries(tsconfig.compilerOptions?.paths ?? {})
    .map(([specifier, paths]) => [specifier, paths[0]] as const)
    .filter((entry): entry is readonly [string, string] => Boolean(entry[1]))
    .sort((a, b) => b[0].length - a[0].length)
    .map(([specifier, path]) => {
      const replacement = specifier === "@aura3d/engine"
        ? resolve("packages/engine/src/agent-api/index.ts")
        : resolve(path);
      return `      { find: ${JSON.stringify(specifier)}, replacement: ${JSON.stringify(replacement)} }`;
    })
    .join(",\n");
}

function findApiHallucinations(source: string): string[] {
  const allowed = new Set(["camera", "createAuraApp", "effects", "interactions", "lights", "material", "model", "primitives", "scene", "timeline"]);
  const match = source.match(/import\s+\{([^}]+)\}\s+from\s+["']@aura3d\/engine["']/);
  if (!match) return ["missing @aura3d/engine named import"];
  return match[1]
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0 && !allowed.has(item));
}

function findAssetPathErrors(source: string, validationResult: ReturnType<typeof validateAssets>): string[] {
  const errors = [...validationResult.failures];
  if (/unsafeModelUrl|["'][^"']+\.(?:glb|gltf)["']/.test(source)) {
    errors.push("generated app used a raw model URL instead of typed asset refs");
  }
  if (!source.includes("assets.agentProduct") || !source.includes("assets.agentTexture")) {
    errors.push("generated app did not use expected typed asset refs");
  }
  return errors;
}

function runCommand(command: string, args: readonly string[], cwd: string): { readonly ok: boolean; readonly output: string } {
  try {
    const output = execFileSync(command, [...args], { cwd, encoding: "utf8", stdio: "pipe" });
    return { ok: true, output: output.trim() };
  } catch (error) {
    const output = error instanceof Error && "stdout" in error
      ? `${String((error as { stdout?: unknown }).stdout ?? "")}${String((error as { stderr?: unknown }).stderr ?? "")}`
      : String(error);
    return { ok: false, output: output.trim().split("\n").slice(-32).join("\n") };
  }
}

function readOptionalJson<T>(path: string): T | undefined {
  if (!existsSync(path)) return undefined;
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function writeMarkdown(checks: readonly ReleaseCheck[], score: AgentDogfoodScore): void {
  const lines = [
    "# Agent Dogfood Results",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Codex Self-Test",
    "",
    "| Agent | Compiles | Runs | API Hallucinations | Asset Path Errors | Turns | Notes |",
    "|---|---:|---:|---:|---:|---:|---|",
    `| ${score.agent} | ${score.compiles ? "yes" : "no"} | ${score.runs ? "yes" : "no"} | ${score.apiHallucinations} | ${score.assetPathErrors} | ${score.turns} | ${escapeTable(score.notes.join(" "))} |`,
    "",
    "## Context Input",
    "",
    ...allowedContextFiles.map((file) => `- \`${file}\``),
    "",
    "## Checks",
    "",
    "| Check | Result | Detail |",
    "|---|---:|---|",
    ...checks.map((check) => `| \`${check.id}\` | ${check.pass ? "pass" : "fail"} | ${escapeTable(check.detail)} |`),
    "",
    "## Remaining Agent Runs",
    "",
    "- Claude Code: not run in this automated self-test.",
    "- Cursor: not run in this automated self-test.",
    "- Copilot: not run in this automated self-test.",
    ""
  ];
  mkdirSync(dirname(resolve(markdownPath)), { recursive: true });
  writeFileSync(markdownPath, lines.join("\n"));
}

function escapeTable(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}
