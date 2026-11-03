// Checked by tsconfig.check.json; this file is not a runtime test.
import { GLTFTextureLoadError } from "@aura3d/assets";
import type { GLTFImageDecodeContext, GLTFRenderResourceLoadIssue, ImportPipeline, ImportPipelineRun } from "@aura3d/assets";

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type Assert<T extends true> = T;

type ResultContract = Assert<Equal<ImportPipelineRun<number>["result"], Promise<number>>>;
type SettledContract = Assert<Equal<ImportPipelineRun<number>["settled"], Promise<void>>>;
type DecodeSignalContract = Assert<Equal<GLTFImageDecodeContext["signal"], AbortSignal | undefined>>;
type TextureIssueContract = Assert<Equal<GLTFTextureLoadError["issue"], GLTFRenderResourceLoadIssue>>;

function checkTextureErrorContract(issue: GLTFRenderResourceLoadIssue): GLTFTextureLoadError {
  return new GLTFTextureLoadError(issue);
}

function checkStartContract(pipeline: ImportPipeline): void {
  const run = pipeline.start<string, number>("input", { url: "asset" });
  type StartContract = Assert<Equal<typeof run, ImportPipelineRun<number>>>;

  // @ts-expect-error A run's result promise cannot be replaced.
  run.result = Promise.resolve(1);
  // @ts-expect-error A run's cleanup acknowledgement cannot be replaced.
  run.settled = Promise.resolve();
}

void checkStartContract;
void checkTextureErrorContract;
