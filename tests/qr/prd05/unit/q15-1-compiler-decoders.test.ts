/**
 * Q-15-1 (#461) contract: every typed-GLB actor the compiler creates carries
 * the C-16 decoder options. With A3D_QR_ASSETS on, a compressed GLB on the
 * default model() path requires meshopt/draco/KTX2 from /aura-decoders/ and
 * fails closed. Without the spread it would parse with no decoder.
 *
 * Source-level contract test: it counts `createTypedGLBActor({` call sites in
 * the compiler and requires a decoder-options spread for each one. A new call
 * site without it fails here.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const COMPILER = ["renderer.ts", "compileScene.ts"].map((file) =>
  resolve(__dirname, "../../../../packages/engine/src/agent-api/compiler", file)
);

describe("Q-15-1: compiler forwards C-16 decoder options to every typed-GLB actor", () => {
  for (const file of COMPILER) {
    it(file.split("/").pop()!, () => {
      const source = readFileSync(file, "utf8");
      const calls = source.split("createTypedGLBActor({").slice(1);
      expect(calls.length).toBeGreaterThan(0);
      for (const call of calls) {
        const body = call.slice(0, call.indexOf("})"));
        expect(body, "createTypedGLBActor call without decoder options").toMatch(/\.\.\.(decoderOptions|typedGLBActorDecoderOptions\()/);
      }
    });
  }
});
