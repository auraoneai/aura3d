/* T0-28 (15-FLAGS, #145 / #266) — per-renderer QR flags.
 *
 *   - `createAuraApp` → `createProductionSceneRenderer` → `Renderer.create`
 *     receives each app's own resolved flags (`qrFlags`), whatever the mount
 *     order.
 *   - Each `Renderer` binds its flags to its own device (FrameGraph seam), and
 *     device-less `rendererQrFlags()` readers inside `render()` see the flags of
 *     the renderer that is drawing; the module-level default is restored after
 *     the frame and stays the fallback for app-less code.
 *   - `all` / a lane flag expand the default-on sub-flags (#266).
 */
import "@aura3d/engine";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { QrFlags } from "@aura3d/rendering/contracts";
import { registerFrameContributor } from "@aura3d/rendering/contracts";
import {
  rendererQrFlags,
  setRendererQrFlags,
  withRendererQrFlags
} from "../../../../packages/rendering/src/renderer/FrameGraph";
import { createProductionSceneRenderer } from "../../../../packages/engine/src/agent-api/app/mountRenderer";
import { primitives } from "../../../../packages/engine/src/agent-api/nodes/primitives";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import type { AuraSceneSnapshot } from "../../../../packages/engine/src/agent-api/nodes/types";

const MOUNT_STOP = new Error("T0-28 test: stop after Renderer.create options were recorded");
const createdWith: Array<QrFlags | undefined> = [];

/* Records the options of every engine-side `Renderer.create`. Mounts on the
 * fake canvas stop right after (no WebGL2 in node); `backend: "mock"` calls
 * delegate to the real factory so the device seam is exercised for real. */
vi.mock("@aura3d/rendering", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@aura3d/rendering")>();
  const RendererClass = actual.Renderer;
  const realCreate = RendererClass.create.bind(RendererClass);
  RendererClass.create = async (options = {}) => {
    if (options.backend === "mock") return realCreate(options);
    createdWith.push(options.qrFlags);
    throw MOUNT_STOP;
  };
  return actual;
});

const snapshot = (): AuraSceneSnapshot =>
  ({ schema: "aura3d-scene-snapshot/1.0", background: "#000000", diagnostics: { enabled: false }, nodes: [primitives.box({ size: 1 }).toJSON()], camera: { mode: "orbit", position: [0, 0, 5], target: [0, 0, 0] } });
const canvas = () => ({ width: 64, height: 64, getContext: () => null }) as unknown as HTMLCanvasElement;

const FLAGS_OFF = resolveQrFlags({ options: ["none"] });

afterEach(() => {
  setRendererQrFlags(FLAGS_OFF);
  createdWith.length = 0;
});

describe("T0-28 engine → Renderer.create flag wiring", () => {
  it("each mount passes its own app flags to Renderer.create, in either creation order", async () => {
    const lighting = resolveQrFlags({ options: ["lighting"] });
    const post = resolveQrFlags({ options: ["post"] });
    for (const order of [[lighting, post], [post, lighting]] as const) {
      createdWith.length = 0;
      for (const flags of order) {
        await expect(
          createProductionSceneRenderer(canvas(), snapshot(), undefined, undefined, flags, { strict: true })
        ).rejects.toMatchObject({ code: "renderer-mount-failed", cause: MOUNT_STOP });
      }
      expect(createdWith).toEqual([order[0], order[1]]);
    }
  });
});

describe("T0-28 per-renderer flag isolation", () => {
  it("two renderers keep their own flags regardless of creation order; the global default is untouched", async () => {
    const { Renderer } = await import("@aura3d/rendering");
    const a = resolveQrFlags({ options: ["lighting"] });
    const b = resolveQrFlags({ options: ["post"] });
    const ambient = resolveQrFlags({ options: ["camera"] });
    setRendererQrFlags(ambient);
    for (const [first, second] of [[a, b], [b, a]] as const) {
      const r1 = await Renderer.create({ backend: "mock", width: 8, height: 8, qrFlags: first });
      const r2 = await Renderer.create({ backend: "mock", width: 8, height: 8, qrFlags: second });
      expect(rendererQrFlags(r1.device)).toBe(first);
      expect(rendererQrFlags(r2.device)).toBe(second);
      expect(rendererQrFlags()).toBe(ambient);
      r1.dispose();
      r2.dispose();
    }
  });

  it("render() scopes ambient rendererQrFlags() readers to the drawing renderer and restores the default", async () => {
    const { Renderer } = await import("@aura3d/rendering");
    const seen: QrFlags[] = [];
    const dispose = registerFrameContributor({
      id: "prd15.t028-probe",
      owner: "prd15",
      flag: "A3D_QR_ROUTE_T028_PROBE",
      phases: ["collect"],
      collect(items) {
        seen.push(rendererQrFlags());
        return items;
      }
    });
    try {
      // post is default-on: renderer a turns it off explicitly so the two
      // renderers' flag sets differ on it.
      const a = resolveQrFlags({ options: ["route.t028.probe", "lighting", "-post"] });
      const b = resolveQrFlags({ options: ["route.t028.probe", "post"] });
      const r1 = await Renderer.create({ backend: "mock", width: 8, height: 8, qrFlags: a });
      const r2 = await Renderer.create({ backend: "mock", width: 8, height: 8, qrFlags: b });
      r2.render([]);
      r1.render([]);
      r2.render([]);
      expect(seen).toEqual([b, a, b]);
      expect(seen[1]?.on("A3D_QR_LIGHTING")).toBe(true);
      expect(seen[1]?.on("A3D_QR_POST")).toBe(false);
      expect(rendererQrFlags()).toBe(FLAGS_OFF);
      r1.dispose();
      r2.dispose();
    } finally {
      dispose();
    }
  });

  it("withRendererQrFlags restores the default when the frame throws; unscoped devices fall back", () => {
    const scoped = resolveQrFlags({ options: ["tiers"] });
    const device = {} as Parameters<typeof withRendererQrFlags>[0];
    const unscoped = {} as Parameters<typeof withRendererQrFlags>[0];
    setRendererQrFlags(scoped, device);
    expect(() => withRendererQrFlags(device, () => {
      expect(rendererQrFlags()).toBe(scoped);
      throw new Error("frame failed");
    })).toThrow("frame failed");
    expect(rendererQrFlags()).toBe(FLAGS_OFF);
    expect(withRendererQrFlags(unscoped, () => rendererQrFlags())).toBe(FLAGS_OFF);
    expect(rendererQrFlags(unscoped)).toBe(FLAGS_OFF);
  });
});

