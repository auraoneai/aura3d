type Vec3 = readonly [number, number, number];
type Color = readonly [number, number, number, number];

interface AuraPromptRequest {
  readonly prompt: string;
  readonly provider: string;
  readonly model?: string;
}

interface AuraPromptPatchRequest {
  readonly prompt: string;
  readonly scene: AuraSceneIR;
}

interface AuraPromptProvider {
  readonly id: string;
  readonly label: string;
  readonly networkUsed: boolean;
  generateScene(request: AuraPromptRequest): Promise<AuraSceneIR>;
  generatePatch(request: AuraPromptPatchRequest): Promise<AuraScenePatch>;
}

interface AuraSceneIR {
  readonly schema: "aura-scene-ir/0.1";
  readonly sceneId: string;
  readonly title: string;
  readonly prompt: string;
  readonly provenance: {
    readonly provider: string;
    readonly model: string;
    readonly generatedAt: string;
    readonly promptHash: string;
    readonly networkUsed: boolean;
    readonly security: readonly string[];
  };
  readonly camera: {
    readonly shot: "wide" | "medium" | "close";
    readonly position: Vec3;
    readonly target: Vec3;
    readonly movement: string;
  };
  readonly environment: {
    readonly timeOfDay: string;
    readonly atmosphere: string;
    readonly fog: number;
    readonly palette: readonly string[];
  };
  readonly lights: readonly AuraSceneLight[];
  readonly materials: readonly AuraSceneMaterial[];
  readonly objects: readonly AuraSceneObject[];
  readonly timeline: readonly AuraSceneBeat[];
  readonly diagnostics: AuraSceneDiagnostics;
}

interface AuraSceneLight {
  readonly id: string;
  readonly kind: "key" | "fill" | "rim" | "practical";
  readonly color: Color;
  readonly intensity: number;
  readonly position: Vec3;
}

interface AuraSceneMaterial {
  readonly id: string;
  readonly label: string;
  readonly color: Color;
  readonly roughness: number;
  readonly metallic: number;
  readonly emissive?: Color;
}

interface AuraSceneObject {
  readonly id: string;
  readonly label: string;
  readonly primitive: "box" | "sphere" | "cylinder" | "plane" | "cone";
  readonly material: string;
  readonly position: Vec3;
  readonly scale: Vec3;
  readonly rotationY: number;
  readonly role: "character" | "hero-prop" | "environment" | "vfx";
  readonly notes?: string;
}

interface AuraSceneBeat {
  readonly time: number;
  readonly action: string;
}

interface AuraSceneDiagnostics {
  readonly status: "ready" | "unsupported" | "error";
  readonly providerMode: string;
  readonly unresolvedAssets: readonly string[];
  readonly placeholders: readonly string[];
  readonly warnings: readonly string[];
  readonly exportReady: boolean;
}

interface AuraScenePatch {
  readonly patchId: string;
  readonly generatedAt: string;
  readonly operations: readonly {
    readonly op: "replace" | "add" | "note";
    readonly path: string;
    readonly value: unknown;
  }[];
}

interface RuntimeState {
  scene: AuraSceneIR | null;
  patches: AuraScenePatch[];
  error: string | null;
}

const canvas = requireElement<HTMLCanvasElement>("viewport", HTMLCanvasElement);
const context = canvas.getContext("2d");
if (!context) throw new Error("A3D AI Product Shot Generator requires a 2D canvas context for the offline preview renderer.");

const state: RuntimeState = {
  scene: null,
  patches: [],
  error: null
};

const providerMode = providerModeFromEnv();
const mockProvider = new MockProvider();
const configuredProvider = new ConfiguredProvider(providerMode);

