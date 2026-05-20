import { describe, expect, it } from "vitest";
import {
  ControlVector3,
  createDistrictPickingAnnotations,
  createImportedGlbHotspotAnnotations,
  createPickingAnnotationRoot,
  createRobotPickingAnnotations,
  pickAnnotation,
  pickScreenSpaceAnnotation,
  type ScreenPickingAnnotation
} from "../../../packages/controls/src";

describe("Picking annotation adapters", () => {
  it("wraps imported GLB hotspot metadata into reusable world-space pick targets", () => {
    const annotations = createImportedGlbHotspotAnnotations("product-configurator-studio-blender", [
      {
        nodeName: "Hotspot_Lens",
        focusId: "lens",
        label: "Lens assembly",
        position: [0, 0, -3],
        radius: 0.16,
        payload: { materialSlot: "glass" }
      },
      {
        nodeName: "Hotspot_Battery",
        focusId: "battery",
        label: "Battery bay",
        position: [0.8, 0, -2.8],
        radius: 0.14
      }
    ], "product-configurator");
    const root = createPickingAnnotationRoot("product hotspots", annotations);

    const report = pickAnnotation(root, new ControlVector3(), new ControlVector3(0, 0, -1));

    expect(report.annotation?.id).toBe("product-configurator-studio-blender:lens");
    expect(report.annotation?.targetId).toBe("lens");
    expect(report.annotation?.source).toBe("imported-gltf");
    expect(report.hit?.metadata?.group).toBe("product-configurator-studio-blender");
    expect(report.diagnostics.skippedMissedRadius).toBe(1);
  });

  it("supports smart-city district and building proxy selection without per-building scene objects", () => {
    const annotations = createDistrictPickingAnnotations([
      {
        id: "core",
        label: "Core district",
        center: [0, 0, -6],
        radius: 2.2,
        routeId: "smart-city",
        buildings: [
          {
            id: "core-tower-17",
            label: "Core tower 17",
            position: [0.05, 0, -4],
            radius: 0.22
          }
        ]
      },
      {
        id: "harbor",
        label: "Harbor logistics district",
        center: [2.8, 0, -5.8],
        radius: 1.4,
        routeId: "smart-city"
      }
    ]);
    const root = createPickingAnnotationRoot("smart-city district proxies", annotations);

    const buildingReport = pickAnnotation(root, new ControlVector3(), new ControlVector3(0, 0, -1), {
      hitPolicy: "priority"
    });
    const districtReport = pickAnnotation(root, new ControlVector3(0.9, 0, 0), new ControlVector3(0, 0, -1), {
      hitPolicy: "priority"
    });

    expect(buildingReport.annotation?.kind).toBe("building");
    expect(buildingReport.annotation?.id).toBe("core-tower-17");
    expect(buildingReport.annotation?.group).toBe("core");
    expect(districtReport.annotation?.kind).toBe("district");
    expect(districtReport.annotation?.id).toBe("core");
  });

  it("creates digital-twin robot/entity selectors with priority over broad labels", () => {
    const robotAnnotations = createRobotPickingAnnotations([
      {
        id: "amr-07",
        label: "AMR 07",
        position: [0, 0, -3],
        radius: 0.32,
        routeId: "digital-twin",
        payload: { fleet: "amr" }
      }
    ]);
    const labelAnnotation = {
      id: "robot-cell-label",
      label: "Robot cell label",
      kind: "label" as const,
      position: [0, 0, -3] as const,
      radius: 0.32,
      priority: 5,
      routeId: "digital-twin",
      source: "procedural" as const
    };
    const root = createPickingAnnotationRoot("digital-twin entities", [labelAnnotation, ...robotAnnotations]);

    const report = pickAnnotation(root, new ControlVector3(), new ControlVector3(0, 0, -1), {
      hitPolicy: "priority"
    });

    expect(report.annotation?.kind).toBe("robot");
    expect(report.annotation?.id).toBe("amr-07");
    expect(report.hit?.metadata?.payload).toEqual({ fleet: "amr" });
  });

  it("provides screen-space annotation picking for projected labels and GLB marker overlays", () => {
    const annotations: readonly ScreenPickingAnnotation[] = [
      {
        id: "hotspot-lens",
        label: "Lens marker",
        kind: "hotspot",
        x: 0.52,
        y: 0.45,
        radius: 0.04,
        priority: 50,
        source: "screen-space",
        targetId: "lens"
      },
      {
        id: "product-label",
        label: "Product label",
        kind: "label",
        x: 0.5,
        y: 0.46,
        radius: 0.08,
        priority: 10,
        source: "screen-space"
      }
    ];

    const nearest = pickScreenSpaceAnnotation({ x: 0.51, y: 0.45 }, annotations);
    const priority = pickScreenSpaceAnnotation({ x: 0.51, y: 0.45 }, annotations, { hitPolicy: "priority" });

    expect(nearest.hit?.annotation.id).toBe("hotspot-lens");
    expect(priority.hit?.annotation.targetId).toBe("lens");
    expect(priority.diagnostics.hitCount).toBe(2);
    expect(pickScreenSpaceAnnotation({ x: 0.9, y: 0.9 }, annotations).hit).toBeNull();
  });
});
