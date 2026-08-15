import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { applyAnimationRenderPreset } from "../../../packages/rendering/src/animation/applyAnimationRenderPreset";
import { createAuraText3DGeometry } from "../../../packages/engine/src/agent-api/RootGeometry";
import {
  createAnimationRenderPreset,
  labels,
  text3D
} from "../../../packages/engine/src/agent-api/index";

const root = process.cwd();
const howToPages = [
  "docs/rendering/world-labels-and-text.md",
  "docs/workflows/animation-episode-production.md",
  "docs/rendering/animation-render-preset.md",
  "docs/animation-studio/README.md",
  "docs/animation-studio/guide.md",
  "docs/animation-studio/quickstart.md",
  "docs/animation-studio/studio-app.md",
  "docs/project/completion-audit.md",
  "docs/project/architecture/create-aura-app-production-bridge.md"
] as const;

const retiredPlanningPages = [
  "docs/examples/animation-studio.md",
  "docs/architecture/text-requirements.md"
] as const;

const unbuiltEpisodeScripts = [
  "episode:plan",
  "episode:preview",
  "episode:render",
  "episode:package",
  "episode:review",
  "episode:verify"
] as const;

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

function animationStudioScripts(): readonly string[] {
  const packageJson = JSON.parse(read("packages/create-aura3d/templates/animation-studio/package.json")) as {
    scripts: Record<string, string>;
  };
  return Object.keys(packageJson.scripts);
}

function sceneToolCommands(): readonly string[] {
  const source = read("packages/create-aura3d/templates/animation-studio/scripts/animation-scene.ts");
  return [...source.matchAll(/^\s*case "([a-z-]+)":/gm)].map((match) => match[1]!);
}

function documentsUnbuiltScriptAsUsage(text: string, script: string): boolean {
  const usage = new RegExp(
    String.raw`(?:npm run|pnpm(?: run)?|yarn)\s+${script.replace(":", "\\:")}\\b`
  );
  return usage.test(text);
}

describe("converted feature docs match shipped source", () => {
  it("removes the planning originals and keeps kebab-case how-to pages", () => {
    for (const path of retiredPlanningPages) {
      expect(existsSync(join(root, path)), path).toBe(false);
    }
    for (const path of howToPages) {
      expect(existsSync(join(root, path)), path).toBe(true);
      expect(read(path), path).toMatch(/^#\s+\S/m);
    }
  });

  it("does not send readers to a PRD or a 1.1 target contract", () => {
    const offenders: string[] = [];
    for (const path of howToPages) {
      const text = read(path);
      if (/use the PRD/i.test(text) || /target-contract/i.test(text) || /requirements before implementation/i.test(text)) {
        offenders.push(path);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("documents only animation-studio scripts that exist on the live template", () => {
    const shipped = new Set(animationStudioScripts());
    expect(shipped.has("episode:render-3d")).toBe(true);
    expect(shipped.has("scene")).toBe(true);
    for (const missing of unbuiltEpisodeScripts) {
      expect(shipped.has(missing), missing).toBe(false);
    }

    const workflow = read("docs/workflows/animation-episode-production.md");
    const studioReadme = read("docs/animation-studio/README.md");
    for (const script of unbuiltEpisodeScripts) {
      expect(documentsUnbuiltScriptAsUsage(workflow, script), `workflow usage of ${script}`).toBe(false);
      expect(documentsUnbuiltScriptAsUsage(studioReadme, script), `readme usage of ${script}`).toBe(false);
    }

    for (const script of ["episode:render-3d", "scene"] as const) {
      expect(workflow).toContain(script);
      expect(shipped.has(script)).toBe(true);
    }

    const commands = sceneToolCommands();
    expect(commands).toEqual(expect.arrayContaining(["new", "cast", "dialogue", "validate", "render"]));
    for (const command of ["new", "cast", "dialogue", "validate", "render"] as const) {
      expect(workflow).toContain(command);
      expect(commands).toContain(command);
    }
  });

  it("drives text3D / labels / createAnimationRenderPreset and matches the how-to", () => {
    const mesh = createAuraText3DGeometry("Aura3D-2.0");
    expect(mesh.method).toBe("extruded-bitmap-glyph-mesh");
    expect(mesh.glyphCount).toBeGreaterThan(0);
    expect(mesh.unsupportedCharacters).toEqual([]);

    const node = text3D("HELLO").toJSON();
    expect(node.text3D?.method).toBe(mesh.method);
    expect(node.kind).toBe("primitive");

    const rejected = createAuraText3DGeometry("HELLO?");
    expect(rejected.unsupportedCharacters).toContain("?");

    const label = labels.billboard("Subject").toJSON();
    expect(label.kind).toBe("label");
    expect(label.occlusionAware).toBe(true);
    expect(label.collisionAvoidance).toBe(true);

    const preset = createAnimationRenderPreset({
      name: "soft-neon-bedtime",
      reducedFlash: true,
      materialStyle: { treatment: "cel" }
    });
    expect(preset.kind).toBe("animation-render-preset-evidence");
    expect(preset.debugOverlaysAllowedInExport).toBe(false);
    expect(preset.postprocess.bloom).toBe(0.08);
    expect(preset.materialStyle.treatment).toBe("cel");

    const applied = applyAnimationRenderPreset(preset);
    expect(applied.kind).toBe("animation-render-preset-application");
    expect(applied.appliedToPixels.toonMaterial).toBe("returned-for-caller-assignment");
    expect(applied.outlineEnabled).toBe(true);

    const textDoc = read("docs/rendering/world-labels-and-text.md");
    expect(textDoc).toContain(mesh.method);
    expect(textDoc).toContain("labels.billboard");
    expect(textDoc).toContain("occlusionAware");
    expect(textDoc).toContain("text3D");
    expect(textDoc).toMatch(/A–Z|A-Z/);
    expect(textDoc).not.toMatch(/does not expose a 3D text primitive/i);

    const presetDoc = read("docs/rendering/animation-render-preset.md");
    expect(presetDoc).toContain("createAnimationRenderPreset");
    expect(presetDoc).toContain("applyAnimationRenderPreset");
    expect(presetDoc).not.toMatch(/planned Aura3D 1\.1 rendering policy/i);
  });

  it("keeps the production renderer how-to on the real public types", () => {
    const source = read("packages/engine/src/agent-api/index.ts");
    expect(source).toContain('export type AuraRendererMode = "safe-basic" | "production"');
    expect(source).toContain(
      'export type AuraRendererQualityProfileId = "safe-basic" | "production" | "cinematic" | "experimental-webgpu"'
    );
    const doc = read("docs/project/architecture/create-aura-app-production-bridge.md");
    expect(doc).toContain('mode: "production"');
    expect(doc).toContain("qualityProfile");
    expect(doc).not.toMatch(/The PRD remains/i);
    expect(doc).not.toMatch(/Open Implementation Work/i);
  });
});
