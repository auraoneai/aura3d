import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

test("Scene Studio Pro has real app screenshot evidence and runtime state", async () => {
  const source = JSON.parse(readFileSync("tests/reports/v4-interior-scene-browser.json", "utf8")) as {
    ok?: boolean;
    screenshots?: readonly string[];
    states?: { readonly app?: { readonly id?: string; readonly drawCalls?: number; readonly featureChecklist?: readonly string[] } };
  };
  const ok = source.ok === true &&
    source.states?.app?.id === "scene-studio-pro" &&
    Number(source.states.app.drawCalls ?? 0) > 0 &&
    source.states.app.featureChecklist?.includes("multi-object-interior") === true &&
    source.screenshots?.some((path) => path.includes("scene-studio-pro.png")) === true;
  writeFileSync(join(process.cwd(), "tests/reports/v4-scene-studio-pro-browser.json"), `${JSON.stringify({ ok, sourceReport: "tests/reports/v4-interior-scene-browser.json" }, null, 2)}\n`);
  expect(ok).toBe(true);
});
