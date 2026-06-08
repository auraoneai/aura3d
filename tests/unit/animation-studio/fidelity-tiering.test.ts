import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  gradeCharacterFidelity as gradeStudio,
  gradeSceneFidelity as gradeSceneStudio,
  fidelityLabel as labelStudio,
  type CharacterFidelityInput as StudioInput
} from "../../../packages/create-aura3d/templates/animation-studio/src/fidelity";
import {
  gradeCharacterFidelity as gradeUi,
  gradeSceneFidelity as gradeSceneUi,
  fidelityLabel as labelUi
} from "../../../apps/animation-studio-web/src/state/fidelity";
import { mapDocument, type RuntimeDocument } from "../../../apps/animation-studio-web/src/state/mapDocument";
import {
  createFidelityReport,
  writeFidelityReport
} from "../../../tools/animation-studio-fidelity-report/index";

/**
 * PRD Phase M7 — honest quality tiering. A/B/C grade per character + scene, surfaced in the
 * resolver report (the fidelity-report tool) AND the UI (mapDocument). C is ALWAYS "previz".
 */

describe("M7 fidelity tiering — grading rules", () => {
  it("grades A: curated/uploaded grade-A rig + real motion + shading + shadows", () => {
    const r = gradeStudio({
      id: "hero",
      rigGrade: "A",
      provenance: "curated",
      motionSource: "mocap",
      shading: "cel",
      shadows: true
    });
    expect(r.grade).toBe("A");
    expect(r.previz).toBe(false);
  });

  it("grades B: catalog rig graded-ok but procedural motion / shadows off (watchable, not previz)", () => {
    const r = gradeStudio({
      id: "robot",
      rigGrade: "A",
      provenance: "catalog-resolved",
      motionSource: "procedural",
      shading: "cel",
      shadows: false
    });
    expect(r.grade).toBe("B");
    expect(r.previz).toBe(false);
    expect(r.reason).toMatch(/catalog/);
  });

  it("grades C (previz): an authored-fallback mascot, regardless of the other ingredients", () => {
    const r = gradeStudio({
      id: "mascot",
      rigGrade: "A", // even a notionally good rig grade can't lift an authored placeholder
      provenance: "authored-fallback",
      motionSource: "mocap",
      shading: "cel",
      shadows: true
    });
    expect(r.grade).toBe("C");
    expect(r.previz).toBe(true);
    expect(r.reason).toMatch(/previz/);
  });

  it("grades C (previz): a sparse rig (grade C/D) even from the catalog", () => {
    expect(gradeStudio({ id: "x", rigGrade: "C", provenance: "catalog-resolved" }).grade).toBe("C");
    expect(gradeStudio({ id: "y", rigGrade: "D", provenance: "catalog-resolved" }).previz).toBe(true);
  });

  it("scene grade is the FLOOR of its cast (one previz character makes the scene previz)", () => {
    const inputs: StudioInput[] = [
      { id: "a", rigGrade: "A", provenance: "curated", motionSource: "mocap", shading: "cel", shadows: true },
      { id: "b", rigGrade: "A", provenance: "authored-fallback" } // mascot → C
    ];
    const scene = gradeSceneStudio(inputs);
    expect(scene.grade).toBe("C");
    expect(scene.previz).toBe(true);
  });

  it("an empty scene is previz", () => {
    expect(gradeSceneStudio([]).previz).toBe(true);
  });

  it("C is labeled 'Previz', never a finished grade", () => {
    expect(labelStudio("C")).toBe("Previz");
    expect(labelStudio("A")).toBe("Grade A");
  });

  // The studio (render-side) and UI copies of the rules MUST agree, or the badge would lie.
  it("studio and UI grading copies produce IDENTICAL verdicts", () => {
    const cases: StudioInput[] = [
      { id: "1", rigGrade: "A", provenance: "curated", motionSource: "mocap", shading: "cel", shadows: true },
      { id: "2", rigGrade: "A", provenance: "catalog-resolved", motionSource: "procedural", shading: "pbr", shadows: false },
      { id: "3", rigGrade: "C", provenance: "catalog-resolved" },
      { id: "4", provenance: "authored-fallback" },
      { id: "5", rigGrade: "B", provenance: "user-uploaded", motionSource: "extracted", shading: "cel", shadows: true }
    ];
    for (const c of cases) {
      const s = gradeStudio(c);
      const u = gradeUi(c);
      expect({ grade: u.grade, previz: u.previz }).toEqual({ grade: s.grade, previz: s.previz });
    }
    expect(gradeSceneUi(cases).grade).toBe(gradeSceneStudio(cases).grade);
    expect(labelUi("C")).toBe(labelStudio("C"));
  });
});

