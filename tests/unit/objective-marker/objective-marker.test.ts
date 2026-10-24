import { describe, expect, it } from "vitest";
import { prefabs } from "../../../packages/engine/src/agent-api/nodes/prefabs/index.js";
import { objectiveMarker, objectiveMarkerPoses } from "../../../packages/engine/src/agent-api/nodes/prefabs/objectiveMarker.js";
import { compassBearing, compassRotationDeg, updateCompass } from "../../../packages/game/src/hud/compass.js";
import { drawCanvasMinimap, type CanvasMinimapContext } from "../../../packages/game/src/hud/canvasMinimap.js";

describe("prefabs.objectiveMarker", () => {
  it("is exposed on the prefabs namespace", () => {
    expect(prefabs.objectiveMarker).toBe(objectiveMarker);
    expect(prefabs.objectiveMarkerPoses).toBe(objectiveMarkerPoses);
  });

  it("builds ring, rim, halo and beam with runtime ids; the arrow is opt-in", () => {
    const nodes = objectiveMarker({ id: "gate", diameter: 66 });
    expect(nodes.map((n) => (n as { runtime?: { id: string } }).runtime?.id)).toEqual(["gate-ring", "gate-rim", "gate-halo", "gate-beam"]);
    const withArrow = objectiveMarker({ id: "gate", arrow: true });
    expect(withArrow.map((n) => (n as { runtime?: { id: string } }).runtime?.id)).toContain("gate-arrow");
  });

  it("keeps the Silt & Signal beacon proportions at diameter 66", () => {
    const [, rim, , beam] = objectiveMarker({ diameter: 66 }) as unknown as { size: number[] }[];
    expect(rim!.size).toEqual([76, 76, 76]);
    expect(beam!.size[0]).toBeCloseTo(5.5, 10);
    expect(beam!.size[1]).toBeCloseTo(360, 10);
  });

  it("poses: hidden without a target, pulsing and centred on the target otherwise", () => {
    const hidden = objectiveMarkerPoses(null, 1, { diameter: 66 });
    expect(hidden.ring!.position).toEqual([0, -400, 0]);
    const live = objectiveMarkerPoses([10, 20, 30], 0.5, { diameter: 66 });
    expect(live.ring!.position).toEqual([10, 20, 30]);
    const pulse = 1 + 0.035 * Math.sin(2.5);
    expect(live.ring!.scale[0]).toBeCloseTo(pulse, 12);
    expect(live.halo!.scale[0]).toBeCloseTo(1 + 0.4 * 0.5, 12);
    expect(live.beam!.position[1]).toBeCloseTo(20 + 170, 9);
    expect(live.arrow).toBeUndefined();
  });
});

describe("compass", () => {
  it("matches the Silt & Signal bearing formula", () => {
    const from = { x: 3, z: -4 };
    const to = { x: 10, z: 7 };
    const yaw = 0.7;
    expect(compassBearing(from, to, yaw)).toBe(Math.atan2(-(to.x - from.x), -(to.z - from.z)) - yaw);
    const needle = { style: { transform: "" } };
    const b = updateCompass(needle, from, to, yaw);
    expect(needle.style.transform).toBe(`rotate(${(-b * 180) / Math.PI}deg)`);
    expect(compassRotationDeg(Math.PI)).toBeCloseTo(-180, 12);
  });
  it("points up when the target is dead ahead", () => {
    expect(compassBearing({ x: 0, z: 0 }, { x: 0, z: -5 }, 0)).toBeCloseTo(0, 12);
  });
});

function recorder(): { ctx: CanvasMinimapContext; calls: string[] } {
  const calls: string[] = [];
  const log = (name: string) => (...a: number[]) => void calls.push(`${name}(${a.map((v) => Number(v.toFixed(4))).join(",")})`);
  const ctx = {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 0,
    clearRect: log("clearRect"),
    fillRect: log("fillRect"),
    beginPath: log("beginPath"),
    moveTo: log("moveTo"),
    lineTo: log("lineTo"),
    closePath: log("closePath"),
    fill: log("fill"),
    stroke: log("stroke"),
    save: log("save"),
    restore: log("restore"),
    translate: log("translate"),
    rotate: log("rotate"),
    roundRect: log("roundRect")
  } satisfies CanvasMinimapContext;
  return { ctx, calls };
}

describe("drawCanvasMinimap", () => {
  it("reproduces the Drift & Deliver minimap call sequence", () => {
    const e = 240;
    const n = (v: number): number => (v / 1020 + 0.5) * e;
    const { ctx, calls } = recorder();
    drawCanvasMinimap(ctx, {
      size: e,
      bounds: [-510, -510, 510, 510],
      background: { fill: "rgba(38,30,26,.82)", radius: 18 },
      layers: [
        { kind: "lines", stroke: "rgba(255,226,175,.5)", width: 2.5, segments: [[30, -450, 30, 506]] },
        { kind: "rect", rect: [-510, 506, 510, 510], fill: "rgba(70,160,205,.55)" },
        { kind: "points", points: [[100, 200]], fill: "#ffd15c", size: 2.8 }
      ],
      marker: { x: 50, z: -60, heading: 0.4, fill: "#ff9a2e" }
    });
    expect(calls.slice(0, 4)).toEqual(["clearRect(0,0,240,240)", "beginPath()", "roundRect(0,0,240,240,18)", "fill()"]);
    expect(calls).toContain(`moveTo(${Number(n(30).toFixed(4))},${Number(n(-450).toFixed(4))})`);
    expect(calls).toContain(`fillRect(0,${Number(n(506).toFixed(4))},240,${Number((e - n(506)).toFixed(4))})`);
    expect(calls).toContain(`fillRect(${Number((n(100) - 1.4).toFixed(4))},${Number((n(200) - 1.4).toFixed(4))},2.8,2.8)`);
    expect(calls).toContain(`translate(${Number(n(50).toFixed(4))},${Number(n(-60).toFixed(4))})`);
    expect(calls).toContain("rotate(-0.4)");
    expect(calls.slice(-2)).toEqual(["fill()", "restore()"]);
  });
});
