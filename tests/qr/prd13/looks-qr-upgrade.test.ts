// PRD-13 — A3D_QR_LOOKS upgrades to the v0 look expansion. Flag off must be
// byte-identical to the frozen §7.1.1 expansion (13-S9 flag-off identity);
// flag on gives the §7.1 dark looks a real HDRI so they get IBL.

import { describe, expect, it } from "vitest";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags";
import { expandLookChildren, lookHdriFiles } from "../../../packages/engine/src/agent-api/looks/looks";
import { lookPresets } from "../../../packages/engine/src/agent-api/looks/lookPresets";
import type { AuraLookId } from "../../../packages/engine/src/contracts/looks";

const OFF = resolveQrFlags({ options: {} });
const ON = resolveQrFlags({ options: { A3D_QR_LOOKS: true } });
const ids = Object.keys(lookPresets) as AuraLookId[];

type EnvChild = { kind: string; environment?: string; intensity?: number; background?: unknown; texture?: { url?: string } };
const env = (children: readonly unknown[]): EnvChild | undefined =>
  (children as EnvChild[]).find((child) => child.kind === "environment");

describe("A3D_QR_LOOKS look upgrades", () => {
  it("flag off: every look expands exactly to its frozen v0 HDRI (or none)", () => {
    for (const id of ids) {
      const hdri = lookPresets[id].v0.hdri;
      const child = env(expandLookChildren(id, undefined, OFF));
      if (hdri === null) expect(child, id).toBeUndefined();
      else expect(child?.texture?.url, id).toBe(`/hdri/${hdri}.hdr`);
    }
  });

  it("flag off and flag on are identical for every look without an upgrade", () => {
    for (const id of ids.filter((id) => !["night-city", "polar-night", "neon-arcade"].includes(id))) {
      expect(expandLookChildren(id, undefined, ON), id).toEqual(expandLookChildren(id, undefined, OFF));
    }
  });

  it("flag on: the night looks get the CC0 night-2k HDRI at low intensity", () => {
    for (const id of ["night-city", "polar-night", "neon-arcade"] as const) {
      const child = env(expandLookChildren(id, undefined, ON));
      expect(child?.environment, id).toBe("hdri");
      expect(child?.texture?.url, id).toBe("/hdri/night-2k.hdr");
      expect(child?.intensity, id).toBeGreaterThan(0);
      expect(child?.intensity, id).toBeLessThan(1);
      expect(lookHdriFiles(id, ON)).toEqual(["night-2k.hdr"]);
      expect(lookHdriFiles(id, OFF)).toEqual([]);
    }
    expect(env(expandLookChildren("neon-arcade", undefined, ON))?.background).toBe(false);
  });

  it("space and underwater stay without an HDRI in both arms", () => {
    for (const id of ["space", "underwater"] as const) {
      expect(env(expandLookChildren(id, undefined, ON)), id).toBeUndefined();
      expect(lookHdriFiles(id, ON)).toEqual([]);
    }
  });
});
