export interface StaticExportRuntimeOptions {
  readonly globalName?: string;
  readonly canvasSelector?: string;
  readonly statusSelector?: string;
  readonly projectPath?: string;
}

export interface StaticExportHtmlOptions {
  readonly title: string;
  readonly runtimePath?: string;
  /** Licensed WOFF2 data URI included with a self-contained export. */
  readonly fontDataUri?: string;
}

/** Bootstrap appended to the bundled project renderer by StaticProjectExporter. */
export function createStaticExportRuntime(options: StaticExportRuntimeOptions = {}): string {
  const globalName = options.globalName ?? "__AURA3D_EXPORTED_PROJECT__";
  const canvasSelector = options.canvasSelector ?? "#aura3d-export";
  const statusSelector = options.statusSelector ?? "#aura3d-export-status";
  const projectPath = options.projectPath ?? "./project.json";
  return `const canvas = document.querySelector(${JSON.stringify(canvasSelector)});
const status = document.querySelector(${JSON.stringify(statusSelector)});
const start = globalThis.__AURA3D_EXPORT_START__;
try {
  if (!canvas || !status || typeof start !== "function") throw new Error("The exported scene runtime is unavailable.");
  delete globalThis.__AURA3D_EXPORT_START__;
  await start({ canvas, status, projectPath: ${JSON.stringify(projectPath)}, globalName: ${JSON.stringify(globalName)} });
} catch (error) {
  const message = (error instanceof Error ? error.message : "Unable to start the exported scene.")
    .replace(/\\b(?:https?|wss?):\\/\\/[^\\s)\\]"']+/gi, "[url]").replace(/data:[^\\s)\\]"']+/gi, "[data]");
  if (status) status.textContent = message;
  window[${JSON.stringify(globalName)}] = { status: "error", errors: [message] };
}
`;
}

export function createStaticExportHtml(options: StaticExportHtmlOptions): string {
  const runtimePath = options.runtimePath ?? "./runtime.js";
  const font = options.fontDataUri;
  if (font !== undefined && !/^data:font\/woff2;base64,[a-z0-9+/=]+$/i.test(font)) throw new Error("Invalid export font data.");
  const fontRule = font ? `@font-face { font-family: "Whitney"; src: url("${font}") format("woff2"); font-weight: 400; }` : "";
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(options.title)}</title>
    <style>
      ${fontRule}
      html, body { margin: 0; min-height: 100%; background: #10151f; color: #edf2f7; font-family: "Whitney"; }
      main { display: grid; min-height: 100vh; place-items: center; padding: 24px; }
      canvas { width: min(920px, 100%); height: 520px; border: 1px solid #334155; background: #121a26; }
      .hud { position: fixed; left: 20px; top: 16px; padding: 10px 12px; background: rgba(15, 23, 42, 0.86); border: 1px solid #334155; border-radius: 6px; }
    </style>
  </head>
  <body>
    <main>
      <canvas id="aura3d-export" width="920" height="520" aria-label="Exported Aura3D scene"></canvas>
      <div class="hud" id="aura3d-export-status" role="status">Loading export...</div>
    </main>
    <script type="module" src="${escapeHtml(runtimePath)}"></script>
  </body>
</html>
`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      default: return "&#39;";
    }
  });
}
