import { AudioClip, AudioSource, AudioSystem } from "@aura3d/audio";

interface AudioBrowserResult {
  readonly status: "waiting" | "ready" | "error";
  readonly contextState: string;
  readonly clipDuration: number;
  readonly sourceStateAfterPlay: string;
  readonly sourceStateAfterPause?: string;
  readonly sourceStateAfterResume?: string;
  readonly sourceStateAfterStop: string;
  readonly repeatedMounts?: number;
  readonly error?: string;
}

declare global {
  interface Window {
    __AURA3D_AUDIO_BROWSER_TEST__?: AudioBrowserResult;
  }
}

function publish(result: AudioBrowserResult): void {
  window.__AURA3D_AUDIO_BROWSER_TEST__ = result;
}

function createToneBuffer(context: AudioContext): AudioBuffer {
  const sampleRate = context.sampleRate;
  const frameCount = Math.max(1, Math.floor(sampleRate * 0.05));
  const buffer = context.createBuffer(1, frameCount, sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < data.length; index += 1) {
    data[index] = Math.sin((index / sampleRate) * Math.PI * 2 * 440) * 0.02;
  }
  return buffer;
}

publish({
  status: "waiting",
  contextState: "uncreated",
  clipDuration: 0,
  sourceStateAfterPlay: "idle",
  sourceStateAfterStop: "idle"
});

document.querySelector<HTMLButtonElement>("#audio-start")?.addEventListener("click", async () => {
  const system = new AudioSystem();
  try {
    await system.unlock();
    const context = system.contextManager.context as AudioContext;
    const clip = new AudioClip({ name: "browser-tone", buffer: createToneBuffer(context) });
    const source = new AudioSource({ context: system.contextManager.context, clip, volume: 0.01 });

    source.play();
    const sourceStateAfterPlay = source.state;
    source.fade(0.01, 0.005, 0.01);
    await new Promise((resolve) => setTimeout(resolve, 10));
    source.pause();
    const sourceStateAfterPause = source.state;
    source.resume();
    const sourceStateAfterResume = source.state;
    source.stop();
    source.playSprite(0, Math.min(0.02, clip.duration));
    await new Promise((resolve) => setTimeout(resolve, 25));
    source.stop();
    const sourceStateAfterStop = source.state;

    let repeatedMounts = 0;
    for (let iteration = 0; iteration < 10; iteration += 1) {
      const mounted = new AudioSystem();
      await mounted.unlock();
      await mounted.suspend();
      await mounted.resume();
      await mounted.dispose();
      if (mounted.contextManager.state === "closed") repeatedMounts += 1;
    }

    publish({
      status: "ready",
      contextState: system.contextManager.state,
      clipDuration: clip.duration,
      sourceStateAfterPlay,
      sourceStateAfterPause,
      sourceStateAfterResume,
      sourceStateAfterStop,
      repeatedMounts
    });
    source.dispose();
    await system.dispose();
  } catch (error) {
    publish({
      status: "error",
      contextState: system.contextManager.state,
      clipDuration: 0,
      sourceStateAfterPlay: "idle",
      sourceStateAfterStop: "idle",
      error: error instanceof Error ? error.message : String(error)
    });
    await system.dispose();
  }
});
