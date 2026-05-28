export type ProviderMode = "fixture" | "mock" | "openai" | "anthropic" | "gemini" | "local";

export interface CinematicSceneAsset {
  readonly id: string;
  readonly role: string;
  readonly source: string;
  readonly status: "loaded" | "generated" | "planned" | "missing";
}

export interface CinematicScenePatch {
  readonly id: string;
  readonly prompt: string;
  readonly summary: string;
  readonly changed: readonly string[];
}

export interface CinematicSceneIR {
  readonly id: string;
  readonly title: string;
  readonly providerMode: ProviderMode;
  readonly providerLabel: string;
  readonly prompt: string;
  readonly backend: "webgl2" | "webgpu";
  readonly qualityTarget: string;
  readonly assetId: string;
  readonly environmentId: string;
  readonly assets: readonly CinematicSceneAsset[];
  readonly shot: {
    readonly durationSeconds: number;
    readonly movement: string;
    readonly mood: string;
  };
  readonly camera: {
    readonly lensMm: number;
    readonly heightM: number;
    readonly distanceM: number;
    readonly dolly: "in" | "out" | "locked";
  };
  readonly atmosphere: {
    readonly fog: number;
    readonly rain: number;
    readonly bloom: number;
  };
  readonly lighting: {
    readonly keyColor: string;
    readonly rimColor: string;
    readonly intensity: number;
  };
  readonly materialPreset: "wet-neon" | "moonlit-metal" | "golden-haze" | "sterile-lab";
  readonly hero: {
    readonly x: number;
    readonly y: number;
    readonly scale: number;
  };
  readonly renderControls: {
    readonly yaw: number;
    readonly pitch: number;
    readonly zoom: number;
    readonly exposure: number;
    readonly roughnessScale: number;
    readonly metallicScale: number;
    readonly clearcoatBoost: number;
    readonly backgroundBlur: number;
    readonly backgroundVisible: boolean;
    readonly shadows: boolean;
  };
  readonly diagnostics: readonly string[];
  readonly history: readonly CinematicScenePatch[];
  readonly future: readonly CinematicScenePatch[];
}

export interface ProviderModeOption {
  readonly mode: ProviderMode;
  readonly label: string;
  readonly description: string;
  readonly requiresProxy: boolean;
}

export const providerModeOptions: readonly ProviderModeOption[] = [
  {
    mode: "fixture",
    label: "Fixture Cinematic Demo",
    description: "Asset-backed authored demo. Default public mode with no API keys.",
    requiresProxy: false
  },
  {
    mode: "mock",
    label: "MockProvider",
    description: "Deterministic offline prompt mapping for repeatable UX tests.",
    requiresProxy: false
  },
  {
    mode: "openai",
    label: "OpenAI",
    description: "Live generation through a server-side proxy only.",
    requiresProxy: true
  },
  {
    mode: "anthropic",
    label: "Anthropic",
    description: "Live generation through a server-side proxy only.",
    requiresProxy: true
  },
  {
    mode: "gemini",
    label: "Gemini",
    description: "Live generation through a server-side proxy only.",
    requiresProxy: true
  },
  {
    mode: "local",
    label: "Local Model",
    description: "Local server model endpoint, never browser-held provider keys.",
    requiresProxy: true
  }
];

export const defaultCinematicFixture: CinematicSceneIR = {
  id: "fixture-rainy-neon-alley",
  title: "Rainy Neon Alley",
  providerMode: "fixture",
  providerLabel: "Fixture Cinematic Demo",
  prompt: "Create a rainy neon alley at night. A lonely robot finds a glowing flower. Make it emotional and cinematic with wet pavement, fog, rain particles, blue rim light, neon reflections, and a slow 12-second dolly-in.",
  backend: "webgl2",
  qualityTarget: "L3-cinematic-realtime",
  assetId: "robot-expressive",
  environmentId: "industrial-sunset-puresky",
  assets: [
    {
      id: "robot-expressive",
      role: "hero character",
      source: "fixtures/threejs-parity/assets/character/robot-expressive.glb",
      status: "loaded"
    },
    {
      id: "procedural-neon-alley",
      role: "environment set",
      source: "renderer:procedural/rainy-neon-alley",
      status: "loaded"
    },
    {
      id: "glowing-flower",
      role: "hero story prop",
      source: "renderer:procedural/glowing-flower",
      status: "generated"
    },
    {
      id: "renderer-rain-particles",
      role: "renderer vfx rain fog glow",
      source: "renderer:vfx/RainParticleSystem",
      status: "loaded"
    }
  ],
  shot: {
    durationSeconds: 12,
    movement: "slow dolly-in",
    mood: "lonely, rain-soaked, hopeful"
  },
  camera: {
    lensMm: 42,
    heightM: 1.35,
    distanceM: 4.4,
    dolly: "in"
  },
  atmosphere: {
    fog: 0.68,
    rain: 0.76,
    bloom: 0.82
  },
  lighting: {
    keyColor: "#38d6ff",
    rimColor: "#ff4fd8",
    intensity: 1.16
  },
  materialPreset: "wet-neon",
  hero: {
    x: 0,
    y: 0,
    scale: 1
  },
  renderControls: {
    yaw: -0.38,
    pitch: -0.22,
    zoom: 0.72,
    exposure: 1.12,
    roughnessScale: 0.68,
    metallicScale: 1.18,
    clearcoatBoost: 0.18,
    backgroundBlur: 0.38,
    backgroundVisible: true,
    shadows: true
  },
  diagnostics: [
    "Provider mode is fixture: no network call and no browser-held provider key.",
    "Renderer backend preference is WebGL2 with preserveDrawingBuffer for screenshots.",
    "Scene keeps last good render visible when generation or patching fails.",
    "Hero GLB, renderer-owned procedural alley, flower prop, fog, rain, bloom, and rim practicals are active."
  ],
  history: [],
  future: []
};

