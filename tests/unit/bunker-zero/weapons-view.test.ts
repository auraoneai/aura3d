import { describe, expect, it } from "vitest";
import { WEAPONS, type WeaponId } from "../../../apps/showcase-bunker-zero/src/sim";
import { VIEWMODEL_ASSET, weaponHudLabel } from "../../../apps/showcase-bunker-zero/src/weapons-view";

const IDS = Object.keys(WEAPONS) as WeaponId[];

describe("bunker zero weapon view", () => {
  it("draws a model for every weapon and never the same model for two weapons", () => {
    expect(Object.keys(VIEWMODEL_ASSET).sort()).toEqual([...IDS].sort());
    const keys = IDS.map((id) => VIEWMODEL_ASSET[id]);
    expect(new Set(keys).size).toBe(IDS.length);
  });

  it("names the weapon in hand from the active weapon definition", () => {
    for (const id of IDS) expect(weaponHudLabel(id)).toBe(WEAPONS[id].name);
    expect(weaponHudLabel("pistol")).toBe("PISTOL");
    expect(weaponHudLabel("mg")).toBe("MACHINE GUN");
  });

  it("gives the pistol its own sidearm model, not the rifle", () => {
    expect(VIEWMODEL_ASSET.pistol).not.toBe(VIEWMODEL_ASSET.mg);
  });
});

import { VIEWMODEL_YAW_OFFSET } from "../../../apps/showcase-bunker-zero/src/weapons-view";

describe("bunker zero viewmodel orientation", () => {
  it("has a yaw offset for every weapon, and turns the sidearm (its muzzle is at +X) around", () => {
    expect(Object.keys(VIEWMODEL_YAW_OFFSET).sort()).toEqual([...IDS].sort());
    expect(VIEWMODEL_YAW_OFFSET.pistol).toBeCloseTo(Math.PI, 6);
    expect(VIEWMODEL_YAW_OFFSET.mg).toBe(0);
  });
});
