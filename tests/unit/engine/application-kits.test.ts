import { describe, expect, it } from "vitest";
import {
  createArchitectureKit,
  createCinematicKit,
  createDigitalTwinKit,
  createProductConfiguratorKit,
  createSmartCityKit
} from "../../../packages/engine/src/agent-api/ApplicationKits";
import { placedBounds } from "../../../packages/engine/src/agent-api/SpatialAnchoring";

/**
 * Phase 12: reusable application kits.
 *
 * The reusable *systems* fixed the defects. They did not stop each route from being 800 to
 * 1,400 lines, because every one still assembles selection state, overlay composition,
 * camera presets and annotation placement by hand, and each does it differently.
 *
 * These tests hold the kits to the property that makes them worth having: a route declares
 * what it is configuring and the kit owns the rest, including the invariants a gate checks.
 * They also pin each kit's honest limits -- a kit that quietly faked measurement or
 * section views would be worse than one that declares it does not own them.
 */

const PRODUCT = placedBounds({ position: [0, 0, 0], size: [1.4, 0.8, 0.9], floorY: 0 });

describe("product configurator kit", () => {
  const kit = () => createProductConfiguratorKit({
    bounds: PRODUCT,
    parts: [
      { id: "earcups", label: "Earcups", u: 0.5, v: 0.5, w: 0.5, extent: [0.8, 0.5, 0.7], price: 40 },
      { id: "headband", label: "Headband", u: 0.5, v: 0.88, w: 0.4, extent: [0.7, 0.2, 0.3], price: 25 }
    ],
    variants: [
      { id: "graphite", label: "Graphite", color: "#252627", accent: "#cdbd99", price: 0 },
      { id: "copper", label: "Copper", color: "#a85634", accent: "#f2c06d", price: 60 }
    ],
    finishes: [{ id: "satin", label: "Satin", price: 0 }, { id: "gloss", label: "Gloss", price: 30 }],
    cameraPresets: [{ id: "hero", camera: { mode: "perspective", position: [1, 1, 2], target: [0, 0.4, 0], fov: 32 } as never }],
    basePrice: 200
  });

  it("owns selection state so a route does not track it", () => {
    const configurator = kit();
    expect(configurator.frame().state.partId).toBeUndefined();
    expect(configurator.selectPart("earcups").state.partId).toBe("earcups");
    // Selecting the same part again deselects, which is what a toggle control expects.
    expect(configurator.selectPart("earcups").state.partId).toBeUndefined();
  });

  it("produces correct focus feedback without the route building geometry", () => {
    const frame = kit().selectPart("earcups");
    expect(frame.nodes.length).toBeGreaterThan(0);
    expect(frame.focus.invariants.passes).toBe(true);
    expect(frame.spatialInvariants.passes).toBe(true);
  });

  it("binds price from variant, finish and part contributions", () => {
    const configurator = kit();
    expect(configurator.frame().price).toBe(200);
    expect(configurator.selectVariant("copper").price).toBe(260);
    expect(configurator.selectFinish("gloss").price).toBe(290);
    expect(configurator.selectPart("earcups").price).toBe(330);
  });

  it("derives exploded placements from each part's own region rather than literals", () => {
    const configurator = kit();
    expect(configurator.frame().explodedPlacements).toHaveLength(0);
    const exploded = configurator.toggleExploded();
    expect(exploded.explodedPlacements).toHaveLength(2);
    // The headband sits above the earcups, so its exploded position must be higher.
    const headband = exploded.explodedPlacements.find((entry) => entry.partId === "headband")!;
    const earcups = exploded.explodedPlacements.find((entry) => entry.partId === "earcups")!;
    expect(headband.position[1]).toBeGreaterThan(earcups.position[1]);
    expect(exploded.spatialInvariants.passes).toBe(true);
  });

  it("prefers an explicit camera preset over part framing", () => {
    const configurator = kit();
    const framed = configurator.selectPart("earcups");
    expect(framed.camera).toBeDefined();
    const preset = configurator.selectCameraPreset("hero");
    expect(preset.camera).toEqual({ mode: "perspective", position: [1, 1, 2], target: [0, 0.4, 0], fov: 32 });
  });

  it("reset restores the initial state", () => {
    const configurator = kit();
    configurator.selectVariant("copper");
    configurator.selectPart("headband");
    configurator.toggleExploded();
    const reset = configurator.reset();
    expect(reset.state).toEqual({ variantId: "graphite", finishId: "satin", partId: undefined, exploded: false, cameraPresetId: "hero" });
  });

  it("reports an accessibility label describing the current selection", () => {
    expect(kit().selectPart("earcups").accessibilityLabel).toContain("Earcups selected");
    expect(kit().frame().accessibilityLabel).toContain("no part selected");
  });

  it("declares what it does not own rather than faking it", () => {
    expect(kit().capabilities.supported).toContain("exploded view");
    expect(kit().capabilities.unsupported.map((entry) => entry.capability)).toContain("material authoring");
  });
});

