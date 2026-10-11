/**
 * Lane prd02 GPU probe (lighting-quality `gpu` job). Launches Playwright
 * Chromium with the job's flags (`QR_PRD02_CHROME_ARGS`), creates a WebGL2
 * context and prints `UNMASKED_RENDERER_WEBGL` / `UNMASKED_VENDOR_WEBGL`.
 * Exits non-zero when there is no WebGL2 or the renderer is a software
 * rasterizer (SwiftShader, llvmpipe, softpipe, Microsoft Basic Render), so a
 * GPU job never silently measures a CPU fallback.
 *
 *   pnpm exec tsx benchmarks/quality-rebuild/scenes/prd02/gpu-probe.ts
 */
import { chromium } from "@playwright/test";

const SOFTWARE = /swiftshader|llvmpipe|softpipe|software|basic render/i;

function chromeArgs(raw = process.env.QR_PRD02_CHROME_ARGS ?? ""): string[] {
  return raw.split(/\s+/).filter(Boolean);
}

async function main(): Promise<void> {
  const args = chromeArgs();
  // `--headless=new` in args: Playwright must not add its own headless flag.
  const headlessInArgs = args.some((arg) => arg.startsWith("--headless"));
  const browser = await chromium.launch({ headless: !headlessInArgs, args });
  try {
    const page = await browser.newPage();
    await page.goto("about:blank");
    const info = (await page.evaluate(`(() => {
      const gl = document.createElement("canvas").getContext("webgl2");
      if (!gl) return { webgl2: false };
      const ext = gl.getExtension("WEBGL_debug_renderer_info");
      return {
        webgl2: true,
        renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
        vendor: ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
        version: gl.getParameter(gl.VERSION),
        floatColor: Boolean(gl.getExtension("EXT_color_buffer_float"))
      };
    })()`)) as { webgl2: boolean; renderer?: string; vendor?: string; version?: string; floatColor?: boolean };
    console.log(JSON.stringify({ browser: browser.version(), args, ...info }));
    if (!info.webgl2) throw new Error("no WebGL2 context");
    if (SOFTWARE.test(`${info.renderer ?? ""} ${info.vendor ?? ""}`)) {
      throw new Error(`software WebGL renderer: ${info.renderer} (${info.vendor})`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
