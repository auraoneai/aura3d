import { renderAssetPanel } from "./asset-panel";
import {
  applyConversationalPatch,
  createFixtureScene,
  createMockScene,
  defaultCinematicFixture,
  normalizeProviderScene,
  providerLabel,
  redoPatch,
  undoPatch,
  type CinematicSceneIR,
  type ProviderMode
} from "./cinematic-demo-fixtures";
import { renderDiagnosticsPanel, renderIrPanel } from "./diagnostics-panel";
import { downloadDataUrl, downloadJson, renderExportPanel, type ExportPanelState } from "./export-panel";
import { renderPatchPanel } from "./patch-panel";
import { renderPromptPanel } from "./prompt-panel";
import { renderProviderPanel } from "./provider-panel";
import { createSceneViewport, type SceneViewportController, type SceneViewportSnapshot } from "./scene-viewport";
import { samplePatchPrompts, samplePrompts } from "./sample-prompts";
import { renderTimelinePanel, updateTimelinePanel } from "./timeline-panel";

declare global {
  interface Window {
    __AURA3D_CINEMATIC_SCENE__?: CinematicSceneIR;
  }
}

interface AppState {
  readonly providerMode: ProviderMode;
  readonly prompt: string;
  readonly patchPrompt: string;
  readonly scene: CinematicSceneIR;
  readonly snapshot: SceneViewportSnapshot;
  readonly playing: boolean;
  readonly seconds: number;
  readonly isGenerating: boolean;
  readonly promptError?: string;
  readonly patchError?: string;
  readonly providerError?: string;
  readonly exportState: ExportPanelState;
}

const canvas = document.getElementById("viewport");
const root = document.getElementById("app");

if (!(canvas instanceof HTMLCanvasElement) || !(root instanceof HTMLElement)) {
  throw new Error("cinematic-prompt-to-scene requires #app and canvas#viewport.");
}

let state: AppState = {
  providerMode: "fixture",
  prompt: defaultCinematicFixture.prompt,
  patchPrompt: samplePatchPrompts[0]?.prompt ?? "",
  scene: defaultCinematicFixture,
  snapshot: {
    status: "loading",
    renderer: "webgl2",
    frameCount: 0,
    fps: 0,
    drawCalls: 0,
    textures: 0,
    renderWidth: canvas.width,
    renderHeight: canvas.height,
    averageFrameMs: 0
  },
  playing: true,
  seconds: 0,
  isGenerating: false,
  exportState: {
    screenshotCount: 0,
    bundleCount: 0
  }
};

window.__AURA3D_CINEMATIC_SCENE__ = state.scene;
root.innerHTML = `
  <section id="left-panel" class="app-column left-column" aria-label="Scene controls">
    <div id="provider-panel"></div>
    <div id="prompt-panel"></div>
    <div id="patch-panel"></div>
  </section>
  <section id="right-panel" class="app-column right-column" aria-label="Scene details">
    <div id="asset-panel"></div>
    <div id="diagnostics-panel"></div>
    <div id="ir-panel"></div>
    <div id="export-panel"></div>
  </section>
  <div id="timeline-root" class="timeline-root" aria-label="Timeline"></div>
  <div id="scene-error" class="scene-error" hidden></div>
`;

const providerRoot = requireElement("provider-panel");
const promptRoot = requireElement("prompt-panel");
const patchRoot = requireElement("patch-panel");
const assetRoot = requireElement("asset-panel");
const diagnosticsRoot = requireElement("diagnostics-panel");
const irRoot = requireElement("ir-panel");
const exportRoot = requireElement("export-panel");
const timelineRoot = requireElement("timeline-root");
const sceneErrorRoot = requireElement("scene-error");

const viewport: SceneViewportController = createSceneViewport({
  canvas,
  initialScene: state.scene,
  onSnapshot: (snapshot) => {
    state = { ...state, snapshot };
    updateRuntimePanels();
  },
  onTimeline: (seconds) => {
    state = { ...state, seconds };
    updateTimelinePanel(timelineRoot, {
      playing: state.playing,
      seconds: state.seconds,
      durationSeconds: state.scene.shot.durationSeconds
    });
  },
  onError: (message) => {
    state = { ...state, providerError: message };
    renderAll();
  }
});

renderAll();

