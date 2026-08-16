import { describe, expect, it } from "vitest";
import {
  createSmartCityControlSnapshot,
  createSmartCityRouteEvidence,
  SMART_CITY_AUTHORED_CORE_KEEPOUT_RADIUS,
  SMART_CITY_OVERLAY_MAX_HEIGHT,
  SMART_CITY_OVERLAY_MAX_WIDTH,
  smartCityColumnsForLevel
} from "../../../apps/advanced-examples-gallery/src/smartCityEvidence";
import { applyGalleryRouteCameraPolicy } from "../../../apps/advanced-examples-gallery/src/galleryRoutePolicies";
import { DEMOS } from "../../../apps/advanced-examples-gallery/src/metadata";

function cameraInput(controls: Record<string, string | boolean>, cameraPreset = "hero") {
  return {
    demoId: "smart-city" as const,
    cameraPreset,
    time: 10,
    frameCount: 0,
    controls,
    authored: { status: "ready", drawItems: 12 } as never,
    sceneBounds: { min: [-2, -1, -2] as const, max: [2, 3, 2] as const },
    yawRadians: 0.4,
    pitchRadians: -0.2,
    paddingRatio: 0.1
  };
}

describe("smart city overlay and control bindings", () => {
  it("keeps default hologram pillars thinner than the authored city keepout", () => {
    const snapshot = createSmartCityControlSnapshot({
      time: 1.5,
      level: "medium",
      selectedDistrict: "all",
      traffic: true,
      flythrough: false,
      pointer: { x: 0.5, y: 0.5 }
    });
    expect(snapshot.authoredCoreKeepoutRadius).toBe(SMART_CITY_AUTHORED_CORE_KEEPOUT_RADIUS);
    expect(snapshot.maxOverlayWidth).toBeGreaterThan(0);
    expect(snapshot.maxOverlayWidth).toBeLessThanOrEqual(SMART_CITY_OVERLAY_MAX_WIDTH);
    expect(snapshot.maxOverlayHeight).toBeGreaterThan(0);
    expect(snapshot.maxOverlayHeight).toBeLessThanOrEqual(SMART_CITY_OVERLAY_MAX_HEIGHT);
    expect(snapshot.towerInstances).toBeGreaterThan(8);
    expect(snapshot.trafficInstances).toBeGreaterThan(0);
  });

  it("changes actual instance counts when object-count, traffic, and district change", () => {
    const base = {
      time: 2,
      flythrough: false,
      pointer: { x: 0.5, y: 0.5 }
    } as const;
    const low = createSmartCityControlSnapshot({
      ...base,
      level: "low",
      selectedDistrict: "all",
      traffic: true
    });
    const extreme = createSmartCityControlSnapshot({
      ...base,
      level: "extreme",
      selectedDistrict: "all",
      traffic: true
    });
    const noTraffic = createSmartCityControlSnapshot({
      ...base,
      level: "medium",
      selectedDistrict: "all",
      traffic: false
    });
    const harbor = createSmartCityControlSnapshot({
      ...base,
      level: "medium",
      selectedDistrict: "harbor",
      traffic: true
    });
    expect(smartCityColumnsForLevel("low")).toBeLessThan(smartCityColumnsForLevel("extreme"));
    expect(extreme.towerInstances).toBeGreaterThan(low.towerInstances);
    expect(noTraffic.trafficInstances).toBe(0);
    expect(harbor.trafficInstances).toBeGreaterThan(0);
    expect(harbor.towerInstances).toBeGreaterThan(0);
    expect(harbor.towerInstances).toBeLessThan(extreme.towerInstances);
    expect(harbor.selectedDistrict).toBe("harbor");
  });

  it("starts and stops flythrough camera motion from the shipped camera policy", () => {
    const parked = applyGalleryRouteCameraPolicy(cameraInput({ fly: false, district: "all" }));
    const flying = applyGalleryRouteCameraPolicy(cameraInput({ fly: true, district: "all" }));
    expect(flying.yawRadians).not.toBeCloseTo(parked.yawRadians, 6);
    expect(flying.pitchRadians).not.toBeCloseTo(parked.pitchRadians, 6);
  });

  it("changes hero framing when the district selector changes", () => {
    const all = applyGalleryRouteCameraPolicy(cameraInput({ fly: false, district: "all" }));
    const harbor = applyGalleryRouteCameraPolicy(cameraInput({ fly: false, district: "harbor" }));
    const north = applyGalleryRouteCameraPolicy(cameraInput({ fly: false, district: "north" }));
    expect(harbor.yawRadians).not.toBeCloseTo(all.yawRadians, 6);
    expect(north.yawRadians).not.toBeCloseTo(all.yawRadians, 6);
    expect(north.yawRadians).not.toBeCloseTo(harbor.yawRadians, 6);
  });

  it("exposes object-count, traffic, debug, flythrough, and district controls on the public scene", () => {
    const city = DEMOS.find((demo) => demo.id === "smart-city");
    expect(city).toBeDefined();
    const keys = city!.controls.map((control) => control.key);
    expect(keys).toEqual(["count", "traffic", "wire", "fly", "district"]);
    expect(city!.controls.find((control) => control.key === "count")?.value).toBe("high");
    expect(city!.subtitle).toMatch(/roads.*traffic.*sensor/i);
    expect(createSmartCityRouteEvidence({
      time: 0,
      level: String(city!.controls.find((control) => control.key === "count")?.value ?? "medium"),
      selectedDistrict: String(city!.controls.find((control) => control.key === "district")?.value ?? "all"),
      traffic: Boolean(city!.controls.find((control) => control.key === "traffic")?.value),
      flythrough: Boolean(city!.controls.find((control) => control.key === "fly")?.value),
      pointer: { x: 0.5, y: 0.5 }
    }).towerInstances).toBeGreaterThan(0);
  });

  it("makes each instanced workload category identifiable in the shipped scene", () => {
    const evidence = createSmartCityRouteEvidence({
      time: 2,
      level: "high",
      selectedDistrict: "all",
      traffic: true,
      flythrough: false,
      pointer: { x: 0.5, y: 0.5 }
    });
    expect(evidence.labels).toEqual(expect.arrayContaining([
      "Yellow = street traffic",
      "Orange = yard cargo",
      "Cyan = intersection sensors"
    ]));
    expect(evidence.instanceBatches.find((batch) => batch.label === "traffic vehicles")?.geometry).toBe("capsule");
    expect(evidence.instanceBatches.find((batch) => batch.label === "traffic vehicles")?.material).toBe("traffic");
    expect(evidence.instanceBatches.find((batch) => batch.label === "logistics cargo pallets")?.material).toBe("logistics");
    expect(evidence.instanceBatches.find((batch) => batch.label === "district sensor pulse")?.material).toBe("sensor");
    expect(evidence.trafficInstances).toBeGreaterThan(0);
    expect(evidence.logisticsInstances).toBeGreaterThan(0);
    expect(evidence.sensorInstances).toBeGreaterThan(0);
  });
});
