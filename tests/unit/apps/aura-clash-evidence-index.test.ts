import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  auraClashEvidence,
  auraClashRuntimeMutationEvidenceContract,
} from "../../../apps/aura-clash-showcase/src/evidence/evidenceModel";
import { AURA_CLASH_ARENA_PROOF_SCHEMA_VERSION } from "../../../apps/aura-clash-showcase/src/playable/evidence/auraClashArenaProof";

describe("Aura Clash evidence route current proof wiring", () => {
  it("declares the current arena proof schema and 1.0.6 artifacts in evidence/index.html", () => {
    const source = readFileSync(resolve("apps/aura-clash-showcase/evidence/index.html"), "utf8");

    expect(source).toContain('name="aura-clash-proof-schema" content="aura-clash-arena-proof/v1"');
    expect(source).toContain("window.__AURA_CLASH_ARENA_PROOF__");
    expect(source).toContain("/launch-evidence/aura-clash-106-readiness.json");
    expect(source).toContain("/launch-evidence/deployed-106-proof.json");
    expect(source).toContain("/launch-evidence/playable-106-first-frame.png");
    expect(source).not.toMatch(/game-v6|v[0-9]+UAL|v[0-9]+Catalog|attempt-prefixed launch screenshot/i);
  });

  it("keeps the evidence model pointed at current arena proof files", () => {
    const serialized = JSON.stringify(auraClashEvidence);

    expect(serialized).toContain("apps/aura-clash-showcase/src/playable/AuraClashArenaApp.ts");
    expect(serialized).toContain("apps/aura-clash-showcase/src/playable/evidence/auraClashArenaProof.ts");
    expect(serialized).toContain("window.__AURA_CLASH_ARENA_PROOF__");
    expect(serialized).not.toContain("apps/aura-clash-showcase/src/game/AuraClashGame.ts");
    expect(serialized).not.toContain("apps/aura-clash-showcase/src/game/HitboxSystem.ts");
    expect(serialized).not.toContain("apps/aura-clash-showcase/src/game/types.ts");
  });

  /**
   * The runtime-mutation contract is rendered verbatim on the public /evidence/ page, so every
   * source file it cites must exist and the runtime export it names must be the one the app
   * actually assigns. This regressed once: the contract still pointed at src/game/AuraClashGame.ts,
   * src/game/CameraDirector.ts and window.__AURA_CLASH_RUNTIME_EVIDENCE__ long after those were
   * deleted, and the suite stayed green because it only inspected `auraClashEvidence`.
   */
  it("cites only source files that exist for the runtime mutation contract", () => {
    expect(auraClashRuntimeMutationEvidenceContract.sourceFiles.length).toBeGreaterThan(0);

    for (const sourceFile of auraClashRuntimeMutationEvidenceContract.sourceFiles) {
      expect(existsSync(resolve(sourceFile)), `${sourceFile} is cited but does not exist`).toBe(true);
    }
  });

  it("names the runtime export the playable app actually assigns", () => {
    const runtimeExport = auraClashRuntimeMutationEvidenceContract.runtimeExport;
    expect(runtimeExport).toContain("__AURA_CLASH_ARENA_PROOF__");
    expect(runtimeExport).not.toContain("__AURA_CLASH_RUNTIME_EVIDENCE__");

    const appSource = readFileSync(
      resolve("apps/aura-clash-showcase/src/playable/AuraClashArenaApp.ts"),
      "utf8",
    );
    const globalName = runtimeExport.replace(/^window\./, "").split(".")[0] ?? "";
    expect(appSource).toContain(globalName);
  });

  it("grounds every required signal in a field of the current arena proof schema", () => {
    const schemaSource = readFileSync(
      resolve("apps/aura-clash-showcase/src/playable/evidence/auraClashArenaProof.ts"),
      "utf8",
    );
    const declaredFields = new Set(
      [...schemaSource.matchAll(/readonly\s+([A-Za-z0-9_]+)\s*[?:]/g)].map((match) => match[1]),
    );

    expect(auraClashRuntimeMutationEvidenceContract.requiredSignals.length).toBeGreaterThan(0);

    for (const signal of auraClashRuntimeMutationEvidenceContract.requiredSignals) {
      const referenced = [...signal.matchAll(/[A-Za-z][A-Za-z0-9_]*/g)]
        .map((match) => match[0])
        .filter((token) => declaredFields.has(token));
      expect(referenced.length, `signal has no field from the proof schema: ${signal}`).toBeGreaterThan(0);
    }
  });

  it("refers to no deleted pre-arena runtime modules anywhere in the contract", () => {
    const serialized = JSON.stringify(auraClashRuntimeMutationEvidenceContract);
    expect(serialized).not.toContain("src/game/AuraClashGame.ts");
    expect(serialized).not.toContain("src/game/CameraDirector.ts");
    expect(serialized).not.toContain("src/game/HitboxSystem.ts");
  });

  it("keeps the evidence page schema pin aligned with the runtime schema constant", () => {
    const source = readFileSync(resolve("apps/aura-clash-showcase/evidence/index.html"), "utf8");
    expect(source).toContain(
      `content="${AURA_CLASH_ARENA_PROOF_SCHEMA_VERSION}"`,
    );
  });
});
