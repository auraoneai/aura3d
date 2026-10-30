import { describe, expect, it } from "vitest";
import { BEACON, beaconSlots, buildBeacons } from "../../../examples/heatsink-port/art/beacons";
import { buildWorld } from "../../../examples/heatsink-port/world";
import { Track } from "../../../examples/heatsink-port/track";

describe("heatsink-port IC-24 lane beacons", () => {
  const track = new Track();
  it("places a pair every 44 m and merges them into one mesh", () => {
    const slots = beaconSlots(track);
    expect(slots.length).toBe(2 * Math.ceil((track.length - BEACON.spacing / 2) / BEACON.spacing));
    const m = buildBeacons(track);
    expect(m.positions.length / 3).toBe(slots.length * 16);
    expect(m.attrs.beaconColor!.length).toBe(m.positions.length);
    expect(m.positions.every(Number.isFinite)).toBe(true);
  });
  it("twilight mounts one beacons node (+1 draw); original none", () => {
    const names = (q: string) => (buildWorld(track, "high", q).scene.toJSON() as unknown as { nodes: { name?: string }[] }).nodes.map((n) => n.name);
    expect(names("").filter((n) => n === "beacons")).toHaveLength(1);
    expect(names("?look=original")).not.toContain("beacons");
  });
});
