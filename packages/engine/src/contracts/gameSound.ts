/**
 * C-25 — game sound contract slot (CONTRACTS.md). Provider: PRD 09.
 * Flag: A3D_QR_GAME. `createGameAudio` resolves through `gameSoundSlot.get()`:
 * flag-off callers get the silent C-25 stub, flag-on callers get the real
 * `game-sound` engine once lane prd09's barrel has provided it.
 */
import { defineContractSlot } from "@aura3d/rendering/contracts";
import { createStubGameSoundEngine } from "@aura3d/audio";
import type { createGameSoundEngine } from "@aura3d/audio";

type GameSoundEngineFactory = typeof createGameSoundEngine;

// The contract stub has a narrower options type than the real factory
// (context/buses are real-engine concerns); both honour the same call shape.
export const gameSoundSlot = defineContractSlot(
  "C-25",
  "prd09",
  "A3D_QR_GAME",
  createStubGameSoundEngine as unknown as GameSoundEngineFactory
);
