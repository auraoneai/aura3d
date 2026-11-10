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

import { VIEWMODEL_YAW_OFFSET, formatTacticalFeed, viewmodelFraming } from "../../../apps/showcase-bunker-zero/src/weapons-view";

describe("bunker zero viewmodel orientation", () => {
  it("has a yaw offset for every weapon, and turns the sidearm and the rifle (their muzzles are at +X) around", () => {
    expect(Object.keys(VIEWMODEL_YAW_OFFSET).sort()).toEqual([...IDS].sort());
    expect(VIEWMODEL_YAW_OFFSET.pistol).toBeCloseTo(Math.PI, 6);
    expect(VIEWMODEL_YAW_OFFSET.mg).toBeCloseTo(Math.PI, 6);
  });

  it("frames portrait 390x844 inside screen bounds (Hor+) while preserving desktop 1280x720 weapon placement", () => {
    const portrait = viewmodelFraming(390 / 844, 66);
    expect(portrait.fov).toBe(82);
    const portraitTanHalfX = Math.tan((portrait.fov * Math.PI) / 360) * (390 / 844);
    const portraitNdcX = portrait.side / (portrait.forward * portraitTanHalfX);
    expect(portraitNdcX).toBeLessThan(0.65);

    const desktop = viewmodelFraming(1280 / 720, 66);
    expect(desktop.fov).toBe(66);
    expect(desktop.side).toBeCloseTo(0.26, 6);
    expect(desktop.forward).toBeCloseTo(0.62, 6);
    expect(desktop.drop).toBeCloseTo(0.3, 6);
  });

  it("humanizes internal pickup/kill feed tokens into tactical visor callouts", () => {
    expect(formatTacticalFeed("health collected")).toBe("Field Medkit +25 HP");
    expect(formatTacticalFeed("treasure-big collected")).toBe("Gold Bullion +500");
    expect(formatTacticalFeed("kill confirmed — guard")).toBe("Patrol Guard Neutralized");
    expect(formatTacticalFeed("push-wall revealed a secret")).toBe("Secret Bulkhead Breached");
  });
});