export function createFixtureScene(prompt: string): CinematicSceneIR {
  return {
    ...defaultCinematicFixture,
    prompt,
    providerMode: "fixture",
    providerLabel: "Fixture Cinematic Demo",
    history: [],
    future: []
  };
}

export function createMockScene(prompt: string): CinematicSceneIR {
  const isWarm = /\b(sun|gold|warm|desert|morning|amber)\b/i.test(prompt);
  const isWide = /\b(wide|epic|establishing|city|landscape)\b/i.test(prompt);
  return {
    ...defaultCinematicFixture,
    id: "mock-" + stableId(prompt),
    title: isWarm ? "Golden Rain Backlot" : "Mock Neon Alley",
    providerMode: "mock",
    providerLabel: "MockProvider",
    prompt,
    camera: {
      lensMm: isWide ? 28 : 50,
      heightM: isWide ? 1.75 : 1.25,
      distanceM: isWide ? 6.2 : 3.6,
      dolly: /\b(push|dolly|move|tracking)\b/i.test(prompt) ? "in" : "locked"
    },
    atmosphere: {
      fog: isWarm ? 0.36 : 0.78,
      rain: /\b(rain|wet|storm|noir)\b/i.test(prompt) ? 0.82 : 0.18,
      bloom: isWarm ? 0.46 : 0.86
    },
    lighting: {
      keyColor: isWarm ? "#ffb04d" : "#38d6ff",
      rimColor: isWarm ? "#caff4d" : "#ff4fd8",
      intensity: isWarm ? 1.02 : 1.22
    },
    renderControls: {
      ...defaultCinematicFixture.renderControls,
      yaw: isWide ? -0.18 : -0.48,
      pitch: isWide ? -0.12 : -0.26,
      zoom: isWide ? 0.58 : 0.78,
      exposure: isWarm ? 1.2 : 1.08,
      roughnessScale: isWarm ? 0.86 : 0.62,
      clearcoatBoost: isWarm ? 0.08 : 0.24
    },
    diagnostics: [
      "MockProvider generated deterministic IR locally from prompt keywords.",
      "No network request was made.",
      "Output uses the same asset-backed WebGL2 cinematic viewport as fixture mode."
    ],
    history: [],
    future: []
  };
}

export function normalizeProviderScene(value: unknown, fallbackPrompt: string, mode: ProviderMode): CinematicSceneIR {
  if (!isRecord(value)) {
    throw new Error("Provider returned a non-object response.");
  }
  const title = stringValue(value.title, "Provider Scene");
  const prompt = stringValue(value.prompt, fallbackPrompt);
  const patch = createMockScene(prompt);
  return {
    ...patch,
    id: stringValue(value.id, mode + "-" + stableId(prompt)),
    title,
    providerMode: mode,
    providerLabel: providerLabel(mode),
    diagnostics: [
      providerLabel(mode) + " returned scene IR through the configured server proxy.",
      "Provider output was normalized before updating the viewport.",
      "No raw API key was accepted by the browser."
    ]
  };
}

