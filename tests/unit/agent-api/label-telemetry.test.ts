import { describe, expect, it } from "vitest";
import type { AuraLabelNode } from "../../../packages/engine/src/agent-api/index.js";
import { resolveLabelCollisions, type ProjectedLabel } from "../../../packages/engine/src/agent-api/WorldLabelRenderer.js";
import {
  CSS2D_OUT_OF_SCOPE,
  collectLabelTelemetry,
  labelTelemetryRoleFor,
  summarizeTextBuckets,
  tuneLabelCollision
} from "../../../packages/engine/src/agent-api/LabelTelemetry.js";

function node(label: AuraLabelNode["label"], name?: string): AuraLabelNode {
  return { kind: "label", label, text: name ?? label, ...(name ? { name } : {}) };
}

function projected(id: string, overrides: Partial<ProjectedLabel> = {}): ProjectedLabel {
  return {
    id,
    text: id,
    x: 100,
    y: 100,
    anchorX: 100,
    anchorY: 100,
    visible: true,
    clamped: false,
    behindCamera: false,
    fontSize: 14,
    color: "#fff",
    background: "#000",
    leader: false,
    depth: 0,
    occluded: false,
    occlusionOpacity: 1,
    ...overrides
  };
}

describe("N4 label telemetry", () => {
  it("role tuning changes final placement and reports collision suppression", () => {
    const pair = (role: "tick" | "annotation") => resolveLabelCollisions([
      projected("a", { role, width: 80, height: 20 }),
      projected("b", { role, width: 80, height: 20 })
    ], { viewport: { width: 200, height: 200 } });
    expect(Math.abs(pair("tick")[0]!.y - pair("tick")[1]!.y)).toBe(22);
    expect(Math.abs(pair("annotation")[0]!.y - pair("annotation")[1]!.y)).toBe(24);
    const final = resolveLabelCollisions([
      projected("a", { role: "hud", width: 80, height: 20 }),
      projected("b", { role: "hud", width: 80, height: 20 }),
      projected("c", { visible: false, occluded: true })
    ], { viewport: { width: 200, height: 200 } });
    const telemetry = collectLabelTelemetry([node("hud", "a"), node("hud", "b"), node("anchor", "c")], final);
    expect(telemetry).toMatchObject({ declared: 3, placed: 1, offscreen: 2, suppressed: 1, occludedHidden: 1 });
  });
  it("maps label kinds to HUD / annotation / tick roles", () => {
    expect(labelTelemetryRoleFor("hud")).toBe("hud");
    expect(labelTelemetryRoleFor("axis-tick")).toBe("tick");
    expect(labelTelemetryRoleFor("billboard")).toBe("annotation");
    expect(labelTelemetryRoleFor("anchor")).toBe("annotation");
    expect(labelTelemetryRoleFor("callout")).toBe("annotation");
  });

  it("counts placed vs offscreen from projections, not nodes", () => {
    const nodes = [node("billboard", "hero"), node("hud", "score"), node("axis-tick")];
    const seen = [
      projected("hero"),
      projected("score", { visible: true }),
      projected("axis-tick-3", { visible: false, behindCamera: true })
    ];
    const telemetry = collectLabelTelemetry(nodes, seen);
    expect(telemetry.declared).toBe(3);
    expect(telemetry.placed).toBe(2);
    expect(telemetry.offscreen).toBe(1);
    expect(telemetry.behindCamera).toBe(1);
    expect(telemetry.placesLabels).toBe(true);
    expect(telemetry.byRole.annotation).toMatchObject({ declared: 1, placed: 1, offscreen: 0 });
    expect(telemetry.byRole.hud).toMatchObject({ declared: 1, placed: 1, offscreen: 0 });
    expect(telemetry.byRole.tick).toMatchObject({ declared: 1, placed: 0, offscreen: 1 });
  });

  it("fails the gate when labels are declared but none are placed", () => {
    const nodes = [node("callout", "hotspot")];
    const telemetry = collectLabelTelemetry(nodes, [projected("hotspot", { visible: false })]);
    expect(telemetry.placed).toBe(0);
    expect(telemetry.placesLabels).toBe(false);
  });

  it("passes vacuously with no labels and counts occlusion-dimmed", () => {
    const empty = collectLabelTelemetry([], []);
    expect(empty.placesLabels).toBe(true);
    expect(empty.placed).toBe(0);
    const dimmed = collectLabelTelemetry([node("anchor", "part")], [
      projected("part", { occluded: true, occlusionOpacity: 0.35 })
    ]);
    expect(dimmed.occludedDimmed).toBe(1);
    expect(dimmed.clamped).toBe(0);
  });

  it("treats id mismatches as offscreen, never as placements", () => {
    const telemetry = collectLabelTelemetry([node("billboard", "a")], [projected("unrelated")]);
    expect(telemetry.placed).toBe(0);
    expect(telemetry.offscreen).toBe(1);
    expect(telemetry.placesLabels).toBe(false);
  });

  it("tunes collision avoidance per role", () => {
    expect(tuneLabelCollision("hud").avoidanceEnabled).toBe(false);
    expect(tuneLabelCollision("tick").minGapPx).toBeLessThan(tuneLabelCollision("annotation").minGapPx);
    expect(tuneLabelCollision("annotation").avoidanceEnabled).toBe(true);
  });

  it("keeps the three text buckets separate", () => {
    const buckets = summarizeTextBuckets({ accessibleDom: 2, worldAnchoredPlaced: 3, sdfTexts: 1 });
    expect(buckets.accessibleDom).toBe(2);
    expect(buckets.worldAnchoredPlaced).toBe(3);
    expect(buckets.sdfTexts).toBe(1);
    expect(() => summarizeTextBuckets({ accessibleDom: 0, worldAnchoredPlaced: -1, sdfTexts: 0 })).toThrow();
  });

  it("records CSS2D/CSS3D as explicitly out of scope", () => {
    expect(CSS2D_OUT_OF_SCOPE.decision).toBe("no-css2d-css3d-parity");
    expect([...CSS2D_OUT_OF_SCOPE.renderers]).toEqual(["CSS2DRenderer", "CSS3DRenderer"]);
  });
});
