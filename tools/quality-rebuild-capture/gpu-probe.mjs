// GPU/WebGL probe for remote macOS runners (GitLab saas-macos-*, GitHub macos-14).
// Launches Chromium with several flag sets, renders a WebGL2 page twice in fresh pages, and records
// whether the browser survives. This finds a launch configuration that is stable on a runner.
// Usage: node tools/quality-rebuild-capture/gpu-probe.mjs [--out probe.json]
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";

const outIdx = process.argv.indexOf("--out");
const outFile = outIdx >= 0 ? process.argv[outIdx + 1] : "tools/quality-rebuild-capture/out/gpu-probe.json";

const page = `<!doctype html><canvas id=c width=256 height=256></canvas><script>
const gl=document.getElementById('c').getContext('webgl2');
const info=gl&&gl.getExtension('WEBGL_debug_renderer_info');
let px=null;if(gl){gl.clearColor(0.2,0.4,0.8,1);gl.clear(gl.COLOR_BUFFER_BIT);const a=new Uint8Array(4);gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,a);px=Array.from(a);}
window.__probe={webgl2:!!gl,renderer:info?gl.getParameter(info.UNMASKED_RENDERER_WEBGL):null,px,maxSamples:gl?gl.getParameter(gl.MAX_SAMPLES):0};
</script>`;

const base = ["--ignore-gpu-blocklist", "--enable-gpu-rasterization", "--disable-background-timer-throttling", "--disable-renderer-backgrounding"];
const configs = [
  { name: "chromium-metal", channel: "chromium", args: [...base, "--use-angle=metal", "--enable-gpu"] },
  { name: "chromium-metal-novsync", channel: "chromium", args: [...base, "--use-angle=metal", "--enable-gpu", "--disable-gpu-vsync", "--disable-frame-rate-limit"] },
  { name: "headless-shell-metal", channel: undefined, args: [...base, "--use-angle=metal", "--enable-gpu"] },
  { name: "chromium-metal-headless-new-noDisplayLink", channel: "chromium", args: [...base, "--use-angle=metal", "--enable-gpu", "--disable-features=CVDisplayLinkBeginFrameSource,DisplayLinkMac", "--disable-gpu-vsync"] },
  { name: "chromium-swiftshader", channel: "chromium", args: [...base, "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] },
];

const results = [];
for (const c of configs) {
  const r = { name: c.name, channel: c.channel ?? "headless-shell", args: c.args, ok: false, runs: [] };
  let browser;
  try {
    browser = await chromium.launch({ channel: c.channel, headless: true, args: c.args, timeout: 60000 });
    for (let i = 0; i < 3; i++) {
      const p = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      await p.setContent(page);
      await p.waitForFunction(() => window.__probe, null, { timeout: 15000 });
      r.runs.push(await p.evaluate(() => window.__probe));
      await p.close();
    }
    r.ok = r.runs.every((x) => x.webgl2 && x.px && x.px[2] > 150);
  } catch (e) {
    r.error = String(e?.message ?? e).split("\n").slice(0, 3).join(" | ");
  } finally {
    await browser?.close().catch(() => {});
  }
  console.log(JSON.stringify({ name: r.name, ok: r.ok, renderer: r.runs[0]?.renderer ?? null, error: r.error ?? null }));
  results.push(r);
}
writeFileSync(outFile, JSON.stringify({ platform: process.platform, arch: process.arch, results }, null, 2));
