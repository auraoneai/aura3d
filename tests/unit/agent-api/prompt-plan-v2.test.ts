// PRD-13 T1.10 — prompt-plan v2 (`compilePromptPlanV2`, flag-on
// `compilePromptPlan`). Covers §6.3: look resolution precedence, per-field
// apply-or-reject, honest visualSystems census, lookLint repairHints, and the
// §16.2 500-plan property sweep.

import { afterEach, describe, expect, test } from "vitest";
import {
  defineAuraAssets,
  definePromptPlan,
  groups,
  compilePromptPlan,
  promptPlanToScene,
  type AuraEffectNode,
  type AuraPromptPlan
} from "../../../packages/engine/src";
import {
  compilePromptPlanV2,
  promptPlanToSceneV2,
  AuraPromptPlanError,
  type AuraCompilePromptPlanOptions,
  type AuraPromptPlanV2
} from "../../../packages/engine/src/agent-api/nodes/prompt/promptPlanV2.js";
import {
  PROMPT_PLAN_CAMERA_TO_RIG,
  PROMPT_PLAN_EFFECT_MAP,
  PROMPT_PLAN_ENVIRONMENT_KEYWORDS,
  PROMPT_PLAN_LIGHTING_TO_LOOK,
  PROMPT_PLAN_SCENE_DEFAULT_LOOK
} from "../../../packages/engine/src/agent-api/nodes/prompt/promptPlanMappings.js";
import { promptRecipes } from "../../../packages/engine/src/agent-api/nodes/prompt/promptRecipes.js";
import { isFakeEffectName } from "../../../packages/engine/src/agent-api/looks/fakeEffectNames.js";
import { lookLint } from "../../../packages/engine/src/contracts/looks.js";
import type { AuraLookId } from "../../../packages/engine/src/contracts/looks.js";

const assets = defineAuraAssets({
  robot: {
    type: "model",
    format: "glb",
    url: "/aura-assets/robot.12345678.glb",
    bounds: [1, 2, 1],
    hash: "sha256-test"
  }
});

const LOOKS_ENV = "A3D_QR_LOOKS";
const STRICT_ENV = "A3D_QR_LOOKS_PROMPT_STRICT";
const STRICT_ALIAS_ENV = "A3D_PROMPT_PLAN_STRICT";
const A3D_QR_ENV = "A3D_QR";

