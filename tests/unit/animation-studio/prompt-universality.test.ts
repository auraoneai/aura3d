import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  SET_TEMPLATES,
  getSetTemplate,
  pickSetForPrompt
} from "../../../packages/create-aura3d/templates/animation-studio/src/set-templates";
import { compileEpisodeDocument } from "../../../packages/create-aura3d/templates/animation-studio/src/director/compile-episode-document";
import {
  emptyDocument,
  EMPTY_DOCUMENT_NOTICE
} from "../../../packages/create-aura3d/templates/animation-studio/src/empty-document";
import type { EpisodeDocument } from "../../../packages/create-aura3d/templates/animation-studio/src/episode-document";
import type { DirectorSceneInput } from "../../../packages/create-aura3d/templates/animation-studio/src/director/director-heuristics";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_ROOT = resolve(__dirname, "../../../packages/create-aura3d/templates/animation-studio");

/**
 * Phase D1 — Moon-Garden fixture leakage. The Moon Garden scene is an EXAMPLE
 * (`src/examples/moon-garden.example.ts`), never a default. A scene built from a
 * non-moon prompt — through the document / set-template path — must contain ZERO
 * Moon-Garden assets: no moon-garden set, no miko/luma default cast, no mushroom
 * default props. These tests pin that contract so the fixture can't silently leak back.
 */

// Anything that would reveal the Moon Garden fixture leaked into a non-moon scene.
const MOON_MARKERS = [
  "moon",
  "moon-garden",
  "glow-stone",
  "glow stones",
  "miko",
  "luma",
  "mushroom",
  "lily",
  "garden"
];

/** Recursively collect every string token (ids, urls, keys) in a document. */
function allStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") {
    out.push(value.toLowerCase());
  } else if (Array.isArray(value)) {
    for (const v of value) allStrings(v, out);
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      out.push(k.toLowerCase());
      allStrings(v, out);
    }
  }
  return out;
}

function moonMarkersIn(doc: EpisodeDocument): string[] {
  const haystack = allStrings(doc);
  const hits: string[] = [];
  for (const token of haystack) {
    for (const marker of MOON_MARKERS) {
      if (token.includes(marker)) hits.push(`${marker} in "${token}"`);
    }
  }
  return hits;
}

// Mirror `animation-scene buildFromPrompt`'s document/set-template path WITHOUT the
// network catalog resolve: pick the set from the prompt, EMPTY cast, ground dressing from
// the chosen template only, then compile through the deterministic Director.
function buildSceneFromPrompt(prompt: string): EpisodeDocument {
  const template = pickSetForPrompt(prompt);
  const scene: DirectorSceneInput = {
    duration: 60,
    characters: [],
    shots: [
      { shotId: "shot-1", startTime: 0, endTime: 20 },
      { shotId: "shot-2", startTime: 20, endTime: 42 },
      { shotId: "shot-3", startTime: 42, endTime: 60 }
    ],
    dialogue: [],
    walkableBounds: template.walkableBounds,
    props: template.groundProp
      ? [{ propId: template.groundProp.propId, count: 6, scaleRange: [...template.groundProp.scaleRange] as [number, number], feetOffset: template.groundProp.feetOffset }]
      : []
  };
  const props = template.groundProp
    ? [{ id: template.groundProp.propId, url: `/aura-assets/${template.groundProp.propId}.catalog.glb`, attribution: `placeholder: ${template.groundProp.query}` }]
    : [];
  const { document } = compileEpisodeDocument({
    id: "test-scene",
    duration: 60,
    assets: { characters: [], props },
    set: template.set,
    scene
  });
  return { ...document, walkableBounds: template.walkableBounds, dialogue: { language: "en", lines: [] } };
}

