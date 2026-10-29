import { describe, expect, it } from "vitest";
import { appPagePath, composePortPage, examplePagePath, readFileText, readNeutralLabels } from "../../../tools/showcase-port-pages/lib.mjs";

describe("the live wrapper page carries the example page's markup and CSS (audit WW-1)", () => {
  const app = readFileText(appPagePath("where-the-wind-wanders")) as string;
  const example = readFileText(examplePagePath("where-the-wind-wanders-port")) as string;
  it("is exactly the page sync.mjs composes from the example", () => {
    expect(app).toBe(composePortPage({ exampleHtml: example, appHtml: app, labels: readNeutralLabels("where-the-wind-wanders") }));
  });
  it("has the phone HUD rules: the hint moves under the quest counter, and touch hides it", () => {
    expect(app).toMatch(/@media \(max-width: 560px\)[\s\S]*#hint \{ top: calc\(/);
    expect(app).toMatch(/@media \(pointer: coarse\) \{ #hint \{ display: none; \}/);
    expect(app).toContain('class="aura-credit"');
  });
});
