/**
 * Courier Rush sound — PRD-09 §10 step 5: a cues object over the shared
 * game-sfx-core pack plus the live van engine loop, replacing courier-audio.ts
 * and the generated-WAV pipeline (scripts/build-sfx.mjs). One-shot cues map to
 * pack ids under /packs/game-sfx-core/; {format} resolves to the probed
 * encoding on the C-25 engine path.
 *
 * Engine: `sound.engine({...van layers})` — three on-load layers crossfaded by
 * RPM with off-load counterparts; `updateEngine(speed, throttle)` feeds
 * `setRpm`/`setLoad` from the drive sim every frame. `city-night` is the
 * ambience bed, started once the first gesture unlocks playback ("playing").
 */
import { createGameSoundEngine, type EngineLoopSpec } from "@aura3d/audio";

export type CourierCue =
  | "dispatch"
  | "pickup"
  | "drop"
  | "early-bonus"
  | "strike"
  | "horn"
  | "shift-clear"
  | "shift-fail";

const asset = (id: string) => ({
  url: `/packs/game-sfx-core/${id}.{format}`,
  license: "CC0",
  provenance: "sample" as const
});

const ids = (...stems: string[]) => stems.map(asset);

/** Route cue map → game-sfx-core ids (route buses fold onto §6.8 ids). */
export const courierCues: Record<CourierCue, { readonly bus: "sfx" | "ui" | "ambience"; readonly volumeDb: number; readonly asset: ReturnType<typeof ids> }> = {
  dispatch: { bus: "ui", volumeDb: -4.4, asset: ids("ui.confirm.00", "ui.confirm.01") },
  pickup: { bus: "sfx", volumeDb: -3.1, asset: ids("impact.plastic.medium.00", "impact.plastic.medium.01", "impact.plastic.medium.02") },
  drop: { bus: "sfx", volumeDb: -2.9, asset: ids("stinger.checkpoint.00", "stinger.checkpoint.01") },
  "early-bonus": { bus: "sfx", volumeDb: -5.2, asset: ids("pickup.combo-up.00", "pickup.combo-up.01") },
  strike: { bus: "sfx", volumeDb: -2.5, asset: ids("impact.metal.medium.00", "impact.metal.medium.01", "impact.metal.medium.02") },
  horn: { bus: "ambience", volumeDb: -6, asset: ids("stinger.alarm.00", "stinger.alarm.01") },
  "shift-clear": { bus: "ui", volumeDb: -2.5, asset: ids("stinger.win.00", "stinger.win.01") },
  "shift-fail": { bus: "ui", volumeDb: -3.1, asset: ids("stinger.lose.00", "stinger.lose.01") }
};

const CITY_BED = {
  bus: "ambience" as const,
  volumeDb: -10.5,
  loop: true,
  asset: ids("ambience.city-night")
};

/** Van engine: three layer anchors across the drive rpm span. */
export const vanEngineSpec: EngineLoopSpec = {
  idleRpm: 700,
  maxRpm: 4800,
  bus: "sfx",
  onLoad: [
    { asset: { url: "/packs/game-sfx-core/vehicle.van.layer0.on.{format}" }, rpm: 700 },
    { asset: { url: "/packs/game-sfx-core/vehicle.van.layer1.on.{format}" }, rpm: 2400 },
    { asset: { url: "/packs/game-sfx-core/vehicle.van.layer2.on.{format}" }, rpm: 4800 }
  ],
  offLoad: [
    { asset: { url: "/packs/game-sfx-core/vehicle.van.layer0.off.{format}" }, rpm: 700 },
    { asset: { url: "/packs/game-sfx-core/vehicle.van.layer1.off.{format}" }, rpm: 2400 },
    { asset: { url: "/packs/game-sfx-core/vehicle.van.layer2.off.{format}" }, rpm: 4800 }
  ]
};

const VAN_MAX_SPEED = 13;

type EngineHandle = ReturnType<ReturnType<typeof createGameSoundEngine<CourierCue | "city-bed">>["engine"]>;

export interface CourierSoundProof {
  readonly contextState: string;
  readonly playedCueCount: number;
  readonly liveVoices: number;
  readonly assetUrls: readonly string[];
  readonly errors: readonly string[];
}

export interface CourierSoundController {
  readonly cue: (name: CourierCue) => Promise<void>;
  readonly unlock: () => Promise<void>;
  /** Start the engine loop + city-night bed (call on first unlock = "playing"). */
  readonly startBeds: () => void;
  /** Feed drive sim state every frame: van speed (m/s) and throttle 0..1. */
  readonly updateEngine: (speed: number, throttle: number) => void;
  readonly recentCues: () => readonly CourierCue[];
  readonly proof: () => CourierSoundProof;
  readonly assetUrls: readonly string[];
}

let cached: ReturnType<typeof createGameSoundEngine<CourierCue | "city-bed">> | null = null;

export function createCourierSound(): CourierSoundController {
  if (!cached) {
    const cues: Parameters<typeof createGameSoundEngine<CourierCue | "city-bed">>[0]["cues"] = {
      ...courierCues,
      "city-bed": CITY_BED
    };
    cached = createGameSoundEngine<CourierCue | "city-bed">({
      buses: { sfx: 0.8, ui: 0.65, ambience: 0.5 },
      cues,
      tier: "high"
    });
  }
  const sound = cached;
  const recent: CourierCue[] = [];
  let engine: EngineHandle | undefined;
  let bedsStarted = false;

  return {
    cue: async (name) => {
      recent.push(name);
      if (recent.length > 24) recent.shift();
      sound.play(name);
    },
    unlock: () => sound.unlock(),
    startBeds() {
      if (bedsStarted) return;
      bedsStarted = true;
      void sound.play("city-bed");
      engine = sound.engine(vanEngineSpec);
    },
    updateEngine(speed, throttle) {
      if (!engine) return;
      const frac = Math.min(1, Math.abs(speed) / VAN_MAX_SPEED);
      engine.setRpm(vanEngineSpec.idleRpm + frac * (vanEngineSpec.maxRpm - vanEngineSpec.idleRpm));
      engine.setLoad(Math.min(1, Math.max(0, throttle)));
    },
    recentCues: () => recent.slice(),
    proof() {
      const p = sound.proof();
      return {
        contextState: p.contextState,
        playedCueCount: p.voicesPlayed,
        liveVoices: p.liveVoices,
        assetUrls: Object.values(courierCues).flatMap((d) => d.asset.map((a) => a.url)),
        errors: p.errors.slice()
      };
    },
    assetUrls: Object.values(courierCues).flatMap((d) => d.asset.map((a) => a.url))
  };
}