describe("prompt universality — no Moon-Garden fixture leakage (D1)", () => {
  const NON_MOON_PROMPTS = [
    "two robots arguing in a garage",
    "a fox and a bear in a forest",
    "two office workers arguing",
    "a chef teaching a child"
  ];

  it.each(NON_MOON_PROMPTS)("non-moon prompt %p produces ZERO moon-garden assets", (prompt) => {
    const doc = buildSceneFromPrompt(prompt);
    // No default cast: a prompt-built skeleton resolves real characters later.
    expect(doc.assets.characters).toHaveLength(0);
    // No moon set / glow stones / miko-luma cast / mushroom props anywhere in the doc.
    expect(moonMarkersIn(doc)).toEqual([]);
  });

  it("non-moon prompts never select the moon-garden set template", () => {
    for (const prompt of NON_MOON_PROMPTS) {
      const template = pickSetForPrompt(prompt);
      expect(template.id).not.toBe("moon-garden");
    }
  });

  it("an unmatched prompt falls back to the neutral STUDIO set, NOT moon-garden", () => {
    const template = pickSetForPrompt("a completely generic conversation");
    expect(template.id).toBe("studio");
    expect(template.id).not.toBe("moon-garden");
    expect(template.groundProp).toBeUndefined();
  });

  it("moon-garden is still ONE selectable template, but only when explicitly themed", () => {
    expect(getSetTemplate("moon-garden")).toBeDefined();
    expect(pickSetForPrompt("a quiet moon garden at night").id).toBe("moon-garden");
  });

  it("the default/empty document carries no scene content (no moon assets)", () => {
    expect(emptyDocument.assets.characters).toHaveLength(0);
    expect(emptyDocument.assets.props).toHaveLength(0);
    expect(emptyDocument.setDressing).toHaveLength(0);
    expect(moonMarkersIn(emptyDocument)).toEqual([]);
    // The placeholder advertises the prompt path as the way to make a real scene.
    expect(EMPTY_DOCUMENT_NOTICE).toMatch(/animation-scene new --prompt/);
  });
});

