/**
 * PRD-09 1734 pre-flight: every route cue map must already satisfy the C-25
 * rule — each cue carries `asset` (typed, with a `url`) or a `play` callback —
 * BEFORE `GameAudio`'s adapter throws on the default-synth path.
 *
 * The manifests are the committed cue → asset/type maps each route converts
 * into `createGameAudio` `cues`; importing them read-only is the check the PRD
 * asks for. `assetKey` counts as `asset`: those manifests resolve the key into
 * a typed `{url, hash}` at play time (post-audio pattern).
 */

import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { landerAudioManifest } from "../../../apps/showcase-aurora-lander/src/lander-audio";
import { billiardsAudioManifest } from "../../../apps/showcase-bank-shot/src/legacy/billiards-audio";
import { blockfallAudioManifest } from "../../../apps/showcase-blockfall-reactor/src/blockfall-audio-manifest";
import { vaultAudioManifest } from "../../../apps/showcase-vault-breakers/src/legacy/pinball-audio";
import { auraClashAudioManifest } from "../../../apps/aura-clash-showcase/src/playable/audio/auraClashAudioManifest";

const ROOT = join(__dirname, "../../..");

interface CueLike {
  readonly cue?: string;
  readonly asset?: { readonly url?: string };
  readonly assetKey?: string;
  readonly play?: unknown;
}

const ROUTE_MANIFESTS: Readonly<Record<string, Readonly<Record<string, CueLike>>>> = {
  "showcase-aurora-lander": landerAudioManifest,
  "showcase-bank-shot": billiardsAudioManifest,
  "showcase-blockfall-reactor": blockfallAudioManifest,
  "showcase-vault-breakers": vaultAudioManifest,
  "aura-clash-showcase": auraClashAudioManifest
};

const cueSatisfied = (def: CueLike): boolean =>
  Boolean(def.asset?.url) || Boolean(def.assetKey) || typeof def.play === "function";

describe("route/template cue maps satisfy C-25 (PRD-09 1734)", () => {
  for (const [route, manifest] of Object.entries(ROUTE_MANIFESTS)) {
    it(`${route}: every cue has asset or play`, () => {
      const offenders = Object.entries(manifest)
        .filter(([, def]) => !cueSatisfied(def))
        .map(([id]) => id);
      expect(offenders, `${route} cues without asset/play — patch into its Q-14-1 set`).toEqual([]);
      expect(Object.keys(manifest).length).toBeGreaterThan(0);
    });
  }

  it("no create-aura3d template ships an audio cue map", () => {
    const templatesDir = join(ROOT, "packages/create-aura3d/templates");
    const cueMapFiles = readdirSync(templatesDir, { recursive: true })
      .map(String)
      .filter((p) => /audio|cue.?map/i.test(p));
    expect(cueMapFiles).toEqual([]);
  });
});
