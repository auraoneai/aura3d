import { EngineLoop, type FrameContext } from "@galileo3d/core";

interface CoreRafLoopResult {
  readonly status: "running" | "ready" | "error";
  readonly frameCount: number;
  readonly fixedStepTotal: number;
  readonly alphaSamples: readonly number[];
  readonly error?: string;
}

declare global {
  interface Window {
    __GALILEO3D_CORE_RAF_TEST__?: CoreRafLoopResult;
  }
}

function publish(result: CoreRafLoopResult): void {
  window.__GALILEO3D_CORE_RAF_TEST__ = result;
}

try {
  let frameCount = 0;
  let fixedStepTotal = 0;
  const alphaSamples: number[] = [];

  const loop = new EngineLoop(
    {
      mode: "raf",
      fixedDelta: 1 / 60,
      maxDelta: 0.25,
      maxFixedSteps: 5
    },
    (context: FrameContext) => {
      frameCount += 1;
      fixedStepTotal += context.fixedSteps;
      alphaSamples.push(context.interpolationAlpha);

      if (frameCount === 3) {
        loop.stop();
        setTimeout(() => {
          publish({
            status: "ready",
            frameCount,
            fixedStepTotal,
            alphaSamples
          });
        }, 50);
      }
    }
  );

  publish({ status: "running", frameCount, fixedStepTotal, alphaSamples });
  loop.start();
  loop.start();
} catch (error) {
  publish({
    status: "error",
    frameCount: 0,
    fixedStepTotal: 0,
    alphaSamples: [],
    error: error instanceof Error ? error.message : String(error)
  });
}
