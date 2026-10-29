import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * D-07 / RP-07: outside `?capture=1` / `?qa=1` the drawing buffer is not preserved, so the `pixels()` QA hook must render in the
 * same task as its `drawImage` read or it measures a cleared (black) canvas. main.ts boots a browser app on import, so this checks
 * the source order; the behaviour itself is measured by tests/browser/audit-fix/last-train-port.spec.ts on the remote runner.
 */
const source = readFileSync("examples/last-train-port/main.ts", "utf8");

function body(name: string): string {
  const start = source.indexOf(`function ${name}(`);
  expect(start, `${name}() exists`).toBeGreaterThanOrEqual(0);
  const open = source.indexOf("{\n", start);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}" && --depth === 0) return source.slice(open, i + 1);
  }
  throw new Error(`unterminated ${name}()`);
}

describe("last-train-port pixels() QA hook", () => {
  it("renders before it reads the canvas", () => {
    const fn = body("pixels");
    const renderAt = fn.search(/\brender\(\)|\bapp\??\.(screenshot|step)\(/);
    const readAt = fn.indexOf("drawImage(canvas");
    expect(readAt, "pixels() reads the canvas").toBeGreaterThan(0);
    expect(renderAt, "pixels() renders first").toBeGreaterThanOrEqual(0);
    expect(renderAt).toBeLessThan(readAt);
  });
});