const promptInput = requireElement<HTMLTextAreaElement>("prompt", HTMLTextAreaElement);
const editInput = requireElement<HTMLInputElement>("edit", HTMLInputElement);
const providerSelect = requireElement<HTMLSelectElement>("provider", HTMLSelectElement);
const generateButton = requireElement<HTMLButtonElement>("generate", HTMLButtonElement);
const patchButton = requireElement<HTMLButtonElement>("patch", HTMLButtonElement);
const sampleButton = requireElement<HTMLButtonElement>("sample", HTMLButtonElement);
const exportButton = requireElement<HTMLButtonElement>("export", HTMLButtonElement);

generateButton.addEventListener("click", () => {
  void generateScene();
});
patchButton.addEventListener("click", () => {
  void patchScene();
});
sampleButton.addEventListener("click", () => {
  promptInput.value = "Design an optimistic product reveal scene for a compact electric scooter in a glass atrium. Include clean reflections, soft morning light, a hero camera, and a subtle data overlay.";
  void generateScene();
});
exportButton.addEventListener("click", () => {
  exportScene();
});

void generateScene();

async function generateScene(): Promise<void> {
  setError(null);
  const provider = selectedProvider();
  try {
    const scene = await provider.generateScene({
      prompt: promptInput.value,
      provider: provider.id,
      model: provider.id === "mock" ? "mock-scene-draft-001" : providerMode.model
    });
    state.scene = scene;
    state.patches = [];
    renderScene(scene, state.patches);
    updatePanel(scene, state.patches, provider);
  } catch (error) {
    setError(error instanceof Error ? error.message : String(error));
  }
}

async function patchScene(): Promise<void> {
  setError(null);
  if (!state.scene) {
    await generateScene();
  }
  const scene = state.scene;
  if (!scene) return;
  const provider = selectedProvider();
  try {
    const patch = await provider.generatePatch({ prompt: editInput.value, scene });
    const nextScene = applyScenePatch(scene, patch);
    state.scene = nextScene;
    state.patches = [...state.patches, patch];
    renderScene(nextScene, state.patches);
    updatePanel(nextScene, state.patches, provider);
  } catch (error) {
    setError(error instanceof Error ? error.message : String(error));
  }
}

