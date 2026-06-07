import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { auraClashEvidence } from "../../../apps/aura-clash-showcase/src/evidence/evidenceModel";

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
});
