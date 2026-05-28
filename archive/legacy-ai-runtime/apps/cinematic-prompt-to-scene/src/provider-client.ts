import {
  createFixtureScene,
  createMockScene,
  normalizeProviderScene,
  type CinematicSceneIR,
  type ProviderMode
} from "./cinematic-demo-fixtures";
import { providerRequiresProxy } from "./provider-config";

export async function generateCinematicSceneWithProvider(mode: ProviderMode, prompt: string): Promise<CinematicSceneIR> {
  if (mode === "fixture") return createFixtureScene(prompt);
  if (mode === "mock") return createMockScene(prompt);
  if (!providerRequiresProxy(mode)) return createFixtureScene(prompt);
  const response = await fetch("/api/cinematic-prompt-to-scene/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ provider: mode, prompt })
  });
  if (!response.ok) throw new Error(`Server proxy returned ${response.status}.`);
  return normalizeProviderScene(await response.json(), prompt, mode);
}
