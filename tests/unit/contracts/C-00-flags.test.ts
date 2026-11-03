import { describe, expect, it, vi } from "vitest";
import { qrFlagsWithAnimationMixer, resolveQrFlags } from "@aura3d/engine/contracts";
import { createRegistry, isTrustedQrFlags, type QrFlagName, type QrFlags, type RegistryEntry } from "@aura3d/rendering/contracts";

// Exercise removal without changing the production list, which is currently empty.
vi.mock("@aura3d/rendering/contracts/flags.state", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@aura3d/rendering/contracts/flags.state")>();
  return { ...actual, REMOVED_QR_FLAGS: [...actual.REMOVED_QR_FLAGS, "A3D_QR_ROUTE_REMOVED_TEST"] };
});

describe("C-00 flags", () => {
  it("options list enables named flags", () => {
    const flags = resolveQrFlags({ options: ["core", "post.taa"] });
    expect(flags.on("A3D_QR_CORE")).toBe(true);
    expect(flags.on("A3D_QR_POST_TAA")).toBe(true);
    // a sub-flag does not imply its lane flag (lane post is default-on, so
    // turn it off explicitly to observe that)
    expect(resolveQrFlags({ options: { A3D_QR_POST_TAA: true, A3D_QR_POST: false } }).on("A3D_QR_POST")).toBe(false);
  });
  it("env A3D_QR list enables flags; per-flag env overrides", () => {
    const flags = resolveQrFlags({ env: { A3D_QR: "core", A3D_QR_POST: "1" } });
    expect(flags.on("A3D_QR_CORE")).toBe(true);
    expect(flags.on("A3D_QR_POST")).toBe(true);
  });
  it("explicit \"none\" disables everything", () => {
    const flags = resolveQrFlags({ options: "none" });
    expect(flags.on("A3D_QR_CORE")).toBe(false);
  });
  it("T1.11: animation.mixer:\"pose\" aliases A3D_QR_ANIMATION_POSE_MIXER; an explicit flags value wins", () => {
    // explicit off: animation is default-on
    const base = resolveQrFlags({ options: { A3D_QR_ANIMATION: false } });
    const aliased = qrFlagsWithAnimationMixer(base, "pose");
    expect(aliased.on("A3D_QR_ANIMATION_POSE_MIXER")).toBe(true);
    // the sub-flag alone does not imply the lane flag
    expect(aliased.on("A3D_QR_ANIMATION")).toBe(false);
    expect(qrFlagsWithAnimationMixer(base, "legacy").on("A3D_QR_ANIMATION_POSE_MIXER")).toBe(false);
    expect(qrFlagsWithAnimationMixer(base, undefined).on("A3D_QR_ANIMATION_POSE_MIXER")).toBe(false);
    const explicitOff = qrFlagsWithAnimationMixer(
      resolveQrFlags({ options: { A3D_QR_ANIMATION_POSE_MIXER: false } }),
      "pose"
    );
    expect(explicitOff.on("A3D_QR_ANIMATION_POSE_MIXER")).toBe(false);
  });
  it("#72: flagNameFor resolves multi-segment names (core.x.y, route.a.b)", () => {
    const flags = resolveQrFlags({ options: ["core.shadows.cascade", "route.demo.alpha", "camera.dof"] });
    expect(flags.on("A3D_QR_CORE_SHADOWS_CASCADE")).toBe(true);
    expect(flags.on("A3D_QR_ROUTE_DEMO_ALPHA")).toBe(true);
    expect(flags.on("A3D_QR_CAMERA_DOF")).toBe(true);
    // dotted shorthand still resolves two-segment names
    expect(resolveQrFlags({ options: ["looks.hair"] }).on("A3D_QR_LOOKS_HAIR")).toBe(true);
  });

  it("uses URL, list environment, per-flag environment, options, then defaults in first-write order", () => {
    const flags = resolveQrFlags({
      url: "https://example.test/?a3d-qr=-core,-world.water,game%3Doff",
      env: { A3D_QR: "core,lighting=off,world", A3D_QR_LIGHTING: "1", A3D_QR_CAMERA: "0", A3D_QR_WORLD_TERRAIN: "0" },
      options: { A3D_QR_CORE: true, A3D_QR_LIGHTING: true, A3D_QR_CAMERA: true, A3D_QR_WORLD: false, A3D_QR_GAME: true }
    });
    expect(flags.values.A3D_QR_CORE).toBe(false);
    expect(flags.values.A3D_QR_LIGHTING).toBe("off");
    expect(flags.values.A3D_QR_CAMERA).toBe(false);
    expect(flags.values.A3D_QR_GAME).toBe("off");
    expect(flags.values.A3D_QR_WORLD).toBe(true);
    expect(flags.values.A3D_QR_WORLD_WATER).toBe(false);
    expect(flags.values.A3D_QR_WORLD_TERRAIN).toBe(false);
    expect(flags.values.A3D_QR_WORLD_BIOME).toBe(true);
    expect(resolveQrFlags({ url: "https://example.test/?a3d-qr=all", options: ["-world"] }).on("A3D_QR_WORLD")).toBe(true);
  });

  it("keeps default-on flags, lane kill switches, and explicitly overridden sub-flags", () => {
    const defaults = resolveQrFlags({});
    expect(defaults.on("A3D_QR_CORE")).toBe(true);
    expect(defaults.on("A3D_QR_WORLD")).toBe(false);
    expect(defaults.on("A3D_QR_WORLD_WATER")).toBe(true);
    expect(defaults.on("A3D_QR_WORLD_TERRAIN")).toBe(false);

    const world = resolveQrFlags({ options: "all,-world.biome" });
    expect(world.on("A3D_QR_WORLD")).toBe(true);
    expect(world.on("A3D_QR_WORLD_TERRAIN")).toBe(true);
    expect(world.on("A3D_QR_WORLD_BIOME")).toBe(false);
    const disabled = resolveQrFlags({ options: "-world" });
    expect(disabled.on("A3D_QR_WORLD_WATER")).toBe(false);
    expect(disabled.on("A3D_QR_WORLD_WIND")).toBe(false);
  });

  it("retains exact string truthiness", () => {
    const flag = "A3D_QR_ROUTE_TRUTHINESS";
    for (const value of [false, "0", "off", ""] as const) {
      const flags = resolveQrFlags({ options: { [flag]: value } });
      expect(flags.values[flag]).toBe(value);
      expect(flags.on(flag)).toBe(false);
    }
    for (const value of [true, "1", "on", "false", "OFF"] as const) {
      const flags = resolveQrFlags({ options: { [flag]: value } });
      expect(flags.values[flag]).toBe(value);
      expect(flags.on(flag)).toBe(true);
    }
  });

  it("removes retired flags before making the trusted snapshot", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const flags = resolveQrFlags({ options: { A3D_QR_ROUTE_REMOVED_TEST: true } });
      expect(flags.values.A3D_QR_ROUTE_REMOVED_TEST).toBeUndefined();
      expect(flags.on("A3D_QR_ROUTE_REMOVED_TEST")).toBe(false);
      expect(isTrustedQrFlags(flags)).toBe(true);
      expect(warn).toHaveBeenCalledWith("QR_FLAG_REMOVED:A3D_QR_ROUTE_REMOVED_TEST");
    } finally {
      warn.mockRestore();
    }
  });

  it("returns a trusted, immutable snapshot that cannot be impersonated by copying or proxying it", () => {
    const input = { A3D_QR_CORE: "v2", A3D_QR_GAME: false };
    const flags = resolveQrFlags({ options: input });
    input.A3D_QR_CORE = "off";
    input.A3D_QR_GAME = true;
    expect(isTrustedQrFlags(flags)).toBe(true);
    expect(Object.isFrozen(flags)).toBe(true);
    expect(Object.isFrozen(flags.values)).toBe(true);
    expect(flags.values.A3D_QR_CORE).toBe("v2");
    expect(flags.on("A3D_QR_GAME")).toBe(false);
    expect(Reflect.set(flags.values, "A3D_QR_CORE", "off")).toBe(false);
    expect(Reflect.set(flags, "on", () => false)).toBe(false);
    expect(flags.on("A3D_QR_CORE")).toBe(true);
    expect(isTrustedQrFlags({ ...flags })).toBe(false);
    expect(isTrustedQrFlags(new Proxy(flags, {}))).toBe(false);
    expect(isTrustedQrFlags(Object.freeze({ values: flags.values, on: flags.on }))).toBe(false);
  });

  it("keeps inherited flag names and inherited short-name keys out of resolution", () => {
    const prior = Object.getOwnPropertyDescriptor(Object.prototype, "A3D_QR_GAME");
    Object.defineProperty(Object.prototype, "A3D_QR_GAME", { configurable: true, value: "polluted" });
    try {
      const flags = resolveQrFlags({ options: ["game", "constructor", "__proto__.probe"] });
      expect(flags.values.A3D_QR_GAME).toBe(true);
      expect(flags.on("A3D_QR_GAME")).toBe(true);
      expect(Object.getPrototypeOf(flags.values)).toBeNull();
      expect(Reflect.ownKeys(flags.values).some((key) => typeof key === "string" && key.includes("function Object"))).toBe(false);
      expect(flags.values.A3D_QR___PROTO___PROBE).toBeUndefined();
    } finally {
      if (prior) Object.defineProperty(Object.prototype, "A3D_QR_GAME", prior);
      else Reflect.deleteProperty(Object.prototype, "A3D_QR_GAME");
    }
  });

  it("makes pose mixer overlays trusted only for trusted sources and honors explicit overrides", () => {
    const base = resolveQrFlags({ options: { A3D_QR_ANIMATION: false } });
    const pose = qrFlagsWithAnimationMixer(base, "pose");
    expect(pose).not.toBe(base);
    expect(isTrustedQrFlags(pose)).toBe(true);
    expect(Object.isFrozen(pose)).toBe(true);
    expect(Object.isFrozen(pose.values)).toBe(true);
    expect(base.values.A3D_QR_ANIMATION_POSE_MIXER).toBeUndefined();
    expect(pose.on("A3D_QR_ANIMATION_POSE_MIXER")).toBe(true);
    expect(pose.on("A3D_QR_ANIMATION")).toBe(false);
    expect(qrFlagsWithAnimationMixer(base, "legacy")).toBe(base);
    expect(qrFlagsWithAnimationMixer(base, undefined)).toBe(base);

    for (const value of [false, "0", "off", "", true, "false"] as const) {
      const explicit = resolveQrFlags({ options: { A3D_QR_ANIMATION_POSE_MIXER: value } });
      expect(qrFlagsWithAnimationMixer(explicit, "pose")).toBe(explicit);
      expect(explicit.on("A3D_QR_ANIMATION_POSE_MIXER")).toBe(value === true || value === "false");
    }
  });

  it("retains custom on() behavior and fails closed for stateful mixer overlays", () => {
    let enabled = false;
    const calls: QrFlagName[] = [];
    const custom: QrFlags = Object.freeze({
      values: Object.freeze({ A3D_QR_CORE: false }),
      on(name: QrFlagName): boolean {
        expect(this).toBe(custom);
        calls.push(name);
        return name === "A3D_QR_CORE" && enabled;
      }
    });
    const pose = qrFlagsWithAnimationMixer(custom, "pose");
    expect(isTrustedQrFlags(custom)).toBe(false);
    expect(isTrustedQrFlags(pose)).toBe(false);
    expect(Object.isFrozen(pose.values)).toBe(true);
    expect(pose.on("A3D_QR_ANIMATION_POSE_MIXER")).toBe(true);
    expect(calls).toEqual([]);

    const registry = createRegistry<RegistryEntry>("flag-mixer-custom-on-test");
    const entry: RegistryEntry = { id: "custom-flag", owner: "prd01", flag: "A3D_QR_CORE" };
    registry.register(entry);
    expect(registry.hasPotentiallyActive(pose)).toBe(true);
    expect(calls).toEqual([]);
    expect(registry.active(pose)).toEqual([]);
    enabled = true;
    expect(registry.active(pose)).toEqual([entry]);
    expect(calls).toEqual(["A3D_QR_CORE", "A3D_QR_CORE"]);

    const explicitCustom: QrFlags = { values: { A3D_QR_ANIMATION_POSE_MIXER: false }, on: () => false };
    expect(qrFlagsWithAnimationMixer(explicitCustom, "pose")).toBe(explicitCustom);
    expect(qrFlagsWithAnimationMixer(explicitCustom, "pose").on("A3D_QR_ANIMATION_POSE_MIXER")).toBe(false);
    expect(qrFlagsWithAnimationMixer(custom, "legacy")).toBe(custom);
  });
});
