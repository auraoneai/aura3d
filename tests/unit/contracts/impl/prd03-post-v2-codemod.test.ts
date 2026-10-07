import { describe, expect, it } from "vitest";
import {
  transformPostV2,
  postV2Codemod,
  POST_V2_DEFAULT_FILES,
  POST_V2_GAME_IDS,
  POST_V2_NOT_MIGRATED,
  POST_V2_PRESET_BY_GAME,
  postV2GameIdFor
} from "../../../../tools/quality-rebuild/codemods/post-v2.mjs";

describe("post-v2 codemod — reporting (§10)", () => {
  it("is registered-shaped (C-39 AuraCodemod)", () => {
    expect(postV2Codemod.name).toBe("post-v2");
    expect(postV2Codemod.owner).toBe("prd03");
    expect(typeof postV2Codemod.transform).toBe("function");
  });

  it("detects effect builders with v2 mappings and correct lines", () => {
    const source = [
      `import { effects } from "@aura3d/engine";`,
      `effects.bloom({ intensity: 0.5 });`,
      `effects.ambientOcclusion({ radius: 1.2 });`,
      `effects.colorGrade({ contrast: 1.1, exposure: 1.3 });`
    ].join("\n");
    const { rows } = transformPostV2(source, "scene.ts");
    const bloom = rows.find((r) => r.construct === "effects.bloom");
    const ao = rows.find((r) => r.construct === "effects.ambientOcclusion");
    const grade = rows.find((r) => r.construct === "effects.colorGrade");
    expect(bloom).toMatchObject({ line: 2, mapping: "exact" });
    expect(ao).toMatchObject({ line: 3, mapping: "approximate" });
    expect(grade).toMatchObject({ line: 4, mapping: "approximate" });
  });

  it("flags constructs with no v2 path as 'none'", () => {
    const { rows } = transformPostV2(`new PostProcessPass({ name: "custom" })`, "legacy.ts");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ construct: "PostProcessPass", mapping: "none" });
    expect(rows[0]!.note).toBeTruthy();
  });

  it("reports renderer toneMapping fields as exact rows", () => {
    const { rows } = transformPostV2(`const opts = { toneMapping: "aces", toneMappingExposure: 1.4 };`, "r.ts");
    expect(rows.map((r) => r.construct)).toEqual(["renderer.toneMapping", "renderer.toneMappingExposure"]);
    expect(rows.every((r) => r.mapping === "exact")).toBe(true);
  });

  it("clean source reports zero rows and identity code", () => {
    const { rows, code } = transformPostV2(`const x = 1;\nfunction unrelated() { return x; }`, "plain.ts");
    expect(rows).toEqual([]);
    expect(code).toBe(`const x = 1;\nfunction unrelated() { return x; }`);
  });

  it("reports pixelRatio: 0.7 as approximate and never edits it", () => {
    const source = `createAuraApp({ pixelRatio: 0.7, output: { toneMapping: "aces" } });`;
    const { rows, code } = transformPostV2(source, "apps/showcase-skyline-runner/src/legacy/main.ts");
    const pr = rows.find((r) => r.construct === "createApp.pixelRatio");
    expect(pr).toMatchObject({ mapping: "approximate" });
    expect(code).toContain("pixelRatio: 0.7");
  });
});

