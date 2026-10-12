// QR-07 — promote_flag=vfx must reach the lane-07 sub-flag contributors.
// The bench harness passes `?a3d-qr=vfx`; runPrd07AuraScene used that list
// verbatim and dropped each scene's own `vfx.sky` / `vfx.fog` /
// `vfx.volumetric` / `vfx.decals`, so the prd07.sky/fog/volumetric/decals
// contributors stayed gated off and the flag-on frame matched flags-off.

import { describe, expect, it } from "vitest";
import { laneFlags } from "../../../../benchmarks/quality-rebuild/aura3d/scenes/prd07/common";
import { adapterSceneIds } from "../../../../benchmarks/quality-rebuild/aura3d/scenes/prd07/index";
import { getPrd07SceneSpec } from "../../../../benchmarks/quality-rebuild/scenes/prd07/specs";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import { frameContributors } from "../../../../packages/rendering/src/contracts/frameGraph";
import "../../../../packages/engine/src";

const SUB_FLAG: Readonly<Record<string, string>> = {
  "vfx.sky": "A3D_QR_VFX_SKY",
  "vfx.fog": "A3D_QR_VFX_FOG",
  "vfx.volumetric": "A3D_QR_VFX_VOLUMETRIC",
  "vfx.decals": "A3D_QR_VFX_DECALS"
};
const CONTRIBUTOR: Readonly<Record<string, string>> = {
  "vfx.sky": "prd07.sky",
  "vfx.fog": "prd07.fog",
  "vfx.volumetric": "prd07.volumetric",
  "vfx.decals": "prd07.decals"
};

describe("prd07 bench lane flags", () => {
  it("flags-off control stays off (absent list, empty, none)", () => {
    const spec = { qrFlags: ["vfx", "vfx.sky"] };
    expect(laneFlags({}, spec.qrFlags)).toBeUndefined();
    expect(laneFlags({ qrFlags: [] }, spec.qrFlags)).toBeUndefined();
    expect(laneFlags({ qrFlags: ["none"] }, spec.qrFlags)).toBeUndefined();
  });

  it("a harness lane flag carries the scene's sub-flags; other lanes don't", () => {
    expect(laneFlags({ qrFlags: ["vfx"] }, ["vfx", "vfx.sky", "vfx.fog"])).toEqual(["vfx", "vfx.sky", "vfx.fog"]);
    expect(laneFlags({ qrFlags: ["all"] }, ["vfx", "vfx.volumetric"])).toEqual(["all", "vfx.volumetric"]);
    expect(laneFlags({ qrFlags: ["post"] }, ["vfx", "vfx.sky"])).toEqual(["post"]);
  });

  it("explicit harness negations win", () => {
    expect(laneFlags({ qrFlags: ["vfx", "-vfx.fog"] }, ["vfx", "vfx.sky", "vfx.fog"])).toEqual(["vfx", "-vfx.fog", "vfx.sky"]);
    expect(laneFlags({ qrFlags: ["all", "-vfx"] }, ["vfx", "vfx.sky"])).toEqual(["all", "-vfx"]);
  });

  it("every lane scene's sub-flags resolve on, with their contributors active, under promote_flag=vfx", () => {
    let checked = 0;
    for (const id of adapterSceneIds) {
      const spec = getPrd07SceneSpec(id);
      const subs = (spec.qrFlags ?? []).filter((flag) => flag.startsWith("vfx."));
      if (subs.length === 0) continue;
      const harness = laneFlags({ qrFlags: ["vfx"] }, spec.qrFlags);
      const flags = resolveQrFlags({ options: [...(harness ?? [])] });
      const control = resolveQrFlags({ options: ["none"] });
      const active = new Set(frameContributors(flags).map((c) => c.id));
      const activeOff = new Set(frameContributors(control).map((c) => c.id));
      for (const sub of subs) {
        expect(flags.on(SUB_FLAG[sub] as never), `${id}: ${sub}`).toBe(true);
        expect(control.on(SUB_FLAG[sub] as never), `${id}: ${sub} control`).toBe(false);
        expect(active.has(CONTRIBUTOR[sub]!), `${id}: ${CONTRIBUTOR[sub]}`).toBe(true);
        expect(activeOff.has(CONTRIBUTOR[sub]!), `${id}: ${CONTRIBUTOR[sub]} control`).toBe(false);
      }
      checked += 1;
    }
    // sky hours, outdoor-sky, fog, underwater, volumetric, decals ...
    expect(checked).toBeGreaterThanOrEqual(8);
  });
});