function renderAll(): void {
  window.__AURA3D_CINEMATIC_SCENE__ = state.scene;
  renderProviderPanel(providerRoot, {
    mode: state.providerMode,
    isGenerating: state.isGenerating,
    lastError: state.providerError
  }, {
    onModeChange: (mode) => {
      state = {
        ...state,
        providerMode: mode,
        providerError: modeRequiresProxy(mode)
          ? `${providerLabel(mode)} needs a server proxy at /api/cinematic-prompt-to-scene/generate. No browser API key input is available.`
          : undefined
      };
      renderAll();
    }
  });

  renderPromptPanel(promptRoot, {
    prompt: state.prompt,
    isGenerating: state.isGenerating,
    error: state.promptError
  }, samplePrompts, {
    onPromptChange: (prompt) => {
      state = { ...state, prompt };
    },
    onGenerate: () => {
      void generateScene();
    },
    onSample: (prompt) => {
      state = { ...state, prompt };
      renderAll();
    }
  });

  renderPatchPanel(patchRoot, state.scene, {
    prompt: state.patchPrompt,
    error: state.patchError
  }, samplePatchPrompts, {
    onPromptChange: (patchPrompt) => {
      state = { ...state, patchPrompt };
    },
    onPatch: () => {
      applyPatch();
    },
    onSample: (patchPrompt) => {
      state = { ...state, patchPrompt };
      renderAll();
    },
    onUndo: () => {
      setScene(undoPatch(state.scene));
    },
    onRedo: () => {
      setScene(redoPatch(state.scene));
    }
  });

  renderAssetPanel(assetRoot, state.scene);
  renderDiagnosticsPanel(diagnosticsRoot, {
    scene: state.scene,
    snapshot: state.snapshot,
    error: state.providerError ?? state.promptError ?? state.patchError
  });
  renderIrPanel(irRoot, state.scene);
  renderExportPanel(exportRoot, state.scene, state.exportState, {
    onScreenshot: captureScreenshot,
    onBundle: exportBundle
  });
  renderTimelinePanel(timelineRoot, {
    playing: state.playing,
    seconds: state.seconds,
    durationSeconds: state.scene.shot.durationSeconds
  }, {
    onTogglePlay: () => {
      state = { ...state, playing: !state.playing };
      viewport.setPlaying(state.playing);
      updateTimelinePanel(timelineRoot, {
        playing: state.playing,
        seconds: state.seconds,
        durationSeconds: state.scene.shot.durationSeconds
      });
    },
    onScrub: (seconds) => {
      state = { ...state, seconds, playing: false };
      viewport.setPlaying(false);
      viewport.setTime(seconds);
      updateTimelinePanel(timelineRoot, {
        playing: false,
        seconds,
        durationSeconds: state.scene.shot.durationSeconds
      });
    }
  });
  renderSceneError();
}

function updateRuntimePanels(): void {
  renderDiagnosticsPanel(diagnosticsRoot, {
    scene: state.scene,
    snapshot: state.snapshot,
    error: state.providerError ?? state.promptError ?? state.patchError
  });
  renderSceneError();
}

async function generateScene(): Promise<void> {
  const prompt = state.prompt.trim();
  if (prompt.length < 8) {
    state = { ...state, promptError: "Enter a cinematic prompt before generating." };
    renderAll();
    return;
  }

  state = {
    ...state,
    isGenerating: true,
    promptError: undefined,
    providerError: undefined
  };
  renderAll();

  try {
    const scene = await generateSceneForMode(state.providerMode, prompt);
    await setScene(scene);
    state = {
      ...state,
      isGenerating: false,
      promptError: undefined,
      providerError: undefined
    };
  } catch (error) {
    state = {
      ...state,
      isGenerating: false,
      providerError: formatProviderError(state.providerMode, error)
    };
  }

  renderAll();
}

async function generateSceneForMode(mode: ProviderMode, prompt: string): Promise<CinematicSceneIR> {
  if (mode === "fixture") return createFixtureScene(prompt);
  if (mode === "mock") return createMockScene(prompt);

  const response = await fetch("/api/cinematic-prompt-to-scene/generate", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      provider: mode,
      prompt
    })
  });

  if (!response.ok) {
    throw new Error(`Server proxy returned ${response.status}. Configure /api/cinematic-prompt-to-scene/generate for ${providerLabel(mode)}.`);
  }
  const body: unknown = await response.json();
  return normalizeProviderScene(body, prompt, mode);
}

function applyPatch(): void {
  try {
    const next = applyConversationalPatch(state.scene, state.patchPrompt.trim());
    setScene(next);
  } catch (error) {
    state = {
      ...state,
      patchError: error instanceof Error ? error.message : String(error)
    };
    renderAll();
  }
}

async function setScene(scene: CinematicSceneIR): Promise<void> {
  state = {
    ...state,
    scene,
    patchError: undefined,
    promptError: undefined,
    seconds: Math.min(state.seconds, scene.shot.durationSeconds)
  };
  window.__AURA3D_CINEMATIC_SCENE__ = scene;
  await viewport.setScene(scene);
  renderAll();
}

function captureScreenshot(): void {
  const screenshot = viewport.captureScreenshot();
  if (!screenshot) {
    state = {
      ...state,
      providerError: "Screenshot is unavailable until the WebGL2 viewport has rendered at least one frame."
    };
    renderAll();
    return;
  }
  downloadDataUrl(`aura3d-${state.scene.id}-screenshot.png`, screenshot.dataUrl);
  state = {
    ...state,
    exportState: {
      ...state.exportState,
      screenshotCount: state.exportState.screenshotCount + 1,
      lastMessage: `Captured ${screenshot.width}x${screenshot.height} PNG.`
    }
  };
  renderAll();
}

function exportBundle(): void {
  downloadJson(`aura3d-${state.scene.id}-bundle.json`, {
    exportedAt: new Date().toISOString(),
    scene: state.scene,
    viewport: viewport.latestSnapshot()
  });
  state = {
    ...state,
    exportState: {
      ...state.exportState,
      bundleCount: state.exportState.bundleCount + 1,
      lastMessage: "Exported scene bundle JSON."
    }
  };
  renderAll();
}

function renderSceneError(): void {
  const message = state.providerError ?? state.promptError ?? state.patchError ?? state.snapshot.error;
  sceneErrorRoot.hidden = !message;
  sceneErrorRoot.textContent = message ?? "";
}

function modeRequiresProxy(mode: ProviderMode): boolean {
  return mode === "openai" || mode === "anthropic" || mode === "gemini" || mode === "local";
}

function formatProviderError(mode: ProviderMode, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `${providerLabel(mode)} did not replace the last good scene. ${message}`;
}

function requireElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLElement)) {
    throw new Error(`Missing #${id}.`);
  }
  return element;
}