describe("post-v2 codemod — write-mode rewrites (Phase 5)", () => {
  it("courier-rush fixture (legacy/main.ts:296-297): strips softKnee/shoulder/quality, deletes fxaa antiAlias", () => {
    const source = [
      `    .add(effects.neonBloom({ intensity: reducedMotion ? 0.26 : 0.44, quality: "balanced", softKnee: 0.5, shoulder: 0.6 }))`,
      `    .add(effects.colorGrade({ exposure: 1.05, contrast: 1.1, saturation: 1.12 }))`,
      `    .add(effects.antiAlias({ mode: "fxaa" }))`
    ].join("\n");
    const { code } = transformPostV2(source, "apps/showcase-courier-rush/src/legacy/main.ts");
    expect(code).not.toMatch(/softKnee|shoulder|quality\s*:/);
    expect(code).toContain(`effects.neonBloom({ intensity: reducedMotion ? 0.26 : 0.44 })`);
    expect(code).not.toContain(`antiAlias({ mode: "fxaa" })`);
    expect(code).toContain("effects.colorGrade");
  });

  it("deep-recovery fixture (legacy/main.ts:268-279): threshold 0.72 → 1.0 with was-comment", () => {
    const source = [
      `  .add(effects.neonBloom({`,
      `    name: "deep recovery sonar bloom",`,
      `    intensity: 0.16,`,
      `    threshold: 0.72,`,
      `    maxIntensity: 0.42,`,
      `    antiBlowout: true,`,
      `    quality: "balanced",`,
      `    softKnee: 0.5,`,
      `    shoulder: 0.6`,
      `  }))`,
      `  .add(effects.colorGrade({ exposure: 1.04, contrast: 1.1, saturation: 1.06 }))`,
      `  .add(effects.antiAlias({ mode: "fxaa" }))`
    ].join("\n");
    const { code, rows } = transformPostV2(source, "apps/showcase-deep-recovery/src/legacy/main.ts");
    expect(code).toContain("threshold: 1.0 /* post-v2: was 0.72 */");
    expect(code).not.toMatch(/\bsoftKnee|\bshoulder|quality\s*:/);
    expect(code).toContain("threshold: 1.0");
    expect(code).not.toContain(`antiAlias({ mode: "fxaa" })`);
    expect(rows.some((r) => r.note?.includes("was 0.72"))).toBe(true);
  });

  it("mech-hangar fixture (legacy/main.ts:689): contactOcclusion radius 0.6 kept via spread", () => {
    const source = `effects.contactOcclusion({ name: "fighter deck contact", intensity: 0.4, radius: 0.6 })`;
    const { code } = transformPostV2(source, "apps/showcase-mech-hangar/src/legacy/main.ts");
    expect(code).toContain(`effects.ambientOcclusion({ radius: 0.2, name: "fighter deck contact", intensity: 0.4, radius: 0.6 })`);
    expect(code).not.toContain("contactOcclusion");
  });

  it("bank-shot dual-AO fixture: AO kept, contactOcclusion deleted with merge comment", () => {
    const source = [
      `      effects.antiAlias({ mode: "fxaa" }),`,
      `      effects.ambientOcclusion({ intensity: visualReviewCapture ? 0.74 : 0.26 }),`,
      `      effects.contactOcclusion({ name: "ball-to-felt contact", intensity: 0.36, radius: 0.52 }),`,
      `      effects.fog({ name: "hall haze" })`
    ].join("\n");
    const { code } = transformPostV2(source, "apps/showcase-bank-shot/src/legacy/main.ts");
    expect(code).toContain(`effects.ambientOcclusion({ intensity: visualReviewCapture ? 0.74 : 0.26 })`);
    expect(code).not.toContain("effects.contactOcclusion(");
    expect(code).toContain(`// post-v2: merged contactOcclusion({ name: "ball-to-felt contact", intensity: 0.36, radius: 0.52 })`);
  });

  it("inserts output.preset per the §10 game map (courier → neon-night)", () => {
    const source = `createAuraApp({\n  scene,\n  renderer: { exposure: 1 },\n});`;
    const { code, rows } = transformPostV2(source, "apps/showcase-courier-rush/src/legacy/main.ts");
    expect(code).toContain(`output: { preset: "neon-night" }`);
    expect(rows.some((r) => r.construct === "output.preset" && r.target === "neon-night")).toBe(true);
  });

  it("merges preset into an existing output block without clobbering it", () => {
    const source = `createAuraApp({\n  scene,\n  output: { toneMapping: "aces", exposure: 1.1 },\n});`;
    const { code } = transformPostV2(source, "apps/showcase-deep-recovery/src/legacy/main.ts");
    expect(code).toContain(`output: { preset: "underwater", toneMapping: "aces", exposure: 1.1 }`);
  });

  it("never re-inserts an authored preset", () => {
    const source = `createAuraApp({ scene, output: { preset: "space" } });`;
    const { code } = transformPostV2(source, "apps/showcase-aurora-lander/src/legacy/main.ts");
    expect(code.match(/preset/g)).toHaveLength(1);
  });

  it("non-game files get no preset insert", () => {
    const source = `createAuraApp({ scene });`;
    const { code } = transformPostV2(source, "apps/showcase-data-galaxy/src/legacy/main.ts");
    expect(code).toBe(source);
  });

  it("emissive report: luma×strength < 1.0 flagged, never edited", () => {
    const source = [
      `material.pbr({ emissive: "#101010", emissiveIntensity: 0.4, roughness: 0.3 })`,
      `material.pbr({ emissive: "#ffffff", emissiveIntensity: 4 })`
    ].join("\n");
    const { code, rows, report } = transformPostV2(source, "apps/showcase-neon-swarm/src/legacy/main.ts");
    expect(report.emissive).toHaveLength(2);
    expect(report.emissive[0].lumaXstrength).toBeLessThan(1);
    expect(rows.some((r) => r.construct === "material.emissive" && r.mapping === "approximate")).toBe(true);
    expect(code).toBe(source); // report only — never edits emissive
  });
});

describe("post-v2 default file list (§10)", () => {
  it("contains exactly the 17 game mains + Aura Clash + neon-corridor + templates", () => {
    const mains = POST_V2_DEFAULT_FILES.filter((f) => f.startsWith("apps/showcase-"));
    expect(mains).toHaveLength(17);
    expect(POST_V2_GAME_IDS).toHaveLength(17);
    for (const id of POST_V2_GAME_IDS) {
      expect(mains).toContain(`apps/showcase-${id}/src/main.ts`);
      expect(POST_V2_PRESET_BY_GAME[id]).toBeDefined();
    }
    expect(POST_V2_DEFAULT_FILES).toContain("apps/aura-clash-showcase/src/**");
    expect(POST_V2_DEFAULT_FILES).toContain("examples/neon-corridor-strike/**");
    expect(POST_V2_DEFAULT_FILES).toContain("templates/**");
  });

  it("no non-game showcase is listed; the 10 exclusions surface as not migrated", () => {
    expect(POST_V2_NOT_MIGRATED).toHaveLength(10);
    for (const id of POST_V2_NOT_MIGRATED) {
      expect(POST_V2_DEFAULT_FILES.some((f) => f.includes(`apps/${id}/`))).toBe(false);
    }
    const { report } = transformPostV2("const x = 1;", "apps/showcase-data-galaxy/src/legacy/main.ts");
    expect(report.notMigrated).toBe(true);
  });

  it("game-id resolver: showcase ids map, aura-clash maps, others are null", () => {
    expect(postV2GameIdFor("apps/showcase-courier-rush/src/legacy/main.ts")).toBe("courier-rush");
    expect(postV2GameIdFor("apps/aura-clash-showcase/src/playable/AuraClashArenaApp.ts")).toBe("aura-clash");
    expect(postV2GameIdFor("apps/showcase-data-galaxy/src/main.ts")).toBeNull();
    expect(postV2GameIdFor("packages/engine/src/scene.ts")).toBeNull();
  });
});
