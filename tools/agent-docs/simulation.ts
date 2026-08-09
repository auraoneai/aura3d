import { execFileSync } from "node:child_process";
import { copyFileSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createA3DProject, type CreateA3DTemplate } from "../../packages/create-aura3d/src/index";

interface AgentSimulationReport {
  readonly pass: boolean;
  readonly detail: string;
  readonly appDir?: string;
  readonly template?: string;
  readonly screenshotBytes?: number;
}

const tsconfig = JSON.parse(readFileSync("tsconfig.base.json", "utf8")) as {
  compilerOptions?: { paths?: Record<string, readonly string[]> };
};

export function runAgentSimulation(llmsText: string): AgentSimulationReport {
  const scaffold = /npx\s+create-aura3d@latest\s+([^\s]+)\s+--template\s+([a-z0-9-]+)/.exec(llmsText);
  const helloWorld = /Hello world:[\s\S]*?```ts\n([\s\S]*?)```/.exec(llmsText);
  if (!scaffold || !helloWorld) {
    return { pass: false, detail: "llms.txt is missing scaffold command or hello-world TypeScript snippet" };
  }
  const template = scaffold[2] as CreateA3DTemplate;
  const appDir = resolve("tests/reports/agent-simulation-app");
  rmSync(appDir, { recursive: true, force: true });
  try {
    createA3DProject({
      targetDir: appDir,
      template,
      rootDir: resolve("packages/create-aura3d")
    });
    copyFileSync(
      resolve("fixtures/threejs-parity/assets/character/robot-expressive.glb"),
      resolve(appDir, "public/aura-assets/robot.glb")
    );
    writeFileSync(resolve(appDir, "src/aura-assets.ts"), `import { defineAuraAssets } from "@aura3d/engine";

export const assets = defineAuraAssets({
  robot: {
    type: "model",
    format: "glb",
    url: "/aura-assets/robot.glb",
    hash: "sha256-047f5e5fb3bb6d378bd1df16ca6137f2a596c99b3a1b5690b4020c05aaf6f319",
    bounds: [1.8, 2.1, 1.0]
  }
} as const);
`);
    writeFileSync(resolve(appDir, "src/main.ts"), `${helloWorld[1]?.trim()}\n`);
    writeAgentSimulationScreenshotSpec(appDir);
    writeWorkspaceViteConfig(appDir);
    writeWorkspacePlaywrightConfig(appDir);
    run("pnpm", ["exec", "vite", "build", "--config", resolve(appDir, "vite.config.ts")], appDir);
    run("pnpm", ["exec", "playwright", "test", "tests/route-health.spec.ts", "tests/screenshot.spec.ts", "--config", resolve(appDir, "playwright.config.ts"), "--reporter=line"], appDir);
    const screenshotPath = resolve(appDir, "tests/reports/screenshot.png");
    const screenshotReport = JSON.parse(readFileSync(resolve(appDir, "tests/reports/screenshot.json"), "utf8")) as {
      readonly profile?: Record<string, unknown>;
    };
    const screenshotBytes = statSync(screenshotPath).size;
    return {
      pass: screenshotBytes > 1000,
      detail: `agent simulation scaffolded ${template}, built it, ran route health, and wrote ${screenshotBytes} screenshot bytes with profile=${JSON.stringify(screenshotReport.profile ?? {})}`,
      appDir,
      template,
      screenshotBytes
    };
  } catch (error) {
    return {
      pass: false,
      detail: error instanceof Error ? error.message : String(error),
      appDir,
      template
    };
  }
}

