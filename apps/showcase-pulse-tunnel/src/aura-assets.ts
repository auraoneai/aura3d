import { defineAuraAssets } from "@aura3d/engine";
import hdriUrl from "../assets/env/data_galaxy_deep_space_1k.hdr?url";
import drumsStemUrl from "../assets/music/drums.wav?url";
import bassStemUrl from "../assets/music/bass.wav?url";
import leadStemUrl from "../assets/music/lead.wav?url";
import airStemUrl from "../assets/music/air.wav?url";
import laneSwitchSfxUrl from "../assets/sfx/lane-switch.wav?url";
import jumpSfxUrl from "../assets/sfx/jump.wav?url";
import slideSfxUrl from "../assets/sfx/slide.wav?url";
import grazeSfxUrl from "../assets/sfx/graze.wav?url";
import shieldHitSfxUrl from "../assets/sfx/shield-hit.wav?url";
import shieldBreakSfxUrl from "../assets/sfx/shield-break.wav?url";
import sectionRiseSfxUrl from "../assets/sfx/section-rise.wav?url";
import runOverSfxUrl from "../assets/sfx/run-over.wav?url";
import uiConfirmSfxUrl from "../assets/sfx/ui-confirm.wav?url";

// App-local typed assets for the single-path Pulse Tunnel scene (B8 port).
// The three GLBs are the admitted CC0 Pulse Tunnel model family staged in
// apps/showcase-pulse-tunnel/public/aura-assets; the four 120 BPM stems,
// nine SFX WAVs, and 1k deep-space HDRI resolve directly from the app's
// committed assets/ directory via Vite asset URLs.
export const assets = defineAuraAssets({
  pulseRunnerCraft: {
    type: "model",
    format: "glb",
    url: "/aura-assets/pulseRunnerCraft.0146f91b.glb",
    bounds: [4.243, 1.185, 3.54],
    hash: "sha256-0146f91bb386b7e30494563b5b96f7204a1685f1c8dfbd343a698be02866dc3d",
    metadata: {
      materials: [
        "Hull_Steel",
        "Intake_Iron",
        "Wing_Composite",
        "Fin_Panel",
        "Nozzle_Char",
        "Afterburner_Core",
        "Canopy_Glass",
        "Canopy_Frame"
      ],
      animations: [],
      textures: [
        "Hull_Steel",
        "Hull_Steel",
        "Hull_Steel",
        "Intake_Iron",
        "Intake_Iron",
        "Intake_Iron",
        "Wing_Composite",
        "Wing_Composite",
        "Wing_Composite",
        "Fin_Panel",
        "Fin_Panel",
        "Fin_Panel",
        "Nozzle_Char",
        "Nozzle_Char",
        "Nozzle_Char",
        "Afterburner_Core",
        "Afterburner_Core",
        "Canopy_Glass",
        "Canopy_Glass",
        "Canopy_Frame",
        "Canopy_Frame",
        "Canopy_Frame"
      ],
      license: "CC0-1.0",
      attribution: "Aura3D synthesis — original CC0 Pulse Tunnel model family"
    }
  },
  pulseReactorEncounterWorld: {
    type: "model",
    format: "glb",
    url: "/aura-assets/pulseReactorEncounterWorld.9723eba7.glb",
    bounds: [9.699, 4.281, 14.8],
    hash: "sha256-9723eba7376782bce15d97d39a813e38ed7d09500e65e3d3cba38c59116f8703",
    metadata: {
      materials: [
        "Tunnel_Wall",
        "Deck_Grating",
        "Rib_Steel",
        "Pipe_Conduit",
        "Terminal_Arch",
        "Coolant_Cyan",
        "Hazard_Beacon"
      ],
      animations: [],
      textures: [
        "Tunnel_Wall",
        "Tunnel_Wall",
        "Tunnel_Wall",
        "Deck_Grating",
        "Deck_Grating",
        "Deck_Grating",
        "Rib_Steel",
        "Rib_Steel",
        "Rib_Steel",
        "Pipe_Conduit",
        "Pipe_Conduit",
        "Pipe_Conduit",
        "Terminal_Arch",
        "Terminal_Arch",
        "Terminal_Arch",
        "Coolant_Cyan",
        "Coolant_Cyan",
        "Hazard_Beacon",
        "Hazard_Beacon"
      ],
      license: "CC0-1.0",
      attribution: "Aura3D synthesis — original CC0 Pulse Tunnel model family"
    }
  },
  pulseTerminalSentry: {
    type: "model",
    format: "glb",
    url: "/aura-assets/pulseTerminalSentry.0d38226c.glb",
    bounds: [5.02, 3.779, 1.764],
    hash: "sha256-0d38226c385a82c58b83554bcb240bf376ee4bf4f2430b90372eacc521b7ad61",
    metadata: {
      materials: [
        "Sentry_Hull",
        "Gantry_Iron",
        "Pylon_Plate",
        "Core_Housing",
        "Warning_Trim",
        "Sentry_Eye",
        "Emitter_Cyan"
      ],
      animations: [],
      textures: [
        "Sentry_Hull",
        "Sentry_Hull",
        "Sentry_Hull",
        "Gantry_Iron",
        "Gantry_Iron",
        "Gantry_Iron",
        "Pylon_Plate",
        "Pylon_Plate",
        "Pylon_Plate",
        "Core_Housing",
        "Core_Housing",
        "Core_Housing",
        "Warning_Trim",
        "Warning_Trim",
        "Warning_Trim",
        "Sentry_Eye",
        "Sentry_Eye",
        "Emitter_Cyan",
        "Emitter_Cyan"
      ],
      license: "CC0-1.0",
      attribution: "Aura3D synthesis — original CC0 Pulse Tunnel model family"
    }
  },
  pulseDrumsStem: {
    type: "audio",
    format: "wav",
    url: drumsStemUrl,
    hash: "sha256-03a34f7d2b05a1351fa319a59c6ce9daefc38f0c58734307d6ad55315a2d4d8f",
    metadata: {
      materials: [],
      animations: [],
      textures: [],
      license: "CC0-1.0",
      attribution: "Aura3D synthesis (apps/showcase-pulse-tunnel/scripts/build-music.mjs)"
    }
  },
  pulseBassStem: {
    type: "audio",
    format: "wav",
    url: bassStemUrl,
    hash: "sha256-830c8785b1ec8036df68d84ba83a6a26ec72aaccb7d5c8c1728ad45c1619b2cf",
    metadata: {
      materials: [],
      animations: [],
      textures: [],
      license: "CC0-1.0",
      attribution: "Aura3D synthesis (apps/showcase-pulse-tunnel/scripts/build-music.mjs)"
    }
  },
  pulseLeadStem: {
    type: "audio",
    format: "wav",
    url: leadStemUrl,
    hash: "sha256-0c9a6130c2b1b682a5a0844fc71672f3c80ee79959d53411e5259c4e3a35b873",
    metadata: {
      materials: [],
      animations: [],
      textures: [],
      license: "CC0-1.0",
      attribution: "Aura3D synthesis (apps/showcase-pulse-tunnel/scripts/build-music.mjs)"
    }
  },
  pulseAirStem: {
    type: "audio",
    format: "wav",
    url: airStemUrl,
    hash: "sha256-612320fcc89d78494e7fdf1a0c12e7648ea90db3e9993713133029106a6865fc",
    metadata: {
      materials: [],
      animations: [],
      textures: [],
      license: "CC0-1.0",
      attribution: "Aura3D synthesis (apps/showcase-pulse-tunnel/scripts/build-music.mjs)"
    }
  },
  pulseLaneSwitchSfx: {
    type: "audio",
    format: "wav",
    url: laneSwitchSfxUrl,
    hash: "sha256-04ec063bf597e2b6b7a3a4b821a5ae25b9abe1bb2237e6c71114ef6596927999",
    metadata: { materials: [], animations: [], textures: [], license: "CC0-1.0" }
  },
  pulseJumpSfx: {
    type: "audio",
    format: "wav",
    url: jumpSfxUrl,
    hash: "sha256-7dd11a3063cd4fdf24378346d4f4cbea44754a9fb559074ab84f548fbfa8e9fb",
    metadata: { materials: [], animations: [], textures: [], license: "CC0-1.0" }
  },
  pulseSlideSfx: {
    type: "audio",
    format: "wav",
    url: slideSfxUrl,
    hash: "sha256-b88a1c77a16957811b71f00c2de012b4918af5f2e01fbdbe2409e83da3e210fc",
    metadata: { materials: [], animations: [], textures: [], license: "CC0-1.0" }
  },
  pulseGrazeSfx: {
    type: "audio",
    format: "wav",
    url: grazeSfxUrl,
    hash: "sha256-d5477d250fc4058dc28f84c65f6fb88c24ef46429a0f47e75548510066ca2080",
    metadata: { materials: [], animations: [], textures: [], license: "CC0-1.0" }
  },
  pulseShieldHitSfx: {
    type: "audio",
    format: "wav",
    url: shieldHitSfxUrl,
    hash: "sha256-6c2b8476915941ba9e3a4abbea5ae18e61fcc7e0dcf0a4754aa9223e92dbb20f",
    metadata: { materials: [], animations: [], textures: [], license: "CC0-1.0" }
  },
  pulseShieldBreakSfx: {
    type: "audio",
    format: "wav",
    url: shieldBreakSfxUrl,
    hash: "sha256-11fdb8917d84e0fdd81b0caecd20150c33f429b423fda41f5d7643657ed26be5",
    metadata: { materials: [], animations: [], textures: [], license: "CC0-1.0" }
  },
  pulseSectionRiseSfx: {
    type: "audio",
    format: "wav",
    url: sectionRiseSfxUrl,
    hash: "sha256-6118617ebaf747ae03a3980e2f59ff0547c24d64c7a3d05f471a6d2fb8be9c76",
    metadata: { materials: [], animations: [], textures: [], license: "CC0-1.0" }
  },
  pulseRunOverSfx: {
    type: "audio",
    format: "wav",
    url: runOverSfxUrl,
    hash: "sha256-9245490ea8b305ad05a71f1d2893f3e4a57bbfc770ef7aa00991bdf593d9521e",
    metadata: { materials: [], animations: [], textures: [], license: "CC0-1.0" }
  },
  pulseUiConfirmSfx: {
    type: "audio",
    format: "wav",
    url: uiConfirmSfxUrl,
    hash: "sha256-0f07af091851320279eb7a5976df249e960f1328fbb3b70abb27b752730a5f27",
    metadata: { materials: [], animations: [], textures: [], license: "CC0-1.0" }
  },
  synthwaveDomeHdr: {
    type: "texture",
    format: "hdr",
    url: hdriUrl,
    hash: "sha256-abbab6e3a136126aa88932440b4242d53def7b1b0ca83b0701f547f085fbeab2",
    metadata: {
      license: "cc0",
      sourcePath: "fixtures/environment-corpus/hdri/data_galaxy_deep_space_1k.hdr"
    }
  }
} as const);
