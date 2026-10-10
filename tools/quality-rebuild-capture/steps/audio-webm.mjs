/**
 * C-33 step plugin `audio-webm` (PRD-09 §20 / 16.1-5): `{"audio-webm": {"seconds": 60}}`
 * — records the game master bus via `window.__AURA3D_GAME_SOUND__.recordMaster`
 * (installed by createGame whenever the route declares `options.sound`) into
 * `<game>/audio.webm`. Resolves to an error entry when the route has no GameAudio
 * facade or the runtime lacks MediaRecorder/MediaStreamDestination — the capture
 * keeps running, the missing audio is visible in `report.json` pluginResults.
 */
import { writeFileSync } from "node:fs";
import path from "node:path";

export default {
  name: "audio-webm",
  owner: "prd09",
  async run(page, step, ctx) {
    const seconds = step["audio-webm"]?.seconds ?? 60;
    const result = await page.evaluate(async (secs) => {
      const holder = globalThis.__AURA3D_GAME_SOUND__;
      if (typeof holder?.recordMaster !== "function") return { error: "no-__AURA3D_GAME_SOUND__" };
      const blob = await holder.recordMaster(secs).catch((e) => ({ error: String(e).slice(0, 200) }));
      if (!blob) return { error: "recorder-unavailable" };
      if (blob.error) return blob;
      const buf = new Uint8Array(await blob.arrayBuffer());
      let bin = "";
      const SLICE = 0x8000;
      for (let i = 0; i < buf.length; i += SLICE) {
        bin += String.fromCharCode.apply(null, buf.subarray(i, i + SLICE));
      }
      return { b64: btoa(bin), type: blob.type || "audio/webm" };
    }, seconds).catch((e) => ({ error: String(e).slice(0, 200) }));
    if (!result?.b64) return { files: [], data: { seconds, error: result?.error ?? "no-blob" } };
    const file = path.join(ctx.outDir, "audio.webm");
    writeFileSync(file, Buffer.from(result.b64, "base64"));
    ctx.log(`audio.webm: ${result.type}, ${result.b64.length} chars b64`);
    return { files: [file], data: { seconds, type: result.type } };
  }
};
