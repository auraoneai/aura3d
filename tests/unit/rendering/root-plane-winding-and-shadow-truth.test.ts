import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { lights, material, primitives, renderer, scene } from "../../../packages/engine/src";

/**
 * Regression coverage for two root-path defects found while building the FS-302
 * root shadow contract.
 */
describe("root plane winding", () => {
  it("winds the root plane primitive so its geometric normal agrees with its vertex normals", () => {
    // A plane authored with up-facing vertex normals but clockwise winding is
    // back-facing to a camera above it. The two-sided lit shaders flip the normal
    // when `gl_FrontFacing` is false, so the plane faced away from every overhead
    // light: it received no direct lighting and showed no cast shadows.
    const plane = readRootPlaneDefinition();
    const { positions, normals, indices } = plane;
    expect(positions).toHaveLength(4);
    expect(indices).toHaveLength(6);
    // Every declared vertex normal points up, which is what the winding must agree with.
    for (const normal of normals) expect(normal).toEqual([0, 1, 0]);

    for (let triangle = 0; triangle < indices.length; triangle += 3) {
      const first = positions[indices[triangle]!]!;
      const second = positions[indices[triangle + 1]!]!;
      const third = positions[indices[triangle + 2]!]!;
      const geometricNormal = cross(subtract(second, first), subtract(third, first));
      // Positive Y means counter-clockwise seen from above, which matches the
      // [0, 1, 0] vertex normals the plane declares.
      expect(geometricNormal[1]).toBeGreaterThan(0);
      expect(Math.abs(geometricNormal[0])).toBeLessThan(1e-6);
      expect(Math.abs(geometricNormal[2])).toBeLessThan(1e-6);
    }
  });
});

describe("root shadow diagnostics honesty", () => {
  it("does not report shadows as enabled from an unmounted scene plan", () => {
    // The report used to publish `shadows.enabled: true` unconditionally, which is
    // a source-authored boolean rather than evidence that anything was rendered.
    const report = renderer.diagnostics(
      scene()
        .add(primitives.plane({ name: "floor", material: material.pbr({ color: "#cccccc" }) }))
        .add(primitives.box({ name: "occluder", material: material.pbr({ color: "#888888" }) }))
        .add(lights.directional({ name: "key", position: [3, 4, 3], intensity: 2 })),
      { mode: "production", qualityProfile: "production" }
    );

    expect(report.shadows.enabled).toBe(false);
    expect(report.shadows.mapRendered).toBe(false);
    expect(report.shadows.mapSampled).toBe(false);
    expect(report.shadows.nativeShadowMapBindings).toBe(0);
    expect(report.shadows.shadowRenderTargetsAllocated).toBe(0);
    // The scene plan may still say shadows were requested; that is a request, not
    // proof, and must be reported separately from `enabled`.
    expect(typeof report.shadows.requested).toBe("boolean");
  });

  it("keeps shadow map type reporting separate from shadow proof", () => {
    const report = renderer.diagnostics(
      scene().add(primitives.box({ name: "solo" })).add(lights.studio()),
      { mode: "production", qualityProfile: "production" }
    );
    expect(report.shadows.mapType).toBe("pcf-soft");
    expect(report.shadows.enabled).toBe(false);
  });
});

/**
 * Reads the plane primitive's positions, normals, and index winding straight out
 * of the engine source that the root production bridge uses.
 *
 * The geometry itself is only constructed inside a mounted WebGL bridge, which is
 * unavailable in this Node unit environment, so the invariant is asserted against
 * the authored definition. That still fails loudly if the winding regresses.
 */
function readRootPlaneDefinition(): {
  readonly positions: (readonly [number, number, number])[];
  readonly normals: (readonly [number, number, number])[];
  readonly indices: number[];
} {
  const source = readFileSync(resolve("packages/engine/src/agent-api/index.ts"), "utf8");
  const marker = "function createPlaneGeometry()";
  const startIndex = source.indexOf(marker);
  expect(startIndex, "createPlaneGeometry must exist in the root agent API").toBeGreaterThan(-1);
  const body = source.slice(startIndex, source.indexOf("\n}", startIndex));

  return {
    positions: triplets(numbersInBlock(body, "positions")),
    normals: triplets(numbersInBlock(body, "normals")),
    indices: numbersInBlock(body, "indices")
  };
}

function numbersInBlock(body: string, field: string): number[] {
  const fieldIndex = body.indexOf(`${field}: new `);
  expect(fieldIndex, `createPlaneGeometry must declare ${field}`).toBeGreaterThan(-1);
  const open = body.indexOf("([", fieldIndex);
  const close = body.indexOf("])", open);
  expect(open).toBeGreaterThan(-1);
  expect(close).toBeGreaterThan(open);
  return body
    .slice(open + 2, close)
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => {
      const value = Number(entry);
      expect(Number.isFinite(value), `Non-numeric ${field} entry: ${entry}`).toBe(true);
      return value;
    });
}

function triplets(values: readonly number[]): (readonly [number, number, number])[] {
  expect(values.length % 3).toBe(0);
  const result: (readonly [number, number, number])[] = [];
  for (let index = 0; index < values.length; index += 3) {
    result.push([values[index]!, values[index + 1]!, values[index + 2]!]);
  }
  return result;
}

function subtract(
  first: readonly [number, number, number],
  second: readonly [number, number, number]
): readonly [number, number, number] {
  return [first[0] - second[0], first[1] - second[1], first[2] - second[2]];
}

function cross(
  first: readonly [number, number, number],
  second: readonly [number, number, number]
): readonly [number, number, number] {
  return [
    first[1] * second[2] - first[2] * second[1],
    first[2] * second[0] - first[0] * second[2],
    first[0] * second[1] - first[1] * second[0]
  ];
}