describe("digital twin kit", () => {
  const bounds = placedBounds({ position: [0, 0, 0], size: [1.3, 0.7, 0.8], floorY: 0 });
  const kit = () => createDigitalTwinKit({
    bounds,
    equipment: [
      { id: "assembly", label: "Assembly", u: 0.3, v: 0.2, w: 0.45, extent: [0.26, 0.1, 0.3], sensors: { load: 56, temperature: 31.5 } },
      { id: "packaging", label: "Packaging", u: 0.7, v: 0.2, w: 0.7, extent: [0.24, 0.1, 0.26], sensors: { load: 64 } }
    ],
    flowRegion: { id: "belt", u: 0.45, v: 0.16, w: 0.85, extent: [0.6, 0.05, 0.06] },
    markerCount: 4
  });

  it("anchors equipment, markers and the alarm beacon to the workcell", () => {
    const frame = kit().frame();
    expect(frame.markerPlacements).toHaveLength(4);
    expect(frame.spatialInvariants.passes).toBe(true);
    // The beacon sits outside the workcell but within reach of it.
    const beaconCheck = frame.spatialInvariants.checks.find((check) => check.id === "alarm beacon");
    expect(beaconCheck?.passes).toBe(true);
  });

  it("frames the selected equipment only when focus is engaged", () => {
    const twin = kit();
    expect(twin.frame().camera).toBeUndefined();
    const focused = twin.toggleFocus();
    expect(focused.camera).toBeDefined();
    expect(twin.toggleFocus().camera).toBeUndefined();
  });

  it("raises and clears alarms, switching mode on a critical alarm", () => {
    const twin = kit();
    const raised = twin.raiseAlarm({ equipmentId: "assembly", severity: "critical", message: "overheat" });
    expect(raised.alarms).toHaveLength(1);
    expect(raised.mode).toBe("incident");
    const cleared = twin.clearAlarms();
    expect(cleared.alarms).toHaveLength(0);
    expect(cleared.mode).toBe("normal");
  });

  it("advances a deterministic state-simulation timeline", () => {
    const twin = kit();
    const first = twin.frame().sensorReadout["assembly.load"];
    twin.advanceTimeline();
    const second = twin.frame().sensorReadout["assembly.load"];
    expect(second).not.toBe(first);
    // Deterministic: a second kit advanced the same number of steps agrees.
    const other = kit();
    other.advanceTimeline();
    expect(other.frame().sensorReadout["assembly.load"]).toBe(second);
  });

  it("wraps the timeline and resets cleanly", () => {
    const twin = kit();
    for (let step = 0; step < 8; step += 1) twin.advanceTimeline();
    expect(twin.frame().timeline.step).toBe(0);
    twin.raiseAlarm({ equipmentId: "assembly", severity: "warning", message: "drift" });
    expect(twin.reset().alarms).toHaveLength(0);
  });

  it("declares that live facility data is out of scope", () => {
    expect(kit().capabilities.unsupported.map((entry) => entry.capability)).toContain("live facility data");
  });
});

