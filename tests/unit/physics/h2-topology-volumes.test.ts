import { describe, expect, it } from "vitest";
import {
  checkpointVolume,
  hazardZoneVolume,
  overlapsTopology,
  platformSurfaceVolume,
  resolveTopologyVolume,
  spawnZoneVolume,
  topologyPenetration,
  topologyVolume,
  topologyVolumeDebugDescriptors,
  trackSegmentVolume,
  triggerZoneVolume
} from "@aura3d/physics";

/**
 * H2 topology helpers generalized beyond the current routes.
 *
 * One validated volume core for racing checkpoints/track segments, platformer
 * surfaces/hazards/spawns, and genre-neutral trigger zones — same half-extent
 * validation and AABB math as the combat volumes, so no route invents its own
 * bounds check. These are authoring data: overlap tests apply no forces; every
 * force in the game still comes from the real simulation.
 */
describe("H2 generalized topology volumes", () => {
  it("builds all six kinds with defaults", () => {
    const volumes = [
      checkpointVolume({ halfExtents: [2, 2, 0.5], progress: 0.25 }),
      trackSegmentVolume({ halfExtents: [4, 2, 10], progress: 0.5 }),
      platformSurfaceVolume({ halfExtents: [3, 0.5, 1] }),
      hazardZoneVolume({ halfExtents: [1, 1, 1] }),
      spawnZoneVolume({ halfExtents: [1, 2, 1] }),
      triggerZoneVolume({ halfExtents: [2, 2, 2] })
    ];
    expect(volumes.map((volume) => volume.kind)).toEqual([
      "checkpoint",
      "track-segment",
      "platform-surface",
      "hazard-zone",
      "spawn-zone",
      "trigger-zone"
    ]);
    for (const volume of volumes) {
      expect(volume.enabled).toBe(true);
      expect(volume.tags).toEqual([]);
    }
    expect(volumes[0]!.progress).toBe(0.25);
  });

  it("rejects non-positive half-extents and out-of-range progress loudly", () => {
    expect(() => topologyVolume("checkpoint", { halfExtents: [0, 1, 1] })).toThrow(/halfExtents/);
    expect(() => topologyVolume("checkpoint", { halfExtents: [1, 1, 1], progress: 1.5 })).toThrow(/progress/);
    expect(() => topologyVolume("checkpoint", { halfExtents: [1, 1, 1], progress: Number.NaN })).toThrow(/progress/);
  });

  it("resolves centers from origin + offset and detects overlap", () => {
    const checkpoint = resolveTopologyVolume(
      checkpointVolume({ id: "cp-1", halfExtents: [2, 2, 0.5] }),
      [10, 0, 0]
    );
    expect(checkpoint.center).toEqual([10, 0, 0]);
    const racer = resolveTopologyVolume(
      triggerZoneVolume({ id: "racer", halfExtents: [0.5, 0.5, 0.5] }),
      [10, 0, 0.2]
    );
    expect(overlapsTopology(checkpoint, racer)).toBe(true);
    const far = resolveTopologyVolume(triggerZoneVolume({ id: "far", halfExtents: [0.5, 0.5, 0.5] }), [50, 0, 0]);
    expect(overlapsTopology(checkpoint, far)).toBe(false);
    expect(topologyPenetration(checkpoint, far)).toBeNull();
    const penetration = topologyPenetration(checkpoint, racer);
    expect(penetration).not.toBeNull();
    expect(penetration!.depth).toBeGreaterThan(0);
  });

  it("disabled volumes never overlap and are excluded from debug descriptors", () => {
    const off = resolveTopologyVolume(
      hazardZoneVolume({ id: "off", halfExtents: [5, 5, 5], enabled: false }),
      [0, 0, 0]
    );
    const on = resolveTopologyVolume(triggerZoneVolume({ id: "on", halfExtents: [5, 5, 5] }), [0, 0, 0]);
    expect(overlapsTopology(off, on)).toBe(false);
    expect(topologyPenetration(off, on)).toBeNull();
    const descriptors = topologyVolumeDebugDescriptors(
      [
        hazardZoneVolume({ id: "off", halfExtents: [5, 5, 5], enabled: false }),
        spawnZoneVolume({ id: "spawn-1", halfExtents: [1, 2, 1] })
      ],
      [0, 0, 0]
    );
    expect(descriptors).toHaveLength(1);
    expect(descriptors[0]!.label).toBe("spawn-zone:spawn-1");
    expect(descriptors[0]!.color).toBe("#facc15");
  });

  it("supports a full racing lap + platformer level from the same core", () => {
    const lap = [0, 0.25, 0.5, 0.75].map((progress, index) =>
      resolveTopologyVolume(
        checkpointVolume({ id: `cp-${index}`, halfExtents: [3, 2, 1], progress }),
        [index * 20, 0, 0]
      )
    );
    const racerAtSecond = resolveTopologyVolume(
      triggerZoneVolume({ id: "racer", halfExtents: [1, 1, 1] }),
      [20, 0, 0]
    );
    const hit = lap.filter((checkpoint) => overlapsTopology(checkpoint, racerAtSecond));
    expect(hit.map((checkpoint) => checkpoint.id)).toEqual(["cp-1"]);

    const level = resolveTopologyVolume(
      platformSurfaceVolume({ id: "floor-1", halfExtents: [10, 0.5, 2] }),
      [0, 0, 0]
    );
    const player = resolveTopologyVolume(triggerZoneVolume({ id: "player", halfExtents: [0.4, 0.9, 0.4] }), [0, 1.2, 0]);
    expect(overlapsTopology(level, player)).toBe(true);
  });
});
