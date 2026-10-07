/**
 * Lane-08 C-22/C-38 impl conformance (CONTRACTS.md §1.1): the registered
 * `camera` extension resolves to the real CameraController under
 * A3D_QR_CAMERA and to the PR 0a stub when the flag is off (or
 * `camera.legacy` forces it).
 */
import { describe, expect, it } from "vitest";
import { appExtensionsAll, resolveQrFlags } from "@aura3d/engine/contracts";
import "@aura3d/engine/lanes";

const ext = () => appExtensionsAll().find((e) => e.id === "prd08.camera");
const flagsOn = resolveQrFlags({ options: ["camera"] });
const flagsOff = resolveQrFlags({});

const fakeApp = () => ({
  nodes: { get: () => undefined, all: () => [] },
  scene: { camera: { mode: "orbit", distance: 5 }, nodes: [] },
  canvas: undefined
});

describe("prd08 camera extension (C-22/C-38)", () => {
  it("is registered with member 'camera' and flag A3D_QR_CAMERA", () => {
    expect(ext()).toBeDefined();
    expect(ext()?.member).toBe("camera");
    expect(ext()?.flag).toBe("A3D_QR_CAMERA");
  });

  it("flag on → real controller (update + presented + rigs.fromSpec)", () => {
    const c = ext()?.create(fakeApp() as never, { flags: flagsOn, options: {} as never }) as
      | ({
          update(dt: number, t: number): unknown;
          presented(): { fov: number };
          rigs: { fromSpec(s: unknown): unknown };
        })
      | undefined;
    expect(c).toBeDefined();
    expect(typeof c!.update).toBe("function"); // impl member (AuraCameraControllerImpl)
    const pose = c!.presented();
    expect(pose.fov).toBeTypeOf("number");
    expect(c!.rigs.fromSpec({ mode: "perspective" })).toBeDefined();
  });

  it("flag on controller presents the authored orbit spec", () => {
    const app = fakeApp();
    const c = ext()?.create(app as never, { flags: flagsOn, options: {} as never }) as
      | { update(dt: number, t: number): { position: readonly number[]; target: readonly number[] } }
      | undefined;
    const pose = c!.update(1 / 60, 0);
    // orbit d=5 → eye target + d·[0.62,0.42,0.78] (S4 parity, no target → [0,0.7,0])
    expect(pose.position[0]).toBeCloseTo(0 + 5 * 0.62, 4);
    expect(pose.position[1]).toBeCloseTo(0.7 + 5 * 0.42, 4);
    expect(pose.position[2]).toBeCloseTo(0 + 5 * 0.78, 4);
  });

  it("flag off → stub (same surface, no update impl)", () => {
    const c = ext()?.create(fakeApp() as never, { flags: flagsOff, options: {} as never }) as
      | { update?: unknown; presented(): { position: readonly number[] } }
      | undefined;
    expect(c).toBeDefined();
    expect(typeof c!.presented).toBe("function");
    expect(c!.update).toBeUndefined();
    const pose = c!.presented();
    // spec.position absent → falls back to the contract DEFAULT_POSE [0,1.6,5].
    expect(pose.position[2]).toBe(5);
  });

  it("camera.legacy forces the stub even under the flag", () => {
    const c = ext()?.create(fakeApp() as never, {
      flags: flagsOn,
      options: { camera: { legacy: true } } as never
    });
    expect((c as { update?: unknown }).update).toBeUndefined();
  });
});
