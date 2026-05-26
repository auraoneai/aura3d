import { describe, expect, it } from "vitest";
import { buildInitialCompatibilityMatrix } from "../../../packages/three-compat/src/ThreeCompatibilityMatrix";
import { buildThreeApiInventory, REQUIRED_THREE_API_CATEGORIES } from "../../../packages/three-compat/src/ThreeApiInventory";

describe("ThreeCompat Three.js inventory", () => {
  it("builds a broad categorized inventory and compatibility matrix", () => {
    const sampleExports = [
      "Object3D",
      "Scene",
      "Mesh",
      "Vector3",
      "Matrix4",
      "PerspectiveCamera",
      "OrthographicCamera",
      "DirectionalLight",
      "PointLight",
      "MeshStandardMaterial",
      "MeshPhysicalMaterial",
      "BoxGeometry",
      "SphereGeometry",
      "Texture",
      "WebGLRenderer",
      "AnimationMixer",
      "AxesHelper"
    ];
    const inventory = buildThreeApiInventory("0.165.0", sampleExports);
    const matrix = buildInitialCompatibilityMatrix(inventory);

    expect(REQUIRED_THREE_API_CATEGORIES.every((category) => category in inventory.categories)).toBe(true);
    expect(inventory.entries.length).toBeGreaterThan(sampleExports.length);
    expect(matrix.totalEntries).toBe(inventory.entries.length);
    expect(matrix.thresholds.some((threshold) => threshold.category === "overall" && threshold.minimumSupportedOrPartialPercent === 60)).toBe(true);
    expect(matrix.entries.every((entry) => ["supported", "partial", "planned", "blocked", "out-of-scope"].includes(entry.status))).toBe(true);
  });
});

