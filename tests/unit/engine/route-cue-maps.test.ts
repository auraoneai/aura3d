/**
 * PRD-09 1734 pre-flight: every route and template cue map must already satisfy
 * the C-25 rule — each cue carries `asset` (typed, with a `url`) or a `play`
 * callback — BEFORE `GameAudio`'s adapter throws on the default-synth path.
 *
 * The manifests are the committed cue → asset/type maps each route converts
 * into `createGameAudio` `cues`; importing them read-only is the check the PRD
 * asks for. Routes without a manifest module (Deep Recovery, Rooftop Buckets)
 * never reach `createGameAudio` — they own private url maps — and templates
 * ship no audio cues at all; both facts are asserted so the coverage list
 * cannot silently rot.
 *
 * `assetKey` counts as `asset`: those manifests resolve the key into a typed
 * `{url, hash}` at play time (post-audio pattern).
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { landerAudioManifest } from "../../../apps/showcase-aurora-lander/src/lander-audio";
import { billiardsAudioManifest } from "../../../apps/showcase-bank-shot/src/billiards-audio";
import { blockfallAudioManifest } from "../../../apps/showcase-blockfall-reactor/src/blockfall-audio-manifest";
import { courierAudioManifest } from "../../../apps/showcase-courier-rush/src/courier-audio";
import { heistAudioManifest } from "../../../apps/showcase-gallery-shift/src/heist-audio";
import { GRAVITY_POST_AUDIO_MANIFEST } from "../../../apps/showcase-gravity-post/src/post-audio";
import { hangarAudioManifest } from "../../../apps/showcase-mech-hangar/src/hangar-audio";
import { wingAudioManifest } from "../../../apps/showcase-patrol-wing/src/wing-audio";
import { golfAudioManifest } from "../../../apps/showcase-siege-golf/src/golf-audio";
import { skylineAudioManifest } from "../../../apps/showcase-skyline-runner/src/skyline-audio-manifest";
import { turboAudioManifest } from "../../../apps/showcase-turbo-drift-circuit/src/turbo-audio";
import { vaultAudioManifest } from "../../../apps/showcase-vault-breakers/src/pinball-audio";
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
  "showcase-courier-rush": courierAudioManifest,
  "showcase-gallery-shift": heistAudioManifest,
  "showcase-gravity-post": GRAVITY_POST_AUDIO_MANIFEST,
  "showcase-mech-hangar": hangarAudioManifest,
  "showcase-patrol-wing": wingAudioManifest,
  "showcase-siege-golf": golfAudioManifest,
  "showcase-skyline-runner": skylineAudioManifest,
  "showcase-turbo-drift-circuit": turboAudioManifest,
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

  it("pulse-tunnel stem+sfx entries each carry play or asset (inline cue map)", () => {
    // The tunnel builds its `cues` record inside createTunnelAudio — scan the
    // `id:` entries textually since there is no exported map.
    const src = readFileSync(join(ROOT, "apps/showcase-pulse-tunnel/src/tunnel-audio.ts"), "utf8");
    const block = src.match(/const cueEntries[^=]*=\s*{([\s\S]*?)\n  };/);
    expect(block, "tunnel cueEntries literal not found").not.toBeNull();
    const entries = block![1].match(/\w+:\s*{\s*id:[^}]*}/g) ?? [];
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(entry, `tunnel cue entry lacks asset/play: ${entry}`).toMatch(/play:|asset:/);
    }
  });

  it("route audio modules without a createGameAudio cue map are non-adapters", () => {
    // These routes own private `cueMap`s of typed asset URLs and never call
    // createGameAudio, so the C-25 throw cannot reach them.
    for (const rel of [
      "apps/showcase-deep-recovery/src/deep-audio.ts",
      "apps/showcase-rooftop-buckets/src/buckets-audio.ts"
    ]) {
      const src = readFileSync(join(ROOT, rel), "utf8");
      expect(src, `${rel} started calling createGameAudio — audit its cue map`).not.toMatch(/createGameAudio/);
    }
  });

  it("no create-aura3d template ships an audio cue map", () => {
    const templatesDir = join(ROOT, "packages/create-aura3d/templates");
    const cueMapFiles = readdirSync(templatesDir, { recursive: true })
      .map(String)
      .filter((p) => /audio|cue.?map/i.test(p));
    expect(cueMapFiles).toEqual([]);
  });
});
