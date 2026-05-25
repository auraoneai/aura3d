import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

test("Animation Studio Pro has real app screenshot evidence and runtime state", async () => {
  const source = JSON.parse(readFileSync("tests/reports/external-parity-character-viewer-browser.json", "utf8")) as {
    ok?: boolean;
    screenshots?: readonly string[];
    states?: { readonly app?: { readonly id?: string; readonly normalizedTime?: number; readonly timelineScrub?: boolean; readonly featureChecklist?: readonly string[] } };
  };
  const ok = source.ok === true &&
    source.states?.app?.id === "animation-studio-pro" &&
    source.states.app.timelineScrub === true &&
    Number(source.states.app.normalizedTime ?? 0) >= 0 &&
    source.states.app.featureChecklist?.includes("timeline-scrub") === true &&
    source.screenshots?.some((path) => path.includes("animation-studio-pro.png")) === true;
  writeFileSync(join(process.cwd(), "tests/reports/external-parity-animation-studio-pro-browser.json"), `${JSON.stringify({ ok, sourceReport: "tests/reports/external-parity-character-viewer-browser.json" }, null, 2)}\n`);
  expect(ok).toBe(true);
});
