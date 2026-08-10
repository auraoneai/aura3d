import { Renderer } from "@aura3d/rendering";
import { createExternalTelemetryExtension, type ExternalTelemetryFrame } from "./telemetry-extension.js";

interface ExternalExtensionEvidence extends ExternalTelemetryFrame {
  readonly id: "external-extension-lab";
  readonly status: "ready" | "applied" | "error";
  readonly claim: "rendering-package-public-escape-hatch";
  readonly backend: string;
  readonly extensionStrength: number;
  readonly publicEntry: "@aura3d/rendering";
  readonly deviceOwner: "host-renderer";
  readonly callerResourceOwner: "external-extension";
  readonly errors: readonly string[];
  readonly knownLimits: readonly string[];
  readonly error?: string;
}

declare global {
  interface Window {
    __AURA3D_EXTERNAL_EXTENSION_LAB__?: ExternalExtensionEvidence;
    __AURA3D_EXTERNAL_EXTENSION_DISPOSE__?: () => { readonly extensionDisposed: boolean; readonly deviceAliveBeforeHostDispose: boolean; readonly rendererDisposed: boolean };
  }
}

const knownLimits = [
  "This is the public @aura3d/rendering low-level contract, not the root createAuraApp safe API.",
  "It proves one WebGL2 ShaderModule integration and ownership boundary; it does not claim arbitrary Three.js plugin or backend-native compatibility."
] as const;

installShell();
void boot().catch(fail);

async function boot(): Promise<void> {
  const canvas = requiredElement<HTMLCanvasElement>("#external-extension-canvas");
  const renderer = await Renderer.create({ backend: "webgl2", canvas, width: canvas.width, height: canvas.height, clearColor: [0.01, 0.02, 0.04, 1] });
  const extension = createExternalTelemetryExtension(renderer, { width: canvas.width, height: canvas.height });
  let strength = 0;
  let status: ExternalExtensionEvidence["status"] = "ready";

  const render = (time = 1.25): ExternalExtensionEvidence => {
    const frame = extension.draw({ time, strength });
    const evidence: ExternalExtensionEvidence = {
      ...frame,
      id: "external-extension-lab",
      status,
      claim: "rendering-package-public-escape-hatch",
      backend: renderer.device.kind,
      extensionStrength: strength,
      publicEntry: "@aura3d/rendering",
      deviceOwner: "host-renderer",
      callerResourceOwner: "external-extension",
      errors: [],
      knownLimits
    };
    window.__AURA3D_EXTERNAL_EXTENSION_LAB__ = evidence;
    document.body.dataset.aura3dReady = "true";
    document.documentElement.dataset.auraRouteStatus = status;
    updateUi(evidence);
    return evidence;
  };

  const apply = (): void => { strength = 1; status = "applied"; render(2.4); };
  const reset = (): void => { strength = 0; status = "ready"; render(1.25); };
  requiredElement<HTMLButtonElement>("[data-testid='extension-apply']").addEventListener("click", apply);
  requiredElement<HTMLButtonElement>("[data-testid='extension-reset']").addEventListener("click", reset);
  window.addEventListener("keydown", (event) => {
    if (event.code === "KeyE") { event.preventDefault(); apply(); }
    if (event.code === "KeyR") { event.preventDefault(); reset(); }
  });
  window.__AURA3D_EXTERNAL_EXTENSION_DISPOSE__ = () => {
    const plugin = extension.dispose();
    const deviceAliveBeforeHostDispose = !renderer.device.disposed && plugin.deviceStillOwnedByHost;
    renderer.dispose();
    return { extensionDisposed: plugin.geometryDisposed && plugin.shaderDisposed, deviceAliveBeforeHostDispose, rendererDisposed: renderer.device.disposed };
  };
  window.addEventListener("beforeunload", () => window.__AURA3D_EXTERNAL_EXTENSION_DISPOSE__?.(), { once: true });
  render();
}

