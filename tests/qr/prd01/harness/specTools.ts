/**
 * Dispatcher for the lane-01 S-row spec tools (?tools=<name>). Each tool
 * publishes its report on `window.__QR_SPEC__` and returns `{ errors }` for the
 * harness ready payload. Loaded lazily from main.ts so the lane-scene path
 * does not pull the tool code in.
 */

export async function runSpecTool(tool: string, stage: HTMLElement): Promise<{ readonly errors: readonly string[] }> {
  switch (tool) {
    case "blend-modes":
      return (await import("./blendTools")).runBlendModesTool(stage);
    case "output-pass":
      return (await import("./outputTools")).runOutputPassTool(stage);
    case "output-scene":
      return (await import("./outputSceneTools")).runOutputSceneTool(stage);
    case "primitive":
    case "instance-grid":
    case "box-uploads":
      return (await import("./primitiveTools")).runPrimitiveTool(stage, tool);
    case "frame-graph":
      return (await import("./frameGraphTools")).runFrameGraphTool(stage);
    case "capture-pdb":
      return (await import("./captureTools")).runCapturePdbTool(stage);
    case "dpr":
      return (await import("./captureTools")).runDprTool(stage);
    case "temporal-dolly":
      return (await import("./temporalDollyTools")).runTemporalDollyTool(stage);
    default:
      throw new Error(`unknown spec tool "${tool}"`);
  }
}