let savedEnv: Record<string, string | undefined> = {};
afterEach(() => {
  for (const key of [LOOKS_ENV, STRICT_ENV, STRICT_ALIAS_ENV, A3D_QR_ENV]) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  savedEnv = {};
});
function setEnv(key: string, value: string | undefined): void {
  if (!(key in savedEnv)) savedEnv[key] = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

function basePlan(overrides: Partial<AuraPromptPlanV2> = {}): AuraPromptPlanV2 {
  return {
    sceneType: "product-viewer",
    subject: { asset: assets.robot, label: "sneaker" },
    acceptanceCriteria: ["subject visible"],
    ...overrides
  };
}

describe("compilePromptPlanV2 (§6.3)", () => {
  test("(a) warn mode: fog applies, stubbed rain lands in rejected, census is honest", () => {
    const compiled = compilePromptPlanV2(basePlan({
      effects: ["rain", "fog"],
      environment: "white turntable plinth and studio sweep"
    }));
    const nodes = compiled.scene.toJSON().nodes;
    const flat = groups.flatten(nodes);

    // fog applied (on the look or added as a prompt fog node)
    expect(compiled.report.appliedEffects).toContain("fog");
    expect(flat.some((node) => node.kind === "effect" && node.effect === "fog")).toBe(true);

    // rain rejected while C-20 reports sim:"primitive-pool" (stubbed here)
    expect(compiled.report.rejected).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "effects", value: "rain", code: "unsupported-effect" })
      ])
    );
    expect(compiled.report.appliedEffects).not.toContain("rain");
    // §6.3 honesty: no fake rain in the census
    expect(compiled.report.visualSystems.some((system) => system.includes("rain"))).toBe(false);
    expect(compiled.report.schema).toBe("aura3d-prompt-plan-report/2.0");
    expect(compiled.report.repairHints.join("\n")).toContain("rejected effects \"rain\"");
  });

  test("(b) reject mode throws AuraPromptPlanError for unappliable effects", () => {
    const options: AuraCompilePromptPlanOptions = { unsupported: "reject" };
    expect(() => compilePromptPlanV2(basePlan({ effects: ["rain"] }), options))
      .toThrowError(AuraPromptPlanError);
    try {
      compilePromptPlanV2(basePlan({ effects: ["rain"] }), options);
      expect.unreachable();
    } catch (error) {
      expect((error as AuraPromptPlanError).code).toBe("unsupported-effect");
      expect((error as AuraPromptPlanError).field).toBe("effects");
      expect((error as AuraPromptPlanError).value).toBe("rain");
    }
    // hud is always rejected — in reject mode it throws hud-is-dom
    try {
      compilePromptPlanV2(basePlan({ effects: ["hud"] }), options);
      expect.unreachable();
    } catch (error) {
      expect((error as AuraPromptPlanError).code).toBe("hud-is-dom");
    }
  });

  test("(c) environment text resolves the look via the ordered keyword table", () => {
    const compiled = compilePromptPlanV2(basePlan({ environment: "misty forest at dusk" }));
    expect(compiled.report.look.id).toBe("golden-hour");
    expect(compiled.report.look.from).toBe("plan.environment");
  });

  test("plan.look wins over environment, lighting wins over scene default", () => {
    const explicit = compilePromptPlanV2(basePlan({
      look: "neon-arcade",
      environment: "misty forest at dusk",
      lighting: { preset: "studio-softbox" }
    }));
    expect(explicit.report.look).toMatchObject({ id: "neon-arcade", from: "plan.look" });

    const fromLighting = compilePromptPlanV2(basePlan({ lighting: { preset: "neon-practicals" } }));
    expect(fromLighting.report.look).toMatchObject({ id: "neon-arcade", from: "plan.lighting" });

    const fromDefault = compilePromptPlanV2(basePlan({ sceneType: "mini-game" }));
    expect(fromDefault.report.look).toMatchObject({ id: "outdoor-day", from: "sceneType-default" });
  });

  test("unmapped environment is rejected (warn) and falls back to lighting/default", () => {
    const compiled = compilePromptPlanV2(basePlan({
      environment: "an atmosphere no keyword covers zqx",
      lighting: { preset: "material-studio" }
    }));
    expect(compiled.report.rejected).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "environment", code: "unmapped-environment" })
      ])
    );
    expect(compiled.report.look).toMatchObject({ id: "product-studio", from: "plan.lighting" });
  });

  test("style maps to a post grade and emits a color-grade node", () => {
    const compiled = compilePromptPlanV2(basePlan({ style: "noir monochrome" }));
    expect(compiled.report.styleGrade).toEqual({ contrast: 1.15, saturation: 0.3, lift: 0 });
    const flat = groups.flatten(compiled.scene.toJSON().nodes);
    const grade = flat.find(
      (node): node is AuraEffectNode =>
        node.kind === "effect" && node.effect === "color-grade" && node.name === "prompt style grade"
    );
    expect(grade).toMatchObject({ contrast: 1.15, saturation: 0.3 });

    const unmapped = compilePromptPlanV2(basePlan({ style: "gobbledygook zqx" }));
    expect(unmapped.report.styleGrade).toBeNull();
    expect(unmapped.report.rejected).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: "style", code: "unmapped-style" })])
    );
  });

  test("every mapping-table row is reachable (table coverage)", () => {
    for (const preset of Object.keys(PROMPT_PLAN_CAMERA_TO_RIG)) {
      const compiled = compilePromptPlanV2(basePlan({
        camera: { preset: preset as keyof typeof PROMPT_PLAN_CAMERA_TO_RIG }
      }));
      expect(compiled.report.camera.rig).toBe(PROMPT_PLAN_CAMERA_TO_RIG[preset as keyof typeof PROMPT_PLAN_CAMERA_TO_RIG].rig);
    }
    for (const preset of Object.keys(PROMPT_PLAN_LIGHTING_TO_LOOK)) {
      const compiled = compilePromptPlanV2(basePlan({
        lighting: { preset: preset as keyof typeof PROMPT_PLAN_LIGHTING_TO_LOOK }
      }));
      expect(compiled.report.look.id).toBe(PROMPT_PLAN_LIGHTING_TO_LOOK[preset as keyof typeof PROMPT_PLAN_LIGHTING_TO_LOOK].look);
    }
    for (const row of PROMPT_PLAN_ENVIRONMENT_KEYWORDS) {
      const compiled = compilePromptPlanV2(basePlan({ environment: `a ${row.keywords[0]} scene` }));
      expect(compiled.report.look.id).toBe(row.look);
    }
    for (const sceneType of Object.keys(PROMPT_PLAN_SCENE_DEFAULT_LOOK)) {
      const compiled = compilePromptPlanV2(basePlan({
        sceneType: sceneType as keyof typeof PROMPT_PLAN_SCENE_DEFAULT_LOOK
      }));
      expect(compiled.report.look.id).toBe(PROMPT_PLAN_SCENE_DEFAULT_LOOK[sceneType as keyof typeof PROMPT_PLAN_SCENE_DEFAULT_LOOK]);
    }
    // every effect id has a row (map is total over AuraPromptEffectId)
    const effectIds = ["rain", "fog", "bloom", "particles", "wet-reflection", "motion-trail", "hud"] as const;
    for (const id of effectIds) expect(PROMPT_PLAN_EFFECT_MAP[id]).toBeDefined();
  });

  test("(d) 500-plan property sweep: warn mode never throws and reports 2.0", () => {
    const sceneTypes = ["product-viewer", "cinematic-scene", "mini-game", "material-studio"] as const;
    const cameras = ["product-orbit", "cinematic-dolly", "game-board", "material-inspection"] as const;
    const lightings = ["studio-softbox", "neon-practicals", "game-readable", "material-studio"] as const;
    const effectPool = ["rain", "fog", "bloom", "particles", "wet-reflection", "motion-trail", "hud"] as const;
    const environments = [undefined, "misty forest at dusk", "night city rain", "bright studio", "zqx unmapped words"];
    const styles = [undefined, "noir", "pastel", "retro", "unmapped zqx"];
    for (let index = 0; index < 500; index += 1) {
      const plan = basePlan({
        sceneType: sceneTypes[index % 4],
        camera: { preset: cameras[index % 4] },
        lighting: { preset: lightings[index % 4] },
        effects: [effectPool[index % 7], effectPool[(index * 3) % 7], effectPool[(index * 5) % 7]],
        environment: environments[index % 5],
        style: styles[index % 5]
      });
      const compiled = compilePromptPlanV2(plan);
      expect(compiled.report.schema).toBe("aura3d-prompt-plan-report/2.0");
      expect(compiled.report.look.id).toBeTruthy();
      expect(compiled.report.visualSystems.length).toBeGreaterThan(2);
      for (const rejection of compiled.report.rejected) {
        expect(["unmapped-environment", "unmapped-style", "unsupported-effect", "unsupported-camera", "hud-is-dom"]).toContain(rejection.code);
      }
      // snapshot must be a real scene
      expect(compiled.scene.toJSON().nodes.length).toBeGreaterThan(0);
    }
  });

  test("promptPlanToSceneV2 returns the compiled scene builder", () => {
    const builder = promptPlanToSceneV2(basePlan({ effects: ["fog"] }));
    expect(builder.toJSON().nodes.length).toBeGreaterThan(0);
  });
});

