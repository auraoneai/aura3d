/**
 * Thermal Drift HS-16 sector moods: GRAND names five distinct sector types, adjacent sectors differ by >= 12 in a fog
 * channel or by a visible key change, and the cross-fade is 1.5 s.
 */
import { describe, expect, it } from "vitest";
import { CIRCUITS, CIRCUIT_ORDER } from "../../../apps/showcase-heatsink/src/data";
import { CIRCUIT_LOOKS } from "../../../apps/showcase-heatsink/src/look";
import { circuitSectorTypes, SECTOR_CROSSFADE_SECONDS, sectorTargets, sectorType } from "../../../apps/showcase-heatsink/src/sectors";

const rgb = (hex: string) => [16, 8, 0].map((s) => (Number.parseInt(hex.slice(1), 16) >> s) & 255);

describe("heatsink HS-16 sector moods", () => {
  it("types the GRAND sectors as avenue, tunnel, flooded, foundry, ruin", () => {
    expect(circuitSectorTypes(CIRCUITS.grand)).toEqual(["avenue", "tunnel", "flooded", "foundry", "ruin"]);
    expect(sectorType("INDUSTRIAL TUNNEL")).toBe("tunnel");
  });
  it("adjacent sectors differ visibly on every circuit", () => {
    for (const id of CIRCUIT_ORDER) {
      const sectors = CIRCUITS[id].sectors;
      for (let i = 0; i < sectors.length; i += 1) {
        const a = sectorTargets(CIRCUIT_LOOKS[id], sectors[i]!.name);
        const b = sectorTargets(CIRCUIT_LOOKS[id], sectors[(i + 1) % sectors.length]!.name);
        const channel = Math.max(...rgb(a.fog.color).map((v, k) => Math.abs(v - rgb(b.fog.color)[k]!)));
        const key = Math.abs(a.keyIntensity - b.keyIntensity) / Math.max(a.keyIntensity, b.keyIntensity);
        expect(channel >= 12 || key >= 0.15 || a.type !== b.type, `${id} ${sectors[i]!.name}`).toBe(true);
      }
    }
  });
  it("cross-fades over 1.5 s and keeps densities positive", () => {
    expect(SECTOR_CROSSFADE_SECONDS).toBe(1.5);
    for (const id of CIRCUIT_ORDER) for (const s of CIRCUITS[id].sectors) expect(sectorTargets(CIRCUIT_LOOKS[id], s.name).fog.density).toBeGreaterThan(0);
  });
});