function updateUi(evidence: ExternalExtensionEvidence): void {
  requiredElement<HTMLElement>("[data-testid='extension-state']").textContent = evidence.status;
  requiredElement<HTMLElement>("[data-testid='extension-pass']").textContent = evidence.extensionApplied ? "EXTERNAL PASS APPLIED" : "HOST BASELINE · PASS ARMED";
  requiredElement<HTMLElement>("[data-testid='extension-metrics']").innerHTML = `<span><strong>${evidence.drawCalls}</strong> public draw</span><span><strong>${evidence.signalPixels.toLocaleString()}</strong> signal pixels</span><span><strong>${evidence.shaderCompiled ? "LINKED" : "FAILED"}</strong> shader</span><span><strong>${evidence.backend.toUpperCase()}</strong> host device</span>`;
}

function fail(error: unknown): void {
  const details = typeof error === "object" && error !== null && "details" in error
    ? `\n${JSON.stringify((error as { readonly details?: unknown }).details)}`
    : "";
  const message = `${error instanceof Error ? error.stack ?? error.message : String(error)}${details}`;
  document.documentElement.dataset.auraRouteStatus = "error";
  window.__AURA3D_EXTERNAL_EXTENSION_LAB__ = {
    id: "external-extension-lab", status: "error", claim: "rendering-package-public-escape-hatch",
    backend: "unknown", extensionStrength: 0, extensionId: "external-telemetry-shader", shaderCompiled: false,
    extensionApplied: false, brightPixels: 0, signalPixels: 0, drawCalls: 0, publicEntry: "@aura3d/rendering",
    deviceOwner: "host-renderer", callerResourceOwner: "external-extension", errors: [message], knownLimits, error: message
  };
}

