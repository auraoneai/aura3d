import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildArticulatedGladiatorRig,
  GLADIATOR_JOINT_SUFFIXES
} from "../../../apps/showcase-iron-crown/src/art/proceduralModels";
import { buildArenaScene } from "../../../apps/showcase-iron-crown/src/game/arena";
import { createFighterNode, FIGHTERS, fighterSurface } from "../../../apps/showcase-iron-crown/src/game/fighters";
import { STAGES } from "../../../apps/showcase-iron-crown/src/game/stages";

const APP = path.resolve("apps/showcase-iron-crown");
const manifest = JSON.parse(readFileSync(path.join(APP, "aura.assets.json"), "utf8"));
const entries: Array<{ id: string; format: string; source: string; url: string; hash: string; sizeBytes: number }> = manifest.assets ?? manifest;

describe("iron crown fighter restyle & zero-Meshy procedural rigs", () => {
  it("ships zero .glb files in public/aura-assets and aura.assets.json, keeping only verified LUT/texture hashes", () => {
    expect(entries.filter((e) => e.format === "glb")).toHaveLength(0);
    const assetFiles = readdirSync(path.join(APP, "public/aura-assets"));
    expect(assetFiles.filter((f) => f.endsWith(".glb") || f.includes("meshy-candidate"))).toEqual([]);
    for (const entry of entries) {
      const file = path.join(APP, entry.source);
      const buf = readFileSync(file);
      expect(entry.hash).toBe(`sha256-${createHash("sha256").update(buf).digest("hex")}`);
      expect(entry.sizeBytes).toBe(buf.length);
      expect(entry.url).toBe(`/aura-assets/${path.basename(entry.source)}`);
    }
  });

  it("gives Player 1 vs Player 2 distinct heraldic armor colors across all 6 sculpted gladiator archetypes", () => {
    for (const fighter of FIGHTERS) {
      const p1Json = JSON.stringify(createFighterNode("player", fighter, `${fighter.name} P1`, [-2.2, 0, 0], 1, {}).toJSON());
      const p2Json = JSON.stringify(createFighterNode("rival", fighter, `${fighter.name} P2`, [2.2, 0, 0], -1, {}).toJSON());
      expect(p1Json).not.toContain('"kind":"model"');
      expect(p2Json).not.toContain('"kind":"model"');
      expect(p1Json).not.toEqual(p2Json);
    }
  });

  it("supports 3-arg and 4-arg positional buildArticulatedGladiatorRig calls with all 14 joints", () => {
    const defaultRig = JSON.stringify(
      buildArticulatedGladiatorRig("probe-default", { primary: "#1f6865", emissive: "#ff7242" }, 1).toJSON()
    );
    const voltRig = JSON.stringify(
      buildArticulatedGladiatorRig("probe-volt", { primary: "#223047", emissive: "#1cb4e8" }, 1, "volt").toJSON()
    );
    for (const suffix of GLADIATOR_JOINT_SUFFIXES) {
      expect(defaultRig).toContain(`"probe-default-${suffix}"`);
      expect(voltRig).toContain(`"probe-volt-${suffix}"`);
    }
    expect(defaultRig).not.toEqual(voltRig);
  });

  it("tames SSR intensity (<= 0.16) and Volt rim/emissive to prevent fighter ghosting and bloom blowout", () => {
    const volt = FIGHTERS.find((f) => f.id === "volt")!;
    expect(volt.palette.emissiveIntensity).toBeLessThanOrEqual(0.25);
    expect(volt.palette.metallic).toBeLessThanOrEqual(0.25);
    expect(fighterSurface(volt.palette).rim.intensity).toBeLessThanOrEqual(0.4);

    const arenaJson = JSON.stringify(
      buildArenaScene({
        stage: STAGES[0]!,
        p1: FIGHTERS[0]!,
        cpu: volt,
        typedFighterAssets: {},
        playerStart: [-2.2, 0, 0],
        rivalStart: [2.2, 0, 0],
        contactShadows: true,
        reducedMotion: false
      }).toJSON()
    );
    expect(arenaJson).toContain('"intensity":0.16');
    expect(arenaJson).toContain('"roughness":0.34');
  });
});
