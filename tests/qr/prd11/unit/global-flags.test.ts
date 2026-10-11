/* T11-GLOBALFLAGS (PRD-16 G2 lane 11, #145) — the lane-11 quality extension
 * no longer writes the module-level renderer flag store. With T0-28 (#914)
 * flags reach each Renderer per device, so the `prd11.frameStats` contributor
 * runs only for the renderer whose app has `tiers` on, and creating the
 * extension never arms other apps.
 */
import "@aura3d/engine";
import { afterEach, describe, expect, it } from "vitest";

import { appExtensionsAll } from "../../../../packages/engine/src/contracts/app";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import { prd11TelemetryForDevice } from "../../../../packages/rendering/src/lanes/prd11";
import { rendererQrFlags, setRendererQrFlags } from "../../../../packages/rendering/src/renderer/FrameGraph";

const FLAGS_OFF = resolveQrFlags({});

afterEach(() => {
  setRendererQrFlags(FLAGS_OFF);
});

describe("T11-GLOBALFLAGS: per-device tiers gate", () => {
  it("creating the lane-11 quality extension with tiers on leaves the global flag store untouched", () => {
    setRendererQrFlags(FLAGS_OFF);
    const extension = appExtensionsAll().find((entry) => entry.id === "prd11.quality");
    expect(extension).toBeDefined();
    const tiers = resolveQrFlags({ options: ["tiers"] });
    const value = extension!.create({} as never, { flags: tiers, options: {} as never });
    expect(rendererQrFlags()).toBe(FLAGS_OFF);
    expect(rendererQrFlags().on("A3D_QR_TIERS")).toBe(false);
    extension!.dispose?.(value as never);
  });

  it("two renderers on one page: only the tiers-on renderer records frame telemetry", async () => {
    const { Renderer } = await import("@aura3d/rendering");
    const tiers = resolveQrFlags({ options: ["tiers"] });
    const off = resolveQrFlags({});
    const on = await Renderer.create({ backend: "mock", width: 8, height: 8, qrFlags: tiers });
    const other = await Renderer.create({ backend: "mock", width: 8, height: 8, qrFlags: off });
    for (let frame = 0; frame < 3; frame += 1) {
      other.render([]);
      on.render([]);
    }
    expect(prd11TelemetryForDevice(on.device).stats.samples).toBe(3);
    expect(prd11TelemetryForDevice(other.device).stats.samples).toBe(0);
    expect(rendererQrFlags()).toBe(FLAGS_OFF);
    on.dispose();
    other.dispose();
  });
});