describe("M7 fidelity tiering — resolver/report tool surface", () => {
  it("joins resolver reports + document + summary into a per-scene/character fidelity report", () => {
    const root = mkdtempSync(join(tmpdir(), "m7-fidelity-"));
    const sceneDir = "packages/create-aura3d/templates/animation-studio/dist/scene";
    const summaryRel = "packages/create-aura3d/templates/animation-studio/dist/episodes/live-3d/render-live-summary.json";

    writeJson(root, join(sceneDir, "working.document.json"), {
      id: "garage-scene",
      assets: {
        characters: [
          { id: "rust", source: "catalog-resolved", attribution: "Rusty Bot (CC-BY)" },
          { id: "mara", source: "user-uploaded", sourceUrl: "file:///tmp/mara.glb" }
        ]
      }
    });
    writeJson(root, join(sceneDir, "rust.resolver-report.json"), { id: "rust", accepted: { rigGrade: "A" } });
    writeJson(root, join(sceneDir, "mara.resolver-report.json"), { id: "mara", accepted: { rigGrade: "A" } });
    writeJson(root, summaryRel, {
      toon: { bands: 6 },
      realShadows: true,
      bodyMotion: [
        { characterId: "rust", clipSource: "procedural" },
        { characterId: "mara", clipSource: "extracted" }
      ]
    });

    const report = createFidelityReport(root, { generatedAt: "2026-06-07T00:00:00.000Z" });
    writeFidelityReport(root, report);

    expect(report.schema).toBe("animation-studio-fidelity/v1");
    expect(report.sceneId).toBe("garage-scene");
    const rust = report.scene.characters.find((c) => c.id === "rust");
    const mara = report.scene.characters.find((c) => c.id === "mara");
    // rust: catalog rig A + procedural motion → B. mara: uploaded rig A + extracted + cel + shadows → A.
    expect(rust?.grade).toBe("B");
    expect(mara?.grade).toBe("A");
    // Scene grade = floor = B.
    expect(report.scene.grade).toBe("B");
    expect(report.previz).toBe(false);
    // Report is persisted with the computed grade (no hard-coded pass).
    const onDisk = JSON.parse(readFileSync(join(root, "tests/reports/animation-studio/fidelity.json"), "utf8"));
    expect(onDisk.scene.grade).toBe("B");
  });

  it("labels a mascot scene as PREVIZ", () => {
    const root = mkdtempSync(join(tmpdir(), "m7-previz-"));
    const sceneDir = "packages/create-aura3d/templates/animation-studio/dist/scene";
    writeJson(root, join(sceneDir, "working.document.json"), {
      id: "mascot-scene",
      assets: { characters: [{ id: "blip" }] } // no source → authored-fallback
    });

    const report = createFidelityReport(root, { generatedAt: "2026-06-07T00:00:00.000Z" });
    expect(report.scene.grade).toBe("C");
    expect(report.previz).toBe(true);
    expect(report.scene.reason).toMatch(/previz/i);
  });
});

describe("M7 fidelity tiering — UI mapDocument surface", () => {
  it("attaches a per-cast + scene fidelity grade to the UI view model", () => {
    const doc: RuntimeDocument = {
      id: "scene",
      duration: 10,
      shots: [{ shotId: "s1", presetId: "two-shot", startTime: 0, endTime: 10 }],
      assets: {
        characters: [
          { id: "hero", source: "curated", rigGrade: "A", motionSource: "mocap" } as never,
          { id: "extra" } // authored-fallback → previz
        ]
      },
      dialogue: { lines: [] }
    };
    const view = mapDocument(doc);
    const hero = view.cast.find((c) => c.id === "hero");
    const extra = view.cast.find((c) => c.id === "extra");
    // hero: curated A + mocap (document carries no shading/shadows → B from the document-only axes).
    expect(hero?.fidelity.grade).toMatch(/A|B/);
    expect(extra?.fidelity.grade).toBe("C");
    expect(extra?.fidelity.previz).toBe(true);
    // Scene floor = C (the authored-fallback extra), so the studio header reads "previz".
    expect(view.fidelity.grade).toBe("C");
    expect(view.fidelity.previz).toBe(true);
  });
});

function writeJson(root: string, path: string, value: unknown): void {
  const absolute = join(root, path);
  mkdirSync(join(absolute, ".."), { recursive: true });
  writeFileSync(absolute, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
