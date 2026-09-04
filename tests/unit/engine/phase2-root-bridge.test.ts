import { describe, expect, it } from "vitest";
import {
  camera,
  effects,
  lights,
  renderer,
  scene,
  text3D
} from "../../../packages/engine/src/agent-api/index";

describe("N1 lights.spot root builder", () => {
  it("builds a spot node with cone defaults", () => {
    const snapshot = scene().add(lights.spot()).toJSON();
    const node = snapshot.nodes.find((entry) => entry.kind === "light" && entry.light === "spot");
    expect(node).toMatchObject({ light: "spot", angle: Math.PI / 6, penumbra: 0.4, distance: 12, intensity: 8 });
  });

  it("honors an explicit aim target and cone", () => {
    const snapshot = scene()
      .add(lights.spot({ target: [1, 0, -2], angle: 0.5, penumbra: 0.2, distance: 20, shadow: true }))
      .toJSON();
    expect(snapshot.nodes.find((entry) => entry.kind === "light")).toMatchObject({
      target: [1, 0, -2],
      angle: 0.5,
      penumbra: 0.2,
      distance: 20,
      shadow: true
    });
  });
});

describe("D4 flipbook/beam root builders", () => {
  it("records validated flipbook geometry and warns withheld", () => {
    const snapshot = scene().add(effects.flipbook({ spriteColumns: 8, spriteRows: 4, frameRate: 30 })).toJSON();
    expect(snapshot.nodes.find((entry) => entry.kind === "effect")).toMatchObject({
      effect: "flipbook-sprite",
      spriteColumns: 8,
      spriteRows: 4,
      frameRate: 30
    });
    expect(() => scene().add(effects.flipbook({ spriteColumns: 0 })).toJSON()).toThrow(RangeError);
    const report = renderer.diagnostics(scene().add(effects.flipbook()));
    expect(report.warnings.some((warning) => warning.includes("flipbook-sprite is recorded but withheld"))).toBe(true);
  });

  it("records a validated beam descriptor and warns withheld", () => {
    const snapshot = scene().add(effects.beam({ from: [0, 1, 0], to: [0, 1, -6], widthWorld: 0.3, segmentCount: 12 })).toJSON();
    expect(snapshot.nodes.find((entry) => entry.kind === "effect")).toMatchObject({
      effect: "light-beam",
      widthWorld: 0.3,
      segmentCount: 12
    });
    expect(() => scene().add(effects.beam({ widthWorld: -1 })).toJSON()).toThrow(RangeError);
    const report = renderer.diagnostics(scene().add(effects.beam()));
    expect(report.warnings.some((warning) => warning.includes("light-beam is recorded but withheld"))).toBe(true);
  });
});

describe("G1 text3D SDF backend", () => {
  it("keeps the extruded default untouched", () => {
    const snapshot = scene().add(text3D("HELLO")).toJSON();
    expect(snapshot.nodes.find((entry) => entry.kind === "primitive")).toMatchObject({
      text3D: { method: "extruded-bitmap-glyph-mesh" }
    });
  });

  it("validates the SDF layout fail-loud and no longer warns withheld (G1 sampler landed)", () => {
    const snapshot = scene().add(text3D("HELLO", { backend: "sdf", sdfStyle: { outlineWidthEm: 0.08 } })).toJSON();
    const text = snapshot.nodes.find((entry) => entry.kind === "primitive");
    expect(text).toMatchObject({ text3D: { method: "sdf-atlas-quad", backend: "sdf" } });
    expect((text as { text3D?: { sdfQuadCount?: number } }).text3D?.sdfQuadCount).toBe(5);
    expect(() => scene().add(text3D("", { backend: "sdf" })).toJSON()).toThrow();
    const report = renderer.diagnostics(scene().add(text3D("HELLO", { backend: "sdf" })));
    expect(report.warnings.some((warning) => warning.includes("text3D sdf backend is recorded but withheld"))).toBe(false);
  });
});

describe("F2 camera rigs at root", () => {
  it("exposes the rig builders on camera", () => {
    expect(typeof camera.shoulder).toBe("function");
    expect(typeof camera.shake).toBe("function");
    expect(typeof camera.collisionAwareOrbit).toBe("function");
    expect(typeof camera.punchIn).toBe("function");
  });
});