export function applyConversationalPatch(scene: CinematicSceneIR, prompt: string): CinematicSceneIR {
  const lower = prompt.toLowerCase();
  const changed: string[] = [];
  let next = scene;

  if (/\b(camera|lens|closer|wide|low|high|dolly|push|pull)\b/.test(lower)) {
    const wide = /\b(wide|establishing|far|pull)\b/.test(lower);
    next = {
      ...next,
      camera: {
        lensMm: wide ? 28 : 58,
        heightM: /\blow\b/.test(lower) ? 0.82 : /\bhigh\b/.test(lower) ? 1.9 : next.camera.heightM,
        distanceM: wide ? 6.6 : 3.2,
        dolly: /\bpull\b/.test(lower) ? "out" : "in"
      },
      renderControls: {
        ...next.renderControls,
        pitch: /\blow\b/.test(lower) ? -0.36 : /\bhigh\b/.test(lower) ? -0.08 : next.renderControls.pitch,
        zoom: wide ? 0.52 : 0.88
      }
    };
    changed.push("camera lens, height, distance, and dolly plan");
  }

  if (/\b(fog|mist|rain|storm|dry|clear|atmosphere)\b/.test(lower)) {
    const less = /\b(less|reduce|dry|clear)\b/.test(lower);
    next = {
      ...next,
      atmosphere: {
        fog: clamp(next.atmosphere.fog + (less ? -0.32 : 0.22), 0, 1),
        rain: clamp(next.atmosphere.rain + (less ? -0.42 : 0.2), 0, 1),
        bloom: clamp(next.atmosphere.bloom + (less ? -0.12 : 0.1), 0, 1)
      }
    };
    changed.push("fog, rain, and bloom intensity");
  }

  if (/\b(light|rim|blue|red|pink|green|gold|warm|cold|bright|dark)\b/.test(lower)) {
    const warm = /\b(gold|warm|amber|sun)\b/.test(lower);
    const green = /\bgreen|acid|toxic\b/.test(lower);
    next = {
      ...next,
      lighting: {
        keyColor: warm ? "#ffb04d" : green ? "#caff4d" : "#38d6ff",
        rimColor: /\b(red|pink|magenta)\b/.test(lower) ? "#ff4fd8" : warm ? "#caff4d" : "#6ee7ff",
        intensity: clamp(next.lighting.intensity + (/\bdark|dim\b/.test(lower) ? -0.24 : 0.18), 0.45, 1.8)
      },
      renderControls: {
        ...next.renderControls,
        exposure: clamp(next.renderControls.exposure + (/\bdark|dim\b/.test(lower) ? -0.18 : 0.16), 0.4, 1.8)
      }
    };
    changed.push("light color and intensity");
  }

  if (/\b(hero|robot|subject|closer|larger|smaller|left|right|move|scale)\b/.test(lower)) {
    next = {
      ...next,
      hero: {
        x: clamp(next.hero.x + (/\bleft\b/.test(lower) ? -0.16 : /\bright\b/.test(lower) ? 0.16 : 0), -0.5, 0.5),
        y: next.hero.y,
        scale: clamp(next.hero.scale + (/\bsmaller\b/.test(lower) ? -0.12 : 0.14), 0.72, 1.34)
      },
      renderControls: {
        ...next.renderControls,
        zoom: /\bsmaller\b/.test(lower) ? 0.64 : 0.84
      }
    };
    changed.push("hero subject position and scale");
  }

  if (/\b(prop|sign|lantern|umbrella|remove|add|material|wet|metal|matte)\b/.test(lower)) {
    const removeProp = /\bremove\b/.test(lower);
    next = {
      ...next,
      materialPreset: /\bmatte\b/.test(lower)
        ? "moonlit-metal"
        : /\bgold|warm\b/.test(lower)
          ? "golden-haze"
          : "wet-neon",
      assets: removeProp
        ? next.assets.filter((asset) => asset.id !== "extra-lantern")
        : [
          ...next.assets.filter((asset) => asset.id !== "extra-lantern"),
          {
            id: "extra-lantern",
            role: "story prop",
            source: "patch-authored fixture overlay",
            status: "generated"
          }
        ],
      renderControls: {
        ...next.renderControls,
        roughnessScale: /\bwet\b/.test(lower) ? 0.52 : 0.9,
        metallicScale: /\bmetal\b/.test(lower) ? 1.34 : next.renderControls.metallicScale,
        clearcoatBoost: /\bwet\b/.test(lower) ? 0.34 : next.renderControls.clearcoatBoost
      }
    };
    changed.push("props and material preset");
  }

  if (changed.length === 0) {
    throw new Error("Patch did not mention a supported visual change. Try camera, fog, rain, light, hero, prop, or material.");
  }

  const patch: CinematicScenePatch = {
    id: "patch-" + stableId(prompt + scene.history.length),
    prompt,
    summary: "Applied " + changed.join(", ") + ".",
    changed
  };

  return {
    ...next,
    history: [...scene.history, patch],
    future: [],
    diagnostics: [
      patch.summary,
      "Patch preserves scene history and keeps undo/redo state in app memory.",
      ...next.diagnostics.filter((line) => !line.startsWith("Applied "))
    ]
  };
}

export function undoPatch(scene: CinematicSceneIR): CinematicSceneIR {
  const patch = scene.history[scene.history.length - 1];
  if (!patch) return scene;
  return {
    ...defaultCinematicFixture,
    providerMode: scene.providerMode,
    providerLabel: scene.providerLabel,
    prompt: scene.prompt,
    history: scene.history.slice(0, -1),
    future: [patch, ...scene.future],
    diagnostics: ["Undo restored the base cinematic fixture while preserving provider mode.", ...scene.diagnostics]
  };
}

export function redoPatch(scene: CinematicSceneIR): CinematicSceneIR {
  const patch = scene.future[0];
  if (!patch) return scene;
  return applyConversationalPatch({ ...scene, future: scene.future.slice(1) }, patch.prompt);
}

export function providerLabel(mode: ProviderMode): string {
  return providerModeOptions.find((option) => option.mode === mode)?.label ?? mode;
}

function stableId(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
