/**
 * LOOK_HDRI_MISSING: a look/environment HDRI that 404s, is served as an SPA index.html, or is a git-LFS pointer
 * degrades to a procedural probe (not the flat neutral floor), logs ONE console.error naming the file and the fix, and
 * reports the same message to the diagnostics channel. The scaffold-time check warns about it before deploy.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import "../../../../packages/rendering/src/lanes/prd02";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import { MockRenderDevice } from "../../../../packages/rendering/src/RenderDevice";
import type { EnvironmentProbe } from "../../../../packages/rendering/src/contracts/environment";
import { bindPrd02EnvironmentProbe } from "../../../../packages/engine/src/agent-api/compiler/environment";
import {
  lookHdriMissingMessage,
  proceduralEnvironmentEquirect,
  proceduralEnvironmentKind,
  reportLookHdriMissing
} from "../../../../packages/engine/src/agent-api/compiler/environmentFallback";
import { lookHdriWarnings, LOOK_PRESET_HDRI } from "../../../../packages/aura3d-cli/src/look-hdri-check";
import { lookPresets } from "../../../../packages/engine/src/agent-api/looks/lookPresets";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const meanLuminance = (kind: Parameters<typeof proceduralEnvironmentEquirect>[0]): number => {
  const { width, height, data } = proceduralEnvironmentEquirect(kind);
  let sum = 0, weight = 0;
  for (let y = 0; y < height; y += 1) {
    const w = Math.cos((0.5 - (y + 0.5) / height) * Math.PI);
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      sum += (0.2126 * data[i]! + 0.7152 * data[i + 1]! + 0.0722 * data[i + 2]!) * w;
      weight += w;
    }
  }
  return sum / weight;
};

describe("LOOK_HDRI_MISSING procedural fallback", () => {
  it("picks the fallback family from the file name", () => {
    expect(proceduralEnvironmentKind("/hdri/studio_small_08_1k.hdr")).toBe("studio");
    expect(proceduralEnvironmentKind("/hdri/kloppenheim_06_puresky_1k.hdr")).toBe("warm-sky");
    expect(proceduralEnvironmentKind("/hdri/autumn_field_puresky_1k.hdr")).toBe("sky");
    expect(proceduralEnvironmentKind("/hdri/rooftop_night_1k.hdr")).toBe("night");
  });

  it("matches the exposure measured from the shipped 1k HDRIs (cosine-weighted mean luminance)", () => {
    // Measured from the real files: studio 0.83, kloppenheim_06 0.73, autumn_field 1.02 (sun peaks included).
    expect(meanLuminance("studio")).toBeGreaterThan(0.6);
    expect(meanLuminance("studio")).toBeLessThan(1.0);
    expect(meanLuminance("warm-sky")).toBeGreaterThan(0.55);
    expect(meanLuminance("warm-sky")).toBeLessThan(0.95);
    expect(meanLuminance("sky")).toBeGreaterThan(0.45);
    expect(meanLuminance("sky")).toBeLessThan(1.1);
    expect(meanLuminance("night")).toBeLessThan(0.05);
    const { data } = proceduralEnvironmentEquirect("sky");
    expect([...data].every((v) => Number.isFinite(v) && v >= 0)).toBe(true);
  });

  it("logs one console.error per file naming the file and the fix", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    reportLookHdriMissing("/hdri/once_only_1k.hdr", "HTTP 404");
    reportLookHdriMissing("/hdri/once_only_1k.hdr", "HTTP 404");
    expect(error).toHaveBeenCalledTimes(1);
    const text = String(error.mock.calls[0]![0]);
    expect(text).toContain("LOOK_HDRI_MISSING");
    expect(text).toContain("once_only_1k.hdr");
    expect(text).toContain("public/hdri/");
    expect(lookHdriMissingMessage("/hdri/a.hdr", "x", "sky")).toContain("git lfs pull");
  });

  it("bind: a 404 HDRI keeps the floor first, then upgrades to the procedural probe and reports once", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 404, statusText: "Not Found", arrayBuffer: async () => new ArrayBuffer(0) })));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const device = new MockRenderDevice();
    const upgraded: EnvironmentProbe[] = [];
    const missing: string[] = [];
    const binding = bindPrd02EnvironmentProbe(
      {
        kind: "explicit", probe: { hdri: "/hdri/kloppenheim_06_puresky_missing_1k.hdr" },
        intensity: 1, diffuseIntensity: 1, specularIntensity: 1, rotation: 0, background: false as const, ambient: null
      } as never,
      { device, tier: "low", flags: resolveQrFlags({}), onUpgrade: (p) => upgraded.push(p), onHdriMissing: (info) => missing.push(info.message) }
    );
    expect(binding.probe.source).toBe("neutral");
    await expect(binding.pending!).rejects.toBeDefined();
    for (let i = 0; i < 50 && upgraded.length === 0; i += 1) await new Promise((resolve) => setTimeout(resolve, 10));
    expect(upgraded).toHaveLength(1);
    expect(upgraded[0]!.source).toBe("hdri");
    expect(missing).toHaveLength(1);
    expect(missing[0]).toContain("LOOK_HDRI_MISSING");
    expect(error).toHaveBeenCalledTimes(1);
  }, 30_000);
});

describe("scaffold-time HDRI check", () => {
  it("covers every preset that has an HDRI", () => {
    for (const [id, preset] of Object.entries(lookPresets)) {
      expect(LOOK_PRESET_HDRI[id], id).toBe(preset.v0.hdri);
    }
  });

  it("warns when a used preset's HDRI is not under public/hdri, and when it is an LFS pointer; passes when present", () => {
    const dir = mkdtempSync(join(tmpdir(), "a3d-hdri-check-"));
    try {
      mkdirSync(join(dir, "src"), { recursive: true });
      writeFileSync(join(dir, "src", "main.ts"), `import { looks } from "@aura3d/engine";\nconst look = looks.preset("golden-hour");\n`);
      const missing = lookHdriWarnings(dir);
      expect(missing).toHaveLength(1);
      expect(missing[0]).toContain("kloppenheim_06_puresky_1k.hdr");
      expect(missing[0]).toContain("LOOK_HDRI_MISSING");

      mkdirSync(join(dir, "public", "hdri"), { recursive: true });
      writeFileSync(join(dir, "public", "hdri", "kloppenheim_06_puresky_1k.hdr"), "version https://git-lfs.github.com/spec/v1\noid sha256:abc\nsize 1\n");
      expect(lookHdriWarnings(dir)).toHaveLength(1);

      writeFileSync(join(dir, "public", "hdri", "kloppenheim_06_puresky_1k.hdr"), Buffer.concat([Buffer.from("#?RADIANCE\n"), Buffer.alloc(2048)]));
      expect(lookHdriWarnings(dir)).toEqual([]);

      writeFileSync(join(dir, "src", "main.ts"), `const look = looks.preset("night-city");\n`);
      expect(lookHdriWarnings(dir)).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