describe("new-scene path + clip-library universal IDs", () => {
  it("the moon-garden source module lives only under examples/ (not as a default module)", () => {
    // The example moved out of the default src path; the old default module is gone.
    const oldDefault = resolve(TEMPLATE_ROOT, "src/moon-garden-document.ts");
    expect(() => readFileSync(oldDefault, "utf8")).toThrow();
    const example = readFileSync(resolve(TEMPLATE_ROOT, "src/examples/moon-garden.example.ts"), "utf8");
    expect(example).toMatch(/EXAMPLE FIXTURE, NOT THE DEFAULT/);
  });

  it("`animation-scene new` requires --prompt (or --from); no default content fixture", () => {
    const cli = readFileSync(resolve(TEMPLATE_ROOT, "scripts/animation-scene.ts"), "utf8");
    // The new command rejects when neither prompt nor from is given.
    expect(cli).toMatch(/animation-scene new requires a prompt/);
    // It no longer imports or clones the moon-garden document as a default.
    expect(cli).not.toMatch(/moon-garden-document/);
    expect(cli).not.toMatch(/moonGardenDocument/);
  });

  it("render-live default is the empty placeholder, not moonGardenDocument (D1)", () => {
    const renderLive = readFileSync(resolve(TEMPLATE_ROOT, "scripts/render-live.ts"), "utf8");
    expect(renderLive).toMatch(/empty-document/);
    expect(renderLive).not.toMatch(/moonGardenDocument/);
  });

  it("the CLI warns when the fallback (empty) fixture is rendered (D1)", () => {
    const renderLive = readFileSync(resolve(TEMPLATE_ROOT, "scripts/render-live.ts"), "utf8");
    // render-live falls back to emptyDocument when no AURA_DOCUMENT is set AND warns loudly.
    expect(renderLive).toMatch(/USING_EMPTY_FALLBACK\s*=\s*!process\.env\.AURA_DOCUMENT/);
    expect(renderLive).toMatch(/if\s*\(USING_EMPTY_FALLBACK\)\s*console\.warn\(EMPTY_DOCUMENT_NOTICE\)/);
    // The render-live-route (browser entry) warns the same way when nothing is injected.
    const route = readFileSync(resolve(TEMPLATE_ROOT, "src/render-live-route.ts"), "utf8");
    expect(route).toMatch(/if\s*\(!injected\)/);
    expect(route).toMatch(/console\.warn\(EMPTY_DOCUMENT_NOTICE\)/);
    // The notice itself names the prompt path as the way to make a real (non-fixture) scene.
    expect(EMPTY_DOCUMENT_NOTICE).toMatch(/No scene loaded/);
    expect(EMPTY_DOCUMENT_NOTICE).toMatch(/animation-scene new --prompt/);
  });

  it("clip-library manifest keeps UNIVERSAL ids primary; source names only in provenance (D2)", () => {
    const manifest = JSON.parse(
      readFileSync(resolve(TEMPLATE_ROOT, "public/clip-library/manifest.json"), "utf8")
    ) as {
      vocabulary: string[];
      clips: {
        clipId: string;
        source: string;
        mappedIntent: string;
        date: string;
        qualityScore: number;
        license?: string;
        sourceTitle?: string;
        sourceUrl?: string;
        originalClipName?: string;
      }[];
    };
    const vocab = new Set(manifest.vocabulary);
    for (const clip of manifest.clips) {
      // Every clipId is a universal vocabulary token (idle/talk/...), never a raw catalog name.
      expect(vocab.has(clip.clipId)).toBe(true);
      // No raw catalog name (e.g. "Moon Walk") used as the id.
      expect(clip.clipId).not.toMatch(/\s/);
      expect(clip.clipId.toLowerCase()).not.toContain("moon");
      // mappedIntent is the EXPLICIT universal slot the source clip was mapped onto (== clipId),
      // stored as provenance metadata — never the raw source name.
      expect(vocab.has(clip.mappedIntent)).toBe(true);
      expect(clip.mappedIntent).toBe(clip.clipId);
      // Provenance metadata the PRD enumerates: title/license/url/date/mappedIntent/qualityScore.
      expect(typeof clip.date).toBe("string");
      expect(clip.date).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(typeof clip.qualityScore).toBe("number");
      expect(clip.qualityScore).toBeGreaterThanOrEqual(0);
      expect(clip.qualityScore).toBeLessThanOrEqual(100);
    }
    // Provenance still carried as metadata (not as the product-facing id).
    const withProvenance = manifest.clips.filter((c) => c.sourceTitle ?? c.originalClipName);
    expect(withProvenance.length).toBeGreaterThan(0);
    // Extracted clips carry title + license + url + a real (>0) quality score.
    for (const clip of manifest.clips.filter((c) => c.source === "catalog-extracted")) {
      expect(clip.sourceTitle).toBeTruthy();
      expect(clip.license).toBeTruthy();
      expect(clip.sourceUrl).toMatch(/^https?:\/\//);
      expect(clip.qualityScore).toBeGreaterThan(0);
    }
  });

  it("no raw catalog NAME (e.g. 'Moon Walk') surfaces as a product concept (D2)", () => {
    const manifest = JSON.parse(
      readFileSync(resolve(TEMPLATE_ROOT, "public/clip-library/manifest.json"), "utf8")
    ) as { vocabulary: string[]; clips: { clipId: string; mappedIntent: string; sourceTitle?: string; originalClipName?: string }[] };
    const vocab = new Set(manifest.vocabulary);
    for (const clip of manifest.clips) {
      // The product-facing identifiers (clipId + mappedIntent) are ONLY universal vocabulary —
      // a raw catalog name like "Moon Walk"/"Idle Update 8-4-20" must never become a concept.
      for (const productFacing of [clip.clipId, clip.mappedIntent]) {
        expect(vocab.has(productFacing)).toBe(true);
        expect(productFacing).not.toMatch(/\s/); // no spaces → no display-name leakage
        if (clip.sourceTitle) expect(productFacing).not.toBe(clip.sourceTitle);
        if (clip.originalClipName) expect(productFacing).not.toBe(clip.originalClipName);
      }
    }
  });

  it("the per-clip library JSON files carry the same universal-id-first provenance (D2)", () => {
    // The loader/debug overlay reads these per-intent files; each must be universal-id-first,
    // with source provenance second (mappedIntent == id; qualityScore present).
    for (const id of ["idle", "talk", "gesture", "walk"]) {
      const file = JSON.parse(
        readFileSync(resolve(TEMPLATE_ROOT, `public/clip-library/${id}.json`), "utf8")
      ) as { id: string; provenance: { clipId: string; mappedIntent: string; qualityScore: number; date: string } };
      expect(file.id).toBe(id);
      expect(file.provenance.clipId).toBe(id);
      expect(file.provenance.mappedIntent).toBe(id);
      expect(typeof file.provenance.qualityScore).toBe("number");
      expect(file.provenance.date).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
  });

  it("AURA_QUALITY tiers (preview/final) are wired in render-live, with the low-fidelity alias (M5)", () => {
    const renderLive = readFileSync(resolve(TEMPLATE_ROOT, "scripts/render-live.ts"), "utf8");
    expect(renderLive).toMatch(/AURA_QUALITY/);
    expect(renderLive).toMatch(/AURA_LOW_FIDELITY/);
    // final tier renders at 1080p/24fps; preview is the 480p/8fps low-fi default.
    expect(renderLive).toMatch(/1920/);
    expect(renderLive).toMatch(/1080/);
  });
});
