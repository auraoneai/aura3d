// PRD-13 T1.11 — §7.4: every `visualQA` returns its old keys plus the additive
// `{ deprecated: true, kind: "structural-name-heuristic" }`; `structuralQA.*`
// returns `{ kind, ok, checks }` with the renamed keys only — old key names
// never appear in the structural checks map.

import { describe, expect, it } from "vitest";
import {
  character,
  charts,
  city,
  material,
  neon,
  product,
  solar,
  type AuraSceneNode
} from "../../../packages/engine/src";
import {
  structuralQA,
  validateMaterialVisualQA,
  validateSolarVisualQA,
  type AuraDeprecatedVisualQA
} from "../../../packages/engine/src/agent-api/looks/structuralQA.js";

const empty: readonly AuraSceneNode[] = [];

/** material/charts annotate their `visualQA` with the base result type inside
 *  owner-15 files (nodes/material.ts, agent-api/index.ts); the additive keys
 *  are present at runtime — Q-15-7 tracks widening those annotations. */
const marked = <T extends object>(result: T): T & AuraDeprecatedVisualQA =>
  result as T & AuraDeprecatedVisualQA;

describe("visualQA results carry the §7.4 deprecated marker", () => {
  it("material.visualQA keeps its old keys and adds deprecated+kind", () => {
    const result = marked(material.visualQA(empty));
    expect(result.deprecated).toBe(true);
    expect(result.kind).toBe("structural-name-heuristic");
    // old keys unchanged
    expect(result).toHaveProperty("passes");
    expect(result).toHaveProperty("score");
    expect(result).toHaveProperty("chromeReflectsEnvironment");
    expect(result).toHaveProperty("problems");
  });

  it("all seven visualQA surfaces carry the additive keys", () => {
    const results = [
      marked(material.visualQA(empty)),
      neon.visualQA(empty),
      marked(charts.visualQA(empty)),
      character.visualQA(empty),
      city.visualQA(empty),
      product.visualQA(empty),
      solar.visualQA(empty)
    ];
    for (const result of results) {
      expect(result.deprecated).toBe(true);
      expect(result.kind).toBe("structural-name-heuristic");
    }
    // spot-check the old keys survived on each surface
    expect(neon.visualQA(empty)).toHaveProperty("ringCount");
    expect(charts.visualQA(empty)).toHaveProperty("bars");
    expect(character.visualQA(empty)).toHaveProperty("connected");
    expect(city.visualQA(empty)).toHaveProperty("buildings");
    expect(product.visualQA(empty)).toHaveProperty("softboxes");
    expect(solar.visualQA(empty)).toHaveProperty("planets");
  });
});

describe("structuralQA namespace (§7.4 renamed keys)", () => {
  it("structuralQA.material returns the renamed check map", () => {
    const result = structuralQA.material(empty);
    expect(result.kind).toBe("structural-name-heuristic");
    expect(typeof result.ok).toBe("boolean");
    // renamed: no pixel-claim names survive
    expect(result.checks).not.toHaveProperty("chromeReflectsEnvironment");
    expect(result.checks).toHaveProperty("chromeReflectionNodesNamed");
    expect(result.checks).toHaveProperty("fiveMaterialClassesNamed");
    expect(result.checks).toHaveProperty("materialClassesFeatureDistance");
  });

  it("structuralQA.neon renames overexposure and depth checks", () => {
    const checks = structuralQA.neon(empty).checks;
    expect(checks).not.toHaveProperty("hasFog");
    expect(checks).toHaveProperty("fogDepthCuePresent");
    expect(checks).toHaveProperty("tunnelDepthElementsNamed");
    expect(checks).toHaveProperty("bloomWhiteoutRisk");
  });

  it("structuralQA.charts/city/product/solar expose only renamed keys", () => {
    expect(structuralQA.charts(empty).checks).toHaveProperty("dataBarsNamed");
    const cityChecks = structuralQA.city(empty).checks;
    expect(cityChecks).toHaveProperty("cityBuildingsNamed");
    expect(cityChecks).toHaveProperty("instancedPrimitivesPresent");
    const productChecks = structuralQA.product(empty).checks;
    expect(productChecks).toHaveProperty("photographySoftboxesNamed");
    expect(productChecks).not.toHaveProperty("contactShadows");
    const solarChecks = structuralQA.solar(empty).checks;
    expect(solarChecks).toHaveProperty("sixPlanetsNamed");
    expect(solarChecks).toHaveProperty("sunCoronaShaderNamed");
    expect(solarChecks).not.toHaveProperty("hasSunCorona");
  });

  it("structuralQA.character converts the gap/proportion check", () => {
    const result = structuralQA.character(empty);
    expect(result.checks).toHaveProperty("humanoidStructureConnected");
    expect(result.checks).toHaveProperty("proportionsPlausible");
    expect(result.checks).not.toHaveProperty("impossibleProportions");
    expect(result.ok).toBe(false); // empty node set cannot be connected
  });

  it("every structuralQA check value is a boolean", () => {
    const all = [
      structuralQA.material(empty),
      structuralQA.neon(empty),
      structuralQA.charts(empty),
      structuralQA.character(empty),
      structuralQA.city(empty),
      structuralQA.product(empty),
      structuralQA.solar(empty)
    ];
    for (const result of all) {
      expect(result.kind).toBe("structural-name-heuristic");
      for (const value of Object.values(result.checks)) {
        expect(typeof value).toBe("boolean");
      }
    }
  });

  it("the deprecated marker flows through the carved validators too", () => {
    for (const result of [validateMaterialVisualQA(empty), validateSolarVisualQA(empty)]) {
      expect(result.deprecated).toBe(true);
      expect(result.kind).toBe("structural-name-heuristic");
    }
  });
});
