import { describe, expect, it } from "vitest";
import {
  CSS2D_CSS3D_MANUAL_MAP,
  R3F_MIGRATION_TABLE_POINTER,
  createR3fMigrationWarnings,
  migrateThreeToA3D
} from "../../../packages/three-compat/src";

describe("V1.4 + N4.3 R3F and CSS2D/CSS3D migration notes", () => {
  it("flags R3F/drei imports as manual with a pointer to the mapping table", () => {
    const source = `
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Environment } from "@react-three/drei";
`;
    const warnings = createR3fMigrationWarnings(source);
    const codes = warnings.map((warning) => warning.code);
    expect(codes).toContain("r3f-manual");
    expect(codes).toContain("drei-manual");
    expect(warnings.every((warning) => warning.message.includes("R3F_TO_AURA_MIGRATION_TABLE"))).toBe(true);
    // The only "parity" wording allowed is the explicit disclaimer — never a claim.
    expect(warnings.every((warning) => warning.message.includes("not an R3F-parity claim"))).toBe(true);
    expect(JSON.stringify(warnings)).not.toMatch(/R3F parity|drei parity|full parity|complete parity|reaches parity|parity with/i);
  });

  it("maps CSS2D onto world-anchored labels and CSS3D onto SDF-or-keep", () => {
    expect(CSS2D_CSS3D_MANUAL_MAP.map((row) => row.three)).toEqual(["CSS2DRenderer", "CSS3DRenderer"]);
    const css2d = CSS2D_CSS3D_MANUAL_MAP[0]!;
    expect(css2d.aura).toMatch(/labels/);
    const css3d = CSS2D_CSS3D_MANUAL_MAP[1]!;
    expect(css3d.aura).toMatch(/no equivalent/);
    const warnings = createR3fMigrationWarnings(`import { CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";`);
    expect(warnings.map((warning) => warning.code)).toContain("css2d-manual");
    const warnings3d = createR3fMigrationWarnings(`import { CSS3DRenderer } from "three/addons/renderers/CSS3DRenderer.js";`);
    expect(warnings3d.map((warning) => warning.code)).toContain("css3d-manual");
  });

  it("flows through the migration lab warnings", () => {
    const result = migrateThreeToA3D(`import { Canvas } from "@react-three/fiber";`);
    expect(result.warnings.map((warning) => warning.code)).toContain("r3f-manual");
    // Plain three.js sources stay warning-free of R3F notes.
    const plain = migrateThreeToA3D(`import * as THREE from "three";`);
    expect(plain.warnings.map((warning) => warning.code)).not.toContain("r3f-manual");
  });

  it("points at the single table source of truth", () => {
    expect(R3F_MIGRATION_TABLE_POINTER).toContain("R3F_TO_AURA_MIGRATION_TABLE");
    expect(R3F_MIGRATION_TABLE_POINTER).toContain("@aura3d/react");
  });
});
