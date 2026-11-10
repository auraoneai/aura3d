import { describe, expect, it } from "vitest";
import { BLEACHER_STANDS } from "../../../apps/showcase-aura-hoops-3d/src/courtRigs";
import { LIVE_FAN_IDLE, LIVE_FAN_IDS, LIVE_FAN_SLOTS, crowdLayout, liveFanTransforms } from "../../../apps/showcase-aura-hoops-3d/src/crowd";

/** Meshy-07: the seated live fans take front-row slots out of the standing crowd and sit at the riser, facing the court. */
describe("aura-hoops live fans", () => {
  it("places six seated fans, one id and idle clip each", () => {
    expect(LIVE_FAN_IDS).toHaveLength(LIVE_FAN_SLOTS.length);
    expect(LIVE_FAN_IDLE).toHaveLength(LIVE_FAN_SLOTS.length);
    expect(LIVE_FAN_SLOTS.length).toBeLessThanOrEqual(8);
    for (const t of liveFanTransforms()) {
      expect(t.position[1]).toBeGreaterThanOrEqual(0);
      expect(t.position[1]).toBeLessThan(0.1);
    }
  });

  it("leaves no standing fan in a live fan's seat", () => {
    const layout = crowdLayout("#c2662d", 1234);
    const standing = [...layout.fanB, ...layout.fanC];
    for (const [i, live] of liveFanTransforms().entries()) {
      const [sx, sz, yaw] = BLEACHER_STANDS[LIVE_FAN_SLOTS[i]!.stand]!;
      expect(live.rotation[1]).toBe(yaw);
      // live fans sit court-side of their stand's centre line
      expect(Math.hypot(live.position[0] - sx, live.position[2] - sz)).toBeLessThan(5);
      const near = standing.filter((f) => f.position[1] < 0.6 && Math.hypot(f.position[0] - live.position[0], f.position[2] - live.position[2]) < 0.5);
      expect(near).toEqual([]);
    }
  });
});
