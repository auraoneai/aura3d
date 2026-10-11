// PRD-13 — A3D_QR_LOOKS look behaviour.
// 1. Flag off must be byte-identical to the frozen §7.1.1 v0 expansion
//    (13-S9 flag-off identity); the night-2k HDRI upgrade was withdrawn after
//    it measured worse on gpu-l4 (looks.ts LOOK_QR_UPGRADES comment), so flag
//    on expands identically too.
// 2. Flag on, an unset scene background takes the authored look's
//    horizon-matched backdrop instead of the default near-black void
//    (look/solid-void); an explicit `.background()` always wins.

import { afterEach, describe, expect, it } from "vitest";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags";
import { expandLookChildren, looks } from "../../../packages/engine/src/agent-api/looks/looks";
import { lookPresets } from "../../../packages/engine/src/agent-api/looks/lookPresets";
import { scene } from "../../../packages/engine/src/agent-api/nodes/scene";
import type { AuraLookId } from "../../../packages/engine/src/contracts/looks";

const OFF = resolveQrFlags({ options: {} });
const ON = resolveQrFlags({ options: { A3D_QR_LOOKS: true } });
const ids = Object.keys(lookPresets) as AuraLookId[];

type EnvChild = { kind: string; texture?: { url?: string } };
const env = (children: readonly unknown[]): EnvChild | undefined =>
  (children as EnvChild[]).find((child) => child.kind === "environment");

const savedQr = process.env.A3D_QR;
afterEach(() => {
  if (savedQr === undefined) delete process.env.A3D_QR;
  else process.env.A3D_QR = savedQr;
});

describe("A3D_QR_LOOKS look expansion", () => {
  it("flag off: every look expands exactly to its frozen v0 HDRI (or none)", () => {
    for (const id of ids) {
      const hdri = lookPresets[id].v0.hdri;
      const child = env(expandLookChildren(id, undefined, OFF));
      if (hdri === null) expect(child, id).toBeUndefined();
      else expect(child?.texture?.url, id).toBe(`/hdri/${hdri}.hdr`);
    }
  });

  it("flag on expands identically while no upgrade beats flag-off", () => {
    for (const id of ids) {
      expect(expandLookChildren(id, undefined, ON), id).toEqual(expandLookChildren(id, undefined, OFF));
    }
  });
});

describe("A3D_QR_LOOKS scene backdrop", () => {
  it("flag off keeps the default background (byte-identical)", () => {
    delete process.env.A3D_QR;
    expect(scene().add(looks.preset("outdoor-day")).toJSON().background).toBe("#070b12");
  });

  it("flag on: an unset background takes the look's backdrop", () => {
    process.env.A3D_QR = "looks";
    const snapshot = scene().add(looks.preset("outdoor-day")).toJSON();
    expect(snapshot.background).toBe(looks.describe("outdoor-day").v0.background);
  });

  it("flag on: an explicit background still wins", () => {
    process.env.A3D_QR = "looks";
    const snapshot = scene().background("#123456").add(looks.preset("outdoor-day")).toJSON();
    expect(snapshot.background).toBe("#123456");
  });

  it("flag on: no look leaves the default background", () => {
    process.env.A3D_QR = "looks";
    expect(scene().toJSON().background).toBe("#070b12");
  });
});
