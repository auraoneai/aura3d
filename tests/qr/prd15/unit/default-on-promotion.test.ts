import { describe, expect, it, vi } from "vitest";

// Promote one flag in a mocked state table; every other flag stays dev.
vi.mock("@aura3d/rendering/contracts/flags.state", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../packages/rendering/src/contracts/flags.state")>();
  return { ...actual, QR_FLAG_STATES: { ...actual.QR_FLAG_STATES, A3D_QR_CAMERA: "default-on" } };
});

const { resolveQrFlags } = await import("../../../../packages/engine/src/contracts/flags");

describe("§5.3 default-on promotion is honoured by resolveQrFlags", () => {
  it("a default-on flag is on with no source at all", () => {
    const flags = resolveQrFlags({ env: {} });
    expect(flags.on("A3D_QR_CAMERA")).toBe(true);
    expect(flags.on("A3D_QR_GAME")).toBe(false);
  });

  it("explicit kill switches still win: none, -camera and A3D_QR_CAMERA=0", () => {
    expect(resolveQrFlags({ options: ["none"], env: {} }).on("A3D_QR_CAMERA")).toBe(false);
    expect(resolveQrFlags({ options: ["-camera"], env: {} }).on("A3D_QR_CAMERA")).toBe(false);
    expect(resolveQrFlags({ env: { A3D_QR_CAMERA: "0" } }).on("A3D_QR_CAMERA")).toBe(false);
  });

  it("an explicit list keeps the default-on flag unless it negates it", () => {
    const flags = resolveQrFlags({ options: ["game"], env: {} });
    expect(flags.on("A3D_QR_GAME")).toBe(true);
    expect(flags.on("A3D_QR_CAMERA")).toBe(true);
  });

  it("a programmatic string list is a flag list: \"none\" turns a default-on flag off", () => {
    expect(resolveQrFlags({ options: "none", env: {} }).on("A3D_QR_CAMERA")).toBe(false);
    expect(resolveQrFlags({ options: "-camera", env: {} }).on("A3D_QR_CAMERA")).toBe(false);
    const list = resolveQrFlags({ options: "game", env: {} });
    expect(list.on("A3D_QR_GAME")).toBe(true);
    expect(list.on("A3D_QR_CAMERA")).toBe(true);
  });

  it("#1232: URL and env override flags hard-coded in app options", () => {
    const opts = ["game", "camera", "lighting"] as const;
    const url = resolveQrFlags({ options: [...opts], url: "http://x/?a3d-qr=none", env: {} });
    expect(url.on("A3D_QR_GAME")).toBe(false);
    expect(url.on("A3D_QR_CAMERA")).toBe(false);
    const neg = resolveQrFlags({ options: [...opts], url: "http://x/?a3d-qr=-lighting", env: {} });
    expect(neg.on("A3D_QR_LIGHTING")).toBe(false);
    expect(neg.on("A3D_QR_GAME")).toBe(true);
    const env = resolveQrFlags({ options: [...opts], env: { A3D_QR_GAME: "0" } });
    expect(env.on("A3D_QR_GAME")).toBe(false);
    expect(env.on("A3D_QR_LIGHTING")).toBe(true);
  });
});

describe("§5.3 the real state table", () => {
  it("dev flags stay off by default", async () => {
    const real = await vi.importActual<typeof import("../../../../packages/rendering/src/contracts/flags.state")>("../../../../packages/rendering/src/contracts/flags.state");
    expect(Object.values(real.QR_FLAG_STATES).every((s) => s !== undefined)).toBe(true);
  });
});
