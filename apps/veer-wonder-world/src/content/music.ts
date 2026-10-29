// Background music beds (PRD 04 B06/D15; PRD 01 section 7; PRD 02 section 3).
//
// One quiet instrumental loop per world. Beds are calm, low in dynamics, have
// no vocals, no drum kits or stingers, and loop seamlessly; the mixer ducks
// them under every spoken line and a grown-up can turn music off. `prompt`
// goes to the music generator (ElevenLabs music through Kiro Prism,
// tools/gen-audio.ts), which appends "Instrumental only, no vocals."

import type { MusicBedId, WorldId } from "../types.js";

export interface MusicBedSpec {
  prompt: string;
  seconds: number;
}

export const MUSIC_BEDS: Record<MusicBedId, MusicBedSpec> = {
  meadowBed: {
    prompt: "calm, quiet instrumental background loop for a sunny toy meadow, soft acoustic guitar, gentle glockenspiel and light pizzicato strings, 72 bpm, warm and simple, low dynamic range, no drums, seamless loop",
    seconds: 60
  },
  gardenBed: {
    prompt: "calm, quiet instrumental background loop for a playful little music garden, soft marimba, gentle ukulele and light hand shaker, 76 bpm, low dynamic range, no drum kit, seamless loop",
    seconds: 60
  },
  barnBed: {
    prompt: "calm, quiet instrumental background loop for a friendly toy barn, soft finger-picked acoustic guitar and gentle upright bass, 70 bpm, warm and cosy, low dynamic range, no drums, seamless loop",
    seconds: 60
  },
  stationBed: {
    prompt: "calm, quiet instrumental background loop for a toy train station, soft xylophone, gentle brushed shaker and warm bass with a slow chugging rhythm, 74 bpm, low dynamic range, no whistles, seamless loop",
    seconds: 60
  },
  cloudBed: {
    prompt: "calm, quiet, dreamy instrumental background loop for a soft learning cloud in the sky, gentle celesta, warm pad and light harp, 66 bpm, low dynamic range, no percussion, seamless loop",
    seconds: 60
  },
  homeBed: {
    prompt: "calm, quiet, cosy instrumental background loop for a toy home, soft felt piano, gentle music box and warm strings, 68 bpm, low dynamic range, no drums, seamless loop",
    seconds: 60
  }
};

/** The bed each world plays by default. */
export const WORLD_BEDS: Readonly<Record<WorldId, MusicBedId>> = {
  meadow: "meadowBed",
  "music-garden": "gardenBed",
  "peekaboo-barn": "barnBed",
  station: "stationBed",
  "learning-cloud": "cloudBed",
  "home-nook": "homeBed"
};

/** Shortest and longest loop lengths (seconds). */
export const BED_MIN_SEC = 30;
export const BED_MAX_SEC = 120;
