/**
 * GU47 E-G (WP-7 item 3): builder-time world flags honour the app's
 * `qualityRebuild.flags` (declared with `world.useAppFlags`), then the URL
 * `?a3d-qr=` list (unless `allowUrlFlags: false`), then the environment.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import {
  setWorldBuilderFlags,
  worldBuilderFlagOn,
  worldBuilderFlags,
  worldBuilderSubflagOn
} from "../../../../packages/engine/src/agent-api/world/flags";
import { world } from "../../../../packages/engine/src/agent-api/world/index";
import { water } from "../../../../packages/engine/src/agent-api/nodes/water";

afterEach(() => {
  setWorldBuilderFlags(null);
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("GU47 E-G builder-time world flags", () => {
  it("without a declaration the builder sees the flags.state defaults (WORLD is dev → off)", () => {
    expect(worldBuilderFlagOn("A3D_QR_WORLD")).toBe(false);
    expect(worldBuilderSubflagOn("A3D_QR_WORLD_TERRAIN")).toBe(false);
  });

  it("world.useAppFlags(qualityRebuild) turns the builder read on, null clears it", () => {
    expect(world.useAppFlags).toBe(setWorldBuilderFlags);
    world.useAppFlags({ flags: ["world"] });
    expect(worldBuilderFlagOn("A3D_QR_WORLD")).toBe(true);
    expect(worldBuilderSubflagOn("A3D_QR_WORLD_WATER")).toBe(true);
    world.useAppFlags(null);
    expect(worldBuilderFlagOn("A3D_QR_WORLD")).toBe(false);
  });

  it("an app's resolved QrFlags object is used verbatim", () => {
    const resolved = resolveQrFlags({ options: { A3D_QR_WORLD: true, A3D_QR_WORLD_BIOME: false } });
    setWorldBuilderFlags(resolved);
    expect(worldBuilderFlags()).toBe(resolved);
    expect(worldBuilderSubflagOn("A3D_QR_WORLD_TERRAIN")).toBe(true);
    expect(worldBuilderSubflagOn("A3D_QR_WORLD_BIOME")).toBe(false);
  });

  it("the URL list applies like createAuraApp, and allowUrlFlags:false ignores it", () => {
    vi.stubGlobal("location", { href: "http://localhost/?a3d-qr=world" });
    expect(worldBuilderFlagOn("A3D_QR_WORLD")).toBe(true);
    setWorldBuilderFlags({ allowUrlFlags: false });
    expect(worldBuilderFlagOn("A3D_QR_WORLD")).toBe(false);
    // URL beats the declared options (resolveQrFlags precedence, #1232).
    vi.stubGlobal("location", { href: "http://localhost/?a3d-qr=-world" });
    setWorldBuilderFlags({ flags: ["world"] });
    expect(worldBuilderFlagOn("A3D_QR_WORLD")).toBe(false);
  });

  it("the environment still applies (pre-GU47 builder source)", () => {
    vi.stubEnv("A3D_QR", "world");
    expect(worldBuilderFlagOn("A3D_QR_WORLD")).toBe(true);
  });

  it("water.surface follows the declared app flags at build time", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    // GU47 WP-7: A3D_QR_WORLD_WATER is default-on (alone), so the legacy fixture needs an explicit off.
    world.useAppFlags({ flags: ["-world.water"] });
    const legacy = water.surface({ preset: "calm" });
    expect(legacy.bandCount).toBeGreaterThan(0);
    expect(legacy.nodes.some((n) => (n as { kind?: string }).kind === "water")).toBe(false);
    world.useAppFlags({ flags: { A3D_QR_WORLD: true } });
    const upgraded = water.surface({ preset: "calm" });
    expect(upgraded.bandCount).toBe(0);
    expect(upgraded.nodes).toHaveLength(1);
    expect((upgraded.nodes[0] as { kind?: string }).kind).toBe("water");
  });

  it("with the promoted water sub-flag, water.surface upgrades by default without the WORLD lane", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(worldBuilderFlagOn("A3D_QR_WORLD")).toBe(false);
    expect(worldBuilderSubflagOn("A3D_QR_WORLD_WATER")).toBe(true);
    expect((water.surface({ preset: "calm" }).nodes[0] as { kind?: string }).kind).toBe("water");
    // `-world` still turns the whole lane off, water included.
    world.useAppFlags({ flags: ["-world"] });
    expect(worldBuilderSubflagOn("A3D_QR_WORLD_WATER")).toBe(false);
  });
});
