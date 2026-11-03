import { afterEach, describe, expect, it, vi } from "vitest";
import { AssetManager } from "../../../packages/assets/src/AssetManager";
import { AudioLoader, type AudioAsset } from "../../../packages/assets/src/AudioLoader";

afterEach(() => vi.unstubAllGlobals());

describe("audio asset loader selection", () => {
  it("recognizes audio paths, fragments, data URLs and explicit formats without treating query suffixes as paths", () => {
    const loader = new AudioLoader({ decodeAudioData: () => ({} as AudioBuffer) });
    for (const url of ["/voice.WAV#chapter", "/voice.opus?signature=abc#part", "/voice.flac", "data:audio/wav;base64,AQ=="]) {
      expect(loader.canLoad({ url })).toBe(true);
    }
    expect(loader.canLoad({ url: "/download?filename=voice.wav" })).toBe(false);
    expect(loader.canLoad({ url: "https://example.wav" })).toBe(false);
    expect(loader.canLoad({ url: "/download", format: "flac" })).toBe(true);
    expect(loader.canLoad({ url: "/misleading.wav", format: "gltf" })).toBe(false);
  });

  it("loads a fragmented audio URL and an extensionless explicitly formatted URL through the asset manager", async () => {
    const fetchMock = vi.fn(async () => new Response(new Uint8Array([7, 8])));
    vi.stubGlobal("fetch", fetchMock);
    const decode = vi.fn(async (bytes: ArrayBuffer) => ({ length: bytes.byteLength }) as AudioBuffer);
    const manager = new AssetManager();
    manager.register(new AudioLoader({ decodeAudioData: decode }));
    const a = await manager.load<AudioAsset>("https://audio.test/voice.wav#chapter");
    const b = await manager.load<AudioAsset>("https://audio.test/signed-download?token=value", { format: "opus" });
    expect(a.value.buffer.length).toBe(2);
    expect(b.value.buffer.length).toBe(2);
    expect(decode).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await a.release();
    await b.release();
  });
});