function writeAgentSimulationScreenshotSpec(targetDir: string): void {
  writeFileSync(resolve(targetDir, "tests/screenshot.spec.ts"), `import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

test.setTimeout(60_000);

test("agent docs hello-world scene renders the typed robot asset", async ({ page }) => {
  await page.goto("/");
  // Match the scaffold's route-health budget. The typed GLB production bridge can legitimately
  // spend more than 15 seconds compiling/loading in a cold single-worker verification run.
  await expect.poll(() => page.locator("body").getAttribute("data-aura3d-ready"), { timeout: 45_000 }).toBe("true");
  const canvas = page.locator("canvas");
  await expect(canvas).toBeVisible();
  const profile = await canvas.evaluate((element) => {
    const target = element as HTMLCanvasElement;
    const gl = target.getContext("webgl2", { preserveDrawingBuffer: true });
    if (!gl) return { error: "missing-webgl2", centerObjectPixels: 0, assetReady: false, uniqueBuckets: 0 };
    const pixels = new Uint8Array(target.width * target.height * 4);
    gl.readPixels(0, 0, target.width, target.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const buckets = new Set<string>();
    let centerObjectPixels = 0;
    for (let y = 0; y < target.height; y += 4) {
      for (let x = 0; x < target.width; x += 4) {
        if (x > target.width * 0.76 && y > target.height * 0.74) continue;
        const offset = (y * target.width + x) * 4;
        const r = pixels[offset] ?? 0;
        const g = pixels[offset + 1] ?? 0;
        const b = pixels[offset + 2] ?? 0;
        const luminance = r * 0.2126 + g * 0.7152 + b * 0.0722;
        if (luminance > 28) buckets.add(\`\${r >> 5}-\${g >> 5}-\${b >> 5}\`);
        const inCenter = x > target.width * 0.32 && x < target.width * 0.68 && y > target.height * 0.22 && y < target.height * 0.82;
        if (inCenter && luminance > 34) centerObjectPixels += 1;
      }
    }
    const route = (window as unknown as { __AURA3D_ROUTE_READY__?: { diagnostics?: { assets?: Array<{ id: string; status: string }> } } }).__AURA3D_ROUTE_READY__;
    return {
      centerObjectPixels,
      assetReady: route?.diagnostics?.assets?.some((asset) => asset.id === "robot" && asset.status === "ready") ?? false,
      uniqueBuckets: buckets.size
    };
  });
  const screenshot = await canvas.screenshot();
  mkdirSync(resolve("tests/reports"), { recursive: true });
  writeFileSync(resolve("tests/reports/screenshot.png"), screenshot);
  writeFileSync(resolve("tests/reports/screenshot.json"), \`\${JSON.stringify({ bytes: screenshot.byteLength, profile }, null, 2)}\\n\`);
  expect(profile.error).toBeUndefined();
  expect(profile.assetReady).toBe(true);
  expect(profile.centerObjectPixels).toBeGreaterThan(600);
  expect(profile.uniqueBuckets).toBeGreaterThan(10);
  expect(screenshot.byteLength).toBeGreaterThan(1000);
});
`);
}

function writeWorkspacePlaywrightConfig(targetDir: string): void {
  writeFileSync(resolve(targetDir, "playwright.config.ts"), `import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  use: {
    baseURL: "http://127.0.0.1:48273"
  },
  webServer: {
    command: "npm exec vite -- --host 127.0.0.1 --port 48273 --strictPort",
    url: "http://127.0.0.1:48273",
    reuseExistingServer: false,
    timeout: 120_000
  }
});
`);
}

function writeWorkspaceViteConfig(targetDir: string): void {
  const aliasEntries = Object.entries(tsconfig.compilerOptions?.paths ?? {})
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
  writeFileSync(resolve(targetDir, "vite.config.ts"), `import { defineConfig } from "vite";

export default defineConfig({
  resolve: {
    alias: [
${aliasEntries}
    ]
  }
});
`);
}

function run(command: string, args: readonly string[], cwd: string): void {
  try {
    execFileSync(command, [...args], { cwd, encoding: "utf8", stdio: "pipe" });
  } catch (error) {
    const output = error instanceof Error && "stdout" in error
      ? `${String((error as { stdout?: unknown }).stdout ?? "")}${String((error as { stderr?: unknown }).stderr ?? "")}`
      : String(error);
    const message = output.trim().split("\n").slice(-16).join("\n");
    throw new Error(message || `${command} ${args.join(" ")} failed`);
  }
}
