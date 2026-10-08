import { execFileSync } from "node:child_process";
import { copyFileSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createA3DProject, type CreateA3DTemplate } from "../../packages/create-aura3d/src/index";
import { aliasEntries as generatedAliasEntries } from "../../vite.aliases.generated";

interface AgentSimulationReport {
  readonly pass: boolean;
  readonly detail: string;
  readonly appDir?: string;
  readonly template?: string;
  readonly screenshotBytes?: number;
}

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
    // Only the generated screenshot spec runs here: the template's own
    // route-health spec asserts template-main.ts globals
    // (__AURA3D_PRODUCT_VIEWER__) that the hello-world main.ts never sets.
    // check:templates runs it per-template against the real template main.ts.
    run("pnpm", ["exec", "playwright", "test", "tests/screenshot.spec.ts", "--config", resolve(appDir, "playwright.config.ts"), "--reporter=line", "--workers=1"], appDir);
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

test.setTimeout(180_000);

test("agent docs hello-world scene renders the typed robot asset", async ({ page }) => {
  // Surface page-side errors in CI logs: the sim otherwise dies with only
  // vite stdout, which makes GPU/app failures invisible.
  page.on("console", (msg) => {
    const text = msg.text();
    if (msg.type() === "error" || msg.type() === "warning") console.log("[sim-console]", msg.type(), text.slice(0, 300));
  });
  page.on("pageerror", (err) => console.log("[sim-pageerror]", String(err).slice(0, 400)));
  await page.goto("/");
  // Match the scaffold's cold-start route-health budget. The agent-doc gate compiles every
  // TypeScript snippet immediately before this browser run, so WebGL startup can exceed the
  // warm, isolated runtime without indicating a broken generated application.
  try {
    await expect.poll(() => page.locator("body").getAttribute("data-aura3d-ready"), { timeout: 90_000 }).toBe("true");
  } catch (err) {
    const attrs = await page.locator("body").evaluate((el) =>
      Array.from(el.attributes).map((a) => a.name + "=" + a.value).join(" ")).catch(() => "<no-body>");
    console.log("[sim-ready-timeout] body attrs:", attrs);
    console.log("[sim-ready-timeout] html:", (await page.content().catch(() => "")).slice(0, 1500));
    throw err;
  }
  // Playwright visibility/stability probes starve behind the continuous rAF
  // render loop on software GL, and a compositor canvas.screenshot() stalls the
  // same way ("waiting for element to be stable" never resolves on CI).
  // waitForFunction polls inside the page's own animation frame, and the
  // readPixels capture below runs in the same evaluate task as a stepped
  // render — deterministic, no preserveDrawingBuffer, no compositor.
  await page.waitForFunction(() => {
    const element = document.querySelector("canvas");
    if (!(element instanceof HTMLCanvasElement)) return false;
    const style = getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden";
  }, undefined, { timeout: 60_000 });
  const capture = await page.evaluate(async () => {
    type LiveApp = { stepAsync?: (dt: number) => Promise<void>; step?: (dt: number) => void };
    const apps = (window as unknown as { __AURA3D_LIVE_APPS__?: LiveApp[] }).__AURA3D_LIVE_APPS__ ?? [];
    if (apps.length > 0) {
      for (const app of apps) {
        if (app.stepAsync) await app.stepAsync(1 / 60);
        else app.step?.(1 / 60);
      }
    } else {
      await new Promise<void>((resolvePromise) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolvePromise()));
      });
    }
    const element = [...document.querySelectorAll("canvas")]
      .find((candidate) => (candidate.getContext("webgl2") ?? candidate.getContext("webgl")) !== null);
    const gl = element ? (element.getContext("webgl2") ?? element.getContext("webgl")) : null;
    if (!gl) return { error: "no-webgl-context", pngBase64: "", centerObjectPixels: 0, assetReady: false, uniqueBuckets: 0 };
    // readPixels reads the currently bound framebuffer: rebind the default so
    // a renderer that ended its frame on an offscreen target still yields the
    // canvas backbuffer.
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const width = gl.drawingBufferWidth;
    const height = gl.drawingBufferHeight;
    const pixels = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const target = document.createElement("canvas");
    target.width = width;
    target.height = height;
    const ctx = target.getContext("2d");
    if (!ctx) return { error: "missing-2d", pngBase64: "", centerObjectPixels: 0, assetReady: false, uniqueBuckets: 0 };
    const image = ctx.createImageData(width, height);
    // readPixels rows run bottom-up; flip into top-down image space.
    for (let y = 0; y < height; y += 1) {
      image.data.set(pixels.subarray((height - 1 - y) * width * 4, (height - y) * width * 4), y * width * 4);
    }
    ctx.putImageData(image, 0, 0);
    const buckets = new Set<string>();
    let centerObjectPixels = 0;
    for (let y = 0; y < target.height; y += 4) {
      for (let x = 0; x < target.width; x += 4) {
        if (x > target.width * 0.76 && y > target.height * 0.74) continue;
        const offset = (y * target.width + x) * 4;
        const r = image.data[offset] ?? 0;
        const g = image.data[offset + 1] ?? 0;
        const b = image.data[offset + 2] ?? 0;
        const luminance = r * 0.2126 + g * 0.7152 + b * 0.0722;
        if (luminance > 28) buckets.add(\`\${r >> 5}-\${g >> 5}-\${b >> 5}\`);
        const inCenter = x > target.width * 0.32 && x < target.width * 0.68 && y > target.height * 0.22 && y < target.height * 0.82;
        if (inCenter && luminance > 34) centerObjectPixels += 1;
      }
    }
    const route = (window as unknown as { __AURA3D_ROUTE_READY__?: { diagnostics?: { assets?: Array<{ id: string; status: string }> } } }).__AURA3D_ROUTE_READY__;
    return {
      pngBase64: target.toDataURL("image/png").split(",")[1] ?? "",
      centerObjectPixels,
      assetReady: route?.diagnostics?.assets?.some((asset) => asset.id === "robot" && asset.status === "ready") ?? false,
      uniqueBuckets: buckets.size
    };
  });
  const screenshot = Buffer.from(capture.pngBase64 ?? "", "base64");
  const profile = {
    centerObjectPixels: capture.centerObjectPixels,
    assetReady: capture.assetReady,
    uniqueBuckets: capture.uniqueBuckets,
    error: capture.error
  };
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
    baseURL: "http://127.0.0.1:48273",
    // Force software WebGL so the sim is deterministic on GPU-less CI
    // runners (ubuntu-latest): without these flags WebGL2 availability is a
    // dice roll and data-aura3d-ready can stall until the 90s poll times out.
    launchOptions: {
      args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
    }
  },
  webServer: {
    // vite preview serves the dist built above — no cold dev-server
    // transform pipeline on the browser run.
    command: "pnpm exec vite preview --host 127.0.0.1 --port 48273 --strictPort",
    url: "http://127.0.0.1:48273",
    reuseExistingServer: false,
    timeout: 120_000
  }
});
`);
}

function writeWorkspaceViteConfig(targetDir: string): void {
  // Mirror the repo's bundler resolution (vite.config.ts -> vite.aliases.generated):
  // it applies each package's browser export condition — e.g. @aura3d/assets ->
  // browser-index.ts, which keeps node-only modules out of browser bundles.
  // tsconfig paths are node/typecheck resolution and must NOT be used here:
  // they map @aura3d/assets to the full src barrel (fs-backed modules), which
  // real browser consumers never reach.
  const aliasEntries = generatedAliasEntries
    .map(([specifier, path]) => {
      const replacement = resolve(path);
      return `      { find: ${JSON.stringify(specifier)}, replacement: ${JSON.stringify(replacement)} }`;
    })
    .join(",\n");
  writeFileSync(resolve(targetDir, "vite.config.ts"), `import { defineConfig } from "vite";

export default defineConfig({
  resolve: {
    alias: [
${aliasEntries}
    ]
  },
  build: {
    rollupOptions: {
      output: {
        // See tools/agent-templates/index.ts writeWorkspaceViteConfig: shared
        // package modules must not land in the generated entry chunk, or lazy
        // chunks that statically import them deadlock against mains that
        // top-level-await app readiness.
        manualChunks(id: string) {
          if (id.includes("/packages/")) return "aura3d-vendor";
        }
      }
    }
  }
});
`);
}

function run(command: string, args: readonly string[], cwd: string): void {
  try {
    // Bounded: execFileSync without a timeout lets a wedged child (chromium
    // under swiftshader, a stalled vite webServer) hold the whole gate job
    // open indefinitely — the spec's own 180s test timeout cannot fire once
    // the browser process itself refuses to exit.
    execFileSync(command, [...args], { cwd, encoding: "utf8", stdio: "pipe", timeout: 600_000, killSignal: "SIGKILL" });
  } catch (error) {
    const output = error instanceof Error && "stdout" in error
      ? `${String((error as { stdout?: unknown }).stdout ?? "")}${String((error as { stderr?: unknown }).stderr ?? "")}`
      : String(error);
    // Playwright dumps the whole buffered [WebServer] log at the tail of a
    // failed run; a 16-line tail keeps only vite noise and loses the actual
    // spec failure. Strip those lines and keep a wider window.
    const lines = output.trim().split("\n").filter((line) => !line.trimStart().startsWith("[WebServer]"));
    const message = lines.slice(-64).join("\n");
    throw new Error(message || `${command} ${args.join(" ")} failed`);
  }
}