describe("architecture kit", () => {
  const bounds = placedBounds({ position: [0, 0, 0], size: [8, 6, 8], floorY: 0 });
  const kit = () => createArchitectureKit({
    bounds,
    spaces: [
      { id: "lobby", label: "Lobby", floor: 0, u: 0.3, v: 0.12, w: 0.4, extent: [0.3, 0.2, 0.3] },
      { id: "gallery", label: "Gallery", floor: 1, u: 0.6, v: 0.45, w: 0.5, extent: [0.3, 0.2, 0.3] },
      { id: "terrace", label: "Terrace", floor: 2, u: 0.5, v: 0.8, w: 0.6, extent: [0.4, 0.15, 0.4] }
    ],
    moods: [
      { id: "dawn", label: "Dawn", sunElevation: 12, sunAzimuth: 95 },
      { id: "noon", label: "Noon", sunElevation: 78, sunAzimuth: 180 }
    ],
    materialVariants: [{ id: "stone", label: "Stone" }, { id: "timber", label: "Timber" }]
  });

  it("filters visible spaces by focused floor", () => {
    const architecture = kit();
    expect(architecture.frame().visibleSpaceIds).toHaveLength(3);
    expect(architecture.focusFloor(1).visibleSpaceIds).toEqual(["gallery"]);
    expect(architecture.focusFloor(undefined).visibleSpaceIds).toHaveLength(3);
  });

  it("focusing a room also focuses its floor, so the two cannot disagree", () => {
    const frame = kit().focusSpace("terrace");
    expect(frame.spaceId).toBe("terrace");
    expect(frame.floor).toBe(2);
    expect(frame.camera).toBeDefined();
  });

  it("derives sun direction from mood angles rather than a per-mood vector", () => {
    const architecture = kit();
    const dawn = architecture.setMood("dawn").sunDirection;
    const noon = architecture.setMood("noon").sunDirection;
    // A higher sun elevation must produce a higher Y component.
    expect(noon[1]).toBeGreaterThan(dawn[1]);
    // Unit length, so a caller can use it as a light direction directly.
    expect(Math.hypot(noon[0], noon[1], noon[2])).toBeCloseTo(1, 6);
  });

  it("keeps every space inside the building bounds", () => {
    expect(kit().frame().spatialInvariants.passes).toBe(true);
  });

  it("declares measurement and section views as unsupported rather than faking them", () => {
    const unsupported = kit().capabilities.unsupported.map((entry) => entry.capability);
    expect(unsupported).toContain("measurement");
    expect(unsupported).toContain("clipping/section views");
  });

  it("reset clears focus and returns the first mood", () => {
    const architecture = kit();
    architecture.focusSpace("gallery");
    architecture.setMood("noon");
    const reset = architecture.reset();
    expect(reset.spaceId).toBeUndefined();
    expect(reset.floor).toBeUndefined();
    expect(reset.moodId).toBe("dawn");
  });
});

describe("smart city kit", () => {
  const bounds = placedBounds({ position: [0, 0, 0], size: [3.8, 1.9, 3.8], floorY: 0 });
  const kit = () => createSmartCityKit({
    bounds,
    districts: [
      { id: "core", label: "Core", color: "#f4c35d", u: 0.5, v: 0.05, w: 0.5, extent: [0.36, 0.02, 0.31] },
      { id: "harbor", label: "Harbor", color: "#50d891", u: 0.18, v: 0.05, w: 0.85, extent: [0.36, 0.02, 0.31] }
    ],
    layers: [
      { id: "mobility", label: "Mobility", values: { core: 0.7, harbor: 0.4 } },
      { id: "energy", label: "Energy", values: { core: 0.9, harbor: 0.2 } }
    ],
    temporalStates: ["day", "night"]
  });

  it("toggles layers and places one overlay per district per active layer", () => {
    const city = kit();
    expect(city.frame().activeLayerIds).toEqual(["mobility"]);
    expect(city.frame().overlays).toHaveLength(2);
    const both = city.toggleLayer("energy");
    expect(both.activeLayerIds).toEqual(["mobility", "energy"]);
    expect(both.overlays).toHaveLength(4);
    expect(city.toggleLayer("mobility").activeLayerIds).toEqual(["energy"]);
  });

  it("scales overlay height with the value, so a reading is legible as height", () => {
    const overlays = kit().frame().overlays;
    const core = overlays.find((overlay) => overlay.districtId === "core")!;
    const harbor = overlays.find((overlay) => overlay.districtId === "harbor")!;
    // Core's mobility value is higher, so its overlay must sit higher.
    expect(core.position[1]).toBeGreaterThan(harbor.position[1]);
  });

  it("reports density reduction instead of drawing past its budget", () => {
    const dense = createSmartCityKit({
      bounds,
      districts: Array.from({ length: 20 }, (_, index) => ({
        id: `d${index}`, label: `D${index}`, color: "#50d891",
        u: (index % 5) / 5, v: 0.05, w: Math.floor(index / 5) / 4, extent: [0.1, 0.02, 0.1] as const
      })),
      layers: [
        { id: "a", label: "A", values: Object.fromEntries(Array.from({ length: 20 }, (_, index) => [`d${index}`, 0.5])) },
        { id: "b", label: "B", values: Object.fromEntries(Array.from({ length: 20 }, (_, index) => [`d${index}`, 0.5])) }
      ]
    });
    const frame = dense.toggleLayer("b");
    expect(frame.overlays.length).toBeGreaterThan(24);
    expect(frame.reducedDetailDistrictIds.length).toBeGreaterThan(0);
  });

  it("frames a selected district and keeps every district inside the city", () => {
    const frame = kit().selectDistrict("harbor");
    expect(frame.camera).toBeDefined();
    expect(frame.spatialInvariants.passes).toBe(true);
  });

  it("carries temporal state and resets it", () => {
    const city = kit();
    expect(city.frame().temporalState).toBe("day");
    expect(city.setTemporalState("night").temporalState).toBe("night");
    expect(city.reset().temporalState).toBe("day");
  });
});

