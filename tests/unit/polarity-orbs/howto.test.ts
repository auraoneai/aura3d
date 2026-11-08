import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CONFIG } from "../../../apps/showcase-polarity-orbs/src/sim";

const html = readFileSync(resolve(__dirname, "../../../apps/showcase-polarity-orbs/index.html"), "utf8");
const panel = html.slice(html.indexOf('id="howto-screen"'), html.indexOf('id="render-error"'));

describe("polarity orbs how to play panel", () => {
  it("is an accessible dialog reachable from the title and pause screens", () => {
    expect(panel).toContain('role="dialog"');
    expect(panel).toContain('aria-labelledby="howto-title"');
    expect(panel).toContain('id="howto-title"');
    expect(panel).toContain('id="btn-howto-close"');
    expect(html).toContain('id="btn-howto"');
    expect(html).toContain('id="btn-howto-pause"');
  });

  it("states the sim's real numbers", () => {
    const text = panel.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    expect(text).toContain(`for ${CONFIG.RAINBOW_DURATION} s`);
    expect(text).toContain(`for ${CONFIG.X2_DURATION} s`);
    expect(text).toContain(`For ${CONFIG.MAGNET_DURATION} s`.toLowerCase());
    expect(text).toContain(`${CONFIG.POINTS_ORB} × your multiplier`);
    expect(text).toContain(`Every ${CONFIG.COMBO_PER_MULT} matches`);
    expect(text).toContain(`x${CONFIG.MAX_MULT}`);
    expect(text).toContain(`+${CONFIG.MILESTONE_BONUS}`);
    expect(text).toContain(`every ${CONFIG.MILESTONE} points`);
    expect(text).toContain(`start with ${CONFIG.MAX_LIVES} lives`);
  });
});
