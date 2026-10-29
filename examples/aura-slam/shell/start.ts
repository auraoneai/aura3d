import type { AudioPort } from "../contract";
import { createTennisAudio } from "../audio/audio";
import { createInputMapper } from "../input/mapper";
import { physics } from "../sim/physics";
import { strokes } from "../sim/strokes";
import { createMatchEngine } from "../sim/create";
import type { CreateSlamEngine } from "../ui/types";
import { bootAuraSlam, type AuraSlamDeps, type AuraSlamHandle, type SlamRenderer } from "./boot";

export type StartAuraSlamOptions = Pick<AuraSlamDeps, "app" | "routeHealth" | "nodeCount" | "autoplay" | "swipeEnabled"> & { renderer: SlamRenderer };

function pageStorage(): Storage | null {
  try { return window.localStorage; } catch { return null; }
}

/** Boots the native game: M-RULES engine, M-INPUT mapper, M-AUDIO cues and the DOM shell around the supplied renderer. */
export function startAuraSlam(options: StartAuraSlamOptions): Promise<AuraSlamHandle> {
  const tennis = createTennisAudio({ ambience: true });
  const audio: AudioPort = { unlock: () => tennis.init(), setEnabled: (on) => tennis.setEnabled(on), handle: (event) => tennis.handleEvent(event), setVenue: (venue) => tennis.setVenue(venue) };
  return bootAuraSlam({
    ...options,
    createEngine: createMatchEngine as unknown as CreateSlamEngine,
    input: createInputMapper({ storage: pageStorage() }),
    audio, physics, strokes
  });
}
