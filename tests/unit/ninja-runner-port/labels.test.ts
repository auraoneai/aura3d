import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ABILITY_LABEL, CONTROLS, FORM_LABEL, announcement, districtLabel, resultCopy } from "../../../examples/ninja-runner-port/labels";

const FRANCHISE = /naruto|uzumaki|konoha|hidden leaf|kurama|rasengan|rasenshuriken|sage mode|shinobi|valley of the end|forest of death|naka\b|hokage/i;

describe("ninja-runner-port copy", () => {
  it("uses no franchise names in labels, announcements or the page", () => {
    const text = [
      ...Object.values(FORM_LABEL), ...Object.values(ABILITY_LABEL), ...CONTROLS.flat(),
      ...[0, 200, 800, 1300, 1800, 2400].map(districtLabel),
      ...["unlock", "form", "rasenshuriken", "dropWarning"].flatMap((t) => { const a = announcement(t, "sage"); return a ? [a.title, a.small] : []; }),
      ...[true, false].flatMap((w) => Object.values(resultCopy(w, w))),
      readFileSync("examples/ninja-runner-port/index.html", "utf8").replace(/data-(form|action)="[^"]*"/g, "")
    ].join("\n");
    expect(text).not.toMatch(FRANCHISE);
  });

  it("announces the events that need it and nothing else", () => {
    expect(announcement("unlock", "kurama")?.small).toBe(FORM_LABEL.kurama);
    expect(announcement("jump")).toBeNull();
    expect(resultCopy(false, true).copy).toMatch(/jump/i);
  });

  it("names the districts along the course", () => {
    expect(districtLabel(0)).toBe("Lantern Village");
    expect(districtLabel(2600)).toBe("Valley Gate");
  });
});
