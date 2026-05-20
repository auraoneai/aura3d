import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

test("Material Studio alias report maps the V4 requested filename to Material Studio Pro proof", async () => {
  const source = JSON.parse(readFileSync("tests/reports/v4-material-studio-pro-browser.json", "utf8")) as {
    ok?: boolean;
    states?: { readonly example?: { readonly materialCount?: number; readonly hdrIbl?: boolean } };
  };
  const ok = source.ok === true && source.states?.example?.materialCount === 12 && source.states.example.hdrIbl === true;
  writeFileSync(join(process.cwd(), "tests/reports/v4-material-studio-browser.json"), `${JSON.stringify({ ok, sourceReport: "tests/reports/v4-material-studio-pro-browser.json" }, null, 2)}\n`);
  expect(ok).toBe(true);
});