function installShell(): void {
  document.body.innerHTML = `<main><section class="stage"><canvas id="external-extension-canvas" width="960" height="800" data-testid="external-extension-canvas" aria-label="External telemetry shader integration rendered through the public Aura3D device seam"></canvas><div class="eyebrow"><i></i> PUBLIC LOW-LEVEL CONTRACT</div><div class="state">STATE · <strong data-testid="extension-state">loading</strong></div><div class="title"><p>ESCAPE HATCH 07</p><h1>Extend the renderer.<br>Keep the engine.</h1><span>No fork. No deep import. One owned device.</span></div></section><aside><div><p class="kicker">EXTERNAL INTEGRATION</p><h2>A real shader module,<br>outside the safe API.</h2><p class="lede">The host creates Aura's renderer. An isolated extension receives its published typed contract, compiles one telemetry pass, submits through the readonly device seam, and owns only its geometry and shader.</p></div><div class="pass" data-testid="extension-pass">HOST BASELINE · PASS ARMED</div><div class="flow"><b>HOST RENDERER</b><i>lends</i><b>READONLY DEVICE</b><i>to</i><b>EXTERNAL PASS</b></div><div class="controls"><button data-testid="extension-apply">Apply external pass <kbd>E</kbd></button><button data-testid="extension-reset">Reset host view <kbd>R</kbd></button></div><div class="metrics" data-testid="extension-metrics"><span><strong>0</strong> public draws</span></div><div class="ownership"><small>LIFECYCLE OWNERSHIP</small><p><b>Host</b> Renderer + device</p><p><b>Extension</b> Geometry + ShaderModule</p><p><b>Teardown</b> Extension first, host last</p></div><p class="limit">Bounded proof: one WebGL2 extension through <code>@aura3d/rendering</code>. This is not root-safe <code>createAuraApp</code> proof and does not claim arbitrary Three.js plugin, native-handle, or cross-backend compatibility.</p></aside></main>`;
  const style = document.createElement("style");
  style.textContent = `:root{color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,sans-serif;background:#04101b;color:#effcff}*{box-sizing:border-box}html,body{margin:0;min-height:100%;background:#04101b}body{overflow:hidden}main{min-height:100vh;display:grid;grid-template-columns:minmax(0,1fr)26rem}.stage{position:relative;min-width:0;overflow:hidden;background:#061321}canvas{display:block;width:100%;height:100vh;object-fit:cover}.eyebrow,.state,.title{position:absolute;z-index:2;pointer-events:none}.eyebrow{top:1.45rem;left:1.55rem;display:flex;align-items:center;gap:.55rem;color:#8eb4c2;font:700 .67rem/1.2 ui-monospace,monospace;letter-spacing:.14em}.eyebrow i{width:.5rem;height:.5rem;border-radius:50%;background:#22d3ee;box-shadow:0 0 18px #22d3ee}.state{top:1.35rem;right:1.4rem;padding:.62rem .75rem;border:1px solid #31566a;background:#06131dcc;color:#7495a5;font:650 .66rem/1 ui-monospace,monospace;letter-spacing:.1em;text-transform:uppercase}.state strong{color:#67e8f9}.title{left:1.6rem;bottom:1.55rem;text-shadow:0 2px 24px #02080d}.title p,.kicker{margin:0 0 .45rem;color:#fb923c;font:700 .68rem/1.2 ui-monospace,monospace;letter-spacing:.16em}.title h1{margin:0;font-size:clamp(2.6rem,5vw,4.8rem);line-height:.91;letter-spacing:-.06em;font-weight:540}.title span{display:block;margin-top:.72rem;color:#b6d0d9}aside{position:relative;z-index:4;display:flex;flex-direction:column;gap:1.15rem;padding:2.05rem 1.85rem 1.4rem;border-left:1px solid #274656;background:linear-gradient(155deg,#102433,#07131c 82%);box-shadow:-20px 0 60px #02080d88}h2{margin:0;font-size:2.2rem;line-height:1;letter-spacing:-.052em;font-weight:540}.lede{color:#91abb6;font-size:.87rem;line-height:1.5}.pass{padding:.75rem;border:1px solid #35677a;background:#071a25;color:#9fddea;font:700 .63rem/1 ui-monospace,monospace;letter-spacing:.09em}.flow{display:grid;grid-template-columns:1fr auto;gap:.35rem .55rem;padding:.7rem;border-left:2px solid #22d3ee;background:#081721}.flow b{color:#d7edf2;font:700 .62rem/1.2 ui-monospace,monospace;letter-spacing:.07em}.flow i{color:#577984;font:italic .62rem/1.2 ui-monospace,monospace}.controls{display:grid;gap:.5rem}.controls button{display:flex;justify-content:space-between;align-items:center;min-height:2.75rem;padding:0 .8rem;border:1px solid #416879;border-radius:.35rem;background:#0d2633;color:#d7edf2;font:650 .72rem/1.2 inherit;cursor:pointer}.controls button:first-child{border-color:#2f98aa;background:#0b3440;color:#b9f7ff}.controls kbd{padding:.22rem .38rem;border:1px solid #527b8a;border-radius:.2rem;background:#071720;font:700 .61rem ui-monospace,monospace}.metrics{display:grid;grid-template-columns:1fr 1fr;gap:.45rem}.metrics span{min-height:3.4rem;display:flex;flex-direction:column;justify-content:center;padding:.58rem;border:1px solid #284653;background:#06141c;color:#688a97;font:600 .59rem/1.3 ui-monospace,monospace;text-transform:uppercase}.metrics strong{color:#f0fbfd;font-size:.86rem}.ownership{padding:.8rem;border:1px solid #294753;background:#07151d}.ownership small{display:block;margin-bottom:.5rem;color:#6f929f;font:700 .58rem/1 ui-monospace,monospace;letter-spacing:.1em}.ownership p{display:flex;justify-content:space-between;margin:.3rem 0;color:#7f9ca7;font-size:.66rem}.ownership b{color:#d0e5ea}.limit{margin-top:auto;padding-top:.8rem;border-top:1px solid #25404b;color:#5f7c87;font-size:.61rem;line-height:1.44}.limit code{color:#82acb9}@media(max-width:860px){body{overflow:auto}main{grid-template-columns:1fr}canvas{height:68vh;min-height:30rem}aside{border-left:0;border-top:1px solid #274656}}`;
  document.head.append(style);
}

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing required element: ${selector}`);
  return element;
}

export {};