describe("T1.9 rewritten recipes (flag-on bodies, §6.3)", () => {
  const sceneTypes = ["product-viewer", "cinematic-scene", "mini-game", "material-studio"] as const;
  const plan = {
    sceneType: "product-viewer",
    subject: { asset: assets.robot },
    acceptanceCriteria: []
  } as const;

  for (const sceneType of sceneTypes) {
    test(`${sceneType}: look-passed census has 0 ambient, 0 fake-effect names, 0 lookLint errors`, () => {
      const look: AuraLookId = sceneType === "mini-game" ? "outdoor-day" : "product-studio";
      const snapshot = promptRecipes[sceneType](assets.robot, plan, look).toJSON();
      const flat = groups.flatten(snapshot.nodes);
      // top-level group children too — groups.flatten drops the group node itself
      const allNodes = snapshot.nodes.flatMap((node) =>
        node.kind === "group" ? [node, ...node.children] : [node]
      );

      // ambient count 0
      const ambient = flat.filter((node) => node.kind === "light" && node.light === "ambient");
      expect(ambient).toHaveLength(0);

      // 0 nodes whose names match fake-effect stems/verbatim names
      const fakeNamed = allNodes.filter(
        (node) => "name" in node && typeof node.name === "string" && isFakeEffectName(node.name)
      );
      expect(fakeNamed).toHaveLength(0);

      // no primitive HUD geometry in the mini-game recipe
      if (sceneType === "mini-game") {
        const hud = allNodes.filter(
          (node) => "name" in node && typeof node.name === "string" &&
            /health pip|timer bar|objective bar|hud score/i.test(node.name)
        );
        expect(hud).toHaveLength(0);
      }

      // look group present (aura-look:<id> when the expansion is v0)
      expect(snapshot.nodes.some(
        (node) => node.kind === "group" && node.name === `aura-look:${look}`
      )).toBe(true);

      // textured material preset ground exists (procedural normal map)
      expect(flat.some(
        (node) =>
          node.kind === "primitive" &&
          (node.material?.normal?.kind === "aura-procedural-texture" ||
            node.material?.roughnessMap?.kind === "aura-procedural-texture")
      )).toBe(true);

      // 0 lookLint *errors* (warnings may fire by design)
      const lint = lookLint(snapshot, {
        devicePixelRatio: 1,
        tierCap: 2,
        production: false,
        capabilities: { ambientAdditive: false, effectsPixelBacked: [] }
      });
      expect(lint.filter((finding) => finding.severity === "error")).toHaveLength(0);
    });

    test(`${sceneType}: no-look call returns the byte-identical legacy body`, () => {
      const withUndefined = promptRecipes[sceneType](assets.robot, plan).toJSON();
      // legacy markers still present in the flag-off path
      const flat = groups.flatten(withUndefined.nodes);
      expect(flat.some((node) => node.kind === "light" && node.light === "ambient")).toBe(true);
      // the flag-on path replaces the body, so a look arg must differ structurally
      const withLook = promptRecipes[sceneType](assets.robot, plan, "product-studio").toJSON();
      expect(withLook.nodes).not.toEqual(withUndefined.nodes);
    });
  }
});

