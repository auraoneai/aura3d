// PRD-15 T0-20 — packed-consumer-check dist URL rule. The packed dist must
// never point `new URL(..., import.meta.url)` at a TypeScript source (the
// retarget worker regression), and a relative `*.worker.js` target must be
// packed beside its caller. Checked-in dist-shaped fixtures prove the rule
// fails on both regressions and passes the emitted shape.
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { findDistUrlViolations } from "../../../tools/packed-consumer-check/index";

const FIXTURES = resolve(__dirname, "../../../tools/packed-consumer-check/fixtures/dist-urls");

describe("packed consumer check dist URL rule (T0-20)", () => {
  it("fails a dist file whose new URL(...) targets a .ts source", () => {
    expect(findDistUrlViolations(join(FIXTURES, "ts-source"))).toEqual([
      { file: "animation/pose/RetargetWorker.js", specifier: "./retarget.worker.ts", reason: "typescript-source" }
    ]);
  });

  it("fails a relative .worker.js URL whose worker was not packed", () => {
    expect(findDistUrlViolations(join(FIXTURES, "missing-worker"))).toEqual([
      { file: "animation/pose/RetargetWorker.js", specifier: "./retarget.worker.js", reason: "missing-worker" }
    ]);
  });

  it("passes the emitted shape: .js URL with the worker beside it", () => {
    expect(findDistUrlViolations(join(FIXTURES, "emitted"))).toEqual([]);
  });
});