describe("#266 default-on sub-flag expansion", () => {
  it("`all` and a lane flag expand default-on sub-flags; explicit values and earlier sources win", () => {
    const all = resolveQrFlags({ options: "all" });
    for (const sub of ["A3D_QR_WORLD_TERRAIN", "A3D_QR_WORLD_WATER", "A3D_QR_WORLD_BIOME"] as const) {
      expect(all.on(sub)).toBe(true);
    }
    expect(resolveQrFlags({ url: "http://x/?a3d-qr=all" }).on("A3D_QR_WORLD_BIOME")).toBe(true);
    expect(resolveQrFlags({ options: ["world"] }).on("A3D_QR_WORLD_TERRAIN")).toBe(true);
    expect(resolveQrFlags({ options: ["world", "-world.biome"] }).on("A3D_QR_WORLD_BIOME")).toBe(false);
    expect(resolveQrFlags({ options: { A3D_QR_WORLD: true }, url: "http://x/?a3d-qr=-world.water" }).on("A3D_QR_WORLD_WATER")).toBe(false);
    // a lane turned off by an earlier source keeps its sub-flags off under `all`
    const worldOff = resolveQrFlags({ options: ["-world"], url: "http://x/?a3d-qr=all" });
    expect(worldOff.on("A3D_QR_WORLD")).toBe(false);
    expect(worldOff.on("A3D_QR_WORLD_TERRAIN")).toBe(false);
    // opt-in sub-flags and lane-01's helper-resolved sub-flags are not implied; flag-off stays empty
    expect(all.on("A3D_QR_POST_VELOCITY_MRT")).toBe(false);
    expect(resolveQrFlags({ options: ["core"] }).values.A3D_QR_CORE_OUTPUT).toBeUndefined();
    // `none` writes every lane flag false (so it also turns default-on flags off)
    const none = resolveQrFlags({ options: ["none"] });
    expect(Object.values(none.values).every((v) => v === false)).toBe(true);
    expect(none.on("A3D_QR_LIGHTING")).toBe(false);
    expect(resolveQrFlags({ options: "all" }).values.A3D_QR_WORLD_BIOME).toBe(true);
  });
});

describe("#266 sub-flag expansion honours later kill switches", () => {
  it("['all', '-world.terrain'] keeps terrain off and water/biome on", async () => {
    const { resolveQrFlags } = await import("../../../../packages/engine/src/contracts/flags");
    const flags = resolveQrFlags({ options: ["all", "-world.terrain"], env: {} });
    expect(flags.on("A3D_QR_WORLD_TERRAIN")).toBe(false);
    expect(flags.on("A3D_QR_WORLD_WATER")).toBe(true);
    expect(flags.on("A3D_QR_WORLD_BIOME")).toBe(true);
  });
});

describe("#625 'all' / 'none' inside comma lists", () => {
  it("route_bank_shot,all arms every lane flag plus the route flag", async () => {
    const { resolveQrFlags } = await import("../../../../packages/engine/src/contracts/flags");
    const flags = resolveQrFlags({ options: ["route.bank_shot,all"], env: {} });
    expect(flags.on("A3D_QR_GAME")).toBe(true);
    expect(flags.on("A3D_QR_WORLD")).toBe(true);
    expect(flags.on("A3D_QR_ROUTE_BANK_SHOT")).toBe(true);
  });
  it("all,-world keeps world (and its sub-flags) off", async () => {
    const { resolveQrFlags } = await import("../../../../packages/engine/src/contracts/flags");
    const flags = resolveQrFlags({ options: ["all,-world"], env: {} });
    expect(flags.on("A3D_QR_WORLD")).toBe(false);
    expect(flags.on("A3D_QR_WORLD_TERRAIN")).toBe(false);
    expect(flags.on("A3D_QR_CAMERA")).toBe(true);
  });
  it("none,game keeps game on and everything else off", async () => {
    const { resolveQrFlags } = await import("../../../../packages/engine/src/contracts/flags");
    const flags = resolveQrFlags({ options: ["none,game"], env: {} });
    expect(flags.on("A3D_QR_GAME")).toBe(true);
    expect(flags.on("A3D_QR_CAMERA")).toBe(false);
  });
});
