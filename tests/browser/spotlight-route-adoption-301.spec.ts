import { writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

// The production application is the test subject: its typed district, day/night
// controls, actual camera, root renderer and existing canvas remain mounted.
test.describe("I04 actual architectural night spotlight adoption", () => {
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server?.close(); });
  for (const route of [{ path: "showcase-cinematic-architecture", probe: "__AURA3D_ARCHITECTURE_SPOTLIGHT_PROBE__" }, { path: "aura-clash-showcase", probe: "__AURA3D_CLASH_SPOTLIGHT_PROBE__" }]) {
  for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
    test(`${route.path} light and shadow negative controls ${viewport.width}`, async ({ page }, testInfo) => {
      // A single readback can take over 90 seconds on the disclosed remote
      // SwiftShader adapter. Preserve the full four-state pixel oracle while
      // allowing the same five-minute software-frame budget used by the route
      // adoption suite; this changes no workload, threshold, or assertion.
      testInfo.setTimeout(1_500_000);
      const startedAt = Date.now();
      const phases: Array<{ name: string; elapsedMs: number; status: string; detail?: unknown }> = [];
      const browserMessages: string[] = [];
      const pageErrors: string[] = [];
      page.on("console", (message) => {
        if (browserMessages.length < 100) browserMessages.push(`${message.type()}: ${message.text().slice(0, 2000)}`);
      });
      page.on("pageerror", (error) => { pageErrors.push(error.message); browserMessages.push(`pageerror: ${error.message}`); });
      page.on("response", response => { if (response.status() >= 400) browserMessages.push(`http ${response.status()}: ${response.url()}`); });
      const record = (name: string, status: string, detail?: unknown) => {
        const phase = { name, elapsedMs: Date.now() - startedAt, status, detail };
        phases.push(phase);
        writeFileSync(testInfo.outputPath("spotlight-progress.json"), JSON.stringify({ route: route.path, viewport, phases, browserMessages }, null, 2));
        console.log(`[I04 ${route.path} ${viewport.width}] ${JSON.stringify(phase)}`);
      };
      const phase = async <T,>(name: string, timeoutMs: number, operation: () => Promise<T>): Promise<T> => {
        record(name, "started");
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          const result = await Promise.race([
            operation(),
            new Promise<never>((_, reject) => {
              timer = setTimeout(() => reject(new Error(`I04 ${route.path} ${viewport.width}: ${name} exceeded ${timeoutMs}ms`)), timeoutMs);
            })
          ]);
          record(name, "completed");
          return result;
        } catch (error) {
          record(name, "failed", String(error));
          throw error;
        } finally {
          if (timer) clearTimeout(timer);
          // Persist each phase independently so completed captures remain inspectable
          // when a later phase reaches the test or remote command deadline.
          await testInfo.attach(`spotlight-phase-${name}`, {
            body: JSON.stringify({ route: route.path, viewport, phases, browserMessages }),
            contentType: "application/json"
          });
        }
      };
      try {
        await page.setViewportSize(viewport);
        await phase("navigation", 65_000, () => page.goto(`${server.origin}/apps/${route.path}/?spotlightProbe=1`, { timeout: 60_000 }));
        await phase("probe-ready", 95_000, () => page.waitForFunction((probe) => {
          const host = window as any;
          if (host.__AURA_CLASH_ARENA_PROOF__?.status === "error") throw new Error(`Aura Clash boot failed: ${host.__AURA_CLASH_ARENA_PROOF__.error}`);
          return Boolean(host[probe]);
        }, route.probe, { timeout: 90_000 }));
        const sequence = await phase("four-state-sequence", 900_000, () => page.evaluate(async ({ probe }) => {
          const owner = (window as any)[probe];
          const off = await owner.capture(false, false);
          const lit = await owner.capture(true, false);
          const shadowed = await owner.capture(true, true);
          const repeated = await owner.capture(true, true);
          const changed = (a: any, b: any) => {
            if (a.width !== b.width || a.height !== b.height) throw new Error("spotlight capture dimensions changed");
            let count = 0;
            for (let index = 0; index < a.pixels.length; index += 4) {
              const delta = Math.abs(a.pixels[index] - b.pixels[index])
                + Math.abs(a.pixels[index + 1] - b.pixels[index + 1])
                + Math.abs(a.pixels[index + 2] - b.pixels[index + 2]);
              if (delta > 6) count += 1;
            }
            return count;
          };
          const canvas = Array.from(document.querySelectorAll<HTMLCanvasElement>("canvas"))
            .map((candidate) => ({ candidate, area: candidate.width * candidate.height }))
            .sort((left, right) => right.area - left.area)[0]?.candidate;
          return {
            width: shadowed.width,
            height: shadowed.height,
            offLitChanged: changed(off, lit),
            litShadowChanged: changed(lit, shadowed),
            repeatChanged: changed(shadowed, repeated),
            shadowedDiagnostics: shadowed.diagnostics,
            litDiagnostics: lit.diagnostics,
            png: canvas?.toDataURL("image/png") ?? ""
          };
        }, { probe: route.probe }));
        await testInfo.attach("spotlight-four-state-metrics", {
          body: JSON.stringify({ ...sequence, png: undefined }),
          contentType: "application/json"
        });
        record("assertions", "started");
        expect(sequence.shadowedDiagnostics.renderer.runtime.backend).toBe("production-runtime");
        expect(sequence.shadowedDiagnostics.renderer.shadows.spot).toMatchObject({
          requested: true, casterIsSpot: true, spotPixelBacked: true,
          casterName: route.path === "aura-clash-showcase" ? "Aura Clash overhead stage spotlight" : "architectural night facade spotlight"
        });
        // This scene may retain a different shadow-casting light in the
        // global caster slot. The negative control applies to the authored
        // spotlight specifically; the pixel comparison below proves that
        // enabling its shadow changes the actual application frame.
        expect(sequence.litDiagnostics.renderer.shadows.spot).toMatchObject({
          requested: false,
          spotPixelBacked: false
        });
        expect(sequence.shadowedDiagnostics.drawCalls).toBeGreaterThan(0);
        expect(sequence.repeatChanged, "fixed camera/time must make the negative control repeatable").toBe(0);
        expect(sequence.offLitChanged, "actual typed facade receives the light").toBeGreaterThan(100);
        expect(sequence.litShadowChanged, "actual geometry casts visible shadows").toBeGreaterThan(30);
        await testInfo.attach("architecture-spotlight-diagnostics", { body: JSON.stringify(sequence.shadowedDiagnostics), contentType: "application/json" });
        expect(pageErrors).toEqual([]);
        record("assertions", "completed");
        expect(sequence.png.startsWith("data:image/png;base64,")).toBe(true);
        writeFileSync(testInfo.outputPath("architecture-night-spotlight.png"), Buffer.from(sequence.png.slice("data:image/png;base64,".length), "base64"));
      } finally {
        writeFileSync(testInfo.outputPath("spotlight-progress.json"), JSON.stringify({ route: route.path, viewport, phases, browserMessages }, null, 2));
        await testInfo.attach("spotlight-execution-phases", {
          body: JSON.stringify({ route: route.path, viewport, phases, browserMessages }),
          contentType: "application/json"
        });
      }
    });
  }
  }
});