describe("flag-on compilePromptPlan (§7.3)", () => {
  test("(e) flag off → byte-identical 1.0 pipeline for existing fixtures", () => {
    setEnv(LOOKS_ENV, undefined);
    setEnv(A3D_QR_ENV, undefined);
    const plan = definePromptPlan({
      sceneType: "cinematic-scene",
      subject: { asset: assets.robot, label: "robot hero" },
      style: "rainy neon alley",
      camera: { preset: "cinematic-dolly" },
      lighting: { preset: "neon-practicals" },
      effects: ["rain", "fog", "bloom", "wet-reflection"],
      interaction: "orbit",
      acceptanceCriteria: ["hero asset visible"]
    } as const);
    const compiled = compilePromptPlan(plan);
    expect(compiled.report).toMatchObject({
      schema: "aura3d-prompt-plan-report/1.0",
      sceneType: "cinematic-scene",
      subjectAssetId: "robot",
      cameraPreset: "cinematic-dolly",
      lightingPreset: "neon-practicals",
      effects: ["rain", "fog", "bloom", "wet-reflection"]
    });
    expect(compiled.report.visualSystems).toContain("cinematic-scene recipe");
    const snapshot = promptPlanToScene(plan).toJSON();
    expect(snapshot.nodes.some((node) => node.kind === "effect" && node.effect === "rain")).toBe(true);
    // 1.0 echo-only effects list: the plan's effects are echoed verbatim
    expect(compiled.report.effects).toEqual(["rain", "fog", "bloom", "wet-reflection"]);
  });

  test("flag on → compilePromptPlan runs the v2 pipeline narrowed to 1.0", () => {
    setEnv(A3D_QR_ENV, undefined);
    setEnv(LOOKS_ENV, "1");
    const compiled = compilePromptPlan(basePlan({ effects: ["rain", "fog"] }) as AuraPromptPlan);
    expect(compiled.report.schema).toBe("aura3d-prompt-plan-report/1.0");
    // honest effects: fog applied, rain dropped (rejected inside v2)
    expect(compiled.report.effects).toEqual(["fog"]);
    expect(compiled.report.visualSystems.join(" ")).toContain("look:");
    expect(compiled.report.repairHints.join("\n")).toContain("rejected effects \"rain\"");
    const nodes = compiled.scene.toJSON().nodes;
    expect(groups.flatten(nodes).some((node) => node.kind === "effect" && node.effect === "fog")).toBe(true);
  });

  test("flag on + strict env → warn-by-default flips to reject", () => {
    setEnv(A3D_QR_ENV, undefined);
    setEnv(LOOKS_ENV, "1");
    setEnv(STRICT_ENV, "1");
    expect(() => compilePromptPlan(basePlan({ effects: ["hud"] }) as AuraPromptPlan))
      .toThrowError(AuraPromptPlanError);
    setEnv(STRICT_ENV, undefined);
    setEnv(STRICT_ALIAS_ENV, "1");
    expect(() => compilePromptPlan(basePlan({ effects: ["hud"] }) as AuraPromptPlan))
      .toThrowError(AuraPromptPlanError);
  });
});