function exportScene(): void {
  if (!state.scene) return;
  const payload = JSON.stringify({ scene: state.scene, patches: state.patches }, null, 2);
  const blob = new Blob([payload], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${state.scene.sceneId}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function selectedProvider(): AuraPromptProvider {
  return providerSelect.value === "configured" ? configuredProvider : mockProvider;
}

class MockProvider implements AuraPromptProvider {
  readonly id = "mock";
  readonly label = "MockProvider";
  readonly networkUsed = false;

  async generateScene(request: AuraPromptRequest): Promise<AuraSceneIR> {
    const prompt = request.prompt.trim() || "Create a cinematic browser 3D scene.";
    const lower = prompt.toLowerCase();
    const product = /product|scooter|car|watch|speaker|helmet|shoe/.test(lower);
    const nature = /forest|garden|flower|ocean|rain|water/.test(lower);
    const cinematic = /cinematic|camera|shot|emotional|previs|story/.test(lower);
    const neon = /neon|night|alley|city|cyber/.test(lower);
    const sceneId = `aura-scene-${stableHash(prompt).slice(0, 8)}`;
    const materialIds = product
      ? ["brushed-metal", "glass-highlight", "matte-floor"]
      : neon
        ? ["wet-asphalt", "robot-shell", "glowing-flower"]
        : ["warm-clay", "soft-glass", "atmosphere"];
    const materials = createMaterials(materialIds, { neon, product, nature });
    const objects = createObjects(materials, { prompt, product, nature, cinematic, neon });
    const fog = clamp((neon ? 0.42 : 0.18) + (nature ? 0.12 : 0) + (cinematic ? 0.1 : 0), 0.08, 0.75);
    return {
      schema: "aura-scene-ir/0.1",
      sceneId,
      title: product ? "AI Product Experience Draft" : neon ? "Neon Story Scene Draft" : "AI Scene Draft",
      prompt,
      provenance: {
        provider: this.id,
        model: request.model ?? "mock-scene-draft-001",
        generatedAt: new Date().toISOString(),
        promptHash: stableHash(prompt),
        networkUsed: false,
        security: [
          "MockProvider used no network and no API keys.",
          "Live provider secrets must stay on a trusted server."
        ]
      },
      camera: {
        shot: cinematic ? "medium" : product ? "close" : "wide",
        position: product ? [0, 1.8, 5.4] : [0, 2.4, 6.2],
        target: [0, 0.8, 0],
        movement: cinematic ? "slow push-in" : "locked inspection orbit"
      },
      environment: {
        timeOfDay: neon ? "night" : product ? "morning" : "golden hour",
        atmosphere: neon ? "rain haze and neon mist" : nature ? "soft volumetric pollen and fog" : "clean studio air",
        fog,
        palette: neon ? ["cyan", "magenta", "warm amber"] : product ? ["graphite", "white", "soft blue"] : ["warm amber", "sage", "deep blue"]
      },
      lights: [
        { id: "key-light", kind: "key", color: product ? [0.86, 0.93, 1, 1] : [1, 0.82, 0.58, 1], intensity: 1.35, position: [-2.8, 3.6, 2.2] },
        { id: "rim-light", kind: "rim", color: neon ? [0.25, 0.78, 1, 1] : [0.65, 0.8, 1, 1], intensity: 1.1, position: [2.8, 2.2, -1.6] },
        { id: "practical-glow", kind: "practical", color: neon || nature ? [1, 0.78, 0.24, 1] : [0.54, 0.82, 1, 1], intensity: 0.9, position: [0.35, 0.62, 0] }
      ],
      materials,
      objects,
      timeline: [
        { time: 0, action: "establish scene silhouette and atmosphere" },
        { time: 2, action: product ? "camera glides to hero product detail" : "hero object enters warm practical light" },
        { time: 4, action: "rim light blooms and dust/fog catches the camera" }
      ],
      diagnostics: {
        status: "ready",
        providerMode: "mock",
        unresolvedAssets: [],
        placeholders: objects.map((object) => object.id),
        warnings: [
          "This starter uses primitive placeholder geometry until asset resolution is connected.",
          "Generated scene is a deterministic draft, not final cinematic output."
        ],
        exportReady: true
      }
    };
  }

  async generatePatch(request: AuraPromptPatchRequest): Promise<AuraScenePatch> {
    const prompt = request.prompt.toLowerCase();
    const operations: AuraScenePatch["operations"] = [];
    if (/fog|haze|mist|dust/.test(prompt)) {
      operations.push({ op: "replace", path: "/environment/fog", value: clamp(request.scene.environment.fog + 0.16, 0, 0.9) });
    }
    if (/bright|glow|flower|emissive|light/.test(prompt)) {
      operations.push({ op: "replace", path: "/lights/2/intensity", value: 1.55 });
    }
    if (/close|macro|detail/.test(prompt)) {
      operations.push({ op: "replace", path: "/camera/shot", value: "close" });
      operations.push({ op: "replace", path: "/camera/position", value: [0, 1.45, 4.2] });
    }
    operations.push({ op: "note", path: "/diagnostics/warnings/-", value: `Applied mock conversational edit: ${request.prompt}` });
    return {
      patchId: `patch-${stableHash(`${request.scene.sceneId}:${request.prompt}`).slice(0, 8)}`,
      generatedAt: new Date().toISOString(),
      operations
    };
  }
}

class ConfiguredProvider implements AuraPromptProvider {
  readonly id: string;
  readonly label: string;
  readonly networkUsed = false;

  constructor(private readonly mode: ProviderMode) {
    this.id = mode.provider;
    this.label = `${mode.provider} adapter placeholder`;
  }

  async generateScene(): Promise<AuraSceneIR> {
    throw new Error(`Provider '${this.mode.provider}' is configured, but this browser starter does not send prompts to live providers. Add a server proxy and keep API keys out of client bundles. Expected env: ${this.mode.envHint}.`);
  }

  async generatePatch(): Promise<AuraScenePatch> {
    throw new Error(`Provider '${this.mode.provider}' patching requires a server-side adapter. MockProvider remains available offline.`);
  }
}

interface ProviderMode {
  readonly provider: string;
  readonly model: string;
  readonly envHint: string;
}

function providerModeFromEnv(): ProviderMode {
  const env = import.meta.env as Record<string, string | undefined>;
  const provider = env.VITE_AURA_AI_PROVIDER ?? "mock";
  if (provider === "openai") return { provider, model: env.VITE_OPENAI_MODEL ?? "gpt-4.1-mini", envHint: "VITE_OPENAI_MODEL plus a server-side OPENAI_API_KEY" };
  if (provider === "anthropic") return { provider, model: env.VITE_ANTHROPIC_MODEL ?? "claude-3-5-sonnet-latest", envHint: "VITE_ANTHROPIC_MODEL plus a server-side ANTHROPIC_API_KEY" };
  if (provider === "gemini") return { provider, model: env.VITE_GEMINI_MODEL ?? "gemini-1.5-pro", envHint: "VITE_GEMINI_MODEL plus a server-side GEMINI_API_KEY" };
  if (provider === "local") return { provider, model: env.VITE_LOCAL_MODEL_NAME ?? "local-model", envHint: "VITE_LOCAL_MODEL_ENDPOINT through a trusted local bridge" };
  return { provider: "mock", model: "mock-scene-draft-001", envHint: "no API key required" };
}

function createMaterials(ids: readonly string[], flags: { readonly neon: boolean; readonly product: boolean; readonly nature: boolean }): readonly AuraSceneMaterial[] {
  return ids.map((id, index) => {
    const color = flags.product
      ? [[0.12, 0.14, 0.16, 1], [0.78, 0.88, 1, 0.78], [0.035, 0.04, 0.048, 1]][index] ?? [0.7, 0.75, 0.82, 1]
      : flags.neon
        ? [[0.02, 0.024, 0.03, 1], [0.64, 0.58, 0.36, 1], [1, 0.72, 0.2, 1]][index] ?? [0.25, 0.8, 1, 1]
        : [[0.65, 0.42, 0.24, 1], [0.72, 0.92, 0.95, 0.7], [0.35, 0.48, 0.38, 1]][index] ?? [0.8, 0.65, 0.4, 1];
    return {
      id,
      label: titleCase(id.replace(/-/g, " ")),
      color: color as Color,
      roughness: id.includes("glass") ? 0.05 : 0.42,
      metallic: id.includes("metal") || id.includes("robot") ? 0.75 : 0.08,
      ...(id.includes("glow") || id.includes("flower") ? { emissive: [1, 0.62, 0.16, 1] as Color } : {})
    };
  });
}

function createObjects(
  materials: readonly AuraSceneMaterial[],
  flags: { readonly prompt: string; readonly product: boolean; readonly nature: boolean; readonly cinematic: boolean; readonly neon: boolean }
): readonly AuraSceneObject[] {
  const primaryMaterial = materials[0]?.id ?? "default";
  const accentMaterial = materials[1]?.id ?? primaryMaterial;
  const glowMaterial = materials[2]?.id ?? accentMaterial;
  if (flags.product) {
    return [
      { id: "hero-product-body", label: "Hero product body", primitive: "box", material: primaryMaterial, position: [0, 0.62, 0], scale: [1.7, 0.45, 0.82], rotationY: -0.25, role: "hero-prop" },
      { id: "glass-highlight", label: "Glass highlight", primitive: "sphere", material: accentMaterial, position: [0.34, 0.98, 0.12], scale: [0.92, 0.28, 0.22], rotationY: 0.1, role: "hero-prop" },
      { id: "reflection-floor", label: "Reflection floor", primitive: "plane", material: glowMaterial, position: [0, -0.02, 0], scale: [4.2, 0.04, 2.8], rotationY: 0, role: "environment" },
      { id: "data-overlay", label: "Data overlay", primitive: "cylinder", material: accentMaterial, position: [-1.25, 1.22, -0.35], scale: [0.08, 1.2, 0.08], rotationY: 0, role: "vfx", notes: "Placeholder data ribbon" }
    ];
  }
  return [
    { id: "lonely-robot", label: flags.neon ? "Lonely robot" : "Hero figure", primitive: "box", material: primaryMaterial, position: [-0.58, 0.78, 0], scale: [0.48, 1.16, 0.36], rotationY: 0.2, role: "character" },
    { id: "robot-head", label: "Head silhouette", primitive: "sphere", material: primaryMaterial, position: [-0.58, 1.55, 0], scale: [0.42, 0.36, 0.42], rotationY: 0, role: "character" },
    { id: "glowing-flower", label: flags.nature ? "Glowing flower" : "Practical light", primitive: "cone", material: glowMaterial, position: [0.42, 0.35, 0.2], scale: [0.28, 0.56, 0.28], rotationY: 0.4, role: "hero-prop" },
    { id: "wet-ground", label: "Ground plane", primitive: "plane", material: accentMaterial, position: [0, -0.04, 0], scale: [4.4, 0.05, 3], rotationY: 0, role: "environment" },
    { id: "neon-portal", label: "Neon background frame", primitive: "cylinder", material: glowMaterial, position: [1.35, 1.15, -0.9], scale: [0.09, 1.8, 0.09], rotationY: 0, role: "vfx" }
  ];
}

function applyScenePatch(scene: AuraSceneIR, patch: AuraScenePatch): AuraSceneIR {
  let next: AuraSceneIR = {
    ...scene,
    provenance: {
      ...scene.provenance,
      generatedAt: new Date().toISOString()
    },
    diagnostics: {
      ...scene.diagnostics,
      warnings: [...scene.diagnostics.warnings]
    }
  };
  for (const operation of patch.operations) {
    if (operation.op === "replace" && operation.path === "/environment/fog" && typeof operation.value === "number") {
      next = { ...next, environment: { ...next.environment, fog: operation.value } };
    }
    if (operation.op === "replace" && operation.path === "/lights/2/intensity" && typeof operation.value === "number") {
      next = { ...next, lights: next.lights.map((light, index) => index === 2 ? { ...light, intensity: operation.value } : light) };
    }
    if (operation.op === "replace" && operation.path === "/camera/shot" && typeof operation.value === "string") {
      next = { ...next, camera: { ...next.camera, shot: operation.value as AuraSceneIR["camera"]["shot"] } };
    }
    if (operation.op === "replace" && operation.path === "/camera/position" && Array.isArray(operation.value)) {
      next = { ...next, camera: { ...next.camera, position: operation.value as unknown as Vec3 } };
    }
    if (operation.op === "note" && operation.path === "/diagnostics/warnings/-" && typeof operation.value === "string") {
      next = { ...next, diagnostics: { ...next.diagnostics, warnings: [...next.diagnostics.warnings, operation.value] } };
    }
  }
  return next;
}

function renderScene(scene: AuraSceneIR, patches: readonly AuraScenePatch[]): void {
  resizeCanvas();
  const width = canvas.width;
  const height = canvas.height;
  const fog = scene.environment.fog;
  const gradient = context.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, rgba([0.035 + fog * 0.04, 0.045 + fog * 0.06, 0.07 + fog * 0.08, 1]));
  gradient.addColorStop(0.52, rgba([0.02, 0.025, 0.038, 1]));
  gradient.addColorStop(1, rgba([0.006, 0.008, 0.012, 1]));
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  drawAtmosphere(scene);
  drawGrid(scene);
  for (const light of scene.lights) drawLight(light, scene);
  for (const object of [...scene.objects].sort((a, b) => a.position[2] - b.position[2])) drawObject(object, scene);
  drawTimeline(scene, patches);
}

function drawAtmosphere(scene: AuraSceneIR): void {
  const width = canvas.width;
  const height = canvas.height;
  const palette = scene.environment.palette;
  for (let i = 0; i < 34; i += 1) {
    const x = (stableNumber(`${scene.sceneId}:dust:x:${i}`) % width);
    const y = (stableNumber(`${scene.sceneId}:dust:y:${i}`) % height);
    const radius = 1 + (stableNumber(`${scene.sceneId}:dust:r:${i}`) % 5);
    context.globalAlpha = 0.08 + scene.environment.fog * 0.16;
    context.fillStyle = i % 2 === 0 && palette.includes("cyan") ? "rgba(86,214,169,0.42)" : "rgba(255,216,154,0.38)";
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }
  context.globalAlpha = 1;
}

function drawGrid(scene: AuraSceneIR): void {
  const width = canvas.width;
  const height = canvas.height;
  const horizon = height * 0.62;
  context.strokeStyle = scene.environment.palette.includes("cyan") ? "rgba(86,214,169,0.18)" : "rgba(139,183,255,0.16)";
  context.lineWidth = 1;
  for (let i = 0; i < 12; i += 1) {
    const y = horizon + i * i * 3.2;
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }
  for (let i = -7; i <= 7; i += 1) {
    context.beginPath();
    context.moveTo(width / 2, horizon);
    context.lineTo(width / 2 + i * width * 0.12, height);
    context.stroke();
  }
}

function drawLight(light: AuraSceneLight, scene: AuraSceneIR): void {
  const projected = project(light.position);
  const radius = Math.max(28, 64 * light.intensity);
  const glow = context.createRadialGradient(projected.x, projected.y, 0, projected.x, projected.y, radius);
  glow.addColorStop(0, rgba(light.color, 0.48));
  glow.addColorStop(1, rgba(light.color, 0));
  context.fillStyle = glow;
  context.fillRect(projected.x - radius, projected.y - radius, radius * 2, radius * 2);
  if (light.kind === "practical" || scene.environment.palette.includes("cyan")) {
    context.fillStyle = rgba(light.color, 0.9);
    context.beginPath();
    context.arc(projected.x, projected.y, Math.max(4, 6 * light.intensity), 0, Math.PI * 2);
    context.fill();
  }
}

function drawObject(object: AuraSceneObject, scene: AuraSceneIR): void {
  const material = scene.materials.find((entry) => entry.id === object.material) ?? scene.materials[0];
  const projected = project(object.position);
  const sx = object.scale[0] * projected.scale;
  const sy = object.scale[1] * projected.scale;
  const color = material?.color ?? [0.75, 0.75, 0.75, 1];
  const emissive = material?.emissive;
  context.save();
  context.translate(projected.x, projected.y);
  context.rotate(object.rotationY * 0.25);
  context.fillStyle = rgba(color, color[3]);
  context.strokeStyle = emissive ? rgba(emissive, 0.95) : "rgba(255,255,255,0.22)";
  context.lineWidth = Math.max(1, projected.scale * 0.006);
  if (emissive) {
    const glow = context.createRadialGradient(0, 0, 0, 0, 0, Math.max(sx, sy) * 1.7);
    glow.addColorStop(0, rgba(emissive, 0.46));
    glow.addColorStop(1, rgba(emissive, 0));
    context.fillStyle = glow;
    context.fillRect(-sx * 2, -sy * 2, sx * 4, sy * 4);
    context.fillStyle = rgba(color, color[3]);
  }
  if (object.primitive === "sphere") {
    context.beginPath();
    context.ellipse(0, -sy * 0.5, sx * 0.5, sy * 0.5, 0, 0, Math.PI * 2);
    context.fill();
    context.stroke();
  } else if (object.primitive === "cylinder") {
    context.fillRect(-sx * 0.5, -sy, sx, sy);
    context.beginPath();
    context.ellipse(0, -sy, sx * 0.5, sx * 0.18, 0, 0, Math.PI * 2);
    context.fill();
    context.stroke();
  } else if (object.primitive === "plane") {
    context.globalAlpha = 0.72;
    context.fillRect(-sx * 0.5, -sy * 0.5, sx, sy);
    context.globalAlpha = 1;
  } else if (object.primitive === "cone") {
    context.beginPath();
    context.moveTo(0, -sy);
    context.lineTo(sx * 0.55, 0);
    context.lineTo(-sx * 0.55, 0);
    context.closePath();
    context.fill();
    context.stroke();
  } else {
    context.fillRect(-sx * 0.5, -sy, sx, sy);
    context.strokeRect(-sx * 0.5, -sy, sx, sy);
  }
  context.restore();
}

function drawTimeline(scene: AuraSceneIR, patches: readonly AuraScenePatch[]): void {
  const x = 24;
  let y = canvas.height - 118;
  context.fillStyle = "rgba(5,8,12,0.68)";
  context.fillRect(16, y - 22, Math.min(520, canvas.width - 32), 104);
  context.fillStyle = "rgba(238,243,248,0.88)";
  context.font = "700 14px system-ui";
  context.fillText(scene.title, x, y);
  context.font = "12px system-ui";
  context.fillStyle = "rgba(190,205,220,0.86)";
  for (const beat of scene.timeline) {
    y += 20;
    context.fillText(`${beat.time}s - ${beat.action}`, x, y);
  }
  if (patches.length > 0) {
    context.fillStyle = "rgba(86,214,169,0.86)";
    context.fillText(`${patches.length} mock edit patch(es) applied`, x, y + 20);
  }
}

function project(position: Vec3): { readonly x: number; readonly y: number; readonly scale: number } {
  const depth = 5.5 + position[2];
  const scale = clamp(360 / depth, 42, 150);
  return {
    x: canvas.width * 0.5 + position[0] * scale,
    y: canvas.height * 0.68 - position[1] * scale,
    scale
  };
}

function updatePanel(scene: AuraSceneIR, patches: readonly AuraScenePatch[], provider: AuraPromptProvider): void {
  setText("hud-provider", provider.id);
  setText("hud-status", scene.diagnostics.status);
  setText("hud-objects", String(scene.objects.length));
  setText("hud-patches", String(patches.length));
  setText("provider-mode", scene.diagnostics.providerMode);
  setText("network-used", String(provider.networkUsed || scene.provenance.networkUsed));
  setText("scene-id", scene.sceneId);
  setText("warning-count", String(scene.diagnostics.warnings.length));
  requireElement<HTMLElement>("ir-output", HTMLElement).textContent = JSON.stringify({ scene, patches }, null, 2);
}

function setError(error: string | null): void {
  state.error = error;
  setText("error", error ?? "");
  if (error) {
    setText("hud-status", "error");
  }
}

function resizeCanvas(): void {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(640, Math.floor(rect.width * dpr));
  const height = Math.max(420, Math.floor(rect.height * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

function requireElement<T extends HTMLElement>(id: string, constructor: { new (...args: never[]): T }): T {
  const element = document.getElementById(id);
  if (!(element instanceof constructor)) {
    throw new Error(`Missing required element #${id}.`);
  }
  return element;
}

function setText(id: string, value: string): void {
  requireElement<HTMLElement>(id, HTMLElement).textContent = value;
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function stableNumber(value: string): number {
  return Number.parseInt(stableHash(value), 16);
}

function rgba(color: Color, alpha = color[3]): string {
  return `rgba(${Math.round(color[0] * 255)},${Math.round(color[1] * 255)},${Math.round(color[2] * 255)},${alpha})`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function titleCase(value: string): string {
  return value.replace(/\b\w/g, (match) => match.toUpperCase());
}
