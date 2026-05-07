import type { ImportPipeline } from "./ImportPipeline";

export interface WorkerAssetJob<TInput = unknown, TOutput = unknown> {
  readonly id: string;
  readonly input: TInput;
  readonly url: string;
  readonly signal?: AbortSignal;
}

export interface WorkerAssetJobRunner {
  run<TInput, TOutput>(job: WorkerAssetJob<TInput, TOutput>): Promise<TOutput>;
}

export class WorkerAssetJobs {
  constructor(
    private readonly pipeline: ImportPipeline,
    private readonly worker?: WorkerAssetJobRunner
  ) {}

  async run<TInput, TOutput = unknown>(job: WorkerAssetJob<TInput, TOutput>): Promise<TOutput> {
    if (job.signal?.aborted) {
      throw new Error(`Worker asset job aborted: ${job.id}`);
    }

    const runPromise = this.worker
      ? this.worker.run<TInput, TOutput>(job)
      : (this.pipeline.run(job.input, { url: job.url, signal: job.signal }) as Promise<TOutput>);

    if (!job.signal) {
      return runPromise;
    }

    return this.withAbort(job, runPromise);
  }

  private async withAbort<TOutput>(job: WorkerAssetJob, promise: Promise<TOutput>): Promise<TOutput> {
    if (job.signal?.aborted) {
      throw new Error(`Worker asset job aborted: ${job.id}`);
    }

    return new Promise<TOutput>((resolve, reject) => {
      const abort = () => reject(new Error(`Worker asset job aborted: ${job.id}`));
      job.signal?.addEventListener("abort", abort, { once: true });
      promise.then(
        (value) => {
          job.signal?.removeEventListener("abort", abort);
          resolve(value);
        },
        (error) => {
          job.signal?.removeEventListener("abort", abort);
          reject(error);
        }
      );
    });
  }
}
