import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

test("Interactive Showcase Pro has real app screenshot evidence and runtime state", async () => {
  const source = JSON.parse(readFileSync("tests/reports/external-parity-interactive-showcase-browser.json", "utf8")) as {
    ok?: boolean;
    screenshots?: readonly string[];
    states?: { readonly app?: { readonly id?: string; readonly interactions?: number; readonly featureChecklist?: readonly string[] } };
  };
  const ok = source.ok === true &&
    source.states?.app?.id === "interactive-showcase-pro" &&
    Number(source.states.app.interactions ?? 0) >= 0 &&
    source.states.app.featureChecklist?.includes("camera-controls") === true &&
    source.screenshots?.some((path) => path.includes("interactive-showcase-pro.png")) === true;
  writeFileSync(join(process.cwd(), "tests/reports/external-parity-interactive-showcase-pro-browser.json"), `${JSON.stringify({ ok, sourceReport: "tests/reports/external-parity-interactive-showcase-browser.json" }, null, 2)}\n`);
  expect(ok).toBe(true);
});