describe("cinematic kit", () => {
  const kit = () => createCinematicKit({
    shots: [
      { id: "establish", seconds: 2, from: [0, 2, 8], to: [0, 2, 5], target: [0, 1, 0], transition: "ease", clip: "idle" },
      { id: "glide", seconds: 3, from: [0, 2, 5], to: [4, 2, 2], target: [0, 1, 0], transition: "linear" },
      { id: "reveal", seconds: 1, from: [4, 3, 2], to: [4, 3, 2], target: [0, 1, 0], transition: "cut" }
    ]
  });

  it("reports shot boundaries covering the full sequence with no gaps", () => {
    const boundaries = kit().shotBoundaries();
    expect(boundaries.map((boundary) => boundary.shotId)).toEqual(["establish", "glide", "reveal"]);
    expect(boundaries[0].start).toBe(0);
    for (let index = 1; index < boundaries.length; index += 1) {
      expect(boundaries[index].start).toBeCloseTo(boundaries[index - 1].end, 9);
    }
    expect(kit().totalSeconds).toBeCloseTo(6, 9);
  });

  it("samples the correct shot and interpolates along its path", () => {
    const cinematic = kit();
    expect(cinematic.sampleAt(0).shotId).toBe("establish");
    expect(cinematic.sampleAt(2.5).shotId).toBe("glide");
    expect(cinematic.sampleAt(5.5).shotId).toBe("reveal");
    // Halfway through the linear glide, x is halfway between 0 and 4.
    const mid = cinematic.sampleAt(3.5);
    expect(mid.camera.position?.[0]).toBeCloseTo(2, 6);
  });

  it("applies easing to the path, not to shot duration", () => {
    const cinematic = kit();
    // A quarter into an eased shot has moved less than a quarter of the way.
    const quarter = cinematic.sampleAt(0.5);
    expect(quarter.shotProgress).toBeCloseTo(0.25, 6);
    const travelled = (8 - (quarter.camera.position?.[2] ?? 8)) / 3;
    expect(travelled).toBeLessThan(0.25);
  });

  it("resolves a cut instantly and reports transitions otherwise", () => {
    const cinematic = kit();
    expect(cinematic.sampleAt(5.2).transitioning).toBe(false);
    expect(cinematic.sampleAt(0.5).transitioning).toBe(true);
  });

  it("coordinates an animation clip with its shot", () => {
    expect(kit().sampleAt(1).activeClip).toBe("idle");
    expect(kit().sampleAt(3).activeClip).toBeUndefined();
  });

  it("loops rather than failing past the end", () => {
    const cinematic = kit();
    expect(cinematic.sampleAt(6.5).shotId).toBe(cinematic.sampleAt(0.5).shotId);
    expect(cinematic.sampleAt(-0.5).shotId).toBe("reveal");
  });

  it("produces a deterministic export plan at a given rate", () => {
    const plan = kit().exportPlan(30);
    expect(plan).toHaveLength(180);
    expect(plan[0]).toEqual({ frame: 0, time: 0, shotId: "establish" });
    expect(JSON.stringify(kit().exportPlan(30))).toBe(JSON.stringify(plan));
  });

  it("declares that encoding belongs to the frame-encoder surface", () => {
    expect(kit().capabilities.unsupported.map((entry) => entry.capability)).toContain("video encoding");
  });

  it("survives an empty shot list instead of dividing by zero", () => {
    const empty = createCinematicKit({ shots: [] });
    expect(empty.sampleAt(0).shotId).toBe("default");
    expect(empty.totalSeconds).toBeGreaterThan(0);
  });
});
