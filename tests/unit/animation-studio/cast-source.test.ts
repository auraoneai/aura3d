import { describe, expect, it } from "vitest";
import {
  pickSetForPrompt
} from "../../../packages/create-aura3d/templates/animation-studio/src/set-templates";
import { compileEpisodeDocument } from "../../../packages/create-aura3d/templates/animation-studio/src/director/compile-episode-document";
import type { DirectorSceneInput } from "../../../packages/create-aura3d/templates/animation-studio/src/director/director-heuristics";
import {
  castProvenance,
  mapDocument,
  type RuntimeCharacter
} from "../../../apps/animation-studio-web/src/state/mapDocument";

/**
 * Phase E3 — authored-fallback ≠ catalog-resolved ≠ user-uploaded.
 *
 * The UI data model + Outliner labels must SEPARATE cast provenance so an authored/placeholder
 * fallback is never presented as catalog evidence. These tests:
 *  1. pin the provenance classifier (`castProvenance`) for each source class, and
 *  2. for the four PRD prompts ("two robots in a garage", "a fox and a bear in a forest",
 *     "two office workers arguing", "a chef teaching a child") report the SET source (which set
 *     template the prompt drives) and the ANIMATION source (the director's per-beat performance
 *     clips), proving cast/set/animation are all prompt-derived — never the Moon-Garden fixture.
 */

const PROMPTS = [
  "two robots in a garage",
  "a fox and a bear in a forest",
  "two office workers arguing",
  "a chef teaching a child"
] as const;

/** A tiny prompt→cast suggestion mirroring the CLI's heuristic, just enough to drive the director. */
function castFor(prompt: string): { id: string; entersFrom: "left" | "right" }[] {
  const names = (prompt.match(/\b[A-Z][a-z]{2,}\b/g) ?? []).map((s) => s.toLowerCase());
  if (names.length >= 2) return [{ id: names[0]!, entersFrom: "left" }, { id: names[1]!, entersFrom: "right" }];
  const plural = prompt.toLowerCase().match(/\b([a-z]{4,})s\b/);
  if (plural) return [{ id: `${plural[1]}-1`, entersFrom: "left" }, { id: `${plural[1]}-2`, entersFrom: "right" }];
  const words = prompt.toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 3 && !["the", "and", "two", "a"].includes(w));
  return [{ id: words[0] ?? "hero", entersFrom: "left" }, { id: words[1] ?? "second", entersFrom: "right" }];
}

describe("cast/set/animation provenance is honest + prompt-derived (E3)", () => {
  it("classifies the three cast sources distinctly", () => {
    const authored: RuntimeCharacter = { id: "hero" };
    const catalog: RuntimeCharacter = {
      id: "robot-1",
      sourceUrl: "https://catalog.example/robot.glb",
      attribution: "Worn Robot (Objaverse, CC-BY-4.0)"
    };
    const uploaded: RuntimeCharacter = { id: "mine", source: "user-uploaded", attribution: "my-character.glb" };

    expect(castProvenance(authored).source).toBe("authored-fallback");
    expect(castProvenance(catalog).source).toBe("catalog-resolved");
    expect(castProvenance(catalog).sourceLabel).toContain("Objaverse");
    expect(castProvenance(uploaded).source).toBe("user-uploaded");

    // A file: source URL also reads as an upload even without an explicit source field.
    expect(castProvenance({ id: "x", sourceUrl: "file:///tmp/x.glb" }).source).toBe("user-uploaded");
  });

  it("an authored fallback is NEVER labeled as catalog evidence", () => {
    const authored = castProvenance({ id: "placeholder" });
    expect(authored.source).toBe("authored-fallback");
    expect(authored.source).not.toBe("catalog-resolved");
    expect(authored.sourceLabel.toLowerCase()).toContain("fallback");
  });

  it("the Outliner view-model carries a source + sourceLabel for every cast member", () => {
    const ui = mapDocument({
      id: "scene",
      duration: 12,
      assets: {
        characters: [
          { id: "robot-1", sourceUrl: "https://catalog.example/r.glb", attribution: "Robot (CC-BY)" },
          { id: "fallback-bot" }
        ],
        props: []
      },
      shots: [{ shotId: "s0", presetId: "two-shot", startTime: 0, endTime: 12 }],
      dialogue: { language: "en", lines: [] }
    });
    expect(ui.cast).toHaveLength(2);
    expect(ui.cast[0]!.source).toBe("catalog-resolved");
    expect(ui.cast[1]!.source).toBe("authored-fallback");
    for (const c of ui.cast) {
      expect(["authored-fallback", "catalog-resolved", "user-uploaded"]).toContain(c.source);
      expect(c.sourceLabel.length).toBeGreaterThan(0);
    }
  });

  // For each prompt: build the scene the SAME way the CLI does (set template from the prompt,
  // director performance from prompt-derived cast/dialogue) and report set + animation source.
  it.each(PROMPTS)("prompt %p drives a prompt-specific set + animation (no Moon fixture)", (prompt) => {
    const template = pickSetForPrompt(prompt);
    const cast = castFor(prompt);
    const scene: DirectorSceneInput = {
      duration: 18,
      characters: cast,
      shots: [
        { shotId: "s0", startTime: 0, endTime: 6 },
        { shotId: "s1", startTime: 6, endTime: 12 },
        { shotId: "s2", startTime: 12, endTime: 18 }
      ],
      dialogue: [
        { lineId: "l0", speakerId: cast[0]!.id, startTime: 0.2, endTime: 3.5, text: "Did you handle this?" },
        { lineId: "l1", speakerId: cast[1]!.id, startTime: 3.7, endTime: 5.8, text: "No, I did NOT!" },
        { lineId: "l2", speakerId: cast[0]!.id, startTime: 6.2, endTime: 9.0, text: "Then walk over here and help." }
      ],
      walkableBounds: template.walkableBounds,
      props: []
    };
    const { document } = compileEpisodeDocument({
      id: `scene-${template.id}`,
      duration: 18,
      assets: { characters: [], props: [] },
      set: template.set,
      scene
    });

    // SET source: the prompt selects a real template; the four PRD prompts never select moon-garden.
    expect(template.id).not.toBe("moon-garden");

    // ANIMATION source: the director's per-beat clips are the universal performance vocabulary,
    // prompt-derived and varied — not all idle/talk, never a Moon-Garden embedded clip name.
    const clips = document.blocking.flatMap((b) => b.shots.map((s) => s.clip));
    expect(clips.length).toBeGreaterThan(0);
    const VOCAB = new Set(["idle", "talk", "gesture", "point", "nod", "walk", "run", "react"]);
    for (const c of clips) expect(VOCAB.has(c)).toBe(true);
    expect(clips.every((c) => c === "idle" || c === "talk")).toBe(false);

    // CAST source: the prompt-built skeleton has an EMPTY cast (real characters resolved later);
    // so the only honest report is "unresolved" — never a leaked authored Moon-Garden cast.
    expect(document.assets.characters).toHaveLength(0);

    // Compose the honest per-prompt source report (printed for the reviewer).
    const report = {
      prompt,
      setSource: `template:${template.id}`,
      animationSource: `director:[${[...new Set(clips)].join(",")}]`,
      castSource: document.assets.characters.length === 0 ? "unresolved (resolve real characters via `cast add`)" : "resolved"
    };
    // eslint-disable-next-line no-console
    console.log(`E3 source report — ${JSON.stringify(report)}`);
    expect(report.setSource).not.toContain("moon");
    expect(report.animationSource).not.toContain("moon");
  });
});
