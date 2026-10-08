/**
 * T4.8 (PRD-06 §17.2, C-33) — the `burst` capture step plugin: shape +
 * registration conformance (unique name, owner), and the step schema the
 * §17.2 sequence / §17.4 games will pass inline.
 */

import { describe, expect, it } from "vitest";
import { readdirSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { registerCaptureStepPlugin, captureStepPluginFor } from "../../../../tools/quality-rebuild-capture/contracts.mjs";
import burst from "../../../../tools/quality-rebuild-capture/steps/burst.mjs";

const STEPS_DIR = resolve(__dirname, "../../../../tools/quality-rebuild-capture/steps");

describe("T4.8 burst capture step (C-33 conformance)", () => {
  it("is a CaptureStepPlugin named burst owned by prd06", () => {
    expect(burst.name).toBe("burst");
    expect(burst.owner).toBe("prd06");
    expect(typeof burst.run).toBe("function");
  });

  it("the burst name is unique across steps/*.mjs and registers cleanly", async () => {
    const seen = new Set<string>();
    for (const file of readdirSync(STEPS_DIR).filter((f) => f.endsWith(".mjs"))) {
      const plugin = (await import(`${STEPS_DIR}/${file}`)).default;
      expect(typeof plugin?.name).toBe("string");
      expect(typeof plugin?.owner).toBe("string");
      expect(seen.has(plugin.name)).toBe(false);
      seen.add(plugin.name);
    }
    expect(seen.has("burst")).toBe(true);
    registerCaptureStepPlugin({ name: "burst", owner: "prd06", run: async () => ({ files: [] }) });
    expect(captureStepPluginFor("burst")?.name).toBe("burst");
    expect(() =>
      registerCaptureStepPlugin({ name: "burst", owner: "prd06", run: async () => ({ files: [] }) })
    ).toThrow(/CAPTURE_STEP_DUPLICATE/);
  });

  it("emits frames + per-frame animation records with the burst schema", async () => {
    // Fake page: screenshot writes a stub file; evaluate returns a region and
    // a two-app diagnostics().animation snapshot.
    const writes: string[] = [];
    const page = {
      screenshot: async (opts: { path: string; clip?: unknown }) => {
        writes.push(opts.path);
        return undefined;
      },
      evaluate: async (fn: (...args: never[]) => unknown) => {
        const src = String(fn);
        if (src.includes("__PRD06_CHARACTER_REGION__")) return { x: 10, y: 20, width: 300, height: 400 };
        return [{ index: 0, animation: { actors: [{ id: "hero", tracksApplied: 60 }] } }];
      }
    };
    const ctx = { outDir: "/tmp/qr-prd06-burst-test", route: "test", log: () => undefined };
    mkdirSync(ctx.outDir, { recursive: true });
    const result = await burst.run(page, { burst: { frames: 3, intervalMs: 1, region: "character" } }, ctx);
    expect(writes).toHaveLength(3);
    expect(result.files).toHaveLength(4); // 3 jpg + burst-animation.json
    expect(result.data).toMatchObject({ frames: 3, intervalMs: 1, region: "character", records: 3 });
  });
});
