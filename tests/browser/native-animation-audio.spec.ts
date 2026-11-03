import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

// Phase B: run on the remote browser runner after the global source freeze.
// The existing root-app harness admits a typed animated GLB and compares pixels
// inside its subject region at two deterministic clip times.
test.describe("native animation and Web Audio", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  test("root playback visibly deforms a skinned asset", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(`${server.origin}/tests/browser/createAuraApp-animation-bridge-harness.html?mode=pose-pair`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean((window as any).__AURA3D_ANIMATION_BRIDGE_CONTRACT__), undefined, { timeout: 30_000 });
    const result = await page.evaluate(() => (window as any).__AURA3D_ANIMATION_BRIDGE_CONTRACT__);
    expect(result.renderer.runtimeBackend).toBe("production-runtime");
    expect(result.renderer.fallbackUsed).toBe(false);
    expect(result.asset.skinnedRenderItemCount).toBeGreaterThan(0);
    expect(result.asset.skinningPaletteUpdated).toBe(true);
    expect(result.animation.cameraStable).toBe(true);
    expect(result.animation.diff.hashA).not.toBe(result.animation.diff.hashB);
    expect(result.animation.diff.changedSubjectPixels).toBeGreaterThan(120);
    expect(result.animation.diff.meanDelta).toBeGreaterThan(0.05);
    expect(errors).toEqual([]);
  });

  test("a user gesture unlocks a connected spatial graph and cleanup releases its nodes", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(`${server.origin}/tests/browser/createAuraApp-animation-bridge-harness.html`, { waitUntil: "domcontentloaded" });
    const initialState = await page.evaluate(async () => {
      const audioPath = "/packages/audio/src/index.ts";
      const scenePath = "/packages/scene/src/index.ts";
      const audio = await import(/* @vite-ignore */ audioPath);
      const sceneApi = await import(/* @vite-ignore */ scenePath);
      const manager = new audio.AudioContextManager();
      const button = document.createElement("button");
      button.id = "native-audio-gesture";
      button.textContent = "Enable audio";
      document.body.appendChild(button);
      button.addEventListener("click", async () => {
        try {
          await manager.unlock();
          const context = manager.context as AudioContext;
          const analyser = context.createAnalyser();
          analyser.fftSize = 256;
          analyser.connect(context.destination);
          const spatial = new audio.SpatialAudio({ context, destination: analyser, panningModel: "equalpower" });
          const scene = new sceneApi.Scene();
          const parent = scene.createNode("parent");
          const emitterNode = scene.createNode("emitter");
          scene.root.addChild(parent);
          parent.addChild(emitterNode);
          parent.transform.setScale(-2, 3, 4);
          emitterNode.transform.setPosition(1, 0, 0);
          const bridge = new audio.SceneAudioBridge(scene);
          bridge.bindSource(emitterNode, spatial);
          bridge.update();
          const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
          const samples = buffer.getChannelData(0);
          for (let index = 0; index < samples.length; index++) samples[index] = 0.1 * Math.sin(index * 2 * Math.PI * 440 / context.sampleRate);
          const source = new audio.AudioSource({ context, destination: spatial.panner, clip: new audio.AudioClip({ buffer }), loop: true });
          source.play();
          (window as any).__NATIVE_AUDIO_PROBE__ = {
            state: () => manager.state,
            orientation: () => [spatial.panner.orientationX.value, spatial.panner.orientationY.value, spatial.panner.orientationZ.value],
            position: () => [spatial.panner.positionX.value, spatial.panner.positionY.value, spatial.panner.positionZ.value],
            elapsed: () => source.positionSeconds,
            peak: () => {
              const wave = new Float32Array(analyser.fftSize);
              analyser.getFloatTimeDomainData(wave);
              return Math.max(...Array.from(wave, Math.abs));
            },
            close: async () => {
              bridge.dispose();
              source.dispose();
              spatial.dispose();
              analyser.disconnect();
              scene.dispose();
              await manager.dispose();
              let rejected = false;
              try { source.play(); } catch { rejected = true; }
              return { state: manager.state, rejected };
            }
          };
        } catch (error) {
          (window as any).__NATIVE_AUDIO_ERROR__ = String(error);
        }
      });
      return manager.state;
    });
    expect(initialState).toBe("locked");
    await page.locator("#native-audio-gesture").click();
    await page.waitForFunction(() => Boolean((window as any).__NATIVE_AUDIO_PROBE__ || (window as any).__NATIVE_AUDIO_ERROR__), undefined, { timeout: 10_000 });
    expect(await page.evaluate(() => (window as any).__NATIVE_AUDIO_ERROR__)).toBeUndefined();
    await page.waitForFunction(() => (window as any).__NATIVE_AUDIO_PROBE__?.peak() > 0.001, undefined, { timeout: 10_000 });
    const graph = await page.evaluate(() => {
      const probe = (window as any).__NATIVE_AUDIO_PROBE__;
      return { state: probe.state(), orientation: probe.orientation(), position: probe.position(), elapsed: probe.elapsed(), peak: probe.peak() };
    });
    expect(graph.state).toBe("running");
    expect(graph.orientation).toEqual([-1, 0, 0]);
    expect(graph.position).toEqual([-2, 0, 0]);
    expect(graph.elapsed).toBeGreaterThan(0);
    expect(graph.peak).toBeGreaterThan(0.001);
    expect(await page.evaluate(() => (window as any).__NATIVE_AUDIO_PROBE__.close())).toEqual({ state: "closed", rejected: true });
    expect(errors).toEqual([]);
  });
});
